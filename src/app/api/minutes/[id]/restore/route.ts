import { handler, json, audit, HttpError } from "@/lib/api";
import { one, q } from "@/lib/db";
import { loadMinute } from "@/lib/minutes-server";

type Ctx = { params: Promise<{ id: string }> };

/** Copies an earlier approved version back into the draft (the uploader then approves it again). */
export const POST = handler<Ctx>(async (req, user, ctx) => {
  const m = await loadMinute(Number((await ctx.params).id));
  const { version } = await req.json();
  const v = await one<any>("SELECT content FROM minute_versions WHERE minute_id = $1 AND version = $2", [m.id, Number(version)]);
  if (!v) throw new HttpError(404, "version_not_found");
  await q("UPDATE minutes SET draft = $2, has_pending_changes = true, updated_at = now() WHERE id = $1",
    [m.id, JSON.stringify(v.content)]);
  await audit(m.competition, user.id, "minute", m.id, "minute_restored", m.title || m.meeting_date, { version: Number(version) });
  return json({ ok: true });
});
