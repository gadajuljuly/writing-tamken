import { handler, json, comp } from "@/lib/api";
import { q } from "@/lib/db";
import { createTask } from "@/lib/tasks";

type Ctx = { params: Promise<{ comp: string }> };

export const GET = handler<Ctx>(async (_req, _u, ctx) => {
  const c = comp((await ctx.params).comp);
  const tasks = await q(
    `SELECT t.*, sm.title AS source_minute_title, dm.title AS decision_minute_title,
       COALESCE((SELECT json_agg(json_build_object('id', i.id, 'kind', i.kind, 'label', i.label, 'url', i.url,
         'body', i.body, 'file_id', i.file_id, 'file_name', f.name, 'mime', f.mime) ORDER BY i.id)
         FROM task_items i LEFT JOIN files f ON f.id = i.file_id WHERE i.task_id = t.id), '[]') AS items
     FROM tasks t
     LEFT JOIN minutes sm ON sm.id = t.source_minute_id
     LEFT JOIN minutes dm ON dm.id = t.decision_minute_id
     WHERE t.competition = $1 ORDER BY t.axis, t.created_at, t.id`,
    [c],
  );
  return json(tasks);
});

export const POST = handler<Ctx>(async (req, user, ctx) => {
  const c = comp((await ctx.params).comp);
  const id = await createTask(c, await req.json(), user.id);
  return json({ id }, 201);
});
