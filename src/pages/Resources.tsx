import { useEffect, useRef, useState } from "react";
import { addResourceFile, addResourceLink, deleteResource, fileUrl, listResources, type Resource } from "@/lib/data";
import { fmtDate, useComp, useData } from "@/components/ui";

const TXT = {
  ar: {
    intro: "ملفات وروابط مفيدة لكل أعضاء اللجنة: مواضيع كتابة، مئشار تقييم، نماذج شهادات، بوسترات…",
    name: "اسم المادة", addFile: "📎 رفع ملف", addLink: "🔗 إضافة رابط", link: "https://…", save: "إضافة",
    empty: "لا توجد مواد بعد", confirmDelete: "حذف هذه المادة؟", notReady: "قسم المواد المساعدة يحتاج تحديث قاعدة البيانات (ملف schema.sql).",
  },
  he: {
    intro: "קבצים וקישורים שימושיים לכל חברי הוועדה: נושאי כתיבה, מחוון, תבניות תעודות, פוסטרים…",
    name: "שם החומר", addFile: "📎 העלאת קובץ", addLink: "🔗 הוספת קישור", link: "https://…", save: "הוספה",
    empty: "אין עדיין חומרים", confirmDelete: "למחוק את החומר?", notReady: "חלק חומרי העזר דורש עדכון של בסיס הנתונים (קובץ schema.sql).",
  },
};

function Item({ r, onDelete }: { r: Resource; onDelete: () => void }) {
  const { comp } = useComp();
  const [url, setUrl] = useState<string | null>(r.kind === "link" ? r.url : null);
  useEffect(() => {
    let alive = true;
    if (r.kind === "file" && r.file_path) fileUrl(r.file_path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [r]);
  const isImage = r.kind === "file" && /^image\/(png|jpe?g|gif|webp|avif)$/.test(r.mime ?? "");
  return (
    <li className="resource" data-testid="resource">
      <span className="resource-icon">{r.kind === "link" ? "🔗" : isImage ? "🖼" : "📄"}</span>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="strong">{r.title}</a> : <span className="strong">{r.title}</span>}
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
  const [mode, setMode] = useState<"" | "file" | "link">("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      if (mode === "file") {
        const f = fileRef.current?.files?.[0];
        if (!f) return;
        await addResourceFile(comp, title, f);
      } else await addResourceLink(comp, title, url);
      setTitle(""); setUrl(""); setMode("");
    } catch (ex) { setMsg(err(ex)); } finally { setBusy(false); }
  }

  return (
    <div className="resources-page">
      <div className="page-head">
        <h2>{t.resources}</h2>
        <div className="actions">
          <button className="btn primary" onClick={() => setMode(mode === "file" ? "" : "file")}>{x.addFile}</button>
          <button className="btn" onClick={() => setMode(mode === "link" ? "" : "link")}>{x.addLink}</button>
        </div>
      </div>
      <p className="muted">{x.intro}</p>

      {mode && (
        <form className="card form" onSubmit={save}>
          <label>{x.name}<input value={title} onChange={(e) => setTitle(e.target.value)} required={mode === "link"} /></label>
          {mode === "file"
            ? <input ref={fileRef} type="file" required data-testid="resource-file" />
            : <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={x.link} required dir="ltr" />}
          {msg && <p className="error">{msg}</p>}
          <div className="actions"><button className="btn primary" disabled={busy}>{x.save}</button></div>
        </form>
      )}

      <section className="card">
        {error && <p className="error">{x.notReady}</p>}
        {data && data.length === 0 && <p className="muted">{x.empty}</p>}
        <ul className="list">
          {data?.map((r) => (
            <Item key={r.id} r={r} onDelete={() => confirm(x.confirmDelete) && deleteResource(r).catch((e) => setMsg(err(e)))} />
          ))}
        </ul>
      </section>
    </div>
  );
}
