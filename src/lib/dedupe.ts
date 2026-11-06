/** Normalizes Arabic/Hebrew titles so near-identical tasks are detected as duplicates. */
export function titleKey(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "") // Arabic diacritics + tatweel
    .replace(/[֑-ׇ]/g, "") // Hebrew niqqud / cantillation
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const STOP = new Set(["ال", "و", "في", "من", "على", "الى", "عن", "مع", "של", "את", "עם", "על", "ו", "ה", "ל", "ב"]);
function tokens(key: string): Set<string> {
  return new Set(
    key.split(" ").map((w) => w.replace(/^(ال|וה|ה|ו)(?=\p{L}{3,})/u, "")).filter((w) => w && !STOP.has(w)),
  );
}

export function isDuplicateTitle(a: string, b: string): boolean {
  const ka = titleKey(a), kb = titleKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const ta = tokens(ka), tb = tokens(kb);
  if (ta.size < 2 || tb.size < 2) return false;
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter++; });
  return inter / (ta.size + tb.size - inter) >= 0.8;
}

export function findDuplicate<T extends { title: string }>(title: string, existing: T[]): T | undefined {
  return existing.find((e) => isDuplicateTitle(title, e.title));
}

export function progress(counts: { not_started: number; in_progress: number; done: number }) {
  const total = counts.not_started + counts.in_progress + counts.done;
  return { total, percent: total === 0 ? 0 : Math.round((counts.done / total) * 100) };
}
