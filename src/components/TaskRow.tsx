import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { STATUSES } from "@/lib/i18n";
import { addFileItem, addLinkItem, addSuggestionItem, deleteItem, fileUrl, updateTask, type Task, type TaskItem } from "@/lib/data";
import { fmtDate, useComp } from "./ui";

type Status = Task["status"];

/** Traffic light: the colour changes instantly; saving happens in the background. */
export function StatusControl({ task, status, onChange }: { task: Task; status: Status; onChange: (s: Status) => void }) {
  const { t, err } = useComp();
  async function pick(s: Status) {
    if (s === status) return;
    const before = status;
    onChange(s); // optimistic
    try { await updateTask(task.id, { status: s }); }
    catch (e) { onChange(before); alert(err(e)); }
  }
  return (
    <div className="status-control" role="radiogroup" aria-label={t.status}>
      {STATUSES.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={status === s} title={t[s]}
          className={`dot ${s} ${status === s ? "on" : ""}`} data-status={s} onClick={() => pick(s)}>
          <span className="dot-label">{t[s]}</span>
        </button>
      ))}
    </div>
  );
}

function Notes({ task }: { task: Task }) {
  const { t } = useComp();
  const [v, setV] = useState(task.notes);
  const [state, setState] = useState<"" | "saved">("");
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setV(task.notes); }, [task.notes]);
  async function save() {
    editing.current = false;
    if (v === task.notes) return;
    await updateTask(task.id, { notes: v });
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

/** Private files are opened through short-lived signed links. */
function FileItem({ item }: { item: TaskItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (item.file_path) fileUrl(item.file_path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [item.file_path]);
  if (item.kind === "image") return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.label} /></a> : <span>🖼 {item.label}</span>;
  return url ? <a href={url} target="_blank" rel="noreferrer">📎 {item.label}</a> : <span>📎 {item.label}</span>;
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
      try { await addFileItem(task, file); } catch (e) { setMsg(err(e)); }
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  async function addOther(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    try {
      if (mode === "link") await addLinkItem(task.id, url.trim(), label.trim());
      else await addSuggestionItem(task.id, body.trim());
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
              {(i.kind === "image" || i.kind === "file") && <FileItem item={i} />}
              {i.kind === "link" && <a href={i.url} target="_blank" rel="noopener noreferrer">🔗 {i.label || i.url}</a>}
              {i.kind === "suggestion" && <span>💡 {i.body}</span>}
              <button className="icon-btn small" aria-label={t.delete} onClick={() => deleteItem(i)}>✕</button>
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

export function TaskRow({ task, onEdit, onDelete }: { task: Task; onEdit: () => void; onDelete: (t: Task) => void }) {
  const { comp, t } = useComp();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(task.status);
  useEffect(() => setStatus(task.status), [task.status]);
  return (
    <li className={`task ${status}`} data-testid="task" data-title={task.title}>
      <div className="task-main">
        <StatusControl task={task} status={status} onChange={setStatus} />
        <div className="task-body">
          <div className="task-head">
            <button className="task-title" onClick={() => setOpen(!open)} aria-expanded={open}>{task.title}</button>
            <button className="icon-btn trash" title={t.delete} aria-label={`${t.delete}: ${task.title}`} data-testid="delete-task"
              onClick={() => onDelete(task)}>🗑</button>
          </div>
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
                {task.source_minute_id && <> · {t.fromMinute}: <Link to={`/${comp}/minutes/${task.source_minute_id}`}>{task.source_minute?.title || `#${task.source_minute_id}`}</Link></>}
                {task.decision_minute_id && <> · {t.decisionMinute}: <Link to={`/${comp}/minutes/${task.decision_minute_id}`}>{task.decision_minute?.title || `#${task.decision_minute_id}`}</Link></>}
              </p>
              <Extras task={task} />
              <div className="actions">
                <button className="btn small" onClick={onEdit}>{t.edit}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Notes task={task} />
    </li>
  );
}
