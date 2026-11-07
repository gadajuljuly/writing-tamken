// Tests the Supabase schema (RLS, triggers, RPCs) on an in-process PostgreSQL (PGlite)
// with a minimal stand-in for Supabase's `auth` schema.  Run: npm run test:db
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const pg = new PGlite();
const U = {
  ghada: "11111111-1111-1111-1111-111111111111",
  rana: "22222222-2222-2222-2222-222222222222",
  stranger: "33333333-3333-3333-3333-333333333333",
};

/** Runs fn as a signed-in Supabase user (role authenticated + JWT sub) inside a transaction. */
async function as(user, fn) {
  return pg.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}
const rows = async (user, sql, params = []) => as(user, async (tx) => (await tx.query(sql, params)).rows);
const fails = async (p, re) => {
  await assert.rejects(p, (e) => { assert.match(String(e.message), re); return true; });
};

before(async () => {
  await pg.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant usage on schema public to authenticated, anon;
  `);
  await pg.exec(fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  await pg.exec(`update wt_settings set value = 'qalam' where key = 'signup_code'`);
  for (const id of Object.values(U)) await pg.query("insert into auth.users values ($1)", [id]);
  // run twice: the script must be idempotent
  await pg.exec(fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
});

test("joining needs the committee code; non-members see nothing", async () => {
  await fails(rows(U.ghada, "select wt_join('wrong', 'غادة جلجولي')"), /bad_code/);
  await rows(U.ghada, "select wt_join('qalam', 'غادة جلجولي')");
  await rows(U.rana, "select wt_join('qalam', 'رنا مروات')");
  assert.equal((await rows(U.stranger, "select * from wt_members")).length, 0);
  assert.equal((await rows(U.ghada, "select * from wt_members where competition = 'ar'")).length, 8);
  await fails(rows(U.stranger, "insert into wt_tasks (competition, title) values ('ar', 'x')"), /row-level security/);
  // settings (signup code) are not readable
  await fails(rows(U.ghada, "select * from wt_settings"), /permission denied/);
});

test("tasks: completion date, duplicates (spelling variants), separate competitions", async () => {
  await rows(U.ghada, `insert into wt_tasks (competition, axis, title, assignees, status)
    values ('ar', 1, 'حجز قاعة حفل التتويج', '["غادة جلجولي","تمارا مصطفى"]', 'not_started')`);
  await rows(U.ghada, `insert into wt_tasks (competition, axis, title) values ('ar', 3, 'إعداد مئشار التقييم')`);
  await fails(rows(U.rana, `insert into wt_tasks (competition, title) values ('ar', 'حجز قاعه حفل التتويج')`), /duplicate/);
  await fails(rows(U.rana, `insert into wt_tasks (competition, title) values ('ar', '  حَجْز قاعة حفل التتويج! ')`), /duplicate/);
  await fails(rows(U.rana, `insert into wt_tasks (competition, title) values ('ar', 'قاعة حفل التتويج حجز')`), /duplicate/);
  // same title in the Hebrew competition is a different task
  await rows(U.rana, `insert into wt_tasks (competition, title) values ('he', 'حجز قاعة حفل التتويج')`);

  const [t] = await rows(U.rana, `update wt_tasks set status = 'done' where title = 'حجز قاعة حفل التتويج' and competition = 'ar' returning *`);
  assert.ok(t.completed_at, "completed_at set automatically");
  const [t2] = await rows(U.rana, `update wt_tasks set notes = 'تم الحجز' where id = $1 returning *`, [t.id]);
  assert.equal(t2.notes, "تم الحجز");
  assert.deepEqual(t2.completed_at, t.completed_at, "editing notes after done keeps the completion date");
  const [t3] = await rows(U.rana, `update wt_tasks set status = 'in_progress' where id = $1 returning *`, [t.id]);
  assert.equal(t3.completed_at, null);
  await rows(U.rana, `update wt_tasks set status = 'done' where id = $1`, [t.id]);
  // cannot move a task to the other competition
  const [t4] = await rows(U.rana, `update wt_tasks set title = title || '' where id = $1 returning competition`, [t.id]);
  assert.equal(t4.competition, "ar");
  await fails(rows(U.rana, `update wt_tasks set competition = 'he' where id = $1`, [t.id]), /permission denied/);

  const counts = await rows(U.ghada, `select status, count(*)::int n from wt_tasks where competition = 'ar' group by status order by status`);
  assert.deepEqual(counts.map((r) => [r.status, r.n]), [["done", 1], ["not_started", 1]]);
});

test("audit log records who changed what", async () => {
  const log = await rows(U.ghada, `select a.action, a.changes, p.name from wt_audit a join wt_profiles p on p.id = a.user_id
    where a.entity = 'task' and a.action = 'status' order by a.id`);
  assert.ok(log.length >= 3);
  assert.equal(log[0].name, "رنا مروات");
  assert.deepEqual(log[0].changes.status, { from: "not_started", to: "done" });
});

test("members: Hebrew names can be added, Arabic list is fixed", async () => {
  await rows(U.rana, `insert into wt_members (competition, name) values ('he', 'דנה לוי')`);
  await fails(rows(U.rana, `insert into wt_members (competition, name) values ('ar', 'X')`), /row-level security/);
});

let minuteId;
test("minutes: AI result → proposals; only uploader approves; duplicates never added; tasks linked", async () => {
  [{ id: minuteId }] = await rows(U.ghada, `insert into wt_minutes (competition, title, source_type, raw_text, uploaded_by, status)
    values ('ar', 'اجتماع اللجنة الأول', 'whatsapp', 'نص', $1, 'approved') returning id`, [U.rana]);
  const [m] = await rows(U.ghada, "select * from wt_minutes where id = $1", [minuteId]);
  assert.equal(m.uploaded_by, U.ghada, "uploader cannot be spoofed");
  assert.equal(m.status, "draft");

  // minutes cannot be updated directly, only through the functions
  await fails(rows(U.rana, "update wt_minutes set status = 'approved' where id = $1", [minuteId]), /permission denied/);

  const draft = { title: "اجتماع اللجنة الأول", date: "2026-11-05", participants: ["غادة", "رنا"], topics: [], discussions: [],
    decisions: ["اعتماد موعد الحفل"], tasks: [], notes: [] };
  const tasks = [
    { title: "طباعة شهادات التقدير", description: "", axis: 5, assignees: ["رنا مروات"] },
    { title: "دعوة كاتب ضيف", description: "", axis: 4, assignees: [] },
    { title: "حجز قاعة حفل التتويج", description: "", axis: 1, assignees: [] },  // exists already
    { title: "مهمة بلا محور", description: "", axis: 9, assignees: [] },          // invalid axis → 8 (other tasks)
    { title: "طباعة شهادات التقدير!", description: "", axis: 5, assignees: [] }, // duplicate of a sibling
  ];
  await rows(U.rana, "select wt_minute_set_ai_result($1, $2, $3)", [minuteId, JSON.stringify(draft), JSON.stringify(tasks)]);
  const sugg = await rows(U.ghada, "select id, title, axis, state from wt_suggestions where minute_id = $1 order by id", [minuteId]);
  assert.deepEqual(sugg.map((s) => s.state), ["pending", "pending", "duplicate", "pending", "duplicate"]);
  assert.equal(sugg[3].axis, 8);

  // nothing added before approval
  assert.equal((await rows(U.ghada, "select * from wt_tasks where source_minute_id = $1", [minuteId])).length, 0);
  // another member cannot approve
  await fails(rows(U.rana, "select wt_minute_apply($1, $2)", [minuteId, sugg.map((s) => s.id)]), /only_uploader/);
  await fails(rows(U.rana, "select wt_suggestion_set_state($1, 'rejected')", [sugg[1].id]), /only_uploader/);
  // a member cannot fake a task "from" minutes
  await fails(rows(U.rana, "insert into wt_tasks (competition, title, source_minute_id) values ('ar', 'y', $1)", [minuteId]), /row-level security/);

  const [{ wt_minute_apply: r }] = await rows(U.ghada, "select wt_minute_apply($1, $2)", [minuteId, [sugg[0].id, sugg[1].id, sugg[2].id]]);
  assert.deepEqual(r, { added: 2, skipped: 1 });
  const linked = await rows(U.ghada, "select title, axis, assignees from wt_tasks where source_minute_id = $1 order by id", [minuteId]);
  assert.deepEqual(linked.map((x) => [x.title, x.axis]), [["طباعة شهادات التقدير", 5], ["دعوة كاتب ضيف", 4]]);
  assert.deepEqual(linked[0].assignees, ["رنا مروات"]);

  const [{ wt_minute_apply: again }] = await rows(U.ghada, "select wt_minute_apply($1, $2)", [minuteId, sugg.map((s) => s.id)]);
  assert.equal(again.added, 1, "only the remaining pending proposal (axis 8) is added");
  assert.equal((await rows(U.ghada, "select * from wt_tasks where competition = 'ar'")).length, 5);
});

test("minutes: approval versions, pending edits, restore, archive, decisions, search", async () => {
  await fails(rows(U.rana, "select wt_minute_approve($1, '{\"title\":\"x\"}')", [minuteId]), /only_uploader/);
  const d1 = { title: "اجتماع اللجنة الأول", date: "2026-11-05", participants: [], topics: [], discussions: [], decisions: ["أ"], tasks: [], notes: [] };
  const [{ wt_minute_approve: v1 }] = await rows(U.ghada, "select wt_minute_approve($1, $2)", [minuteId, JSON.stringify(d1)]);
  assert.equal(v1, 1);
  await rows(U.rana, "select wt_minute_save_draft($1, $2)", [minuteId, JSON.stringify({ ...d1, notes: ["ملاحظة من رنا"] })]);
  let [m] = await rows(U.ghada, "select * from wt_minutes where id = $1", [minuteId]);
  assert.equal(m.has_pending_changes, true);
  assert.equal(m.current_version, 1);
  const [{ wt_minute_approve: v2 }] = await rows(U.ghada, "select wt_minute_approve($1, $2)", [minuteId, JSON.stringify(m.draft)]);
  assert.equal(v2, 2);
  await rows(U.rana, "select wt_minute_restore($1, 1)", [minuteId]);
  [m] = await rows(U.ghada, "select * from wt_minutes where id = $1", [minuteId]);
  assert.deepEqual(m.draft.notes, []);

  const [task] = await rows(U.rana, "select id from wt_tasks where title = 'دعوة كاتب ضيف'");
  await rows(U.rana, "update wt_tasks set proposal_approved = true, decision_minute_id = $2 where id = $1", [task.id, minuteId]);
  await rows(U.rana, "select wt_document_decision($1, $2, 'استضافة الكاتب في الحفل')", [task.id, minuteId]);
  [m] = await rows(U.ghada, "select * from wt_minutes where id = $1", [minuteId]);
  assert.ok(m.draft.decisions.includes("تم اعتماد الاقتراح: دعوة كاتب ضيف — استضافة الكاتب في الحفل"));

  assert.equal((await rows(U.ghada, "select id from wt_minutes where search_text like '%' || lower('الكاتب') || '%'")).length, 1);
  await rows(U.rana, "select wt_minute_set_archived($1, true)", [minuteId]);
  assert.equal((await rows(U.ghada, "select id from wt_minutes where competition = 'ar' and not archived")).length, 0);
  assert.equal((await rows(U.ghada, "select id from wt_minutes where competition = 'he'")).length, 0);
});

test("attachments: links must be http(s); items are logged", async () => {
  const [task] = await rows(U.rana, "select id from wt_tasks where title = 'دعوة كاتب ضيف'");
  await rows(U.rana, "insert into wt_task_items (task_id, kind, url, label) values ($1, 'link', 'https://example.com', 'صفحة')", [task.id]);
  await fails(rows(U.rana, "insert into wt_task_items (task_id, kind, url) values ($1, 'link', 'javascript:alert(1)')", [task.id]), /check constraint/);
  await rows(U.rana, "insert into wt_task_items (task_id, kind, body) values ($1, 'suggestion', 'نقترح قاعة البلدية')", [task.id]);
  const log = await rows(U.ghada, "select action from wt_audit where entity_id = $1 and action = 'item_added'", [task.id]);
  assert.equal(log.length, 2);
});

test("delete goes to the recycle bin; undo restores; duplicates checked on restore", async () => {
  const [t] = await rows(U.rana, `insert into wt_tasks (competition, axis, title, notes) values ('ar', 2, 'تصميم البوستر', 'ملاحظة') returning id`);
  await rows(U.rana, "insert into wt_task_items (task_id, kind, body) values ($1, 'suggestion', 'فكرة')", [t.id]);
  await rows(U.rana, "update wt_tasks set deleted_at = now() where id = $1", [t.id]);
  const live = await rows(U.ghada, "select id from wt_tasks where competition = 'ar' and deleted_at is null and id = $1", [t.id]);
  assert.equal(live.length, 0);
  // a new task with the same title is allowed while the old one is in the bin…
  const [t2] = await rows(U.ghada, `insert into wt_tasks (competition, axis, title) values ('ar', 2, 'تصميم البوستر') returning id`);
  // …so restoring the old one now would duplicate it
  await fails(rows(U.rana, "update wt_tasks set deleted_at = null where id = $1", [t.id]), /duplicate/);
  await rows(U.ghada, "delete from wt_tasks where id = $1", [t2.id]); // permanent delete
  const [back] = await rows(U.rana, "update wt_tasks set deleted_at = null where id = $1 returning notes", [t.id]);
  assert.equal(back.notes, "ملاحظة");
  assert.equal((await rows(U.ghada, "select id from wt_task_items where task_id = $1", [t.id])).length, 1, "attachments kept");
  const actions = (await rows(U.ghada, "select action from wt_audit where entity = 'task' and entity_id in ($1, $2) order by id", [t.id, t2.id])).map((r) => r.action);
  assert.deepEqual(actions.filter((a) => a !== "item_added"), ["created", "deleted", "created", "purged", "restored"]);
});

test("helpful materials: members add links/files per competition; only http(s) links", async () => {
  await rows(U.rana, "insert into wt_resources (competition, title, kind, url) values ('ar', 'مئشار التقييم', 'link', 'https://example.com/rubric')");
  await rows(U.rana, "insert into wt_resources (competition, title, kind, file_path, mime) values ('ar', 'بوستر', 'file', 'ar/resources/x.pdf', 'application/pdf')");
  await fails(rows(U.rana, "insert into wt_resources (competition, title, kind, url) values ('ar', 'x', 'link', 'javascript:alert(1)')"), /check constraint/);
  await fails(rows(U.stranger, "insert into wt_resources (competition, title, kind, url) values ('ar', 'x', 'link', 'https://a.b')"), /row-level security/);
  assert.equal((await rows(U.ghada, "select * from wt_resources where competition = 'ar'")).length, 2);
  assert.equal((await rows(U.ghada, "select * from wt_resources where competition = 'he'")).length, 0);
  assert.equal((await rows(U.stranger, "select * from wt_resources")).length, 0);
  await rows(U.ghada, "delete from wt_resources where title = 'بوستر'");
  assert.equal((await rows(U.ghada, "select * from wt_resources")).length, 1);
});
