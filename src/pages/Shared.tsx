import { useEffect, useState } from "react";
import { DICT, type Comp } from "@/lib/i18n";
import { getShare, openUrl, type SharedItem } from "@/lib/data";
import { Logo } from "@/components/Header";

const TXT = {
  ar: { open: "فتح", none: "الرابط غير صالح أو أن المواد حُذفت.", loading: "…" },
  he: { open: "פתיחה", none: "הקישור לא תקין או שהחומרים נמחקו.", loading: "…" },
};

/** Public page for a short share link (#/m/<code>): no login, only the chosen materials. */
export default function Shared({ code }: { code: string }) {
  const [items, setItems] = useState<SharedItem[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => { getShare(code).then(setItems).catch(() => setItems([])); }, [code]);
  const comp: Comp = items?.[0]?.competition ?? "ar";
  const t = DICT[comp], x = TXT[comp];
  useEffect(() => { document.documentElement.lang = comp; }, [comp]);

  async function open(it: SharedItem) {
    setBusy(it.id);
    const w = window.open("", "_blank"); // open right away so phones don't block the new tab
    try { const url = await openUrl(it); if (w) w.location.href = url; else location.href = url; }
    catch { w?.close(); } finally { setBusy(null); }
  }

  const icon = (it: SharedItem) => (it.kind === "link" ? "🔗" : /^image\//.test(it.mime ?? "") ? "🖼" : /video/.test(it.mime ?? "") ? "🎬" : "📄");

  return (
    <>
      <header className="site-header">
        <div className="topbar">
          <div className="brand"><Logo /></div>
          <div className="topbar-end"><span className="owner-name">{t.owner}</span></div>
        </div>
        <div className="comp-bar">
          <h1 className="comp-title">{t.competition}</h1>
        </div>
      </header>
      <main className="container shared-page">
        {items === null && <p className="muted">{x.loading}</p>}
        {items?.length === 0 && <p className="error">{x.none}</p>}
        {items && items.length > 0 && (
          <section className="card">
            <h2>{items[0].share_title || t.resources}</h2>
            <ul className="shared-list">
              {items.map((it) => (
                <li key={it.id}>
                  <button className="shared-item" onClick={() => open(it)} disabled={busy === it.id} data-testid="shared-item">
                    <span className="shared-icon">{icon(it)}</span>
                    <span className="shared-title">{it.title}</span>
                    <span className="btn small primary">{busy === it.id ? "…" : x.open}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
