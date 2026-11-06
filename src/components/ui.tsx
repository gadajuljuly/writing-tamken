import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { DICT, ERRORS, type Comp, type Dict } from "@/lib/i18n";
import { ApiError, onChange, type Me } from "@/lib/data";

/** Loads data and keeps it fresh: on every change (local or realtime), on focus, and every 15 s. */
export function useData<T>(fetcher: (() => Promise<T>) | null, deps: unknown[], intervalMs = 15000) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fetcher);
  ref.current = fetcher;
  const gen = useRef(0);
  const load = useCallback(async () => {
    const f = ref.current;
    if (!f) return;
    const my = ++gen.current;
    try {
      const d = await f();
      if (my === gen.current) { setData(d); setError(null); }
    } catch (e) {
      if (my === gen.current) setError(e instanceof ApiError ? e.code : "error");
    }
  }, []);
  useEffect(() => {
    setData(undefined);
    load();
    const off = onChange(load);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => document.visibilityState === "visible" && load(), intervalMs);
    return () => { off(); window.removeEventListener("focus", onFocus); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, reload: load };
}

type Ctx = { comp: Comp; t: Dict; me: Me; err: (e: unknown) => string };
const CompCtx = createContext<Ctx | null>(null);
export function CompProvider({ comp, me, children }: { comp: Comp; me: Me; children: React.ReactNode }) {
  const err = (e: unknown) => (e instanceof ApiError ? ERRORS[comp][e.code] ?? DICT[comp].error : DICT[comp].error);
  return <CompCtx.Provider value={{ comp, me, t: DICT[comp], err }}>{children}</CompCtx.Provider>;
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
