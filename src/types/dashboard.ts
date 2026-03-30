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
  partialData?: boolean;
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

export interface DashboardAtendimentoAgentRow {
  name: string;
  messages: string;
  messagesValue?: number;
  activeConversations: string;
  activeConversationsValue?: number;
  newConversations: string;
  newConversationsValue?: number;
  accent: ReferenceAccent;
}

export interface DashboardOperacaoOwnerRow {
  name: string;
  active: string;
  activeValue?: number;
  stalled: string;
  stalledValue?: number;
  closed: string;
  closedValue?: number;
  accent: ReferenceAccent;
}

export interface DashboardFinanceiroOwnerRow {
  name: string;
  pipeline: string;
  pipelineValue?: number;
  forecast: string;
  forecastValue?: number;
  won: string;
  wonValue?: number;
  accent: ReferenceAccent;
}

export interface DashboardSnapshot {
  header: DashboardHeader;
  kpis: DashboardKpiCard[];
  chatSla?: DashboardChatSla;
  atendimento?: {
    title: string;
    status: string;
    note: string;
    metrics: DashboardKpiCard[];
    backlog: {
      title: string;
      trailing: string;
      rows: DashboardEfficiencyRow[];
    };
    agents: {
      title: string;
      columns: string[];
      rows: DashboardAtendimentoAgentRow[];
    };
  };
  operacao?: {
    title: string;
    status: string;
    note: string;
    metrics: DashboardKpiCard[];
    stages: {
      title: string;
      trailing: string;
      rows: DashboardEfficiencyRow[];
    };
    owners: {
      title: string;
      columns: string[];
      rows: DashboardOperacaoOwnerRow[];
    };
  };
  financeiro?: {
    title: string;
    status: string;
    note: string;
    metrics: DashboardKpiCard[];
    breakdown: {
      title: string;
      trailing: string;
      rows: DashboardEfficiencyRow[];
    };
    owners: {
      title: string;
      columns: string[];
      rows: DashboardFinanceiroOwnerRow[];
    };
  };
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
