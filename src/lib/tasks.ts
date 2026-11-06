import "server-only";
import { q, one } from "./db";
import { HttpError, audit } from "./api";
import { findDuplicate, titleKey } from "./dedupe";
import type { Comp } from "./i18n";
import { STATUSES } from "./i18n";

export type TaskInput = {
  title: string; description?: string; axis?: number; assignees?: string[]; status?: string; notes?: string;
};

export function cleanAssignees(a: unknown): string[] {
  return Array.isArray(a) ? [...new Set(a.map((s) => String(s).trim()).filter(Boolean))] : [];
}

export async function existingTitles(comp: Comp) {
  return q<{ id: number; title: string }>("SELECT id, title FROM tasks WHERE competition = $1", [comp]);
}

export async function createTask(comp: Comp, input: TaskInput, userId: number, sourceMinuteId: number | null = null) {
  const title = String(input.title ?? "").trim();
  if (!title) throw new HttpError(400, "title_required");
  const dup = findDuplicate(title, await existingTitles(comp));
  if (dup) throw new HttpError(409, "duplicate", { duplicateOf: dup.id, duplicateTitle: dup.title });
  const axis = Number(input.axis) >= 1 && Number(input.axis) <= 6 ? Number(input.axis) : 6;
  const status = STATUSES.includes(input.status as any) ? input.status! : "not_started";
  try {
    const row = await one<{ id: number }>(
      `INSERT INTO tasks (competition, axis, title, title_key, description, assignees, status, notes, source_minute_id, created_by, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $7 = 'done' THEN now() ELSE NULL END) RETURNING id`,
      [comp, axis, title, titleKey(title), String(input.description ?? ""), JSON.stringify(cleanAssignees(input.assignees)), status, String(input.notes ?? ""), sourceMinuteId, userId],
    );
    await audit(comp, userId, "task", row!.id, sourceMinuteId ? "created_from_minute" : "created", title);
    return row!.id;
  } catch (e: any) {
    if (String(e?.code) === "23505" || /unique/i.test(String(e?.message))) throw new HttpError(409, "duplicate");
    throw e;
  }
}
