import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { fmtDate, Modal, useComp, useData } from "@/components/ui";
import { createMinute, listMinutes } from "@/lib/data";


function NewMinute({ onClose }: { onClose: () => void }) {
  const { comp, t, err } = useComp();
  const navigate = useNavigate();
  const [source, setSource] = useState<"file" | "whatsapp" | "direct">("file");
  const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const { id } = await createMinute(comp, { sourceType: source, title: title.trim(), date, text, file });
      navigate(`/${comp}/minutes/${id}`);
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
  const { data } = useData(() => listMinutes(comp), [comp]);
  const [creating, setCreating] = useState(false);

  return (
    <div className="minutes-page">
      <div className="page-head">
        <h2>{t.minutesTitle}</h2>
        <button className="btn primary" onClick={() => setCreating(true)}>+ {t.newMinute}</button>
      </div>
      <div className="card">
        {data && data.length === 0 && <p className="muted">{t.none}</p>}
        <ul className="list minutes-list">
          {data?.map((m) => (
            <li key={m.id}>
              <span className="minute-date">{m.meeting_date ? fmtDate(m.meeting_date, comp) : fmtDate(m.created_at, comp)}</span>
              <Link to={`/${comp}/minutes/${m.id}`} className="strong">{m.title || m.meeting_date || `#${m.id}`}</Link>
            </li>
          ))}
        </ul>
      </div>
      {creating && <NewMinute onClose={() => setCreating(false)} />}
    </div>
  );
}
