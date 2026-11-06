import { useState } from "react";
import { DICT, ERRORS, type Comp } from "@/lib/i18n";
import { ApiError, join, signIn, signUp, signOut } from "@/lib/data";
import { configured } from "@/lib/supabase";

/** Sign in / create an account. With `joinOnly`, a signed-in user who is not yet a member enters the committee code. */
export default function Login({ onDone, joinOnly }: { onDone: () => void; joinOnly?: boolean }) {
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
      if (joinOnly) await join(f.code, f.name);
      else if (mode === "login") await signIn(f.email.trim(), f.password);
      else await signUp(f.name.trim(), f.email.trim(), f.password, f.code);
      onDone();
    } catch (ex) {
      setError(ex instanceof ApiError ? ERRORS[lang][ex.code] ?? t.error : t.error);
    } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const title = joinOnly ? t.joinTitle : mode === "login" ? t.login : t.register;

  return (
    <main className="auth-page" lang={lang}>
      <div className="auth-card card">
        <div className="auth-top">
          <span className="owner-name">{t.owner}</span>
          <button type="button" className="lang-btn" onClick={() => setLang(lang === "ar" ? "he" : "ar")}>{t.switchTo}</button>
        </div>
        <h1 className="comp-title">{t.competition}</h1>
        <h2>{title}</h2>
        {!configured && <p className="error">{t.notConfigured}</p>}
        <form onSubmit={submit} className="form">
          {(joinOnly || mode === "register") && (
            <label>{t.name}<input value={f.name} onChange={set("name")} required autoComplete="name" /></label>
          )}
          {!joinOnly && (
            <>
              <label>{t.email}<input type="email" value={f.email} onChange={set("email")} required autoComplete="email" dir="ltr" /></label>
              <label>{t.password}<input type="password" value={f.password} onChange={set("password")} required minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"} dir="ltr" /></label>
            </>
          )}
          {(joinOnly || mode === "register") && (
            <label>{t.signupCode}<input value={f.code} onChange={set("code")} required /></label>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{joinOnly ? t.join : title}</button>
        </form>
        {joinOnly ? (
          <button className="link-btn" onClick={async () => { await signOut(); onDone(); }}>{t.logout}</button>
        ) : (
          <button className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
            {mode === "login" ? t.noAccount : t.haveAccount}
          </button>
        )}
      </div>
    </main>
  );
}
