import { Link } from "react-router-dom";
import { useState } from "react";
import { DICT, ERRORS } from "@/lib/i18n";
import {
  ApiError, createInvite, displayPhone, inviteLink, listInvites, listProfiles, revokeInvite, setMemberActive, whatsappLink,
  type Invite, type Me,
} from "@/lib/data";
import { useData } from "@/components/ui";
import { Logo } from "@/components/Header";

type ContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };
const contacts = (navigator as unknown as { contacts?: ContactsManager }).contacts;
const canPickContacts = !!contacts && "select" in contacts;

const message = (inv: Invite) =>
  `مرحبًا ${inv.name || ""}، هذه دعوتك للانضمام إلى تطبيق لجنة مسابقة الكتابة:\n${inviteLink(inv.token)}\n\n` +
  `שלום ${inv.name || ""}, זו ההזמנה שלך להצטרף לאפליקציית ועדת תחרות הכתיבה (הקישור למעלה).`;

/** Admin only: choose who may join (by phone number) and manage access. */
export default function Admin({ me }: { me: Me }) {
  const { data: invites = [] } = useData(() => listInvites(), []);
  const { data: people = [] } = useData(() => listProfiles(), []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const err = (e: unknown) => (e instanceof ApiError ? ERRORS.ar[e.code] ?? DICT.ar.error : DICT.ar.error);

  async function add(list: { name: string; phone: string }[]) {
    setBusy(true); setMsg("");
    const problems: string[] = [];
    for (const c of list) {
      try { await createInvite(c.phone, c.name); } catch (e) { problems.push(`${c.name || c.phone}: ${err(e)}`); }
    }
    setBusy(false);
    setMsg(problems.length ? problems.join(" · ") : "✓ أُضيفت الدعوات. أرسليها عبر WhatsApp من القائمة أدناه.");
  }

  async function pickContacts() {
    try {
      const picked = await contacts!.select(["name", "tel"], { multiple: true });
      const list = picked.flatMap((c) => (c.tel?.[0] ? [{ name: c.name?.[0] ?? "", phone: c.tel[0] }] : []));
      if (list.length) await add(list);
    } catch { /* closed the picker */ }
  }

  return (
    <>
      <header className="site-header">
        <div className="topbar">
          <Link to="/" className="brand"><Logo /><span className="brand-home">⌂ المسابقات</span></Link>
          <div className="topbar-end"><span className="owner-name">{DICT.ar.owner}</span></div>
        </div>
        <div className="comp-bar"><h1 className="comp-title">إدارة الأعضاء</h1></div>
      </header>
      <main className="container admin" lang="ar">
        <section className="card">
          <h3>دعوة أعضاء</h3>
          <p className="muted small">فقط من تدعينه يستطيع التسجيل. يحصل كل شخص على رابط شخصي مرتبط برقم هاتفه.</p>
          {canPickContacts ? (
            <button className="btn primary big" onClick={pickContacts} disabled={busy} data-testid="pick-contacts">📇 اختيار من جهات الاتصال</button>
          ) : (
            <p className="muted small">اختيار جهات الاتصال يعمل في متصفح Chrome على هاتف Android. هنا يمكنك إدخال الرقم يدويًا:</p>
          )}
          <form className="inline-add" onSubmit={(e) => { e.preventDefault(); add([{ name, phone }]).then(() => { setName(""); setPhone(""); }); }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" required />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الهاتف" required inputMode="tel" dir="ltr" />
            <button className="btn" disabled={busy}>+ دعوة</button>
          </form>
          {msg && <p className="small" role="status">{msg}</p>}
        </section>

        <section className="card">
          <h3>دعوات بانتظار التسجيل ({invites.length})</h3>
          {invites.length === 0 && <p className="muted">لا توجد دعوات مفتوحة</p>}
          <ul className="list">
            {invites.map((inv) => (
              <li key={inv.id} data-testid="invite">
                <b>{inv.name || "—"}</b>
                <span dir="ltr">{displayPhone(inv.phone)}</span>
                <a className="btn small primary" href={whatsappLink(inv.phone, message(inv))} target="_blank" rel="noreferrer">WhatsApp</a>
                <button className="btn small" onClick={() => navigator.clipboard.writeText(inviteLink(inv.token)).then(() => setMsg("✓ نُسخ الرابط"))}>نسخ الرابط</button>
                <button className="btn small danger" onClick={() => revokeInvite(inv.id)}>إلغاء</button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>أعضاء اللجنة ({people.filter((p) => p.active).length})</h3>
          <ul className="list">
            {people.map((p) => (
              <li key={p.id} className={p.active ? "" : "inactive"}>
                <b>{p.name}</b>
                <span dir="ltr">{displayPhone(p.phone) || "—"}</span>
                {p.role === "admin" && <span className="badge approved">مديرة</span>}
                {!p.active && <span className="badge duplicate">موقوف</span>}
                {p.id !== me.id && (
                  <button className="btn small" onClick={() => setMemberActive(p.id, !p.active).catch((e) => setMsg(err(e)))}>
                    {p.active ? "إيقاف الدخول" : "إعادة الدخول"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
