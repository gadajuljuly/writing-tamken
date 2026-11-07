import { useState } from "react";
import { DICT, type Comp } from "@/lib/i18n";
import { ApiError, signInWithCode, signOut } from "@/lib/data";
import { configured } from "@/lib/supabase";

const TXT = {
  ar: { code: "رمز الدخول", enter: "دخول", wrong: "الرمز غير صحيح", notReady: "الحساب المشترك لم يُفعَّل بعد في قاعدة البيانات." },
  he: { code: "קוד כניסה", enter: "כניסה", wrong: "הקוד שגוי", notReady: "החשבון המשותף עוד לא הופעל בבסיס הנתונים." },
};

/** Shared access: everyone enters the same code (like a shared document). */
export default function Login({ onDone, notReady }: { onDone: () => void; notReady?: boolean }) {
  const [lang, setLang] = useState<Comp>("ar");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = DICT[lang], x = TXT[lang];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await signInWithCode(code); onDone(); }
    catch (ex) { setError(ex instanceof ApiError && ex.code === "bad_login" ? x.wrong : t.error); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-page" lang={lang}>
      <div className="auth-card card">
        <div className="auth-top">
          <span className="owner-name">{t.owner}</span>
          <button type="button" className="lang-btn" onClick={() => setLang(lang === "ar" ? "he" : "ar")}>{t.switchTo}</button>
        </div>
        <h1 className="comp-title">{t.competition}</h1>
        {!configured && <p className="error">{t.notConfigured}</p>}
        {notReady ? (
          <>
            <p className="error">{x.notReady}</p>
            <button className="btn" onClick={async () => { await signOut(); onDone(); }}>{t.logout}</button>
          </>
        ) : (
          <form onSubmit={submit} className="form">
            <label>{x.code}<input type="password" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus dir="ltr" autoComplete="current-password" /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary" disabled={busy}>{x.enter}</button>
          </form>
        )}
      </div>
    </main>
  );
}
