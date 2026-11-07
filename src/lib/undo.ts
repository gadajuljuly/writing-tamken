/**
 * "Undo" for the last actions done in this browser tab (up to 30):
 * deleting / changing tasks, notes, statuses, attachments and materials.
 */
export type UndoEntry = { label: string; run: () => Promise<unknown> };

const stack: UndoEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushUndo(label: string, run: () => Promise<unknown>) {
  stack.push({ label, run });
  if (stack.length > 30) stack.shift();
  emit();
}

export const lastUndo = (): UndoEntry | undefined => stack[stack.length - 1];

export async function undoLast() {
  const e = stack.pop();
  emit();
  if (e) await e.run();
  return e;
}

export function onUndoChange(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
