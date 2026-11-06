import { handler, json, audit, HttpError } from "@/lib/api";
import { q } from "@/lib/db";
import { loadMinute, requireUploader } from "@/lib/minutes-server";
import { normalizeMinute } from "@/lib/minute";

type Ctx = { params: Promise<{ id: string }> };

/** Only the person who uploaded the minutes can approve them; each approval creates a new version. */
export const POST = handler<Ctx>(async (req, user, ctx) => {
  const m = await loadMinute(Number((await ctx.params).id));
  requireUploader(m, user.id);
  const body = await req.json().catch(() => ({}));
  const content = normalizeMinute(body.draft ?? m.draft);
  if (!content.title && !content.date && !content.discussions.length && !content.decisions.length)
    throw new HttpError(400, "empty");
  const version = m.current_version + 1;
  await q("INSERT INTO minute_versions (minute_id, version, content, approved_by) VALUES ($1,$2,$3,$4)",
    [m.id, version, JSON.stringify(content), user.id]);
  await q(
    `UPDATE minutes SET draft = $2, status = 'approved', has_pending_changes = false, current_version = $3,
       title = $4, meeting_date = $5, updated_at = now() WHERE id = $1`,
    [m.id, JSON.stringify(content), version, content.title || m.title, content.date || m.meeting_date]);
  await audit(m.competition, user.id, "minute", m.id, "minute_approved", content.title || m.title, { version });
  return json({ ok: true, version });
});
