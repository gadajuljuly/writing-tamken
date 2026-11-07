import { useEffect, useRef, useState } from "react";
import { AXES } from "@/lib/i18n";
import { useComp, useData } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { TaskForm } from "@/components/TaskForm";
import { deleteTask, listDeletedTasks, listTasks, purgeTask, restoreTask, type Task } from "@/lib/data";

export default function TasksPage() {
  const { comp, t, err } = useComp();
  const { data: tasks } = useData(() => listTasks(comp), [comp]);
  const [form, setForm] = useState<{ task?: Task; axis?: number } | null>(null);

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
      {!tasks && <p className="muted">…</p>}
      {tasks && AXES[comp].map((a) => {
        const list = tasks.filter((x) => x.axis === a.id && !hidden.includes(x.id));
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
