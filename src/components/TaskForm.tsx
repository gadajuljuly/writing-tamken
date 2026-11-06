"use client";
import { useState } from "react";
import { AXES, STATUSES } from "@/lib/i18n";
import { api, Modal, useComp, useData, ApiError } from "./client";
import { AssigneePicker } from "./AssigneePicker";
import type { Task } from "./types";

export function TaskForm({ task, axis, onClose }: { task?: Task; axis?: number; onClose: () => void }) {
  const { comp, t, err } = useComp();
  const { data: minutes = [] } = useData<{ id: number; title: string; meeting_date: string }[]>(`/api/c/${comp}/minutes`, 60000);
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
      if (task) await api("PATCH", `/api/tasks/${task.id}`, f);
      else {
        const { id } = await api<{ id: number }>("POST", `/api/c/${comp}/tasks`, f);
        if (f.proposal_approved) await api("PATCH", `/api/tasks/${id}`, { proposal_approved: true, decision_minute_id: f.decision_minute_id, decision_text: f.decision_text });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "duplicate" && e.data.duplicateTitle ? `${t.duplicate}: «${e.data.duplicateTitle}»` : err(e));
    } finally { setBusy(false); }
  }

  return (
    <Modal title={task ? t.editTask : t.newTask} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label>{t.title}<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required autoFocus name="title" /></label>
        <label>{t.description}<textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} name="description" /></label>
        <div className="row-2">
          <label>{t.axis}
            <select value={f.axis} onChange={(e) => setF({ ...f, axis: Number(e.target.value) })} name="axis">
              {AXES[comp].map((a) => <option key={a.id} value={a.id}>{a.id}. {a.title}</option>)}
            </select>
          </label>
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
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>{t.save}</button>
          <button type="button" className="btn ghost" onClick={onClose}>{t.cancel}</button>
        </div>
      </form>
    </Modal>
  );
}
