// Tests the copy/paste AI helper (prompt + answer parsing). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, parseAnswer } from "../src/lib/aiPrompt.ts";

test("prompt contains the minutes, axes, members and existing tasks", () => {
  const p = buildPrompt({
    comp: "ar", title: "اجتماع", date: "2026-11-05", raw: "مهمة: طباعة الشهادات",
    axes: [{ id: 1, title: "محور", hint: "تلميح" }], members: ["رنا مروات"], existingTasks: ["حجز القاعة"],
  });
  for (const s of ["مهمة: طباعة الشهادات", "1. محور — تلميح", "رنا مروات", "- حجز القاعة", "العربية الفصحى", "new_tasks"]) assert.ok(p.includes(s), s);
});

test("parses a fenced JSON answer with chat text around it; fixes bad axis", () => {
  const answer = `Here you go:
\`\`\`json
{ "minutes": { "title": "اجتماع اللجنة", "date": "5.11", "participants": ["غادة", "رنا"], "topics": [],
  "discussions": ["نقاش"], "decisions": ["اعتماد الموعد"], "tasks": [{"task": "طباعة", "owners": ["رنا"]}], "notes": "ملاحظة" },
  "new_tasks": [{ "title": "طباعة الشهادات", "description": "", "axis": 5, "assignees": ["رنا مروات"] },
                { "title": "مهمة", "axis": 42 }, { "title": "  " }] }
\`\`\`
Good luck!`;
  const r = parseAnswer(answer);
  assert.equal(r.minutes.title, "اجتماع اللجنة");
  assert.deepEqual(r.minutes.participants, ["غادة", "رنا"]);
  assert.deepEqual(r.minutes.notes, ["ملاحظة"]);
  assert.deepEqual(r.minutes.tasks, [{ task: "طباعة", owners: ["رنا"] }]);
  assert.equal(r.tasks.length, 2);
  assert.equal(r.tasks[0].axis, 5);
  assert.equal(r.tasks[1].axis, 8);
  assert.deepEqual(r.tasks[1].assignees, []);
});

test("parses bare JSON and rejects unusable answers", () => {
  assert.equal(parseAnswer('{"minutes":{"title":"x"},"new_tasks":[]}').minutes.title, "x");
  assert.throws(() => parseAnswer("Sorry, I can't help"), /bad_ai_answer/);
  assert.throws(() => parseAnswer("```json\n{ not json }\n```"), /bad_ai_answer/);
  assert.throws(() => parseAnswer('{"foo": 1}'), /bad_ai_answer/);
});
