import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { DICT, type Comp } from "@/lib/i18n";
import { progress } from "@/lib/dedupe";
import { signOut, summary } from "@/lib/data";
import { Logo } from "@/components/Header";
import BookHero from "@/components/BookHero";

/** Start screen: two big tiles, one per competition. */
export default function Choose() {
  const [pct, setPct] = useState<Partial<Record<Comp, number>>>({});
  useEffect(() => {
    document.documentElement.lang = "ar";
    (["ar", "he"] as Comp[]).forEach((c) =>
      summary(c).then((s) => setPct((p) => ({ ...p, [c]: progress(s.counts).percent }))).catch(() => {}));
  }, []);

  const tiles: { comp: Comp; title: string; sub: string; lang: string }[] = [
    { comp: "ar", title: DICT.ar.competition, sub: "", lang: "ar" },
    { comp: "he", title: DICT.he.competition, sub: "مسابقة الكتابة", lang: "he" },
  ];

  return (
    <>
      <header className="site-header">
        <div className="topbar">
          <div className="brand"><Logo /></div>
          <div className="topbar-end">
            <button className="link-btn" onClick={() => signOut()}>{DICT.ar.logout}</button>
            <span className="owner-name">{DICT.ar.owner}</span>
          </div>
        </div>
      </header>
      <section className="choose-hero">
        <BookHero />
        <h1 className="choose-heading">أهلًا وسهلًا بكم في أبليكاتسيا الكتابة</h1>
      </section>
      <main className="container choose">
        {tiles.map((x) => (
          <Link key={x.comp} to={`/${x.comp}`} className="choose-tile card" data-testid={`choose-${x.comp}`} lang={x.lang}>
            <span className="book-spine" aria-hidden="true" />
            <span className="choose-title">{x.title}</span>
            {x.sub && <span className="choose-sub">{x.sub}</span>}
            {pct[x.comp] !== undefined && (
              <span className="choose-pct">
                <span className="bar"><span style={{ width: `${pct[x.comp]}%` }} /></span>
                {pct[x.comp]}%
              </span>
            )}
          </Link>
        ))}
      </main>
    </>
  );
}
