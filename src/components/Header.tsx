"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { DICT, type Comp } from "@/lib/i18n";
import { api } from "./client";

export function Header({ comp, logo }: { comp: Comp; logo: string | null }) {
  const t = DICT[comp];
  const path = usePathname();
  const router = useRouter();
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
        <div className="brand">
          {logo ? <img src={logo} alt="logo" className="logo" /> : <span className="logo-placeholder" aria-hidden />}
        </div>
        <div className="topbar-end">
          <button className="lang-btn" onClick={() => router.push(target)} data-testid="lang-toggle">{t.switchTo}</button>
          <button className="link-btn" onClick={async () => { await api("POST", "/api/auth/logout"); window.location.href = "/login"; }}>
            {t.logout}
          </button>
          <span className="owner-name">{t.owner}</span>
        </div>
      </div>
      <div className="comp-bar">
        <h1 className="comp-title">{t.competition}</h1>
        <nav className="tabs">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`tab ${active(n.href) ? "active" : ""}`}>{n.label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
