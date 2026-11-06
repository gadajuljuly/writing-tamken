"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DICT, ERRORS, type Comp, type Dict } from "@/lib/i18n";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public data: any) { super(code); }
}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth")) window.location.href = "/login";
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data);
  notifyChange();
  return data as T;
}

// --- tiny live-sync: every view refetches on mutations, on focus, and every few seconds ---
const listeners = new Set<() => void>();
export function notifyChange() { listeners.forEach((l) => l()); }

export function useData<T>(url: string | null, intervalMs = 8000) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;
  const load = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const d = await res.json();
      if (u === urlRef.current) { setData(d); setError(res.ok ? null : d.error ?? "error"); }
    } catch { setError("network"); }
  }, []);
  useEffect(() => {
    load();
    const onFocus = () => load();
    listeners.add(load);
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, intervalMs);
    return () => { listeners.delete(load); window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, [url, load, intervalMs]);
  return { data, error, reload: load };
}

type Ctx = { comp: Comp; t: Dict; err: (e: unknown) => string };
const CompCtx = createContext<Ctx | null>(null);
export function CompProvider({ comp, children }: { comp: Comp; children: React.ReactNode }) {
  const err = (e: unknown) => (e instanceof ApiError ? ERRORS[comp][e.code] ?? DICT[comp].error : DICT[comp].error);
  return <CompCtx.Provider value={{ comp, t: DICT[comp], err }}>{children}</CompCtx.Provider>;
}
export function useComp() {
  const c = useContext(CompCtx);
  if (!c) throw new Error("CompProvider missing");
  return c;
}

export function fmtDate(d: string | null | undefined, comp: Comp, withTime = false) {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleString(comp === "ar" ? "ar-EG-u-nu-latn" : "he-IL", {
    day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
