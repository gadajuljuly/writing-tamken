import { useEffect, useRef, useState } from "react";
import { addResourceFile, addResourceLink, createShare, deleteResource, reorderResources, shareUrl, fileUrl, viewUrl, listResources, renameResource, type Resource } from "@/lib/data";
import { fmtDate, useComp, useData } from "@/components/ui";

const TXT = {
  ar: {
    intro: "ملفات وروابط مفيدة لكل أعضاء اللجنة: مواضيع كتابة، مئشار تقييم، نماذج شهادات، بوسترات…",
    name: "اسم المادة", addFile: "📎 رفع ملف", addLink: "🔗 إضافة رابط", link: "https://…", save: "إضافة",
    empty: "لا توجد مواد بعد", confirmDelete: "حذف هذه المادة؟", notReady: "قسم المواد المساعدة يحتاج تحديث قاعدة البيانات (ملف schema.sql).",
    uploading: "جارٍ الرفع…", rename: "تغيير الاسم", ok: "حفظ", cancel: "إلغاء",
    share: "مشاركة", copied: "نُسخ الرابط. يمكنك لصقه في أي رسالة", whatsapp: "إرسال عبر WhatsApp",
    select: "اختيار", shareSelected: "📤 مشاركة المختار", selectAll: "اختيار الكل", clear: "إلغاء الاختيار", copiedMany: "نُزّلت الملفات إلى جهازك. أرفقيها في WhatsApp أو في البريد (والروابط نُسخت)",
  },
  he: {
    intro: "קבצים וקישורים שימושיים לכל חברי הוועדה: נושאי כתיבה, מחוון, תבניות תעודות, פוסטרים…",
    name: "שם החומר", addFile: "📎 העלאת קובץ", addLink: "🔗 הוספת קישור", link: "https://…", save: "הוספה",
    empty: "אין עדיין חומרים", confirmDelete: "למחוק את החומר?", notReady: "חלק חומרי העזר דורש עדכון של בסיס הנתונים (קובץ schema.sql).",
    uploading: "מעלה…", rename: "שינוי שם", ok: "שמירה", cancel: "ביטול",
    share: "שיתוף", copied: "הקישור הועתק. אפשר להדביק אותו בכל הודעה", whatsapp: "שליחה ב-WhatsApp",
    select: "בחירה", shareSelected: "📤 שיתוף הנבחרים", selectAll: "בחירת הכול", clear: "ניקוי הבחירה", copiedMany: "הקבצים הורדו למחשב. צרפו אותם ב-WhatsApp או במייל (והקישורים הועתקו)",
  },
};

/** 📤 share a permanent link to this one material (phone: share sheet; computer: copy + WhatsApp). */
function ShareButton({ r, onError }: { r: Resource; onError: (e: unknown) => void }) {
  const { comp } = useComp();
  const x = TXT[comp];
  const [shared, setShared] = useState<string | null>(null);
  async function share() {
    try {
      // short link to a page with this material (falls back to the direct link if the database is not updated yet)
      const url = await createShare(comp, [r.id], r.title).catch(() => shareUrl(r));
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await nav.share({ title: r.title, text: r.title, url }).catch(() => {});
        return;
      }
      await navigator.clipboard.writeText(url).catch(() => {});
      setShared(url);
      setTimeout(() => setShared(null), 15000);
    } catch (e) { onError(e); }
  }
  return (
    <>
      <button className="icon-btn share" title={x.share} aria-label={`${x.share}: ${r.title}`} data-testid="share" onClick={share}>📤</button>
      {shared && (
        <div className="toast" role="status" data-testid="share-toast">
          <span>{x.copied}</span>
          <a className="btn small" href={`https://wa.me/?text=${encodeURIComponent(`${r.title}\n${shared}`)}`} target="_blank" rel="noreferrer">{x.whatsapp}</a>
          <button className="icon-btn" onClick={() => setShared(null)} aria-label="close">✕</button>
        </div>
      )}
    </>
  );
}

type Drag = { onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDrop: () => void; onDragEnd: () => void; over: boolean; dragging: boolean };

