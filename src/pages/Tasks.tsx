import { useEffect, useMemo, useRef, useState } from "react";
import { AXES, STATUSES } from "@/lib/i18n";
import { titleKey } from "@/lib/dedupe";
import { useComp, useData } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { TaskForm } from "@/components/TaskForm";
import { deleteTask, listDeletedTasks, listTasks, purgeTask, restoreTask, type Task } from "@/lib/data";

export default function TasksPage() {
  const { comp, t, err } = useComp();
  const { data: tasks } = useData(() => listTasks(comp), [comp]);
  const [qText, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [person, setPerson] = useState("");
  const [axisF, setAxisF] = useState(0);
  const [form, setForm] = useState<{ task?: Task; axis?: number } | null>(null);

  const people = useMemo(() => [...new Set((tasks ?? []).flatMap((x) => x.assignees))].sort(), [tasks]);
  const filtered = useMemo(() => {
    const k = titleKey(qText);
    return (tasks ?? []).filter((x) =>
      (!k || titleKey(`${x.title} ${x.description} ${x.notes} ${x.assignees.join(" ")}`).includes(k)) &&
      (!status || x.status === status) && (!person || x.assignees.includes(person)));
  }, [tasks, qText, status, person]);
  const filtering = !!(qText || status || person);

  // delete → task disappears at once, an "undo" bar shows for 10 s; deleted tasks stay in the bin below
  const [hidden, setHidden] = useState<number[]>([]);
  const [undo, setUndo] = useState<Task | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const { data: bin = [] } = useData(() => listDeletedTasks(comp), [comp]);
  const [binOpen, setBinOpen] = useState(false);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  async function remove(task: Task) {
    setHidden((h) => [...h, task.id]);
    setUndo(task);
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 10000);
    try { await deleteTask(task.id); }
    catch (e) { setHidden((h) => h.filter((x) => x !== task.id)); setUndo(null); alert(err(e)); }
  }
  async function restore(id: number) {
    try { await restoreTask(id); setHidden((h) => h.filter((x) => x !== id)); setUndo(null); }
    catch (e) { alert(err(e)); }
  }

  return (
    <div className="tasks-page">
      <div className="filters card">
        <input type="search" placeholder={t.search} value={qText} onChange={(e) => setQ(e.target.value)} aria-label={t.search} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t.status}>
          <option value="">{t.allStatuses}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t[s]}</option>)}
        </select>
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t.assignees}>
          <option value="">{t.allAssignees}</option>
          {people.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={axisF} onChange={(e) => setAxisF(Number(e.target.value))} aria-label={t.axis}>
          <option value={0}>{t.allAxes}</option>
          {AXES[comp].map((a) => <option key={a.id} value={a.id}>{a.id}. {a.title}</option>)}
        </select>
      </div>

      {!tasks && <p className="muted">…</p>}
      {tasks && AXES[comp].filter((a) => !axisF || a.id === axisF).map((a) => {
        const list = filtered.filter((x) => x.axis === a.id && !hidden.includes(x.id));
        if (filtering && list.length === 0) return null;
        return (
          <section key={a.id} className="axis card" data-testid={`axis-${a.id}`}>
            <header className="axis-head">
              <span className="axis-num">{a.id}</span>
              <div>
                <h2>{a.title}</h2>
                <p className="muted small">{a.hint}</p>
              </div>
            </header>
            {list.length === 0 ? <p className="muted empty">{t.noTasks}</p> : (
              <ul className="task-list">
                {list.map((x) => <TaskRow key={x.id} task={x} onEdit={() => setForm({ task: x })} onDelete={remove} />)}
              </ul>
            )}
            <button className="add-task" onClick={() => setForm({ axis: a.id })}>{t.addTask}</button>
          </section>
        );
      })}
      {bin.length > 0 && (
        <section className="card bin" data-testid="bin">
          <button className="link-btn" onClick={() => setBinOpen(!binOpen)} aria-expanded={binOpen}>🗑 {t.deletedTasks} ({bin.length})</button>
          {binOpen && (
            <ul className="list">
              {bin.map((x) => (
                <li key={x.id}>
                  <span>{x.title}</span>
                  <span className="muted small">{AXES[comp].find((a) => a.id === x.axis)?.title}</span>
                  <button className="btn small" onClick={() => restore(x.id)}>{t.restoreTask}</button>
                  <button className="btn small danger" onClick={() => confirm(t.confirmPurge) && purgeTask(x.id).catch((e) => alert(err(e)))}>{t.purge}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {undo && (
        <div className="toast" role="status" data-testid="undo-bar">
          <span>{t.taskDeleted}: «{undo.title}»</span>
          <button className="btn small" onClick={() => restore(undo.id)} data-testid="undo">{t.undo}</button>
        </div>
      )}
      {form && <TaskForm task={form.task} axis={form.axis} onClose={() => setForm(null)} />}
    </div>
  );
}
