import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { DICT, type Comp } from "@/lib/i18n";
import { signOut } from "@/lib/data";

/** Shows public/logo.png (or logo.svg) when the file exists. */
export function Logo() {
  const [src, setSrc] = useState<string | null>("logo.png");
  if (!src) return <span className="logo-placeholder" aria-hidden />;
  return <img src={src} alt="logo" className="logo" onError={() => setSrc(src === "logo.png" ? "logo.svg" : null)} />;
}

export function Header({ comp }: { comp: Comp }) {
  const t = DICT[comp];
  const { pathname: path } = useLocation();
  const navigate = useNavigate();
  const other: Comp = comp === "ar" ? "he" : "ar";

  useEffect(() => { document.documentElement.lang = comp; }, [comp]);

  // Switching language switches to the other competition; ids never cross competitions.
  const rest = path.replace(/^\/(ar|he)/, "");
  const target = `/${other}${/^\/minutes\/\d+/.test(rest) ? "/minutes" : rest}`;

  const nav = [
    { href: `/${comp}`, label: t.home },
    { href: `/${comp}/tasks`, label: t.tasks },
    { href: `/${comp}/minutes`, label: t.minutes },
    { href: `/${comp}/history`, label: t.history },
  ];
  const active = (href: string) => (href === `/${comp}` ? path === href : path.startsWith(href));

  return (
    <header className="site-header">
      <div className="topbar">
        <Link to="/" className="brand" title={t.allCompetitions} data-testid="to-start"><Logo /><span className="brand-home">⌂ {t.allCompetitions}</span></Link>
        <div className="topbar-end">
          <button className="lang-btn" onClick={() => navigate(target)} data-testid="lang-toggle">{t.switchTo}</button>
          <button className="link-btn" onClick={async () => { await signOut(); navigate("/login"); }}>{t.logout}</button>
          <span className="owner-name">{t.owner}</span>
        </div>
      </div>
      <div className="comp-bar">
        <h1 className="comp-title">{t.competition}</h1>
        <nav className="tabs">
          {nav.map((n) => (
            <Link key={n.href} to={n.href} className={`tab ${active(n.href) ? "active" : ""}`}>{n.label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
