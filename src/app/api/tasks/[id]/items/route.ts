import { handler, json, audit, HttpError, MAX_FILE } from "@/lib/api";
import { one } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Adds an attachment (file / image), a link or a suggestion to a task. */
export const POST = handler<Ctx>(async (req, user, ctx) => {
  const taskId = Number((await ctx.params).id);
  const task = await one<any>("SELECT id, competition, title FROM tasks WHERE id = $1", [taskId]);
  if (!task) throw new HttpError(404, "not_found");

  let kind: string, label = "", url = "", body = "", fileId: number | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "file_required");
    if (file.size > MAX_FILE) throw new HttpError(413, "file_too_large");
    const f = await one<{ id: number }>(
      "INSERT INTO files (name, mime, size, data, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [file.name, file.type || "application/octet-stream", file.size, Buffer.from(await file.arrayBuffer()), user.id],
    );
    fileId = f!.id;
    kind = (file.type || "").startsWith("image/") ? "image" : "file";
    label = file.name;
  } else {
    const b = await req.json();
    kind = b.kind;
    if (kind === "link") {
      url = String(b.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) throw new HttpError(400, "bad_url");
      label = String(b.label ?? "").trim();
    } else if (kind === "suggestion") {
      body = String(b.body ?? "").trim();
      if (!body) throw new HttpError(400, "text_required");
    } else throw new HttpError(400, "bad_kind");
  }
  const row = await one<{ id: number }>(
    "INSERT INTO task_items (task_id, kind, label, url, body, file_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [taskId, kind, label, url, body, fileId, user.id],
  );
  await audit(task.competition, user.id, "task", taskId, "item_added", task.title, { kind, label: label || url || body });
  return json({ id: row!.id }, 201);
});
