import { handler, json, comp, audit, HttpError, MAX_FILE } from "@/lib/api";
import { q, one } from "@/lib/db";
import { extractText } from "@/lib/extract-text";
import { emptyMinute } from "@/lib/minute";

type Ctx = { params: Promise<{ comp: string }> };

export const GET = handler<Ctx>(async (req, _u, ctx) => {
  const c = comp((await ctx.params).comp);
  const url = new URL(req.url);
  const archived = url.searchParams.get("archived") === "1";
  const search = (url.searchParams.get("q") ?? "").trim();
  return json(
    await q(
      `SELECT m.id, m.title, m.meeting_date, m.status, m.has_pending_changes, m.current_version, m.archived,
         m.created_at, m.source_type, u.name AS uploader
       FROM minutes m JOIN users u ON u.id = m.uploaded_by
       WHERE m.competition = $1 AND m.archived = $2
         AND ($3 = '' OR m.title ILIKE '%' || $3 || '%' OR m.raw_text ILIKE '%' || $3 || '%'
              OR m.draft::text ILIKE '%' || $3 || '%' OR m.meeting_date ILIKE '%' || $3 || '%')
       ORDER BY m.created_at DESC`,
      [c, archived, search],
    ),
  );
});

export const POST = handler<Ctx>(async (req, user, ctx) => {
  const c = comp((await ctx.params).comp);
  const form = await req.formData();
  const sourceType = String(form.get("sourceType") ?? "direct");
  if (!["file", "whatsapp", "direct"].includes(sourceType)) throw new HttpError(400, "bad_source");
  const title = String(form.get("title") ?? "").trim();
  const date = String(form.get("date") ?? "").trim();
  let raw = String(form.get("text") ?? "").trim();
  let fileId: number | null = null;
  let extractFailed = false;

  if (sourceType === "file") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "file_required");
    if (file.size > MAX_FILE) throw new HttpError(413, "file_too_large");
    const buf = Buffer.from(await file.arrayBuffer());
    const f = await one<{ id: number }>(
      "INSERT INTO files (name, mime, size, data, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [file.name, file.type || "application/octet-stream", file.size, buf, user.id],
    );
    fileId = f!.id;
    try {
      raw = await extractText(file.name, file.type, buf);
    } catch {
      extractFailed = true;
    }
    if (!raw) extractFailed = true;
  } else if (!raw) {
    throw new HttpError(400, "text_required");
  }

  const draft = emptyMinute(title, date);
  draft.discussions = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const m = await one<{ id: number }>(
    `INSERT INTO minutes (competition, title, meeting_date, source_type, source_file_id, raw_text, draft, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [c, title, date, sourceType, fileId, raw, JSON.stringify(draft), user.id],
  );
  await audit(c, user.id, "minute", m!.id, "minute_created", title || date);
  return json({ id: m!.id, extractFailed }, 201);
});
