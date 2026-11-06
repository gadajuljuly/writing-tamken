import { handler, json, comp } from "@/lib/api";
import { q } from "@/lib/db";
import { progress } from "@/lib/dedupe";

type Ctx = { params: Promise<{ comp: string }> };
export const GET = handler<Ctx>(async (_req, _u, ctx) => {
  const c = comp((await ctx.params).comp);
  const rows = await q<{ status: string; n: number }>(
    "SELECT status, count(*)::int AS n FROM tasks WHERE competition = $1 GROUP BY status",
    [c],
  );
  const counts = { not_started: 0, in_progress: 0, done: 0 };
  for (const r of rows) (counts as Record<string, number>)[r.status] = Number(r.n);
  const minutes = await q(
    `SELECT m.id, m.title, m.meeting_date, m.status, m.has_pending_changes, m.created_at, u.name AS uploader
     FROM minutes m JOIN users u ON u.id = m.uploaded_by
     WHERE m.competition = $1 AND NOT m.archived ORDER BY m.created_at DESC LIMIT 5`,
    [c],
  );
  const updates = await q(
    `SELECT a.id, a.entity, a.entity_id, a.action, a.summary, a.created_at, u.name AS user_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.competition = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT 8`,
    [c],
  );
  return json({ counts, ...progress(counts), minutes, updates });
});
