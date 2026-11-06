import "server-only";
import { one, q } from "./db";
import { HttpError } from "./api";
import { findDuplicate } from "./dedupe";
import type { Comp } from "./i18n";

export async function loadMinute(id: number) {
  const m = await one<any>("SELECT * FROM minutes WHERE id = $1", [id]);
  if (!m) throw new HttpError(404, "not_found");
  return m as { id: number; competition: Comp; uploaded_by: number; title: string; meeting_date: string; draft: any; current_version: number; [k: string]: any };
}

export function requireUploader(m: { uploaded_by: number }, userId: number) {
  if (m.uploaded_by !== userId) throw new HttpError(403, "only_uploader");
}

/** Recomputes duplicate flags of pending suggestions against existing tasks and each other. */
export async function refreshSuggestionDuplicates(minuteId: number, comp: Comp) {
  const tasks = await q<{ id: number; title: string }>("SELECT id, title FROM tasks WHERE competition = $1", [comp]);
  const sugg = await q<{ id: number; title: string; state: string }>(
    "SELECT id, title, state FROM suggestions WHERE minute_id = $1 ORDER BY id", [minuteId]);
  const seen: { id: number; title: string }[] = [];
  for (const s of sugg) {
    if (s.state !== "pending" && s.state !== "duplicate") continue;
    const dupTask = findDuplicate(s.title, tasks);
    const dupSibling = findDuplicate(s.title, seen);
    const state = dupTask || dupSibling ? "duplicate" : "pending";
    await q("UPDATE suggestions SET state = $2, duplicate_of = $3 WHERE id = $1", [s.id, state, dupTask?.id ?? null]);
    if (state === "pending") seen.push(s);
  }
}
