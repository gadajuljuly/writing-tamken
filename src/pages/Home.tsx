import { Link } from "react-router-dom";
import { ACTIONS } from "@/lib/i18n";
import { useComp, useData, fmtDate } from "@/components/ui";
import { summary } from "@/lib/data";
import { progress } from "@/lib/dedupe";

export default function Home() {
  const { comp, t } = useComp();
  const { data } = useData(() => summary(comp), [comp]);
  if (!data) return <p className="muted">…</p>;
  const { counts } = data;
  const { percent, total } = progress(counts);

  return (
    <div className="home">
      <section className="card progress-card">
        <div className="ring" style={{ ["--p" as string]: percent }} data-testid="overall-percent" aria-label={`${percent}%`}>
          <span>{percent}%</span>
        </div>
        <div className="progress-info">
          <h2>{t.overall}</h2>
          <p className="muted">{total} {t.tasksCount}</p>
          <div className="stat-row">
            <div className="stat done"><b data-testid="count-done">{counts.done}</b><span>{t.done}</span></div>
            <div className="stat in_progress"><b data-testid="count-in_progress">{counts.in_progress}</b><span>{t.in_progress}</span></div>
            <div className="stat not_started"><b data-testid="count-not_started">{counts.not_started}</b><span>{t.not_started}</span></div>
          </div>
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h3>{t.latestMinutes}</h3>
          {data.minutes.length === 0 && <p className="muted">{t.none}</p>}
          <ul className="list">
            {data.minutes.map((m) => (
              <li key={m.id}>
                <Link to={`/${comp}/minutes/${m.id}`}>{m.title || m.meeting_date || `#${m.id}`}</Link>
                <span className={`badge ${m.status}`}>{m.status === "approved" ? t.approved : t.draft}</span>
                <span className="muted small">{m.meeting_date || fmtDate(m.created_at, comp)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>{t.latestUpdates}</h3>
          {data.updates.length === 0 && <p className="muted">{t.none}</p>}
          <ul className="list">
            {data.updates.map((u) => (
              <li key={u.id}>
                <span>{ACTIONS[comp][u.action] ?? u.action}{u.summary ? `: ${u.summary}` : ""}</span>
                <span className="muted small">{fmtDate(u.created_at, comp, true)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
