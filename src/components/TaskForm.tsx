import { useState } from "react";
import { AXES, STATUSES } from "@/lib/i18n";
import { Modal, useComp, useData } from "./ui";
import { AssigneePicker } from "./AssigneePicker";
import { ApiError, createTask, documentDecision, listMinutes, updateTask, type Task } from "@/lib/data";

export function TaskForm({ task, axis, onClose }: { task?: Task; axis?: number; onClose: () => void }) {
  const { comp, t, err } = useComp();
  const { data: minutes = [] } = useData(() => listMinutes(comp), [comp], 60000);
  const [f, setF] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    axis: task?.axis ?? axis ?? 6,
    assignees: task?.assignees ?? [],
    status: task?.status ?? "not_started",
    proposal_approved: task?.proposal_approved ?? false,
    decision_minute_id: task?.decision_minute_id ?? null as number | null,
    decision_text: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const { decision_text, ...fields } = f;
      let id = task?.id;
      if (task) await updateTask(task.id, fields);
      else id = (await createTask(comp, fields)).id;
      const decisionChanged = !task || !task.proposal_approved || task.decision_minute_id !== f.decision_minute_id || !!decision_text.trim();
      if (f.proposal_approved && f.decision_minute_id && decisionChanged) await documentDecision(id!, f.decision_minute_id, decision_text);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "duplicate" && e.data.duplicateTitle ? `${t.duplicate}: «${e.data.duplicateTitle}»` : err(e));
    } finally { setBusy(false); }
  }

  return (
    <Modal title={task ? t.editTask : `${t.newTask}: ${AXES[comp].find((a) => a.id === f.axis)?.title ?? ""}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label>{task ? t.title : t.taskName}<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required autoFocus name="title" /></label>
        {/* Adding a task asks only for its name; everything else is set later with "Edit". */}
        {task && (
          <>
        <label>{t.description}<textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} name="description" /></label>
        <div className="row-2">
          {/* A new task belongs to the axis whose "+" was pressed; the axis is only changeable when editing. */}
          {task && (
            <label>{t.axis}
              <select value={f.axis} onChange={(e) => setF({ ...f, axis: Number(e.target.value) })} name="axis">
                {AXES[comp].map((a) => <option key={a.id} value={a.id}>{a.id}. {a.title}</option>)}
              </select>
            </label>
          )}
          <label>{t.status}
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Task["status"] })} name="status">
              {STATUSES.map((s) => <option key={s} value={s}>{t[s]}</option>)}
            </select>
          </label>
        </div>
        <div className="field"><span className="label">{t.assignees}</span>
          <AssigneePicker value={f.assignees} onChange={(assignees) => setF({ ...f, assignees })} />
        </div>
        <fieldset className="proposal">
          <label className="check">
            <input type="checkbox" checked={f.proposal_approved} onChange={(e) => setF({ ...f, proposal_approved: e.target.checked })} />
            {t.proposalApproved}
          </label>
          {f.proposal_approved && (
            <>
              <label>{t.decisionMinute}
                <select value={f.decision_minute_id ?? ""} onChange={(e) => setF({ ...f, decision_minute_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">{t.chooseMinute}</option>
                  {minutes.map((m) => <option key={m.id} value={m.id}>{m.title || m.meeting_date || `#${m.id}`}</option>)}
                </select>
              </label>
              {f.decision_minute_id && (
                <label>{t.decisionText}<input value={f.decision_text} onChange={(e) => setF({ ...f, decision_text: e.target.value })} /></label>
              )}
            </>
          )}
        </fieldset>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>{t.save}</button>
          {task && <button type="button" className="btn ghost" onClick={onClose}>{t.cancel}</button>}
        </div>
      </form>
    </Modal>
  );
}
