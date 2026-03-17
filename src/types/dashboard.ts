export type ReferenceAccent = "emerald" | "violet" | "amber" | "blue" | "rose";

export interface DashboardHeader {
  brand: string;
  context: string;
  subtitle: string;
  liveMetricLabel: string;
  liveMetricValue: string;
  status: string;
}

export interface DashboardKpiCard {
  label: string;
  value: string;
  note?: string;
  noteAccent?: ReferenceAccent;
  accent: ReferenceAccent;
}

export interface DashboardEfficiencyRow {
  label: string;
  note: string;
  progress: number;
  accent: ReferenceAccent;
}

export interface DashboardMixRow {
  label: string;
  value: number;
  suffix: string;
  accent: ReferenceAccent;
}

export interface DashboardSquadRow {
  name: string;
  role?: string;
  initials?: string;
  avatarAccent?: ReferenceAccent;
  volume: string;
  volumeAccent?: ReferenceAccent;
  atendimentos: string;
  sla: string;
  slaAccent?: ReferenceAccent;
}

export interface DashboardOpportunity {
  title: string;
  owner: string;
  value: string;
  status: string;
  note: string;
  accent: ReferenceAccent;
}

export interface DashboardSnapshot {
  header: DashboardHeader;
  kpis: DashboardKpiCard[];
  efficiency: {
    title: string;
    trailing: string;
    rows: DashboardEfficiencyRow[];
  };
  squad: {
    title: string;
    columns: string[];
    rows: DashboardSquadRow[];
  };
  mix: {
    title: string;
    rows: DashboardMixRow[];
  };
  opportunities: {
    title: string;
    rows: DashboardOpportunity[];
  };
}
