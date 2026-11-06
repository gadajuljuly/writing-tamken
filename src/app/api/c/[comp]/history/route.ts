import { handler, json, comp } from "@/lib/api";
import { q } from "@/lib/db";

type Ctx = { params: Promise<{ comp: string }> };

export const GET = handler<Ctx>(async (req, _u, ctx) => {
  const c = comp((await ctx.params).comp);
  const entity = new URL(req.url).searchParams.get("entity") || null;
  return json(
    await q(
      `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.competition = $1 AND ($2::text IS NULL OR a.entity = $2)
       ORDER BY a.created_at DESC, a.id DESC LIMIT 300`,
      [c, entity],
    ),
  );
});
