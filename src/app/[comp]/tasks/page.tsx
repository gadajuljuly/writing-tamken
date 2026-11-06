"use client";
import { useMemo, useState } from "react";
import { AXES, STATUSES } from "@/lib/i18n";
import { titleKey } from "@/lib/dedupe";
import { useComp, useData } from "@/components/client";
import { TaskRow } from "@/components/TaskRow";
import { TaskForm } from "@/components/TaskForm";
import type { Task } from "@/components/types";

export default function TasksPage() {
  const { comp, t } = useComp();
  const { data: tasks } = useData<Task[]>(`/api/c/${comp}/tasks`);
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
        const list = filtered.filter((x) => x.axis === a.id);
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
                {list.map((x) => <TaskRow key={x.id} task={x} onEdit={() => setForm({ task: x })} />)}
              </ul>
            )}
            <button className="add-task" onClick={() => setForm({ axis: a.id })}>{t.addTask}</button>
          </section>
        );
      })}
      {form && <TaskForm task={form.task} axis={form.axis} onClose={() => setForm(null)} />}
    </div>
  );
}
