// Supabase Edge Function: organizes raw meeting minutes with Claude and proposes tasks.
// It runs with the caller's own login (RLS applies) and only writes a DRAFT + proposals;
// nothing is approved here — the uploader approves in the app.
//
// Secrets (Supabase → Edge Functions → Secrets):  ANTHROPIC_API_KEY  (required)
//                                                  ANTHROPIC_MODEL    (optional, default claude-opus-5-5)
import Anthropic from "npm:@anthropic-ai/sdk";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk/helpers/zod";
import { z } from "npm:zod@4";
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
  new_tasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    axis: z.number().int(),
    assignees: z.array(z.string()),
  })),
});

function systemPrompt(comp: string, members: string[], existing: string[]) {
  const lang = comp === "ar" ? "Modern Standard Arabic (العربية الفصحى)" : "standard formal Hebrew";
  return `You organize meeting minutes for the committee of a school writing competition.

Rewrite the raw minutes (which may be a WhatsApp chat, rough notes or a document) into clear, correct, formal ${lang}.
Strict rules:
- Keep every name, number, date, place, detail and decision that appears in the source. Do not drop information.
- Never invent anything. If a field is not present in the source, leave it empty ("" or []).
- Do not add opinions, conclusions or tasks that are not stated or clearly agreed in the source.
- Use people's names as written in the source; if a name clearly matches a known committee member below, use the member's spelling.

Structure the minutes into: title, date, participants, topics (agenda items), discussions, decisions, tasks (each with its owners), notes.

Then list new_tasks: concrete action items the committee agreed to carry out.
- For each: a short title, a one-sentence description (only from the source) and the responsible people (assignees) if stated.
- Give each task the number of the best matching axis below; if none clearly fits, use 6:
${AXES[comp].map((a, i) => `${i + 1}. ${a}`).join("\n")}
- Do not include tasks that already exist in the list below (same meaning, even if worded differently).

Known committee members: ${members.join(", ") || "(none)"}
Existing tasks:
${existing.map((t) => `- ${t}`).join("\n") || "(none)"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const hasKey = !!Deno.env.get("ANTHROPIC_API_KEY");
    if (body.ping) return reply({ mode: hasKey ? "anthropic" : "off" });
    if (!hasKey) return reply({ error: "ai_off" }, 503);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: m, error } = await supabase.from("wt_minutes").select("*").eq("id", body.minute_id).single();
    if (error || !m) return reply({ error: "not_found" }, 404);
    if (!m.raw_text?.trim()) return reply({ error: "no_text" }, 400);

    const { data: members } = await supabase.from("wt_members").select("name").eq("competition", m.competition);
    const { data: tasks } = await supabase.from("wt_tasks").select("title").eq("competition", m.competition);

    const client = new Anthropic();
    const response = await client.messages.parse({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-opus-5-5",
      max_tokens: 16000,
      system: systemPrompt(m.competition, (members ?? []).map((x) => x.name), (tasks ?? []).map((x) => x.title)),
      messages: [{
        role: "user",
        content: `Meeting title (may be empty): ${m.title}\nMeeting date (may be empty): ${m.meeting_date}\n\n<raw_minutes>\n${m.raw_text}\n</raw_minutes>`,
      }],
      output_config: { format: zodOutputFormat(Result) },
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) return reply({ error: "ai_failed" }, 502);

    const out = response.parsed_output;
    const { error: e2 } = await supabase.rpc("wt_minute_set_ai_result", {
      p_id: m.id,
      p_draft: out.minutes,
      p_tasks: out.new_tasks.map((t) => ({ ...t, axis: t.axis >= 1 && t.axis <= 6 ? t.axis : 6 })),
    });
    if (e2) return reply({ error: e2.message }, 400);
    return reply({ ok: true, suggestions: out.new_tasks.length });
  } catch (e) {
    console.error(e);
    return reply({ error: "ai_failed" }, 502);
  }
});
