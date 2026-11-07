import { useEffect, useState } from "react";

declare const __BUILD_ID__: string;

/**
 * Shows a bar when a newer version of the app was published. It never reloads
 * by itself, so nothing someone is typing gets lost. Data lives in Supabase and
 * is never touched by app updates.
 */
export function UpdateBanner() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const check = async () => {
      try {
        const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
        const v = await r.json();
        if (v.build && v.build !== __BUILD_ID__) setFresh(true);
      } catch { /* offline: try later */ }
    };
    const id = setInterval(check, 120_000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    check();
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);
  if (!fresh) return null;
  const he = document.documentElement.lang === "he";
  return (
    <div className="toast update" role="status" data-testid="update-banner">
      <span>{he ? "יש עדכון חדש לאפליקציה" : "يوجد تحديث جديد للتطبيق"}</span>
      <button className="btn small" onClick={() => location.reload()}>{he ? "רענון עכשיו" : "تحديث الآن"}</button>
    </div>
  );
}
