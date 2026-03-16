import { type CSSProperties, type ReactNode, useEffect } from "react";
import { getDashboardSnapshot } from "./services/dashboardSource";
import type {
  DashboardEfficiencyRow,
  DashboardKpiCard,
  DashboardMixRow,
  DashboardOpportunity,
  ReferenceAccent,
} from "./types/dashboard";

const referenceAccentStyles: Record<ReferenceAccent, { accent: string; soft: string }> = {
  emerald: { accent: "#26d07c", soft: "rgba(38, 208, 124, 0.18)" },
  violet: { accent: "#a65cff", soft: "rgba(166, 92, 255, 0.18)" },
  amber: { accent: "#ffb233", soft: "rgba(255, 178, 51, 0.18)" },
  blue: { accent: "#4b7dff", soft: "rgba(75, 125, 255, 0.18)" },
  rose: { accent: "#ff5e8a", soft: "rgba(255, 94, 138, 0.18)" },
};

function App() {
  const dashboard = getDashboardSnapshot();

  useEffect(() => {
    document.body.classList.remove("dashboard-theme-light");
  }, []);

  return (
    <div className="dashboard-root dashboard-static min-h-screen text-slate-100">
      <main className="dashboard-shell mx-auto max-w-[1620px] p-4 pb-8 md:p-6 xl:p-8">
        <div className="reference-static-layout">
          <header className="reference-shell reference-header-shell dashboard-header-shell">
            <div className="reference-topbar">
              <div className="reference-brand">
                <div className="reference-title-row">
                  <h1 className="reference-title">{dashboard.header.brand}</h1>
                  <span className="reference-slash">/</span>
                  <span className="reference-context">{dashboard.header.context}</span>
                </div>
                <p className="reference-eyebrow">{dashboard.header.subtitle}</p>
              </div>

              <div className="reference-head-actions">
                <div className="reference-live-metric">
                  <span className="reference-live-label">{dashboard.header.liveMetricLabel}</span>
                  <strong>{dashboard.header.liveMetricValue}</strong>
                </div>
                <div className="reference-status-pill">{dashboard.header.status}</div>
              </div>
            </div>
          </header>

          <section className="reference-main-grid mt-4">
            <div className="reference-main-column space-y-4">
              <div className="reference-kpi-strip">
                {dashboard.kpis.map((card) => (
                  <ReferenceKpiCard
                    key={card.label}
                    label={card.label}
                    value={card.value}
                    note={card.note}
                    accent={card.accent}
                  />
                ))}
              </div>

              <ReferencePanel
                title={dashboard.efficiency.title}
                trailing={dashboard.efficiency.trailing}
              >
                <div className="reference-lane-list">
                  {dashboard.efficiency.rows.map((row) => (
                    <ReferenceEfficiencyRow
                      key={row.label}
                      label={row.label}
                      note={row.note}
                      progress={row.progress}
                      accent={row.accent}
                    />
                  ))}
                </div>
              </ReferencePanel>

              <ReferencePanel title={dashboard.squad.title}>
                <div className="overflow-x-auto">
                  <table className="reference-table w-full min-w-[560px]">
                    <thead>
                      <tr>
                        {dashboard.squad.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.squad.rows.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td>{item.atendimentos}</td>
                          <td>{item.sla}</td>
                          <td>{item.volume}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ReferencePanel>
            </div>

            <div className="reference-side-column space-y-4">
              <ReferencePanel title={dashboard.mix.title}>
                <div className="reference-mix-list">
                  {dashboard.mix.rows.map((row) => (
                    <ReferenceMixRow
                      key={row.label}
                      label={row.label}
                      value={row.value}
                      suffix={row.suffix}
                      accent={row.accent}
                    />
                  ))}
                </div>
              </ReferencePanel>

              <ReferencePanel title={dashboard.opportunities.title}>
                <div className="reference-opportunity-list">
                  {dashboard.opportunities.rows.map((task) => (
                    <ReferenceOpportunityCard
                      key={task.title}
                      title={task.title}
                      owner={task.owner}
                      status={task.status}
                      value={task.value}
                      accent={task.accent}
                      note={task.note}
                    />
                  ))}
                </div>
              </ReferencePanel>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ReferenceKpiCard({ label, value, note, accent }: DashboardKpiCard) {
  const accentStyle = referenceAccentStyles[accent];

  return (
    <article
      className="reference-kpi-card"
      style={
        {
          "--reference-accent": accentStyle.accent,
          "--reference-accent-soft": accentStyle.soft,
        } as CSSProperties
      }
    >
      <span className="reference-kpi-label">{label}</span>
      <strong className="reference-kpi-value">{value}</strong>
      {note ? <span className="reference-kpi-note">{note}</span> : null}
    </article>
  );
}

function ReferencePanel({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: string;
  children: ReactNode;
}) {
  return (
    <section className="reference-panel">
      <div className="reference-panel-head">
        <div>
          <h2>{title}</h2>
        </div>
        {trailing ? <span className="reference-panel-trailing">{trailing}</span> : null}
      </div>
      {children}
    </section>
  );
}

function ReferenceEfficiencyRow({ label, note, progress, accent }: DashboardEfficiencyRow) {
  const accentStyle = referenceAccentStyles[accent];

  return (
    <div
      className="reference-lane-row"
      style={
        {
          "--reference-accent": accentStyle.accent,
          "--reference-accent-soft": accentStyle.soft,
          "--reference-progress": `${Math.max(8, Math.min(100, progress)).toFixed(1)}%`,
        } as CSSProperties
      }
    >
      <div className="reference-lane-head">
        <span className="reference-lane-label">{label}</span>
        <span className="reference-lane-meta">{note}</span>
      </div>
      <div className="reference-lane-track">
        <div className="reference-lane-fill" />
      </div>
    </div>
  );
}

function ReferenceMixRow({ label, value, suffix, accent }: DashboardMixRow) {
  const accentStyle = referenceAccentStyles[accent];

  return (
    <div
      className="reference-mix-row"
      style={
        {
          "--reference-accent": accentStyle.accent,
          "--reference-accent-soft": accentStyle.soft,
        } as CSSProperties
      }
    >
      <span className="reference-mix-label">{label}</span>
      <span className="reference-mix-value">
        {value} <small>{suffix}</small>
      </span>
    </div>
  );
}

function ReferenceOpportunityCard({
  title,
  owner,
  status,
  value,
  note,
  accent,
}: DashboardOpportunity) {
  const accentStyle = referenceAccentStyles[accent];

  return (
    <article
      className="reference-opportunity-card"
      style={
        {
          "--reference-accent": accentStyle.accent,
          "--reference-accent-soft": accentStyle.soft,
        } as CSSProperties
      }
    >
      <div className="reference-opportunity-head">
        <div>
          <h3>{title}</h3>
          <p>{owner}</p>
        </div>
      </div>
      <div className="reference-opportunity-metric">
        <span>Faturamento:</span>
        <strong>{value}</strong>
      </div>
      <div className="reference-opportunity-foot">
        <span className="reference-opportunity-tag">{status}</span>
        <span>{note}</span>
      </div>
    </article>
  );
}

export default App;
