import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AXES } from "@/lib/i18n";
import { buildPrompt, parseAnswer } from "@/lib/aiPrompt";
import { emptyMinute, type MinuteContent } from "@/lib/minute";
import { fmtDate, useComp, useData } from "@/components/ui";
import { addSuggestion, aiMode, applySuggestions, approveMinute, viewUrl, getMinute, organizeMinute, restoreVersion, saveDraft,
  setAiResult, setSuggestionState, updateSuggestion, listMembers, listTasks, ApiError, type Minute as MinuteData } from "@/lib/data";

type Minute = MinuteData & { isUploader: boolean };

const LIST_FIELDS = ["participants", "topics", "discussions", "decisions", "notes"] as const;
const toLines = (a: string[]) => a.join("\n");
const fromLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const tasksToLines = (a: MinuteContent["tasks"]) => a.map((x) => (x.owners.length ? `${x.task} | ${x.owners.join("، ")}` : x.task)).join("\n");
const linesToTasks = (s: string) => fromLines(s).map((l) => {
  const [task, owners = ""] = l.split("|");
  return { task: task.trim(), owners: owners.split(/[،,]/).map((o) => o.trim()).filter(Boolean) };
});

function MinuteView({ c }: { c: MinuteContent }) {
  const { t } = useComp();
  const label: Record<string, string> = { participants: t.participants, topics: t.topics, discussions: t.discussions, decisions: t.decisions, notes: t.minuteNotes };
  return (
    <div className="minute-view">
      <h3>{c.title}</h3>
      {c.date && <p className="muted">{c.date}</p>}
      {LIST_FIELDS.map((f) => c[f].length > 0 && (
        <div key={f}><h4>{label[f]}</h4><ul>{c[f].map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      ))}
      {c.tasks.length > 0 && (
        <div><h4>{t.minuteTasks}</h4><ul>{c.tasks.map((x, i) => <li key={i}>{x.task}{x.owners.length ? ` — ${x.owners.join("، ")}` : ""}</li>)}</ul></div>
      )}
    </div>
  );
}

function Editor({ m }: { m: Minute }) {
  const { t, err } = useComp();
  const base = () => m.draft ?? emptyMinute(m.title, m.meeting_date);
  const [d, setD] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const fill = () => {
    const b = base();
    setD({ title: b.title, date: b.date, ...Object.fromEntries(LIST_FIELDS.map((f) => [f, toLines(b[f])])), tasks: tasksToLines(b.tasks) });
  };
  useEffect(() => { if (!dirty) fill(); /* eslint-disable-next-line */ }, [JSON.stringify(m.draft), dirty]);

  const content = (): MinuteContent => ({
    title: d.title ?? "", date: d.date ?? "",
    participants: fromLines(d.participants ?? ""), topics: fromLines(d.topics ?? ""), discussions: fromLines(d.discussions ?? ""),
    decisions: fromLines(d.decisions ?? ""), notes: fromLines(d.notes ?? ""), tasks: linesToTasks(d.tasks ?? ""),
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDirty(true); setD({ ...d, [k]: e.target.value }); };

  async function onSaveDraft() {
    setMsg("");
    try { await saveDraft(m.id, content()); setDirty(false); setMsg(t.saved); } catch (e) { setMsg(err(e)); }
  }
  async function approve() {
    setMsg("");
    try { await approveMinute(m.id, content()); setDirty(false); setMsg(t.saved); } catch (e) { setMsg(err(e)); }
  }
  const label: Record<string, string> = { participants: t.participants, topics: t.topics, discussions: t.discussions, decisions: t.decisions, notes: t.minuteNotes };

  return (
    <div className="minute-editor form">
      <div className="row-2">
        <label>{t.meetingTitle}<input value={d.title ?? ""} onChange={set("title")} name="m-title" /></label>
        <label>{t.meetingDate}<input value={d.date ?? ""} onChange={set("date")} name="m-date" /></label>
      </div>
      {LIST_FIELDS.slice(0, 4).map((f) => (
        <label key={f}>{label[f]} <span className="muted small">({t.onePerLine})</span>
          <textarea rows={f === "discussions" ? 6 : 3} value={d[f] ?? ""} onChange={set(f)} name={`m-${f}`} />
        </label>
      ))}
      <label>{t.minuteTasks} <span className="muted small">({t.onePerLine}: … | …)</span>
        <textarea rows={3} value={d.tasks ?? ""} onChange={set("tasks")} name="m-tasks" />
      </label>
      <label>{label.notes}<textarea rows={2} value={d.notes ?? ""} onChange={set("notes")} name="m-notes" /></label>
      <div className="actions">
        <button className="btn" onClick={onSaveDraft}>{t.saveDraft}</button>
        {m.isUploader ? <button className="btn primary" onClick={approve} data-testid="approve-minute">{t.approve}</button>
          : <span className="muted small">{t.onlyUploader}</span>}
        {msg && <span className="muted small" role="status">{msg}</span>}
      </div>
    </div>
  );
}

function Suggestions({ m }: { m: Minute }) {
  const { comp, t, err } = useComp();
  const [sel, setSel] = useState<number[]>([]);
  const [msg, setMsg] = useState("");
  const [manual, setManual] = useState({ title: "", axis: 8, assignees: "" });
  const pending = m.suggestions.filter((s) => s.state === "pending");
  useEffect(() => { setSel((cur) => cur.filter((id) => pending.some((p) => p.id === id))); /* eslint-disable-next-line */ }, [JSON.stringify(pending.map((p) => p.id))]);

  const patch = (id: number, body: { title?: string; axis?: number; assignees?: string[] }) => updateSuggestion(id, body).catch((e) => setMsg(err(e)));
  async function apply() {
    setMsg("");
    try {
      const r = await applySuggestions(m.id, sel);
      setMsg(`${t.added}: ${r.added}${r.skipped ? ` · ${t.dupOf}: ${r.skipped}` : ""}`);
      setSel([]);
    } catch (e) { setMsg(err(e)); }
  }
  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addSuggestion(m.id, { ...manual, assignees: manual.assignees.split(/[،,]/).map((x) => x.trim()).filter(Boolean) });
      setManual({ title: "", axis: 8, assignees: "" });
    } catch (e) { setMsg(err(e)); }
  }
  const stateLabel: Record<string, string> = { added: t.added, duplicate: t.dupOf, rejected: t.rejected };

  return (
    <section className="card" data-testid="suggestions">
      <h3>{t.suggested}</h3>
      <p className="muted small">{t.suggestedHint}</p>
      <ul className="suggestions">
        {m.suggestions.map((s) => (
          <li key={s.id} className={`sugg ${s.state}`} data-testid="suggestion" data-state={s.state}>
            {s.state === "pending" ? (
              <input type="checkbox" checked={sel.includes(s.id)} aria-label={s.title}
                onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} disabled={!m.isUploader} />
            ) : <span className={`badge ${s.state}`}>{stateLabel[s.state]}</span>}
            <div className="sugg-body">
              {s.state === "pending" ? (
                <input defaultValue={s.title} key={s.title} onBlur={(e) => e.target.value !== s.title && patch(s.id, { title: e.target.value })} aria-label={t.title} />
              ) : <b>{s.title}</b>}
              {s.duplicate && s.state === "duplicate" && <span className="muted small">↔ {s.duplicate.title}</span>}
              <div className="sugg-meta">
                <select value={s.axis} disabled={s.state !== "pending"} onChange={(e) => patch(s.id, { axis: Number(e.target.value) })} aria-label={t.axis}>
                  {AXES[comp].map((a) => <option key={a.id} value={a.id}>{a.id}. {a.title}</option>)}
                </select>
                {s.state === "pending" ? (
                  <input defaultValue={s.assignees.join("، ")} key={s.assignees.join()} placeholder={t.assignees} aria-label={t.assignees}
                    onBlur={(e) => patch(s.id, { assignees: e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean) })} />
                ) : <span className="muted small">{s.assignees.join("، ")}</span>}
                {s.state === "pending" && m.isUploader && <button className="btn small ghost" onClick={() => setSuggestionState(s.id, "rejected").catch((e) => setMsg(err(e)))}>{t.reject}</button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <form className="inline-add" onSubmit={addManual}>
        <input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder={t.addSuggestionManual} required name="manual-title" />
        <select value={manual.axis} onChange={(e) => setManual({ ...manual, axis: Number(e.target.value) })} aria-label={t.axis}>
          {AXES[comp].map((a) => <option key={a.id} value={a.id}>{a.id}. {a.title}</option>)}
        </select>
        <input value={manual.assignees} onChange={(e) => setManual({ ...manual, assignees: e.target.value })} placeholder={t.assignees} />
        <button className="btn small">{t.add}</button>
      </form>
      <div className="actions">
        {m.isUploader ? (
          <button className="btn primary" disabled={sel.length === 0} onClick={apply} data-testid="apply-suggestions">{t.addSelected} ({sel.length})</button>
        ) : <span className="muted small">{t.onlyUploader}</span>}
        {msg && <span className="muted small" role="status">{msg}</span>}
      </div>
    </section>
  );
}

/** Free option: copy a ready prompt to any AI chat, paste the answer back. */
function FreeAi({ m }: { m: Minute }) {
  const { comp, t, err } = useComp();
  const [copied, setCopied] = useState(false);
  const [answer, setAnswer] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function copy() {
    setMsg("");
    const [members, tasks] = await Promise.all([listMembers(comp), listTasks(comp)]);
    const text = buildPrompt({
      comp, title: m.title, date: m.meeting_date, raw: m.raw_text, axes: AXES[comp],
      members: members.map((x) => x.name), existingTasks: tasks.map((x) => x.title),
    });
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }
  async function apply() {
    setMsg(""); setBusy(true);
    try {
      let parsed;
      try { parsed = parseAnswer(answer); } catch { throw new ApiError("bad_ai_answer"); }
      await setAiResult(m.id, parsed.minutes, parsed.tasks);
      setAnswer(""); setMsg(t.freeAiApplied);
    } catch (e) { setMsg(err(e)); } finally { setBusy(false); }
  }

  return (
    <div className="free-ai" data-testid="free-ai">
      <h3>✨ {t.freeAiTitle}</h3>
      <p className="small">{t.freeAiStep1}</p>
      <button className="btn" onClick={copy} disabled={!m.raw_text.trim()} data-testid="free-ai-copy">{copied ? t.freeAiCopied : t.freeAiCopy}</button>
      <p className="small">{t.freeAiStep2}</p>
      <p className="small">{t.freeAiStep3}</p>
      <textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t.freeAiPastePh} dir="auto" data-testid="free-ai-answer" />
      <button className="btn primary" onClick={apply} disabled={busy || !answer.trim()} data-testid="free-ai-apply">{t.freeAiApply}</button>
      {msg && <p className="small" role="status">{msg}</p>}
    </div>
  );
}

function SourceFile({ path, name }: { path: string; name: string }) {
  const { t } = useComp();
  const open = async () => window.open(await viewUrl(path), "_blank", "noopener");
  return <button className="link-btn small" onClick={open}>📎 {t.original}: {name}</button>;
}

export default function MinutePage() {
  const id = Number(useParams().id);
  const { comp, t, err, me } = useComp();
  const { data: raw, error } = useData(() => getMinute(id), [id]);
  const { data: ai } = useData(() => aiMode(), [], 600000);
  const m: Minute | undefined = raw && { ...raw, isUploader: raw.uploaded_by === me.id };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [viewV, setViewV] = useState<number | null>(null);

  if (error) return <p className="error">{t.error}</p>;
  if (!m) return <p className="muted">…</p>;
  if (m.competition !== comp) return <p className="error">{t.error}</p>;

  async function organize() {
    setBusy(true); setMsg("");
    try { await organizeMinute(id); setMsg(t.aiDone); } catch (e) { setMsg(err(e)); } finally { setBusy(false); }
  }

  return (
    <div className="minute-page">
      <div className="page-head">
        <div>
          <Link to={`/${comp}/minutes`} className="muted small">← {t.minutesTitle}</Link>
          <h2>{m.title || m.meeting_date || `#${m.id}`}</h2>
          <div className="task-meta">
            {m.status === "approved" && <span className="badge approved">{`${t.approved} · ${t.version} ${m.current_version}`}</span>}
            {m.has_pending_changes && m.status === "approved" && <span className="badge pending">{t.pending}</span>}
            {m.source_file_path && <SourceFile path={m.source_file_path} name={m.source_file_name ?? "file"} />}
          </div>
        </div>
      </div>

      <section className="card ai-panel">
        {ai && ai !== "off" ? (
          <>
            <button className="btn primary big" onClick={organize} disabled={busy} data-testid="organize">
              ✨ {busy ? t.organizing : t.organizeAI}
            </button>
            <details className="small"><summary>{t.altManualAi}</summary><FreeAi m={m} /></details>
          </>
        ) : <FreeAi m={m} />}
        {msg && <p className="small" role="status">{msg}</p>}
        <button className="link-btn small" onClick={() => setShowRaw(!showRaw)}>{t.rawText}</button>
        {showRaw && <pre className="raw">{m.raw_text}</pre>}
      </section>

      <section className="card"><Editor m={m} /></section>
      <Suggestions m={m} />

      {m.linked.length > 0 && (
        <section className="card">
          <h3>{t.tasks}</h3>
          <ul className="list">{m.linked.filter((x: any) => !x.deleted_at).map((x) => <li key={x.id}><span className={`dot-mini ${x.status}`} />{x.title}</li>)}</ul>
        </section>
      )}

      {m.versions.length > 0 && (
        <section className="card">
          <h3>{t.versions}</h3>
          <ul className="list">
            {m.versions.map((v) => (
              <li key={v.version}>
                <button className="link-btn" onClick={() => setViewV(viewV === v.version ? null : v.version)}>{t.version} {v.version}</button>
                <span className="muted small">{v.approver?.name} · {fmtDate(v.created_at, comp, true)}</span>
                <button className="btn small ghost" onClick={() => restoreVersion(id, v.version)}>{t.restore}</button>
                {viewV === v.version && <MinuteView c={v.content} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
