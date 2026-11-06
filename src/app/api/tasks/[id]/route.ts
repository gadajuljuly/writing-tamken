import { handler, json, audit, diff, HttpError } from "@/lib/api";
import { q, one } from "@/lib/db";
import { STATUSES, DICT, type Comp } from "@/lib/i18n";
import { findDuplicate, titleKey } from "@/lib/dedupe";
import { cleanAssignees } from "@/lib/tasks";
import { emptyMinute, normalizeMinute } from "@/lib/minute";

type Ctx = { params: Promise<{ id: string }> };
const FIELDS = ["title", "description", "axis", "assignees", "status", "notes", "proposal_approved", "decision_minute_id"];

async function load(id: number) {
  const t = await one<any>("SELECT * FROM tasks WHERE id = $1", [id]);
  if (!t) throw new HttpError(404, "not_found");
  return t;
}

export const PATCH = handler<Ctx>(async (req, user, ctx) => {
  const id = Number((await ctx.params).id);
  const before = await load(id);
  const comp = before.competition as Comp;
  const body = await req.json();
  const next: Record<string, any> = {};

  if ("title" in body) {
    const title = String(body.title ?? "").trim();
    if (!title) throw new HttpError(400, "title_required");
    const others = await q<{ id: number; title: string }>(
      "SELECT id, title FROM tasks WHERE competition = $1 AND id <> $2", [comp, id]);
    const dup = findDuplicate(title, others);
    if (dup) throw new HttpError(409, "duplicate", { duplicateOf: dup.id, duplicateTitle: dup.title });
    next.title = title;
  }
  if ("description" in body) next.description = String(body.description ?? "");
  if ("notes" in body) next.notes = String(body.notes ?? "");
  if ("axis" in body) next.axis = Math.min(6, Math.max(1, Number(body.axis) || 6));
  if ("assignees" in body) next.assignees = cleanAssignees(body.assignees);
  if ("status" in body) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, "bad_status");
    next.status = body.status;
  }
  if ("proposal_approved" in body) next.proposal_approved = !!body.proposal_approved;
  if ("decision_minute_id" in body) {
    const mid = body.decision_minute_id ? Number(body.decision_minute_id) : null;
    if (mid && !(await one("SELECT 1 FROM minutes WHERE id = $1 AND competition = $2", [mid, comp])))
      throw new HttpError(400, "bad_minute");
    next.decision_minute_id = mid;
  }

  const changes = diff(before, next, FIELDS);
  if (Object.keys(changes).length === 0) return json({ ok: true });

  const merged = { ...before, ...next };
  const completedAt =
    merged.status === "done" ? (before.status === "done" ? before.completed_at : new Date()) : null;
  await q(
    `UPDATE tasks SET title=$2, title_key=$3, description=$4, notes=$5, axis=$6, assignees=$7, status=$8,
       proposal_approved=$9, decision_minute_id=$10, completed_at=$11, updated_at=now() WHERE id=$1`,
    [id, merged.title, titleKey(merged.title), merged.description, merged.notes, merged.axis,
      JSON.stringify(merged.assignees), merged.status, merged.proposal_approved, merged.decision_minute_id, completedAt],
  );

  // Document an approved proposal in the chosen minutes (as a pending change the uploader must approve).
  if (merged.proposal_approved && merged.decision_minute_id &&
      (changes.proposal_approved || changes.decision_minute_id || body.decision_text)) {
    const m = await one<any>(
      `SELECT m.*, (SELECT content FROM minute_versions v WHERE v.minute_id = m.id ORDER BY version DESC LIMIT 1) AS latest
       FROM minutes m WHERE m.id = $1`, [merged.decision_minute_id]);
    const draft = normalizeMinute(m.draft ?? m.latest ?? emptyMinute(m.title, m.meeting_date));
    const text = String(body.decision_text ?? "").trim();
    draft.decisions.push(`${DICT[comp].proposalApproved}: ${merged.title}${text ? ` — ${text}` : ""}`);
    await q("UPDATE minutes SET draft=$2, has_pending_changes=true, updated_at=now() WHERE id=$1",
      [m.id, JSON.stringify(draft)]);
    await audit(comp, user.id, "minute", m.id, "decision_documented", m.title || m.meeting_date, { task: merged.title, text });
  }

  const action = Object.keys(changes).length === 1 && changes.status ? "status" : "updated";
  await audit(comp, user.id, "task", id, action, merged.title, changes);
  return json({ ok: true });
});

export const DELETE = handler<Ctx>(async (_req, user, ctx) => {
  const id = Number((await ctx.params).id);
  const t = await load(id);
  await q("DELETE FROM tasks WHERE id = $1", [id]);
  await audit(t.competition, user.id, "task", id, "deleted", t.title);
  return json({ ok: true });
});
