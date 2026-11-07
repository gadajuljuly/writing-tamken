/**
 * Free AI option: the app builds a ready prompt that any AI chat can answer
 * (Claude free plan, ChatGPT, Gemini…). The member pastes the answer back and
 * the app checks it before anything is used. Nothing is approved automatically.
 */
import type { MinuteContent } from "./minute";

export type AiTask = { title: string; description: string; axis: number; assignees: string[] };
export type AiAnswer = { minutes: MinuteContent; tasks: AiTask[] };

export function buildPrompt(opts: {
  comp: "ar" | "he";
  title: string;
  date: string;
  raw: string;
  axes: { id: number; title: string; hint: string }[];
  members: string[];
  existingTasks: string[];
}) {
  const lang = opts.comp === "ar" ? "Modern Standard Arabic (العربية الفصحى)" : "standard formal Hebrew (עברית תקנית)";
  return `You organize meeting minutes for the committee of a school writing competition.

TASK
1. Rewrite the raw minutes below into clear, correct, formal ${lang}.
2. Keep EVERY name, number, date, place, detail and decision from the source. Drop nothing.
3. NEVER invent anything. If something is not in the source, leave it empty ("" or []).
4. Then list the NEW action items (tasks) the committee agreed on. For each task choose the best axis number below; if none clearly fits use 8.
5. Do not list tasks that already exist (see the list below), even if worded differently.

AXES
${opts.axes.map((a) => `${a.id}. ${a.title} — ${a.hint}`).join("\n")}

KNOWN COMMITTEE MEMBERS (use these spellings when a name clearly matches)
${opts.members.join(", ") || "(none)"}

EXISTING TASKS
${opts.existingTasks.map((t) => `- ${t}`).join("\n") || "(none)"}

ANSWER FORMAT
Reply with ONLY one JSON code block, exactly in this shape, and nothing else:
\`\`\`json
{
  "minutes": {
    "title": "", "date": "",
    "participants": [], "topics": [], "discussions": [], "decisions": [],
    "tasks": [{ "task": "", "owners": [] }],
    "notes": []
  },
  "new_tasks": [{ "title": "", "description": "", "axis": 8, "assignees": [] }]
}
\`\`\`

MEETING TITLE: ${opts.title || "(empty)"}
MEETING DATE: ${opts.date || "(empty)"}

RAW MINUTES
<<<
${opts.raw}
>>>`;
}

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : [];

/** Parses the AI chat answer. Throws "bad_ai_answer" if it is not usable. */
export function parseAnswer(text: string): AiAnswer {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1] : text;
  const start = body.indexOf("{"), end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("bad_ai_answer");
  body = body.slice(start, end + 1);
  let data: any;
  try { data = JSON.parse(body); } catch { throw new Error("bad_ai_answer"); }
  const m = data?.minutes;
  if (!m || typeof m !== "object") throw new Error("bad_ai_answer");
  const minutes: MinuteContent = {
    title: String(m.title ?? "").trim(),
    date: String(m.date ?? "").trim(),
    participants: strArr(m.participants),
    topics: strArr(m.topics),
    discussions: strArr(m.discussions),
    decisions: strArr(m.decisions),
    tasks: Array.isArray(m.tasks)
      ? m.tasks.map((t: any) => ({ task: String(t?.task ?? t ?? "").trim(), owners: strArr(t?.owners) })).filter((t: any) => t.task)
      : [],
    notes: strArr(m.notes),
  };
  const list = Array.isArray(data.new_tasks) ? data.new_tasks : Array.isArray(data.tasks) ? data.tasks : [];
  const tasks: AiTask[] = list
    .map((t: any) => {
      const axis = Number(t?.axis);
      return {
        title: String(t?.title ?? "").trim(),
        description: String(t?.description ?? "").trim(),
        axis: Number.isInteger(axis) && axis >= 1 && axis <= 8 ? axis : 8,
        assignees: strArr(t?.assignees),
      };
    })
    .filter((t: AiTask) => t.title);
  return { minutes, tasks };
}
