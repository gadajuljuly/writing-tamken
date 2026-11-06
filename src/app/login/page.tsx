"use client";
import { useState } from "react";
import { DICT, ERRORS, type Comp } from "@/lib/i18n";
import { api, ApiError } from "@/components/client";

export default function LoginPage() {
  const [lang, setLang] = useState<Comp>("ar");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", code: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = DICT[lang];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("POST", `/api/auth/${mode}`, f);
      window.location.href = `/${lang}`;
    } catch (err) {
      setError(err instanceof ApiError ? ERRORS[lang][err.code] ?? t.error : t.error);
    } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <main className="auth-page" lang={lang}>
      <div className="auth-card card">
        <div className="auth-top">
          <span className="owner-name">{t.owner}</span>
          <button type="button" className="lang-btn" onClick={() => setLang(lang === "ar" ? "he" : "ar")}>{t.switchTo}</button>
        </div>
        <h1 className="comp-title">{t.competition}</h1>
        <h2>{mode === "login" ? t.login : t.register}</h2>
        <form onSubmit={submit} className="form">
          {mode === "register" && (
            <label>{t.name}<input value={f.name} onChange={set("name")} required autoComplete="name" /></label>
          )}
          <label>{t.email}<input type="email" value={f.email} onChange={set("email")} required autoComplete="email" dir="ltr" /></label>
          <label>{t.password}<input type="password" value={f.password} onChange={set("password")} required minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"} dir="ltr" /></label>
          {mode === "register" && (
            <label>{t.signupCode}<input value={f.code} onChange={set("code")} required /></label>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{mode === "login" ? t.login : t.register}</button>
        </form>
        <button className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
          {mode === "login" ? t.noAccount : t.haveAccount}
        </button>
      </div>
    </main>
  );
}
