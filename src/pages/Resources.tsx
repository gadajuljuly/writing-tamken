import { useEffect, useRef, useState } from "react";
import { addResourceFile, addResourceLink, deleteResource, fileUrl, listResources, renameResource, type Resource } from "@/lib/data";
import { fmtDate, useComp, useData } from "@/components/ui";

const TXT = {
  ar: {
    intro: "ملفات وروابط مفيدة لكل أعضاء اللجنة: مواضيع كتابة، مئشار تقييم، نماذج شهادات، بوسترات…",
    name: "اسم المادة", addFile: "📎 رفع ملف", addLink: "🔗 إضافة رابط", link: "https://…", save: "إضافة",
    empty: "لا توجد مواد بعد", confirmDelete: "حذف هذه المادة؟", notReady: "قسم المواد المساعدة يحتاج تحديث قاعدة البيانات (ملف schema.sql).",
    uploading: "جارٍ الرفع…", rename: "تغيير الاسم", ok: "حفظ", cancel: "إلغاء",
  },
  he: {
    intro: "קבצים וקישורים שימושיים לכל חברי הוועדה: נושאי כתיבה, מחוון, תבניות תעודות, פוסטרים…",
    name: "שם החומר", addFile: "📎 העלאת קובץ", addLink: "🔗 הוספת קישור", link: "https://…", save: "הוספה",
    empty: "אין עדיין חומרים", confirmDelete: "למחוק את החומר?", notReady: "חלק חומרי העזר דורש עדכון של בסיס הנתונים (קובץ schema.sql).",
    uploading: "מעלה…", rename: "שינוי שם", ok: "שמירה", cancel: "ביטול",
  },
};

function Item({ r, onDelete, onError }: { r: Resource; onDelete: () => void; onError: (e: unknown) => void }) {
  const { comp } = useComp();
  const x = TXT[comp];
  const [url, setUrl] = useState<string | null>(r.kind === "link" ? r.url : null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.title);
  useEffect(() => {
    let alive = true;
    if (r.kind === "file" && r.file_path) fileUrl(r.file_path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [r.file_path, r.kind]);
  useEffect(() => { if (!editing) setName(r.title); }, [r.title, editing]);

  async function saveName(e?: React.FormEvent) {
    e?.preventDefault();
    if (name.trim() && name.trim() !== r.title) {
      try { await renameResource(r.id, name, r.title); } catch (ex) { onError(ex); }
    }
    setEditing(false);
  }

  const isImage = r.kind === "file" && /^image\/(png|jpe?g|gif|webp|avif)$/.test(r.mime ?? "");
  return (
    <li className="resource" data-testid="resource">
      <span className="resource-icon">{r.kind === "link" ? "🔗" : isImage ? "🖼" : "📄"}</span>
      {editing ? (
        <form className="rename" onSubmit={saveName}>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label={x.rename}
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)} />
          <button className="btn small primary">{x.ok}</button>
          <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>{x.cancel}</button>
        </form>
      ) : (
        <>
          {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="strong">{r.title}</a> : <span className="strong">{r.title}</span>}
          <button className="icon-btn" title={x.rename} aria-label={`${x.rename}: ${r.title}`} data-testid="rename" onClick={() => setEditing(true)}>✏️</button>
        </>
      )}
      <span className="muted small">{fmtDate(r.created_at, comp)}</span>
      <button className="icon-btn trash" aria-label="delete" onClick={onDelete}>🗑</button>
    </li>
  );
}

/** مواد مساعدة: shared files and links for the committee. */
export default function Resources() {
  const { comp, t, err } = useComp();
  const x = TXT[comp];
  const { data, error } = useData(() => listResources(comp), [comp]);
  const [linkForm, setLinkForm] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // choosing files uploads them right away (the name is the file name; it can be renamed later with ✏️)
  async function upload(files: FileList | null) {
    setBusy(true); setMsg("");
    for (const f of Array.from(files ?? [])) {
      try { await addResourceFile(comp, "", f); } catch (ex) { setMsg(`${f.name}: ${err(ex)}`); }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function saveLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try { await addResourceLink(comp, title, url); setTitle(""); setUrl(""); setLinkForm(false); }
    catch (ex) { setMsg(err(ex)); } finally { setBusy(false); }
  }

  return (
    <div className="resources-page">
      <div className="page-head">
        <h2>{t.resources}</h2>
        <div className="actions">
          <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="upload-resource">
            {busy ? x.uploading : x.addFile}
          </button>
          <input ref={fileRef} type="file" hidden multiple onChange={(e) => upload(e.target.files)} data-testid="resource-file" />
          <button className="btn" onClick={() => setLinkForm(!linkForm)}>{x.addLink}</button>
        </div>
      </div>
      <p className="muted">{x.intro}</p>
      {msg && <p className="error" role="alert">{msg}</p>}

      {linkForm && (
        <form className="card form" onSubmit={saveLink}>
          <label>{x.name}<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={x.link} required dir="ltr" />
          <div className="actions"><button className="btn primary" disabled={busy}>{x.save}</button></div>
        </form>
      )}

      <section className="card">
        {error && <p className="error">{x.notReady}</p>}
        {data && data.length === 0 && <p className="muted">{x.empty}</p>}
        <ul className="list">
          {data?.map((r) => (
            <Item key={r.id} r={r} onError={(e) => setMsg(err(e))}
              onDelete={() => confirm(x.confirmDelete) && deleteResource(r).catch((e) => setMsg(err(e)))} />
          ))}
        </ul>
      </section>
    </div>
  );
}
