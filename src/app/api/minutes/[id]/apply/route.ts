import { handler, json, audit, HttpError } from "@/lib/api";
import { q } from "@/lib/db";
import { loadMinute, refreshSuggestionDuplicates, requireUploader } from "@/lib/minutes-server";
import { createTask } from "@/lib/tasks";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The uploader approves selected proposals: each becomes a checklist task linked to this minute.
 * Duplicates (of existing tasks or of each other) are never added.
 */
export const POST = handler<Ctx>(async (req, user, ctx) => {
  const m = await loadMinute(Number((await ctx.params).id));
  requireUploader(m, user.id);
  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, "nothing_selected");
  await refreshSuggestionDuplicates(m.id, m.competition);
  const rows = await q<any>("SELECT * FROM suggestions WHERE minute_id = $1 AND id = ANY($2::int[]) ORDER BY id",
    [m.id, ids.map(Number)]);
  const added: number[] = [], skipped: number[] = [];
  for (const s of rows) {
    if (s.state !== "pending") { skipped.push(s.id); continue; }
    try {
      const taskId = await createTask(m.competition,
        { title: s.title, description: s.description, axis: s.axis, assignees: s.assignees }, user.id, m.id);
      await q("UPDATE suggestions SET state = 'added', created_task_id = $2 WHERE id = $1", [s.id, taskId]);
      added.push(taskId);
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        await q("UPDATE suggestions SET state = 'duplicate', duplicate_of = $2 WHERE id = $1", [s.id, (e.extra?.duplicateOf as number) ?? null]);
        skipped.push(s.id);
      } else throw e;
    }
  }
  if (added.length)
    await audit(m.competition, user.id, "minute", m.id, "tasks_from_minute", m.title || m.meeting_date, { count: added.length });
  await refreshSuggestionDuplicates(m.id, m.competition);
  return json({ added: added.length, skipped: skipped.length });
});
