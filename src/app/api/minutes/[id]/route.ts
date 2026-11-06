import { handler, json, audit } from "@/lib/api";
import { q } from "@/lib/db";
import { loadMinute } from "@/lib/minutes-server";
import { normalizeMinute } from "@/lib/minute";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, user, ctx) => {
  const m = await loadMinute(Number((await ctx.params).id));
  const [uploader] = await q<{ name: string }>("SELECT name FROM users WHERE id = $1", [m.uploaded_by]);
  const versions = await q(
    `SELECT v.version, v.content, v.created_at, u.name AS approved_by_name
     FROM minute_versions v LEFT JOIN users u ON u.id = v.approved_by WHERE v.minute_id = $1 ORDER BY v.version DESC`, [m.id]);
  const suggestions = await q(
    `SELECT s.*, t.title AS duplicate_title FROM suggestions s LEFT JOIN tasks t ON t.id = s.duplicate_of
     WHERE s.minute_id = $1 ORDER BY s.id`, [m.id]);
  const linkedTasks = await q("SELECT id, title, status FROM tasks WHERE source_minute_id = $1 ORDER BY id", [m.id]);
  const file = m.source_file_id ? (await q("SELECT id, name FROM files WHERE id = $1", [m.source_file_id]))[0] : null;
  return json({
    ...m, uploader: uploader?.name, isUploader: m.uploaded_by === user.id, versions, suggestions, linkedTasks, file,
  });
});

/** Any member may edit the draft or archive; edits stay pending until the uploader approves them. */
export const PATCH = handler<Ctx>(async (req, user, ctx) => {
  const m = await loadMinute(Number((await ctx.params).id));
  const body = await req.json();
  if ("draft" in body) {
    const draft = normalizeMinute(body.draft);
    await q("UPDATE minutes SET draft = $2, has_pending_changes = true, updated_at = now() WHERE id = $1",
      [m.id, JSON.stringify(draft)]);
    await audit(m.competition, user.id, "minute", m.id, "minute_edited", m.title || m.meeting_date);
  }
  if ("archived" in body) {
    await q("UPDATE minutes SET archived = $2, updated_at = now() WHERE id = $1", [m.id, !!body.archived]);
    await audit(m.competition, user.id, "minute", m.id, body.archived ? "minute_archived" : "minute_unarchived", m.title || m.meeting_date);
  }
  return json({ ok: true });
});
