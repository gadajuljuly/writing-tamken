"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, fmtDate, Modal, useComp, useData } from "@/components/client";

type Row = { id: number; title: string; meeting_date: string; status: string; has_pending_changes: boolean; current_version: number; created_at: string; uploader: string };

function NewMinute({ onClose }: { onClose: () => void }) {
  const { comp, t, err } = useComp();
  const router = useRouter();
  const [source, setSource] = useState<"file" | "whatsapp" | "direct">("file");
  const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const fd = new FormData();
    fd.append("sourceType", source); fd.append("title", title); fd.append("date", date);
    if (source === "file" && file) fd.append("file", file); else fd.append("text", text);
    try {
      const { id } = await api<{ id: number }>("POST", `/api/c/${comp}/minutes`, fd);
      router.push(`/${comp}/minutes/${id}`);
    } catch (e) { setMsg(err(e)); setBusy(false); }
  }

  return (
    <Modal title={t.newMinute} onClose={onClose} wide>
      <form className="form" onSubmit={create}>
        <div className="segmented" role="tablist">
          {(["file", "whatsapp", "direct"] as const).map((s) => (
            <button type="button" key={s} role="tab" aria-selected={source === s} className={source === s ? "on" : ""} onClick={() => setSource(s)}>
              {s === "file" ? t.uploadFile : s === "whatsapp" ? t.pasteWhatsapp : t.writeDirect}
            </button>
          ))}
        </div>
        <div className="row-2">
          <label>{t.meetingTitle}<input value={title} onChange={(e) => setTitle(e.target.value)} name="title" /></label>
          <label>{t.meetingDate}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} name="date" /></label>
        </div>
        {source === "file" ? (
          <label>{t.uploadFile}
            <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} required data-testid="minute-file" />
          </label>
        ) : (
          <label>{source === "whatsapp" ? t.pasteWhatsapp : t.writeDirect}
            <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} required name="text" />
          </label>
        )}
        {msg && <p className="error">{msg}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>{t.create}</button>
          <button type="button" className="btn ghost" onClick={onClose}>{t.cancel}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function MinutesPage() {
  const { comp, t } = useComp();
  const [qText, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const { data } = useData<Row[]>(`/api/c/${comp}/minutes?archived=${archived ? 1 : 0}&q=${encodeURIComponent(qText)}`);
  const [creating, setCreating] = useState(false);

  return (
    <div className="minutes-page">
      <div className="page-head">
        <h2>{t.minutesTitle}</h2>
        <button className="btn primary" onClick={() => setCreating(true)}>+ {t.newMinute}</button>
      </div>
      <div className="filters card">
        <input type="search" placeholder={t.search} value={qText} onChange={(e) => setQ(e.target.value)} aria-label={t.search} />
        <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />{t.showArchived}</label>
      </div>
      <div className="card">
        {data && data.length === 0 && <p className="muted">{t.none}</p>}
        <ul className="list minutes-list">
          {data?.map((m) => (
            <li key={m.id}>
              <Link href={`/${comp}/minutes/${m.id}`} className="strong">{m.title || m.meeting_date || `#${m.id}`}</Link>
              <span className={`badge ${m.status}`}>{m.status === "approved" ? `${t.approved} · ${t.version} ${m.current_version}` : t.draft}</span>
              {m.has_pending_changes && m.status === "approved" && <span className="badge pending">{t.pending}</span>}
              <span className="muted small">{m.meeting_date} · {t.uploadedBy}: {m.uploader} · {fmtDate(m.created_at, comp)}</span>
            </li>
          ))}
        </ul>
      </div>
      {creating && <NewMinute onClose={() => setCreating(false)} />}
    </div>
  );
}
