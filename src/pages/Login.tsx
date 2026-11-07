import { useEffect, useState } from "react";
import { DICT, ERRORS, type Comp } from "@/lib/i18n";
import { ApiError, displayPhone, inviteInfo, joinWithInvite, signIn, signOut } from "@/lib/data";
import { configured } from "@/lib/supabase";

const TXT = {
  ar: {
    phone: "رقم الهاتف", inviteOnly: "الدخول لأعضاء اللجنة فقط. للانضمام اطلبي رابط دعوة من المديرة.",
    inviteTitle: "دعوة للانضمام إلى اللجنة", choosePassword: "اختاري كلمة مرور (6 أحرف على الأقل)", join: "انضمام",
    noAccess: "ليس لديك صلاحية دخول. اطلبي من المديرة رابط دعوة.", badInvite: "رابط الدعوة غير صالح أو استُخدم من قبل.",
    phoneHint: "مثال: 0501234567",
  },
  he: {
    phone: "מספר טלפון", inviteOnly: "הכניסה לחברי הוועדה בלבד. להצטרפות בקשו קישור הזמנה מהמנהלת.",
    inviteTitle: "הזמנה להצטרף לוועדה", choosePassword: "בחרו סיסמה (6 תווים לפחות)", join: "הצטרפות",
    noAccess: "אין לך הרשאת כניסה. בקשו מהמנהלת קישור הזמנה.", badInvite: "קישור ההזמנה לא תקין או שכבר נעשה בו שימוש.",
    phoneHint: "לדוגמה: 0501234567",
  },
};

function Shell({ lang, setLang, title, children }: { lang: Comp; setLang: (c: Comp) => void; title: string; children: React.ReactNode }) {
  const t = DICT[lang];
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
        {children}
      </div>
    </main>
  );
}

/** Login (phone + password), joining with a personal invite link, or "no access" for signed-in non-members. */
export default function Login({ onDone, invite, noAccess }: { onDone: () => void; invite?: string | null; noAccess?: boolean }) {
  const [lang, setLang] = useState<Comp>("ar");
  const [f, setF] = useState({ name: "", phone: "", password: "" });
  const [info, setInfo] = useState<{ name: string; phone: string } | null | undefined>(invite ? undefined : null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = DICT[lang], x = TXT[lang];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const errText = (ex: unknown) => (ex instanceof ApiError ? ERRORS[lang][ex.code] ?? t.error : t.error);

  useEffect(() => {
    if (!invite) return;
    inviteInfo(invite).then((i) => { setInfo(i); if (i) setF((v) => ({ ...v, name: i.name })); }).catch(() => setInfo(null));
  }, [invite]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); onDone(); } catch (ex) { setError(errText(ex)); } finally { setBusy(false); }
  }

  if (invite) {
    return (
      <Shell lang={lang} setLang={setLang} title={x.inviteTitle}>
        {info === undefined && <p className="muted">…</p>}
        {info === null && <p className="error">{x.badInvite}</p>}
        {info && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await joinWithInvite(invite, f.name.trim(), f.password); history.replaceState(null, "", "#/"); }); }}>
            <label>{x.phone}<input value={displayPhone(info.phone)} readOnly dir="ltr" /></label>
            <label>{t.name}<input value={f.name} onChange={set("name")} required autoComplete="name" /></label>
            <label>{x.choosePassword}<input type="password" value={f.password} onChange={set("password")} required minLength={6} autoComplete="new-password" dir="ltr" /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary" disabled={busy}>{x.join}</button>
          </form>
        )}
      </Shell>
    );
  }

  if (noAccess) {
    return (
      <Shell lang={lang} setLang={setLang} title={t.login}>
        <p>{x.noAccess}</p>
        <button className="btn" onClick={async () => { await signOut(); onDone(); }}>{t.logout}</button>
      </Shell>
    );
  }

  return (
    <Shell lang={lang} setLang={setLang} title={t.login}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => signIn(f.phone, f.password)); }}>
        <label>{x.phone}<input value={f.phone} onChange={set("phone")} required autoComplete="tel" inputMode="tel" dir="ltr" placeholder={x.phoneHint} /></label>
        <label>{t.password}<input type="password" value={f.password} onChange={set("password")} required autoComplete="current-password" dir="ltr" /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{t.login}</button>
      </form>
      <p className="muted small">{x.inviteOnly}</p>
    </Shell>
  );
}
