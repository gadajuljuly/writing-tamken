// Supabase Edge Function "organize-minutes": one click organizes the raw minutes
// into the template and proposes tasks. It runs with the caller's own login (RLS
// applies) and only writes a DRAFT + proposals; the uploader approves in the app.
//
// Secrets (Supabase → Edge Functions → Secrets) — set ONE of:
//   GEMINI_API_KEY     free key from https://aistudio.google.com/apikey   (optional GEMINI_MODEL)
//   ANTHROPIC_API_KEY  paid key from https://console.anthropic.com       (optional ANTHROPIC_MODEL)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const AXES: Record<string, string[]> = {
  ar: [
    "التحضيرات التقنية والتنظيمية — المكان، المواصلات، التضييفات، الجوائز وتجهيزات حفل التتويج",
    "التحضير والتنسيق مع المدارس والطاقم — التواصل مع المدارس، لقاءات الطاقم، المنشورات والبوسترات",
    "تطوير الكتابة والتحضير للمسابقة — مواضيع الكتابة، مئشار التقييم، لجنة التحكيم ومتابعة المدربات",
    "إثراء التجربة الأدبية والتربوية — استضافة كاتب، قراءة قصصه والأنشطة المرتبطة بها",
    "التحضيرات الختامية وما بعد التتويج — شهادات التقدير، رسائل الشكر واستكمال التنسيق",
    "مهام أخرى — كل ما لا ينتمي إلى المحاور السابقة",
  ],
  he: [
    "היערכות טכנית וארגונית — מקום, הסעות, כיבוד, פרסים והכנות לטקס",
    "הכנה ותיאום עם בתי הספר והצוות — קשר עם בתי הספר, מפגשי צוות, פרסומים ופוסטרים",
    "פיתוח הכתיבה והכנה לתחרות — נושאי כתיבה, מחוון הערכה, ועדת שיפוט ומעקב אחר המנחות",
    "העשרת החוויה הספרותית והחינוכית — אירוח סופר/ת, קריאת סיפוריו והפעילויות הנלוות",
    "היערכות לסיום ואחרי הטקס — תעודות הוקרה, מכתבי תודה והשלמת התיאום",
    "משימות אחרות — כל מה שאינו שייך לצירים הקודמים",
  ],
};

function instructions(comp: string, members: string[], existing: string[]) {
  const lang = comp === "ar" ? "Modern Standard Arabic (العربية الفصحى)" : "standard formal Hebrew";
  return `You organize meeting minutes for the committee of a school writing competition.

1. Rewrite the raw minutes (WhatsApp chat, rough notes or a document) into clear, correct, formal ${lang}.
2. Keep EVERY name, number, date, place, detail and decision from the source. Drop nothing.
3. NEVER invent anything. If something is not in the source, leave it empty ("" or []).
4. Organize into the template: title, date, participants, topics (agenda items), discussions, decisions, tasks (each with owners), notes.
5. Then list new_tasks: the NEW action items the committee agreed on, each with a short title, a one-sentence description (only from the source), the responsible people (assignees) if stated, and the best axis number below (use 6 if none clearly fits).
6. Do not list tasks that already exist (see below), even if worded differently.

AXES
${AXES[comp].map((a, i) => `${i + 1}. ${a}`).join("\n")}

KNOWN COMMITTEE MEMBERS (use these spellings when a name clearly matches): ${members.join(", ") || "(none)"}

EXISTING TASKS
${existing.map((t) => `- ${t}`).join("\n") || "(none)"}

Reply with ONLY this JSON (no other text):
{"minutes":{"title":"","date":"","participants":[],"topics":[],"discussions":[],"decisions":[],"tasks":[{"task":"","owners":[]}],"notes":[]},
 "new_tasks":[{"title":"","description":"","axis":6,"assignees":[]}]}`;
}

// ---------- providers ----------
// tried in order; a busy or missing model falls through to the next one
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
const AI_TIMEOUT_MS = 110_000; // stay under the Edge Function time limit
let workingModel: string | null = null; // remembered while this function instance is warm

async function geminiCall(model: string, system: string, user: string, thinking: boolean) {
  const generationConfig: Record<string, unknown> = { responseMimeType: "application/json" };
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: "low" }; // faster answers on models that "think"
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    headers: { "Content-Type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig,
    }),
  });
}

