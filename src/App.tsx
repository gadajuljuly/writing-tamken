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
import History from "@/pages/History";

function CompLayout({ me }: { me: Me }) {
  const { comp = "" } = useParams();
  if (!isComp(comp)) return <Navigate to="/ar" replace />;
  return (
    <CompProvider comp={comp} me={me}>
      <Header comp={comp} />
      <main className="container"><Outlet /></main>
    </CompProvider>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const refresh = useCallback(() => { loadMe().then(setMe); }, []);
  useEffect(() => {
    refresh();
    const { data } = supabase.auth.onAuthStateChange(() => refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);
  useEffect(() => { if (me?.name) startRealtime(); }, [me?.name]);

  if (me === undefined) return <p className="muted" style={{ padding: 24 }}>…</p>;
  if (me === null) return <Login onDone={refresh} />;
  if (!me.name) return <Login onDone={refresh} joinOnly />; // signed in but not yet a committee member

  return (
    <HashRouter>
      <Routes>
        <Route path="/:comp" element={<CompLayout me={me} />}>
          <Route index element={<Home />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="minutes" element={<Minutes />} />
          <Route path="minutes/:id" element={<Minute />} />
          <Route path="history" element={<History />} />
        </Route>
        <Route path="*" element={<Navigate to="/ar" replace />} />
      </Routes>
    </HashRouter>
  );
}
