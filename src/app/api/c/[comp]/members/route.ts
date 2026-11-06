import { handler, json, comp, audit, HttpError } from "@/lib/api";
import { q } from "@/lib/db";

type Ctx = { params: Promise<{ comp: string }> };

export const GET = handler<Ctx>(async (_req, _u, ctx) => {
  const c = comp((await ctx.params).comp);
  return json(await q("SELECT id, name FROM members WHERE competition = $1 ORDER BY id", [c]));
});

export const POST = handler<Ctx>(async (req, user, ctx) => {
  const c = comp((await ctx.params).comp);
  // The Arabic competition uses the fixed committee list; the Hebrew one lets members add names.
  if (c !== "he") throw new HttpError(403, "fixed_list");
  const name = String((await req.json()).name ?? "").trim();
  if (!name) throw new HttpError(400, "name_required");
  const rows = await q<{ id: number }>(
    "INSERT INTO members (competition, name) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id",
    [c, name],
  );
  if (rows.length) await audit(c, user.id, "member", rows[0].id, "member_added", name);
  return json({ ok: true });
});
