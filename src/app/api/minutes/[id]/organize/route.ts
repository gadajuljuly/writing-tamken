import { handler, json, audit, HttpError } from "@/lib/api";
import { q } from "@/lib/db";
import { loadMinute, refreshSuggestionDuplicates } from "@/lib/minutes-server";
import { organizeMinutes, aiMode } from "@/lib/ai";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 120;

/** AI: organizes the raw minutes into a draft and proposes tasks. Nothing is approved here. */
export const POST = handler<Ctx>(async (_req, user, ctx) => {
  const m = await loadMinute(Number((await ctx.params).id));
  if (aiMode() === "off") throw new HttpError(503, "ai_off");
  if (!m.raw_text.trim()) throw new HttpError(400, "no_text");
  const members = (await q<{ name: string }>("SELECT name FROM members WHERE competition = $1", [m.competition])).map((r) => r.name);
  const existing = (await q<{ title: string }>("SELECT title FROM tasks WHERE competition = $1", [m.competition])).map((r) => r.title);

  let result;
  try {
    result = await organizeMinutes(m.competition, m.raw_text, { title: m.title, date: m.meeting_date }, members, existing);
  } catch (e) {
    console.error("AI organize failed", e);
    throw new HttpError(502, "ai_failed");
  }

  await q("UPDATE minutes SET draft = $2, ai_organized = true, has_pending_changes = true, updated_at = now() WHERE id = $1",
    [m.id, JSON.stringify(result.minutes)]);
  await q("DELETE FROM suggestions WHERE minute_id = $1 AND state IN ('pending','duplicate')", [m.id]);
  for (const t of result.tasks) {
    await q("INSERT INTO suggestions (minute_id, title, description, axis, assignees) VALUES ($1,$2,$3,$4,$5)",
      [m.id, t.title, t.description, t.axis, JSON.stringify(t.assignees)]);
  }
  await refreshSuggestionDuplicates(m.id, m.competition);
  await audit(m.competition, user.id, "minute", m.id, "minute_organized", m.title || m.meeting_date, { suggestions: result.tasks.length });
  return json({ ok: true, mode: aiMode() });
});
