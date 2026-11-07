import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AXES } from "@/lib/i18n";
import { guessAxis } from "@/lib/axisGuess";
import { titleKey } from "@/lib/dedupe";
import { buildPrompt, parseAnswer } from "@/lib/aiPrompt";
import { emptyMinute, type MinuteContent } from "@/lib/minute";
import { fmtDate, useComp, useData } from "@/components/ui";
import { addSuggestion, aiMode, applySuggestions, approveMinute, viewUrl, getMinute, organizeMinute, saveDraft,
  setAiResult, setSuggestionState, updateSuggestion, listMembers, listTasks, ApiError, type Minute as MinuteData } from "@/lib/data";

type Minute = MinuteData & { isUploader: boolean };

const LIST_FIELDS = ["participants", "topics", "discussions", "decisions", "notes"] as const;
const toLines = (a: string[]) => a.join("\n");
const fromLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
/** Proposed tasks as bullet points; ✅ marks a task that is already in the task list. */
const tasksToLines = (a: MinuteContent["tasks"], inList: Set<string> = new Set()) =>
  a.map((x) => `${inList.has(titleKey(x.task)) ? "✅" : "•"} ${x.owners.length ? `${x.task} | ${x.owners.join("، ")}` : x.task}`).join("\n");
const linesToTasks = (s: string) => fromLines(s).map((l) => l.replace(/^(✅|✔️|✔|•|●|-|\*|–)\s*/u, "")).filter(Boolean).map((l) => {
  const [task, owners = ""] = l.split("|");
  return { task: task.trim(), owners: owners.split(/[،,]/).map((o) => o.trim()).filter(Boolean) };
});

function Editor({ m }: { m: Minute }) {
  const { t, err, comp } = useComp();
  const { data: allTasks } = useData(() => listTasks(comp), [comp]);
  const inList = new Set((allTasks ?? []).map((x) => titleKey(x.title)));
  const base = () => m.draft ?? emptyMinute(m.title, m.meeting_date);
  const [d, setD] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const fill = () => {
    const b = base();
    const proposed = m.suggestions.filter((s) => s.state === "pending").map((s) => ({ task: s.title, owners: s.assignees }));
    setD({ title: b.title, date: b.date, ...Object.fromEntries(LIST_FIELDS.map((f) => [f, toLines(b[f])])),
      tasks: tasksToLines(b.tasks.length ? b.tasks : proposed, inList) });
  };
  useEffect(() => { if (!dirty) fill(); /* eslint-disable-next-line */ }, [JSON.stringify(m.draft), JSON.stringify(m.suggestions), inList.size, dirty]);

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
  // the tasks written in the minutes → the task list, each under the right axis
  const [adding, setAdding] = useState(false);
  async function addTasksToList() {
    setMsg(""); setAdding(true);
    try {
      const lines = linesToTasks(d.tasks ?? "");
      if (!lines.length) return;
      await saveDraft(m.id, content());
      const open = () => m.suggestions.filter((s) => s.state === "pending");
      for (const l of lines) {
        if (!open().some((s) => titleKey(s.title) === titleKey(l.task))) {
          await addSuggestion(m.id, { title: l.task, axis: guessAxis(l.task), assignees: l.owners });
        }
      }
      const fresh = await getMinute(m.id);
      const ids = fresh.suggestions
        .filter((s) => s.state === "pending" && lines.some((l) => titleKey(l.task) === titleKey(s.title)))
        .map((s) => s.id);
      const r = ids.length ? await applySuggestions(m.id, ids) : { added: 0, skipped: 0 };
      const skipped = r.skipped + (lines.length - ids.length);
      setMsg(`✓ ${t.added}: ${r.added}${skipped ? ` · ${t.dupOf}: ${skipped}` : ""}`);
      setDirty(false);
    } catch (e) { setMsg(err(e)); } finally { setAdding(false); }
  }
  const label: Record<string, string> = { participants: t.participants, topics: t.topics, discussions: t.discussions, decisions: t.decisions, notes: t.minuteNotes };

  return (
    <div className="minute-editor form" onBlur={() => { if (dirty) onSaveDraft(); }}>
      <div className="row-2">
        <label>{t.meetingTitle}<input value={d.title ?? ""} onChange={set("title")} name="m-title" /></label>
        <label>{t.meetingDate}<input value={d.date ?? ""} onChange={set("date")} name="m-date" /></label>
      </div>
      {LIST_FIELDS.slice(0, 4).filter((f) => f !== "topics").map((f) => (
        <label key={f}>{label[f]}
          <textarea rows={f === "discussions" ? 6 : 3} value={d[f] ?? ""} onChange={set(f)} name={`m-${f}`} />
        </label>
      ))}
      <label>{t.suggested}
        <textarea rows={Math.max(3, (d.tasks ?? "").split("\n").length + 1)} value={d.tasks ?? ""} onChange={set("tasks")} name="m-tasks" />
      </label>
      <div className="tasks-to-list">
        <button type="button" className="btn primary" onClick={addTasksToList} disabled={adding || !(d.tasks ?? "").trim()} data-testid="tasks-to-list">
          {adding ? "…" : `➕ ${t.addSelected}`}
        </button>
        {msg && <span className="muted small" role="status">{msg}</span>}
      </div>
    </div>
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

      <section className="card">
        <Editor m={m} />
      </section>


    </div>
  );
}
