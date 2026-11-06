import "server-only";
import { NextResponse } from "next/server";
import { currentUser, type User } from "./auth";
import { isComp, type Comp } from "./i18n";
import { q } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Wraps a route handler: requires login, maps errors to JSON. */
export function handler<C>(fn: (req: Request, user: User, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      const user = await currentUser();
      if (!user) return json({ error: "unauthorized" }, 401);
      return await fn(req, user, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
      console.error(e);
      return json({ error: "server_error" }, 500);
    }
  };
}

export function comp(c: string): Comp {
  if (!isComp(c)) throw new HttpError(404, "unknown_competition");
  return c;
}

export async function audit(
  competition: Comp, userId: number, entity: string, entityId: number | null, action: string, summary: string, changes: Record<string, unknown> = {},
) {
  await q(
    "INSERT INTO audit_log (competition, user_id, entity, entity_id, action, summary, changes) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [competition, userId, entity, entityId, action, summary, JSON.stringify(changes)],
  );
}

/** Returns {field: {from, to}} for changed fields. */
export function diff(before: Record<string, any>, after: Record<string, any>, fields: string[]) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) out[f] = { from: before[f], to: after[f] };
  }
  return out;
}

export const MAX_FILE = 4 * 1024 * 1024; // 4 MB (fits serverless request limits)
