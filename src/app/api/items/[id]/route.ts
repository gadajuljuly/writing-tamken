import { handler, json, audit, HttpError } from "@/lib/api";
import { one, q } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handler<Ctx>(async (_req, user, ctx) => {
  const id = Number((await ctx.params).id);
  const it = await one<any>(
    `SELECT i.*, t.competition, t.title FROM task_items i JOIN tasks t ON t.id = i.task_id WHERE i.id = $1`, [id]);
  if (!it) throw new HttpError(404, "not_found");
  await q("DELETE FROM task_items WHERE id = $1", [id]);
  await audit(it.competition, user.id, "task", it.task_id, "item_removed", it.title, { kind: it.kind, label: it.label || it.url || it.body });
  return json({ ok: true });
});