function Item({ r, onDelete, onError, drag, checked, onCheck }: { r: Resource; onDelete: () => void; onError: (e: unknown) => void; drag: Drag; checked: boolean; onCheck: (v: boolean) => void }) {
  const { comp } = useComp();
  const x = TXT[comp];
  const [url, setUrl] = useState<string | null>(r.kind === "link" ? r.url : null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.title);
  useEffect(() => {
    let alive = true;
    if (r.kind === "file" && r.file_path) viewUrl(r.file_path).then((u) => alive && setUrl(u)).catch(() => {});
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
    <li className={`resource ${drag.over ? "drop-here" : ""} ${drag.dragging ? "dragging" : ""}`} data-testid="resource"
      draggable={!editing} onDragStart={drag.onDragStart} onDragOver={drag.onDragOver} onDrop={drag.onDrop} onDragEnd={drag.onDragEnd}>
      <span className="drag-handle" title="⇅" aria-hidden>⋮⋮</span>
      <input type="checkbox" className="pick" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`${x.select}: ${r.title}`} data-testid="pick" />
      <span className="resource-icon">{r.kind === "link" ? "🔗" : isImage ? "🖼" : "📄"}</span>
      <span className="res-name">{editing ? (
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
      )}</span>
      <ShareButton r={r} onError={onError} />
      <span className="muted small res-date">{fmtDate(r.created_at, comp)}</span>
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
  // ✓ several materials, then share all their links in one message
  const [picked, setPicked] = useState<number[]>([]);
  const [sharedText, setSharedText] = useState<string | null>(null);
  // ✓ several materials → sent as separate FILES (not a link to the app)
  const [sharing, setSharing] = useState(false);
  async function shareSelected() {
    setSharing(true); setMsg("");
    try {
      const chosen = list.filter((r) => picked.includes(r.id));
      const fileItems = chosen.filter((r) => r.kind === "file" && r.file_path);
      const links = chosen.filter((r) => r.kind === "link").map((r) => `${r.title}\n${r.url}`).join("\n\n");
      const files = await Promise.all(fileItems.map(async (r) => {
        const blob = await (await fetch(await fileUrl(r.file_path!))).blob();
        const ext = r.file_path!.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "";
        const name = (r.title.endsWith(ext) ? r.title : r.title + ext).replace(/[\\/:*?"<>|]/g, "-");
        return new File([blob], name, { type: r.mime || blob.type || "application/octet-stream" });
      }));
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
      // phone / supported computers: the share sheet with the files attached (WhatsApp, mail…)
      if (files.length && nav.canShare?.({ files }) && nav.share) {
        await nav.share({ files, ...(links ? { text: links } : {}) }).catch(() => {});
        return;
      }
      if (!files.length && links && nav.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await nav.share({ text: links }).catch(() => {});
        return;
      }
      // otherwise: download the files (then attach them in WhatsApp / mail); links are copied
      for (const f of files) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(f); a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }
      if (links) await navigator.clipboard.writeText(links).catch(() => {});
      setSharedText(links || " ");
      setTimeout(() => setSharedText(null), 20000);
    } catch (e) { setMsg(err(e)); } finally { setSharing(false); }
  }
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // drag & drop: take a title with the mouse and drop it before another one
  const [order, setOrder] = useState<Resource[] | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  useEffect(() => setOrder(null), [data]); // fresh data from the server replaces the local order
  const list = order ?? data ?? [];
  async function drop(targetId: number) {
    if (dragId === null || dragId === targetId || !data) return;
    const before = list.map((r) => r.id);
    const moved = list.filter((r) => r.id !== dragId);
    const from = before.indexOf(dragId), to = before.indexOf(targetId);
    const idx = moved.findIndex((r) => r.id === targetId) + (from < to ? 1 : 0);
    moved.splice(idx, 0, list.find((r) => r.id === dragId)!);
    setOrder(moved);
    setDragId(null); setOverId(null);
    try { await reorderResources(moved.map((r) => r.id), before); } catch (ex) { setOrder(null); setMsg(err(ex)); }
  }

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

      {picked.length > 0 && (
        <div className="pick-bar card" data-testid="pick-bar">
          <b>{picked.length} ✓</b>
          <button className="btn primary" onClick={shareSelected} disabled={sharing} data-testid="share-selected">{sharing ? "…" : x.shareSelected}</button>
          <button className="btn small" onClick={() => setPicked((data ?? []).map((r) => r.id))}>{x.selectAll}</button>
          <button className="btn small ghost" onClick={() => setPicked([])}>{x.clear}</button>
        </div>
      )}
      {sharedText && (
        <div className="toast" role="status" data-testid="share-many-toast">
          <span>{x.copiedMany}</span>
          <a className="btn small" href={`https://wa.me/?text=${encodeURIComponent(sharedText)}`} target="_blank" rel="noreferrer">{x.whatsapp}</a>
          <button className="icon-btn" onClick={() => setSharedText(null)} aria-label="close">✕</button>
        </div>
      )}
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
          {list.map((r) => (
            <Item key={r.id} r={r} onError={(e) => setMsg(err(e))}
              checked={picked.includes(r.id)} onCheck={(v) => setPicked((p) => (v ? [...p, r.id] : p.filter((id) => id !== r.id)))}
              drag={{
                onDragStart: () => setDragId(r.id),
                onDragOver: (e) => { e.preventDefault(); if (overId !== r.id) setOverId(r.id); },
                onDrop: () => drop(r.id),
                onDragEnd: () => { setDragId(null); setOverId(null); },
                over: overId === r.id && dragId !== r.id, dragging: dragId === r.id,
              }}
              onDelete={() => confirm(x.confirmDelete) && deleteResource(r).catch((e) => setMsg(err(e)))} />
          ))}
        </ul>
      </section>
    </div>
  );
}
