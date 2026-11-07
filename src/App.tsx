import { useCallback, useEffect, useState } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { isComp } from "@/lib/i18n";
import { me as loadMe, startRealtime, type Me } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { CompProvider } from "@/components/ui";
import { Header } from "@/components/Header";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import Tasks from "@/pages/Tasks";
import Minutes from "@/pages/Minutes";
import Minute from "@/pages/Minute";
import Choose from "@/pages/Choose";
import Admin from "@/pages/Admin";

/** Personal invite token from a link like …/#/?invite=abc */
const inviteToken = () => new URLSearchParams(location.hash.split("?")[1] ?? "").get("invite");

function CompLayout({ me }: { me: Me }) {
  const { comp = "" } = useParams();
  if (!isComp(comp)) return <Navigate to="/" replace />;
  return (
    <CompProvider comp={comp} me={me}>
      <Header comp={comp} />
      <main className="container"><Outlet /></main>
    </CompProvider>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [invite, setInvite] = useState(inviteToken());
  const refresh = useCallback(() => { setInvite(inviteToken()); loadMe().then(setMe); }, []);
  useEffect(() => {
    refresh();
    const { data } = supabase.auth.onAuthStateChange(() => refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);
  const member = !!(me?.name && me.active);
  useEffect(() => { if (member) startRealtime(); }, [member]);

  if (me === undefined) return <p className="muted" style={{ padding: 24 }}>…</p>;
  if (invite && !member) return <Login onDone={refresh} invite={invite} />;
  if (me === null) return <Login onDone={refresh} />;
  if (!member) return <Login onDone={refresh} noAccess />; // signed in but not (or no longer) a committee member

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Choose me={me} />} />
        {me.role === "admin" && <Route path="/admin" element={<Admin me={me} />} />}
        <Route path="/:comp" element={<CompLayout me={me} />}>
          <Route index element={<Home />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="minutes" element={<Minutes />} />
          <Route path="minutes/:id" element={<Minute />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
