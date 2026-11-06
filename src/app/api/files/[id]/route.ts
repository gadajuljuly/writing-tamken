import { handler, HttpError } from "@/lib/api";
import { one } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Files are stored in the database and served only to signed-in committee members. */
export const GET = handler<Ctx>(async (_req, _u, ctx) => {
  const f = await one<any>("SELECT name, mime, data FROM files WHERE id = $1", [Number((await ctx.params).id)]);
  if (!f) throw new HttpError(404, "not_found");
  // Only safe types are shown inline (SVG/HTML are always downloaded to avoid script execution).
  const inline = /^image\/(png|jpe?g|gif|webp|avif)$|^application\/pdf$/.test(f.mime);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
});
