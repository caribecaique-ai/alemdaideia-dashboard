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

export interface DashboardChatSla {
  title: string;
  value: string;
  note: string;
  status: string;
  progress: number;
  accent: ReferenceAccent;
  targetSeconds?: number;
  averageSeconds?: number;
  compliancePct?: number;
  sampleSize?: number;
  withinTargetCount?: number;
  outsideTargetCount?: number;
  waitingCount?: number;
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
  chatCount?: number;
  volume: string;
  volumeValue?: number;
  volumeAccent?: ReferenceAccent;
  atendimentos: string;
  atendimentosValue?: number;
  sla: string;
  slaSeconds?: number;
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
  chatSla?: DashboardChatSla;
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
