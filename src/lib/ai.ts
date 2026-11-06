import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AXES, type Comp } from "./i18n";
import { normalizeMinute, type MinuteContent } from "./minute";

export type AiMode = "anthropic" | "mock" | "off";

/** "mock" exists only for automated tests (AI_MOCK=1) and is labelled as such in the UI. */
export function aiMode(): AiMode {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.AI_MOCK === "1") return "mock";
  return "off";
}

const Result = z.object({
  minutes: z.object({
    title: z.string(),
    date: z.string(),
    participants: z.array(z.string()),
    topics: z.array(z.string()),
    discussions: z.array(z.string()),
    decisions: z.array(z.string()),
    tasks: z.array(z.object({ task: z.string(), owners: z.array(z.string()) })),
    notes: z.array(z.string()),
  }),
  new_tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      axis: z.number().int(),
      assignees: z.array(z.string()),
    }),
  ),
});

export type AiTask = { title: string; description: string; axis: number; assignees: string[] };
export type AiResult = { minutes: MinuteContent; tasks: AiTask[] };

function systemPrompt(comp: Comp, members: string[], existing: string[]) {
  const lang = comp === "ar" ? "Modern Standard Arabic (العربية الفصحى)" : "standard formal Hebrew";
  const axes = AXES[comp].map((a) => `${a.id}. ${a.title} — ${a.hint}`).join("\n");
  return `You organize meeting minutes for the committee of a school writing competition.

Rewrite the raw minutes (which may be a WhatsApp chat, rough notes or a document) into clear, correct, formal ${lang}.
Strict rules:
- Keep every name, number, date, place, detail and decision that appears in the source. Do not drop information.
- Never invent anything. If a field is not present in the source, leave it empty ("" or []).
- Do not add opinions, conclusions or tasks that are not stated or clearly agreed in the source.
- Use people's names exactly as written in the source; if a name clearly matches one of the known committee members below, use the member's spelling.

Structure the minutes into: title, date, participants, topics (agenda items), discussions, decisions, tasks (each with its owners), notes.

Then list new_tasks: concrete action items from the meeting that the committee must carry out.
- For each, write a short title, a one-sentence description (only from the source) and the names of the responsible people (assignees) if stated.
- Assign each task the best matching axis number from this list; if none clearly fits, use 6:
${axes}
- Do not include tasks that are already in the existing task list below (same meaning, even if worded differently).

Known committee members: ${members.join(", ") || "(none)"}
Existing tasks:
${existing.map((t) => `- ${t}`).join("\n") || "(none)"}`;
}

export async function organizeMinutes(
  comp: Comp, raw: string, meta: { title: string; date: string }, members: string[], existing: string[],
): Promise<AiResult> {
  const mode = aiMode();
  if (mode === "off") throw new Error("ai_off");
  if (mode === "mock") return mockOrganize(raw, meta);

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    system: systemPrompt(comp, members, existing),
    messages: [
      {
        role: "user",
        content: `Meeting title (may be empty): ${meta.title}\nMeeting date (may be empty): ${meta.date}\n\n<raw_minutes>\n${raw}\n</raw_minutes>`,
      },
    ],
    output_config: { format: zodOutputFormat(Result) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("ai_failed");
  const out = response.parsed_output;
  return {
    minutes: normalizeMinute(out.minutes),
    tasks: out.new_tasks
      .map((t) => ({ ...t, axis: t.axis >= 1 && t.axis <= 6 ? t.axis : 6, title: t.title.trim() }))
      .filter((t) => t.title),
  };
}

/** Deterministic stand-in used ONLY by the automated tests (AI_MOCK=1). */
function mockOrganize(raw: string, meta: { title: string; date: string }): AiResult {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tasks: AiTask[] = [];
  const decisions: string[] = [];
  for (const l of lines) {
    const m = l.match(/^(?:مهمة|משימה)\s*[:：]\s*(.+?)(?:\s*[|]\s*(.+?))?(?:\s*#(\d))?$/);
    if (m) tasks.push({ title: m[1].trim(), description: "", assignees: m[2] ? m[2].split(/[،,]/).map((s) => s.trim()) : [], axis: m[3] ? Number(m[3]) : 6 });
    const d = l.match(/^(?:قرار|החלטה)\s*[:：]\s*(.+)$/);
    if (d) decisions.push(d[1].trim());
  }
  return {
    minutes: normalizeMinute({
      title: meta.title, date: meta.date, decisions,
      discussions: lines.filter((l) => !/^(مهمة|משימה|قرار|החלטה)/.test(l)),
      tasks: tasks.map((t) => ({ task: t.title, owners: t.assignees })),
    }),
    tasks,
  };
}
