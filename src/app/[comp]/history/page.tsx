"use client";
import { useState } from "react";
import { ACTIONS } from "@/lib/i18n";
import { fmtDate, useComp, useData } from "@/components/client";

type Entry = { id: number; entity: string; action: string; summary: string; changes: Record<string, any>; created_at: string; user_name: string };

export default function HistoryPage() {
  const { comp, t } = useComp();
  const [entity, setEntity] = useState("");
  const { data } = useData<Entry[]>(`/api/c/${comp}/history${entity ? `?entity=${entity}` : ""}`);
  const fieldLabel: Record<string, string> = {
    title: t.title, description: t.description, axis: t.axis, assignees: t.assignees, status: t.status, notes: t.notes,
    proposal_approved: t.proposalApproved, decision_minute_id: t.decisionMinute,
  };
  const show = (f: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (f === "status") return t[v as "done"] ?? String(v);
    if (typeof v === "boolean") return v ? "✓" : "✗";
    if (Array.isArray(v)) return v.join("، ") || "—";
    return String(v);
  };

  return (
    <div className="history-page">
      <div className="filters card">
        <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label={t.history}>
          <option value="">{t.allEntities}</option>
          <option value="task">{t.entity_task}</option>
          <option value="minute">{t.entity_minute}</option>
          <option value="member">{t.entity_member}</option>
        </select>
      </div>
      <div className="card">
        <table className="history">
          <thead><tr><th>{t.when}</th><th>{t.who}</th><th>{t.what}</th></tr></thead>
          <tbody>
            {data?.map((e) => (
              <tr key={e.id}>
                <td className="nowrap small">{fmtDate(e.created_at, comp, true)}</td>
                <td>{e.user_name}</td>
                <td>
                  <b>{ACTIONS[comp][e.action] ?? e.action}</b>{e.summary ? `: ${e.summary}` : ""}
                  {Object.keys(e.changes ?? {}).length > 0 && e.changes && Object.values(e.changes)[0]?.from !== undefined && (
                    <ul className="changes">
                      {Object.entries(e.changes).map(([f, c]: [string, any]) => (
                        <li key={f}>{fieldLabel[f] ?? f}: <s>{show(f, c.from)}</s> ← {show(f, c.to)}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="muted">{t.none}</p>}
      </div>
    </div>
  );
}
