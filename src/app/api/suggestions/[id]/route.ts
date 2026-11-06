import { handler, json, HttpError } from "@/lib/api";
import { one, q } from "@/lib/db";
import { loadMinute, refreshSuggestionDuplicates, requireUploader } from "@/lib/minutes-server";
import { cleanAssignees } from "@/lib/tasks";

type Ctx = { params: Promise<{ id: string }> };

/** Edit a pending proposal, or reject it (rejecting is the uploader's decision). */
export const PATCH = handler<Ctx>(async (req, user, ctx) => {
  const s = await one<any>("SELECT * FROM suggestions WHERE id = $1", [Number((await ctx.params).id)]);
  if (!s) throw new HttpError(404, "not_found");
  if (s.state === "added") throw new HttpError(409, "already_added");
  const m = await loadMinute(s.minute_id);
  const b = await req.json();
  if (b.state === "rejected" || b.state === "pending") {
    requireUploader(m, user.id);
    await q("UPDATE suggestions SET state = $2 WHERE id = $1", [s.id, b.state]);
  }
  const title = "title" in b ? String(b.title ?? "").trim() || s.title : s.title;
  const axis = "axis" in b ? Math.min(6, Math.max(1, Number(b.axis) || 6)) : s.axis;
  const description = "description" in b ? String(b.description ?? "") : s.description;
  const assignees = "assignees" in b ? cleanAssignees(b.assignees) : s.assignees;
  await q("UPDATE suggestions SET title=$2, axis=$3, description=$4, assignees=$5 WHERE id=$1",
    [s.id, title, axis, description, JSON.stringify(assignees)]);
  await refreshSuggestionDuplicates(m.id, m.competition);
  return json({ ok: true });
});
