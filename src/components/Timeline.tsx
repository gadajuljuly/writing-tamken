/** "مسار تدريجي نحو الإبداع في التعبير الكتابي" — the year's writing path (Arabic competition). */
type Step = { when: string; what: string; start: string };

const STEPS: Step[] = [
  { when: "بروفيل الكاتب", what: "الكاتب + مهمة راما", start: "2026-09-01" },
  { when: "تشرين أوّل/ثانٍ", what: "توسيع الحدث", start: "2026-10-01" },
  { when: "كانون أوّل/ثانٍ", what: "الحواس والمشاعر", start: "2026-12-01" },
  { when: "شباط", what: "الحوار", start: "2027-02-01" },
  { when: "آذار", what: "البداية / النهاية / العنوان", start: "2027-03-01" },
  { when: "31.3.27", what: "كتابة 2-3 قصص (تسليم قصة واحدة)", start: "2027-03-31" },
  { when: "26.4.27", what: "اختيار قصة عن كل صف للمركز", start: "2027-04-26" },
];
const FINAL: Step = { when: "26.5.27", what: "يوم التتويج (مدارس قلم-تمكين، ثوالث وروابع)", start: "2027-05-26" };

export function Timeline({ today = new Date() }: { today?: Date }) {
  const all = [...STEPS, FINAL];
  const t = today.getTime();
  const current = all.reduce((cur, s, i) => (new Date(s.start).getTime() <= t ? i : cur), -1);

  return (
    <section className="card timeline-card" data-testid="timeline">
      <h2 className="timeline-title">مسار تدريجي نحو الإبداع في التعبير الكتابي</h2>
      <ol className="timeline">
        {all.map((s, i) => {
          const state = i < current ? "past" : i === current ? "now" : "next";
          const final = i === all.length - 1;
          return (
            <li key={s.when} className={`tl-step ${state} ${final ? "final" : ""}`} data-state={state}>
              <span className="tl-dot" aria-hidden>{final ? "★" : ""}</span>
              <b className="tl-when">{s.when}</b>
              <span className="tl-what">{s.what}</span>
              {state === "now" && <span className="tl-now">نحن هنا</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
