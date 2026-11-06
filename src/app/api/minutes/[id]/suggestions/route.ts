import { handler, json, HttpError } from "@/lib/api";
import { q } from "@/lib/db";
import { loadMinute, refreshSuggestionDuplicates } from "@/lib/minutes-server";
import { cleanAssignees } from "@/lib/tasks";

type Ctx = { params: Promise<{ id: string }> };

/** Adds a task proposal to a minute manually (used when AI is off, or to complete the AI list). */
export const POST = handler<Ctx>(async (req, _user, ctx) => {
  const m = await loadMinute(Number((await ctx.params).id));
  const b = await req.json();
  const title = String(b.title ?? "").trim();
  if (!title) throw new HttpError(400, "title_required");
  const axis = Math.min(6, Math.max(1, Number(b.axis) || 6));
  await q("INSERT INTO suggestions (minute_id, title, description, axis, assignees) VALUES ($1,$2,$3,$4,$5)",
    [m.id, title, String(b.description ?? ""), axis, JSON.stringify(cleanAssignees(b.assignees))]);
  await refreshSuggestionDuplicates(m.id, m.competition);
  return json({ ok: true }, 201);
});
