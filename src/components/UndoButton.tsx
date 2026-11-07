import { useEffect, useState } from "react";
import { lastUndo, onUndoChange, undoLast } from "@/lib/undo";
import { notifyChange } from "@/lib/data";

/** "↩ تراجع" at the top of the screen: undoes the last change or deletion made here. */
export function UndoButton({ he }: { he?: boolean }) {
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  useEffect(() => onUndoChange(() => force((n) => n + 1)), []);
  const last = lastUndo();
  const label = he ? "↩ ביטול" : "↩ تراجع";
  async function run() {
    setBusy(true);
    try {
      const e = await undoLast();
      notifyChange();
      if (e) { setDone(`${he ? "בוטל" : "تم التراجع"}: ${e.label}`); setTimeout(() => setDone(""), 3000); }
    } catch {
      setDone(he ? "לא ניתן לבטל" : "تعذّر التراجع"); setTimeout(() => setDone(""), 3000);
    } finally { setBusy(false); }
  }
  return (
    <>
      <button className="btn small undo-btn" onClick={run} disabled={!last || busy} data-testid="undo-top"
        title={last ? `${label}: ${last.label}` : label}>{label}</button>
      {done && <div className="toast" role="status">{done}</div>}
    </>
  );
}
