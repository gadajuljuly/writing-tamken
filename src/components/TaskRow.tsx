"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STATUSES } from "@/lib/i18n";
import { api, fmtDate, useComp } from "./client";
import type { Task } from "./types";

export function StatusControl({ task }: { task: Task }) {
  const { t } = useComp();
  return (
    <div className="status-control" role="radiogroup" aria-label={t.status}>
      {STATUSES.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={task.status === s} title={t[s]}
          className={`dot ${s} ${task.status === s ? "on" : ""}`} data-status={s}
          onClick={() => task.status !== s && api("PATCH", `/api/tasks/${task.id}`, { status: s })}>
          <span className="dot-label">{t[s]}</span>
        </button>
      ))}
    </div>
  );
}

function Notes({ task }: { task: Task }) {
  const { t } = useComp();
  const [v, setV] = useState(task.notes);
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setV(task.notes); }, [task.notes]);
  async function save() {
    editing.current = false;
    if (v === task.notes) return;
    setState("saving");
    await api("PATCH", `/api/tasks/${task.id}`, { notes: v });
    setState("saved");
    setTimeout(() => setState(""), 1500);
  }
  return (
    <div className="notes">
      <textarea value={v} placeholder={t.notesPh} aria-label={t.notes} rows={2}
        onFocus={() => (editing.current = true)} onChange={(e) => setV(e.target.value)} onBlur={save} />
      {state === "saved" && <span className="saved-hint">{t.saved}</span>}
    </div>
  );
}

function Extras({ task }: { task: Task }) {
  const { t, err } = useComp();
  const [mode, setMode] = useState<"" | "link" | "suggestion">("");
  const [url, setUrl] = useState(""); const [label, setLabel] = useState(""); const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    setMsg("");
    for (const file of Array.from(files ?? [])) {
      const fd = new FormData(); fd.append("file", file);
      try { await api("POST", `/api/tasks/${task.id}/items`, fd); } catch (e) { setMsg(err(e)); }
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  async function addOther(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    try {
      await api("POST", `/api/tasks/${task.id}/items`, mode === "link" ? { kind: "link", url, label } : { kind: "suggestion", body });
      setUrl(""); setLabel(""); setBody(""); setMode("");
    } catch (e) { setMsg(err(e)); }
  }

  return (
    <div className="extras">
      <h4>{t.attachments}</h4>
      {task.items.length > 0 && (
        <ul className="items">
          {task.items.map((i) => (
            <li key={i.id} className={`item ${i.kind}`}>
              {i.kind === "image" && <a href={`/api/files/${i.file_id}`} target="_blank"><img src={`/api/files/${i.file_id}`} alt={i.label} /></a>}
              {i.kind === "file" && <a href={`/api/files/${i.file_id}`} target="_blank">📎 {i.label}</a>}
              {i.kind === "link" && <a href={i.url} target="_blank" rel="noopener noreferrer">🔗 {i.label || i.url}</a>}
              {i.kind === "suggestion" && <span>💡 {i.body}</span>}
              <button className="icon-btn small" aria-label={t.delete} onClick={() => api("DELETE", `/api/items/${i.id}`)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="extras-actions">
        <button className="btn small" onClick={() => fileRef.current?.click()}>{t.addFile}</button>
        <input ref={fileRef} type="file" hidden multiple onChange={(e) => upload(e.target.files)} data-testid="task-file" />
        <button className="btn small" onClick={() => setMode(mode === "link" ? "" : "link")}>{t.addLink}</button>
        <button className="btn small" onClick={() => setMode(mode === "suggestion" ? "" : "suggestion")}>{t.addSuggestion}</button>
      </div>
      {mode && (
        <form className="inline-add" onSubmit={addOther}>
          {mode === "link" ? (
            <>
              <input dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t.linkPh} required />
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.labelPh} />
            </>
          ) : (
            <input value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.suggestionPh} required />
          )}
          <button className="btn small primary">{t.add}</button>
        </form>
      )}
      {msg && <p className="error small">{msg}</p>}
    </div>
  );
}

export function TaskRow({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const { comp, t } = useComp();
  const [open, setOpen] = useState(false);
  return (
    <li className={`task ${task.status}`} data-testid="task" data-title={task.title}>
      <div className="task-main">
        <StatusControl task={task} />
        <div className="task-body">
          <button className="task-title" onClick={() => setOpen(!open)} aria-expanded={open}>{task.title}</button>
          <div className="task-meta">
            {task.assignees.map((a) => <span key={a} className="person">{a}</span>)}
            {task.proposal_approved && <span className="badge approved">✓ {t.proposalApproved}</span>}
            {task.items.length > 0 && <span className="muted small">📎 {task.items.length}</span>}
          </div>
          {open && (
            <div className="task-details">
              {task.description && <p className="desc">{task.description}</p>}
              <p className="muted small">
                {t.addedOn}: {fmtDate(task.created_at, comp)}
                {task.completed_at && <> · {t.doneOn}: {fmtDate(task.completed_at, comp)}</>}
                {task.source_minute_id && <> · {t.fromMinute}: <Link href={`/${comp}/minutes/${task.source_minute_id}`}>{task.source_minute_title || `#${task.source_minute_id}`}</Link></>}
                {task.decision_minute_id && <> · {t.decisionMinute}: <Link href={`/${comp}/minutes/${task.decision_minute_id}`}>{task.decision_minute_title || `#${task.decision_minute_id}`}</Link></>}
              </p>
              <Extras task={task} />
              <div className="actions">
                <button className="btn small" onClick={onEdit}>{t.edit}</button>
                <button className="btn small danger" onClick={() => confirm(t.confirmDelete) && api("DELETE", `/api/tasks/${task.id}`)}>{t.delete}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Notes task={task} />
    </li>
  );
}