async function askGemini(system: string, user: string): Promise<{ text: string; model: string }> {
  const fixed = Deno.env.get("GEMINI_MODEL");
  const models = fixed ? [fixed] : workingModel ? [workingModel, ...GEMINI_MODELS.filter((m) => m !== workingModel)] : GEMINI_MODELS;
  const errors: string[] = [];
  for (const model of models) {
    let res = await geminiCall(model, system, user, true);
    if (res.status === 400) {
      const err = await res.text();
      if (!/thinking/i.test(err)) throw new Error(`gemini 400: ${err.slice(0, 300)}`);
      res = await geminiCall(model, system, user, false); // model without thinking settings
    }
    if (res.status === 404) { errors.push(`${model}: not found`); continue; }
    // busy / rate-limited / temporary error → try the next model right away instead of failing
    if (res.status === 429 || res.status >= 500) { errors.push(`${model}: ${res.status}`); await res.body?.cancel(); continue; }
    const data = await res.json();
    if (!res.ok) throw new Error(`gemini ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) throw new Error(`gemini returned no text: ${JSON.stringify(data).slice(0, 300)}`);
    workingModel = model;
    if (errors.length) console.warn("gemini fallbacks:", errors.join("; "));
    return { text, model };
  }
  throw new Error(errors.join("; ") || "no gemini model available");
}

async function askClaude(system: string, user: string): Promise<{ text: string; model: string }> {
  const { default: Anthropic } = await import("npm:@anthropic-ai/sdk");
  const client = new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-opus-5-5";
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error("refused");
  return { text: response.content.map((b) => (b.type === "text" ? b.text : "")).join(""), model };
}

function provider(): "gemini" | "anthropic" | "off" {
  if (Deno.env.get("GEMINI_API_KEY")) return "gemini";
  if (Deno.env.get("ANTHROPIC_API_KEY")) return "anthropic";
  return "off";
}

// ---------- answer parsing (same rules as the app) ----------
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : [];

function parse(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1] : text;
  body = body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1);
  const data = JSON.parse(body);
  const m = data.minutes ?? {};
  return {
    minutes: {
      title: String(m.title ?? "").trim(), date: String(m.date ?? "").trim(),
      participants: strArr(m.participants), topics: strArr(m.topics), discussions: strArr(m.discussions),
      decisions: strArr(m.decisions), notes: strArr(m.notes),
      tasks: Array.isArray(m.tasks)
        ? m.tasks.map((t: any) => ({ task: String(t?.task ?? "").trim(), owners: strArr(t?.owners) })).filter((t: any) => t.task)
        : [],
    },
    tasks: (Array.isArray(data.new_tasks) ? data.new_tasks : [])
      .map((t: any) => {
        const axis = Number(t?.axis);
        return {
          title: String(t?.title ?? "").trim(), description: String(t?.description ?? "").trim(),
          axis: Number.isInteger(axis) && axis >= 1 && axis <= 6 ? axis : 6, assignees: strArr(t?.assignees),
        };
      })
      .filter((t: any) => t.title),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const mode = provider();
    if (body.ping) return reply({ mode });
    if (body.check) {
      // Health check: one tiny AI call; tells which model answers and how fast (no user data involved).
      if (mode === "off") return reply({ mode });
      const t0 = Date.now();
      try {
        const sys = 'Reply with exactly this JSON: {"ok":true}';
        const r = mode === "gemini" ? await askGemini(sys, "ping") : await askClaude(sys, "ping");
        return reply({ mode, model: r.model, ms: Date.now() - t0, answer: r.text.slice(0, 100) });
      } catch (e) {
        return reply({ mode, ms: Date.now() - t0, error: String(e).slice(0, 400) }, 502);
      }
    }
    if (mode === "off") return reply({ error: "ai_off" }, 503);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: m, error } = await supabase.from("wt_minutes").select("*").eq("id", body.minute_id).single();
    if (error || !m) return reply({ error: "not_found" }, 404);
    if (!m.raw_text?.trim()) return reply({ error: "no_text" }, 400);
    const { data: members } = await supabase.from("wt_members").select("name").eq("competition", m.competition);
    const { data: tasks } = await supabase.from("wt_tasks").select("title").eq("competition", m.competition);

    const system = instructions(m.competition, (members ?? []).map((x) => x.name), (tasks ?? []).map((x) => x.title));
    const user = `MEETING TITLE: ${m.title || "(empty)"}\nMEETING DATE: ${m.meeting_date || "(empty)"}\n\nRAW MINUTES\n<<<\n${m.raw_text}\n>>>`;

    let result;
    const t0 = Date.now();
    try {
      const r = mode === "gemini" ? await askGemini(system, user) : await askClaude(system, user);
      console.info(`AI answered with ${r.model} in ${Date.now() - t0} ms`);
      result = parse(r.text);
    } catch (e) {
      console.error("AI failed", e);
      const timedOut = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
      return reply({ error: timedOut ? "ai_timeout" : "ai_failed" }, timedOut ? 504 : 502);
    }

    const { error: e2 } = await supabase.rpc("wt_minute_set_ai_result", { p_id: m.id, p_draft: result.minutes, p_tasks: result.tasks });
    if (e2) return reply({ error: e2.message }, 400);
    return reply({ ok: true, mode, suggestions: result.tasks.length });
  } catch (e) {
    console.error(e);
    return reply({ error: "ai_failed" }, 502);
  }
});
