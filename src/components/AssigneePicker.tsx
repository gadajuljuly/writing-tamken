"use client";
import { useState } from "react";
import { api, useComp, useData } from "./client";

/** Multi-select of committee members. Hebrew competition can add new names (saved for later use). */
export function AssigneePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { comp, t, err } = useComp();
  const { data: members = [], reload } = useData<{ id: number; name: string }[]>(`/api/c/${comp}/members`, 30000);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const names = [...new Set([...members.map((m) => m.name), ...value])];
  const toggle = (n: string) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);

  async function add() {
    const n = name.trim();
    if (!n) return;
    try {
      await api("POST", `/api/c/${comp}/members`, { name: n });
      await reload();
      if (!value.includes(n)) onChange([...value, n]);
      setName("");
    } catch (e) { setMsg(err(e)); }
  }

  return (
    <div className="assignee-picker">
      <div className="chips">
        {names.map((n) => (
          <button type="button" key={n} className={`chip ${value.includes(n) ? "on" : ""}`} onClick={() => toggle(n)} aria-pressed={value.includes(n)}>
            {n}
          </button>
        ))}
      </div>
      {comp === "he" && (
        <div className="inline-add">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.addMemberPh}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" className="btn small" onClick={add}>{t.addMember}</button>
        </div>
      )}
      {msg && <p className="error small">{msg}</p>}
    </div>
  );
}
