import { startTransition, type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { ALEMDAIDEIA_DASHBOARD_MOCK } from "./data/mockDashboard";
import {
  getDashboardSnapshot,
  subscribeDashboardSnapshotStream,
} from "./services/dashboardSource";
import type {
  DashboardChatSla,
  DashboardEfficiencyRow,
  DashboardKpiCard,
  DashboardMixRow,
  DashboardOpportunity,
  DashboardSnapshot,
  DashboardSquadRow,
  ReferenceAccent,
} from "./types/dashboard";

type IconName =
  | "pulse"
  | "calendar"
  | "coins"
  | "shield"
  | "trend"
  | "crown"
  | "spark"
  | "target"
  | "mix"
  | "team"
  | "deal";

const referenceAccentStyles: Record<ReferenceAccent, { accent: string; soft: string; border: string }> = {
  emerald: {
    accent: "#27d69a",
    soft: "rgba(39, 214, 154, 0.14)",
    border: "rgba(39, 214, 154, 0.34)",
  },
  violet: {
    accent: "#9f7bff",
    soft: "rgba(159, 123, 255, 0.14)",
    border: "rgba(159, 123, 255, 0.32)",
  },
  amber: {
    accent: "#ffb648",
    soft: "rgba(255, 182, 72, 0.15)",
    border: "rgba(255, 182, 72, 0.32)",
  },
  blue: {
    accent: "#4d8dff",
    soft: "rgba(77, 141, 255, 0.14)",
    border: "rgba(77, 141, 255, 0.3)",
  },
  rose: {
    accent: "#ff6e86",
    soft: "rgba(255, 110, 134, 0.14)",
    border: "rgba(255, 110, 134, 0.3)",
  },
};

function App() {
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(ALEMDAIDEIA_DASHBOARD_MOCK);

  useEffect(() => {
    let isMounted = true;
    document.body.classList.remove("dashboard-theme-light");

    const loadDashboard = async () => {
      const snapshot = await getDashboardSnapshot();
      if (isMounted) {
        startTransition(() => {
          setDashboard(snapshot);
        });
      }
    };

    void loadDashboard();
    const unsubscribeStream = subscribeDashboardSnapshotStream({
      onSnapshot: (snapshot) => {
        if (isMounted) {
          startTransition(() => {
            setDashboard(snapshot);
          });
        }
      },
      onError: () => {
        void loadDashboard();
      },
    });
    const pollInterval = window.setInterval(() => {
      void loadDashboard();
    }, 45_000);

    return () => {
      isMounted = false;
      window.clearInterval(pollInterval);
      unsubscribeStream();
    };
  }, []);

  useEffect(() => {
    let frame = 0;

    const updatePointerGlow = (event: PointerEvent) => {
      if (frame) {
        cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        const xPercent = ((event.clientX / window.innerWidth) * 100).toFixed(2);
        const yPercent = ((event.clientY / window.innerHeight) * 100).toFixed(2);
        document.documentElement.style.setProperty("--pointer-x-percent", `${xPercent}%`);
        document.documentElement.style.setProperty("--pointer-y-percent", `${yPercent}%`);
      });
    };

    window.addEventListener("pointermove", updatePointerGlow, { passive: true });
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      window.removeEventListener("pointermove", updatePointerGlow);
    };
  }, []);

  const presentation = buildPresentationSnapshot(dashboard);
  const mixMaxValue = presentation.mix.rows.reduce((max, row) => Math.max(max, row.value), 0);
  const opportunitiesListMode = presentation.opportunities.rows.length > 4;

  return (
    <div className="dashboard-root dashboard-static dashboard-fullscreen text-slate-100">
      <main className="dashboard-shell dashboard-shell-fullscreen">
        <div className="reference-static-layout reference-static-layout-pro">
          <header className="reference-shell reference-header-shell dashboard-header-shell reference-header-shell-pro">
            <div className="reference-topbar">
              <div className="reference-brand">
                <div className="reference-badge">
                  <GlyphIcon name="spark" />
                  <span>Executive Live View</span>
                </div>
                <div className="reference-title-row">
                  <h1 className="reference-title">{presentation.header.brand}</h1>
                  <span className="reference-slash">/</span>
                  <span className="reference-context">{presentation.header.context}</span>
                </div>
                <p className="reference-subtitle">{presentation.header.subtitle}</p>
              </div>

              <div className="reference-head-actions">
                <div className="reference-live-metric reference-live-metric-pro">
                  <span className="reference-live-label">{presentation.header.liveMetricLabel}</span>
                  <strong>{presentation.header.liveMetricValue}</strong>
                </div>
                <div className="reference-status-pill reference-status-pill-pro">
                  <GlyphIcon name="shield" />
                  <span>{presentation.header.status}</span>
                </div>
              </div>
            </div>
          </header>

          <section className="reference-main-grid">
            <div className="reference-main-column">
              <div className="reference-kpi-strip reference-kpi-strip-pro">
                {presentation.kpis.map((card) => (
                  <ReferenceKpiCard key={card.label} {...card} />
                ))}
              </div>

              <ReferencePanel
                title={presentation.efficiency.title}
                iconName="target"
                accent="violet"
                trailing={presentation.efficiency.trailing}
                className="reference-panel-flex reference-panel-main-compact"
              >
                <div className="reference-lane-list reference-scroll-list">
                  {presentation.efficiency.rows.map((row) => (
                    <ReferenceEfficiencyRow key={row.label} {...row} />
                  ))}
                </div>
              </ReferencePanel>

              <ReferencePanel
                  title={presentation.squad.title}
                  iconName="team"
                  accent="emerald"
                  trailing={presentation.header.status}
                  className="reference-panel-flex reference-panel-main-fill"
              >
                <div className="reference-table-wrap reference-scroll-list">
                  <table className="reference-table reference-table-pro w-full min-w-[760px]">
                    <thead>
                      <tr>
                        {presentation.squad.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {presentation.squad.rows.map((item) => (
                        <ReferenceSquadRowView
                          key={item.name}
                          item={item}
                          targetSeconds={presentation.chatSla?.targetSeconds}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </ReferencePanel>

              {presentation.chatSla ? (
                <ReferencePanel
                  title={presentation.chatSla.title}
                  iconName="pulse"
                  accent={presentation.chatSla.accent}
                  trailing={presentation.chatSla.status}
                  className="reference-panel-flex reference-panel-main-sla"
                >
                  <ReferenceChatSlaCard {...presentation.chatSla} />
                </ReferencePanel>
              ) : null}
            </div>

            <div className="reference-side-column">
              <ReferencePanel
                title={presentation.mix.title}
                iconName="mix"
                accent="amber"
                className="reference-panel-flex reference-panel-side-compact reference-panel-side-mix"
              >
                <div className="reference-mix-list reference-scroll-list">
                  {presentation.mix.rows.map((row) => (
                    <ReferenceMixRow key={row.label} {...row} maxValue={mixMaxValue} />
                  ))}
                </div>
              </ReferencePanel>

              <ReferencePanel
                title={presentation.opportunities.title}
                iconName="crown"
                accent="amber"
                className={`reference-panel-flex reference-panel-side-hero ${
                  opportunitiesListMode ? "reference-panel-side-hero-list" : ""
                }`.trim()}
              >
                <div
                  className={`reference-opportunity-list reference-scroll-list ${
                    opportunitiesListMode ? "reference-opportunity-list-list" : ""
                  }`.trim()}
                >
                  {presentation.opportunities.rows.map((task) => (
                    <ReferenceOpportunityCard key={task.title} {...task} compact={opportunitiesListMode} />
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

function ReferenceKpiCard({ label, value, note, noteAccent, accent }: DashboardKpiCard) {
  const accentStyle = referenceAccentStyles[accent];
  const trend = inferTrendDirection(note);
  const iconName = resolveKpiIcon(label);
  const valueColor =
    trend === "up"
      ? referenceAccentStyles.emerald.accent
      : trend === "down"
        ? referenceAccentStyles.rose.accent
        : accentStyle.accent;

  return (
    <article
      className="reference-kpi-card reference-kpi-card-pro"
      style={
        {
          "--reference-accent": accentStyle.accent,
          "--reference-accent-soft": accentStyle.soft,
          "--reference-accent-border": accentStyle.border,
          "--reference-value-color": valueColor,
        } as CSSProperties
      }
    >
      <div className="reference-kpi-head">
        <span className="reference-kpi-label">{label}</span>
        <span className="reference-kpi-icon">
          <GlyphIcon name={iconName} />
        </span>
      </div>
      <strong className="reference-kpi-value">{value}</strong>
      {note ? (
        <span
          className={`reference-kpi-note reference-kpi-note-${trend}`}
          style={noteAccent ? { color: referenceAccentStyles[noteAccent].accent } : undefined}
        >
          {note}
        </span>
      ) : (
        <span className="reference-kpi-note reference-kpi-note-neutral">monitoramento em tempo real</span>
      )}
    </article>
  );
}

function ReferenceChatSlaCard({
  value,
  note,
  progress,
  accent,
  targetSeconds,
  compliancePct,
  outsideTargetCount,
  waitingCount,
}: DashboardChatSla) {
  const accentStyle = referenceAccentStyles[accent];

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        flexDirection: "column",
        gap: "0.8rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <div className="reference-kpi-label">TEMPO MEDIO DE 1a RESPOSTA</div>
          <strong className="reference-kpi-value" style={{ color: accentStyle.accent }}>
            {value}
          </strong>
        </div>
        <div
          style={{
            display: "inline-flex",
            height: "2.2rem",
            width: "2.2rem",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "999px",
            border: `1px solid ${accentStyle.border}`,
            background: accentStyle.soft,
            color: accentStyle.accent,
          }}
        >
          <GlyphIcon name="pulse" />
        </div>
      </div>

      <p
        style={{
          margin: 0,
          color: "rgba(228, 236, 240, 0.74)",
          fontSize: "0.9rem",
          lineHeight: 1.5,
        }}
      >
        {note}
      </p>

      <div
        style={{
          height: "0.4rem",
          width: "100%",
          overflow: "hidden",
          borderRadius: "999px",
          background: "rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.max(8, Math.min(progress, 100))}%`,
            borderRadius: "999px",
            background: accentStyle.accent,
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "0.6rem",
        }}
      >
        <SlaMetaItem label="Meta" value={targetSeconds ? formatSecondsLabel(targetSeconds) : "n/d"} />
        <SlaMetaItem
          label="Dentro SLA"
          value={typeof compliancePct === "number" ? `${String(compliancePct).replace(".", ",")}%` : "--"}
        />
        <SlaMetaItem
          label="Fora da Meta"
          value={typeof outsideTargetCount === "number" ? `${outsideTargetCount} conversas` : "--"}
        />
        <SlaMetaItem label="Fila" value={waitingCount ? `${waitingCount} aguardando` : "estabilizada"} />
      </div>
    </div>
  );
}

function SlaMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
        background: "rgba(255, 255, 255, 0.03)",
        padding: "0.68rem 0.78rem",
      }}
    >
      <div className="reference-kpi-label">{label}</div>
      <div
        style={{
          marginTop: "0.35rem",
          color: "#f4f7f8",
          fontSize: "0.88rem",
          fontWeight: 700,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ReferencePanel({
  title,
  iconName,
  accent,
  trailing,
  className,
  children,
}: {
  title: string;
  iconName: IconName;
  accent?: ReferenceAccent;
  trailing?: string;
  className?: string;
  children: ReactNode;
}) {
  const accentStyle = accent ? referenceAccentStyles[accent] : null;
  const panelStyle = accentStyle
    ? ({
        "--reference-accent": accentStyle.accent,
        "--reference-accent-soft": accentStyle.soft,
        "--reference-accent-border": accentStyle.border,
      } as CSSProperties)
    : undefined;

  return (
    <section className={`reference-panel reference-panel-pro ${className ?? ""}`.trim()} style={panelStyle}>
      <div className="reference-panel-head">
        <div className="reference-panel-title">
          <span className="reference-panel-icon">
            <GlyphIcon name={iconName} />
          </span>
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
      className="reference-lane-row reference-lane-row-pro"
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

function ReferenceSquadRowView({
  item,
  targetSeconds,
}: {
  item: DashboardSquadRow;
  targetSeconds?: number;
}) {
  const avatarStyle = item.avatarAccent ? referenceAccentStyles[item.avatarAccent] : referenceAccentStyles.blue;
  const slaAccent = item.slaAccent || accentForSlaSeconds(item.slaSeconds, targetSeconds);
  const volumeAccent = item.volumeAccent || accentForVolume(item.volumeValue);
  const slaStyle = referenceAccentStyles[slaAccent];
  const volumeStyle = referenceAccentStyles[volumeAccent];
  const chatCount = item.chatCount ?? 0;
  const slaLabel =
    item.slaSeconds !== undefined && (item.sla === "--" || !String(item.sla || "").trim())
      ? formatSecondsLabel(item.slaSeconds)
      : item.sla;

  return (
    <tr className="reference-squad-row">
      <td>
        <div className="reference-person-chip">
          <div
            className="reference-avatar"
            style={{
              backgroundColor: avatarStyle.soft,
              color: avatarStyle.accent,
              borderColor: avatarStyle.border,
            }}
          >
            {item.initials}
          </div>
          <div className="reference-person-copy">
            <div className="reference-person-name">{item.name}</div>
          </div>
        </div>
      </td>
      <td className="reference-cell-strong reference-data-number">{item.atendimentos}</td>
      <td className="reference-cell-strong reference-data-number">{chatCount}</td>
      <td className="reference-data-number" style={{ color: slaStyle.accent, fontWeight: 700 }}>
        {slaLabel}
      </td>
      <td className="reference-data-number" style={{ color: volumeStyle.accent, fontWeight: 700 }}>
        {item.volume}
      </td>
    </tr>
  );
}

function ReferenceMixRow({ label, value, suffix, accent, maxValue }: DashboardMixRow & { maxValue: number }) {
  const accentStyle = referenceAccentStyles[accent];
  const ratio = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <div
      className="reference-mix-row reference-mix-row-pro"
      style={
        {
          "--reference-accent": accentStyle.accent,
          "--reference-accent-soft": accentStyle.soft,
          "--reference-progress": `${Math.max(10, Math.min(100, ratio))}%`,
        } as CSSProperties
      }
    >
      <div className="reference-mix-head">
        <span className="reference-mix-label">{label}</span>
        <span className="reference-mix-value">
          {value} <small>{suffix}</small>
        </span>
      </div>
      <div className="reference-mix-track">
        <div className="reference-mix-fill" />
      </div>
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
  compact = false,
}: DashboardOpportunity & { compact?: boolean }) {
  const accentStyle = referenceAccentStyles[accent];
  const probability = extractProbability(note);

  return (
    <article
      className={`reference-opportunity-card reference-opportunity-card-pro ${
        compact ? "reference-opportunity-card-list" : ""
      }`.trim()}
      style={
        {
          "--reference-accent": accentStyle.accent,
          "--reference-accent-soft": accentStyle.soft,
          "--reference-accent-border": accentStyle.border,
          "--reference-progress": `${Math.max(12, Math.min(100, probability))}%`,
        } as CSSProperties
      }
    >
      <div className="reference-opportunity-head">
        <div>
          <h3>{title}</h3>
          <p>{owner}</p>
        </div>
        <span className="reference-opportunity-tag">
          <GlyphIcon name="deal" />
          <span>{status}</span>
        </span>
      </div>

      <div className="reference-opportunity-metric">
        <span>Faturamento</span>
        <strong>{value}</strong>
      </div>

      <div className="reference-opportunity-probability">
        <div className="reference-opportunity-track">
          <div className="reference-opportunity-fill" />
        </div>
        <span>{probability}%</span>
      </div>

      <div className="reference-opportunity-foot">
        <span>{note}</span>
      </div>
    </article>
  );
}

function GlyphIcon({
  name,
  size = 18,
}: {
  name: IconName;
  size?: number;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  switch (name) {
    case "pulse":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="M4 12h4l2.1-4 3.8 8 2.1-4H20" />
        </svg>
      );
    case "calendar":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M8 3.5v4M16 3.5v4M3.5 9.5h17" />
        </svg>
      );
    case "coins":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="M6 7.5c0 1.7 2.7 3 6 3s6-1.3 6-3-2.7-3-6-3-6 1.3-6 3Z" />
          <path d="M6 7.5v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4" />
          <path d="M6 11.5v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="M12 3l7 3v5c0 5-2.9 8.5-7 10-4.1-1.5-7-5-7-10V6l7-3Z" />
          <path d="m9.5 12 1.8 1.8 3.7-4" />
        </svg>
      );
    case "trend":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="M4 16 10 10l4 4 6-7" />
          <path d="M16 7h4v4" />
        </svg>
      );
    case "crown":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="m4 7 4.5 5 3.5-6 3.5 6L20 7l-2 10H6L4 7Z" />
          <path d="M7 20h10" />
        </svg>
      );
    case "spark":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
        </svg>
      );
    case "target":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M22 12h-3M12 22v-3M2 12h3" />
        </svg>
      );
    case "mix":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="M5 18V9M12 18V5M19 18v-7" />
          <path d="M3 20h18" />
        </svg>
      );
    case "team":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M16.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M3.5 18.5c1.1-2.6 3-4 5.5-4s4.4 1.4 5.5 4" />
          <path d="M14 18.5c.8-1.7 2.1-2.7 4-3" />
        </svg>
      );
    case "deal":
      return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...common}>
          <path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z" />
          <path d="M12 4v16M4 7.5l8 3.5 8-3.5" />
        </svg>
      );
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s%+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function initialsFromName(value: string): string {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "NA";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function accentFromName(value: string): ReferenceAccent {
  const normalized = normalizeText(value);
  const accents: ReferenceAccent[] = ["emerald", "amber", "blue", "violet", "rose"];
  let hash = 0;

  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return accents[hash % accents.length];
}

function parseDurationToSeconds(label: string | undefined): number | undefined {
  const raw = String(label || "").trim();
  if (!raw) return undefined;

  const dayMatch = raw.match(/(\d+)\s*d/i);
  const hourMatch = raw.match(/(\d+)\s*h/i);
  const minuteMatch = raw.match(/(\d+)\s*m/i);
  const secondMatch = raw.match(/(\d+)\s*s/i);

  const total =
    Number(dayMatch?.[1] || 0) * 86_400 +
    Number(hourMatch?.[1] || 0) * 3_600 +
    Number(minuteMatch?.[1] || 0) * 60 +
    Number(secondMatch?.[1] || 0);

  return total > 0 ? total : undefined;
}

function parseCompactCurrency(label: string | undefined): number {
  const raw = String(label || "")
    .trim()
    .replace(/[R$\s]/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .toLowerCase();

  if (!raw) return 0;
  const unit = raw.slice(-1);
  const numeric = Number(raw.replace(/[^\d.-]/g, "").replace(/[kmb]$/, ""));
  if (!Number.isFinite(numeric)) return 0;

  if (unit === "b") return numeric * 1_000_000_000;
  if (unit === "m") return numeric * 1_000_000;
  if (unit === "k") return numeric * 1_000;
  return numeric;
}

function parseCount(value: string | undefined): number {
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSecondsLabel(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function inferTrendDirection(note?: string): "up" | "down" | "neutral" {
  const normalized = normalizeText(note);
  if (!normalized) return "neutral";
  if (note?.includes("▲") || normalized.includes("crescimento") || normalized.includes("subiu")) return "up";
  if (note?.includes("▼") || normalized.includes("queda") || normalized.includes("caiu")) return "down";
  return "neutral";
}

function accentForSlaSeconds(value: number | undefined, targetSeconds = 300): ReferenceAccent {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "blue";
  if (value <= targetSeconds) return "emerald";
  if (value <= targetSeconds * 1.35) return "amber";
  if (value <= targetSeconds * 2) return "blue";
  return "rose";
}

function accentForVolume(value: number | undefined): ReferenceAccent {
  if (!value || value <= 0) return "rose";
  if (value >= 800_000) return "emerald";
  if (value >= 250_000) return "amber";
  if (value >= 100_000) return "blue";
  return "violet";
}

function resolveKpiIcon(label: string): IconName {
  const normalized = normalizeText(label);
  if (normalized.includes("agendamento")) return "calendar";
  if (normalized.includes("pipeline")) return "coins";
  if (normalized.includes("referral") || normalized.includes("indicacao")) return "crown";
  if (normalized.includes("ticket")) return "coins";
  return "trend";
}

function extractProbability(note: string): number {
  const match = String(note || "").match(/(\d{1,3})\s*%/);
  return match ? Number(match[1]) : 40;
}

function buildPresentationSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot {
  return {
    ...snapshot,
    squad: {
      ...snapshot.squad,
      rows: snapshot.squad.rows.map((row) => {
        const initials = row.initials?.toUpperCase() || initialsFromName(row.name);
        const avatarAccent = row.avatarAccent || accentFromName(row.name);
        const slaSeconds = row.slaSeconds ?? parseDurationToSeconds(row.sla);
        const volumeValue = row.volumeValue ?? parseCompactCurrency(row.volume);
        const atendimentosValue = row.atendimentosValue ?? parseCount(row.atendimentos);

        return {
          ...row,
          initials,
          avatarAccent,
          role: row.role,
          atendimentosValue,
          sla:
            row.sla === "--" && slaSeconds !== undefined
              ? formatSecondsLabel(slaSeconds)
              : row.sla,
          slaSeconds,
          slaAccent: row.slaAccent,
          volumeValue,
          volumeAccent: row.volumeAccent,
        };
      }),
    },
  };
}

export default App;
