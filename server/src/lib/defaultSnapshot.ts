import type { DashboardSnapshot } from "../schemas/dashboard.js";

export const DEFAULT_DASHBOARD_SNAPSHOT: DashboardSnapshot = {
  header: {
    brand: "ALEM DA IDEIA",
    context: "COMMERCIAL INTELLIGENCE",
    subtitle: "ANALISE DE MIX, ORIGEM E PERFORMANCE HIGH-TICKET",
    liveMetricLabel: "LTV ESTIMADO",
    liveMetricValue: "R$ 14.2M",
    status: "BRADTAIL CHAT: ATIVO",
  },
  kpis: [
    {
      label: "TICKET MEDIO (GERAL)",
      value: "R$ 140.000",
      accent: "emerald",
    },
    {
      label: "BEST-SELLER (VOLUME)",
      value: "Conselheiro",
      accent: "violet",
    },
    {
      label: "PIPELINE ATIVO",
      value: "R$ 2.33M",
      accent: "amber",
    },
  ],
  efficiency: {
    title: "Eficiencia por Origem (SDR)",
    trailing: "TOTAL LEADS: 161",
    rows: [
      {
        label: "LinkedIn (Ze Vicente)",
        note: "42 Leads - 12% Conv.",
        progress: 76,
        accent: "violet",
      },
      {
        label: "LinkedIn (Reginaldo)",
        note: "38 Leads - 9.5% Conv.",
        progress: 60,
        accent: "blue",
      },
      {
        label: "LinkedIn (Regina)",
        note: "24 Leads - 7.2% Conv.",
        progress: 41,
        accent: "rose",
      },
      {
        label: "Indicacao Direta",
        note: "57 Leads - 68% Conv.",
        progress: 94,
        accent: "amber",
      },
    ],
  },
  squad: {
    title: "Elite Squad Performance",
    columns: ["Consultor", "Atendimentos", "SLA BRADTAIL", "VOLUME VENDAS"],
    rows: [
      { name: "Kaue Bordignon", atendimentos: "342", sla: "01m 12s", volume: "R$ 280k" },
      { name: "Thomas Silva", atendimentos: "289", sla: "02m 45s", volume: "R$ 220k" },
      { name: "Jota Carnaiba", atendimentos: "156", sla: "04m 10s", volume: "R$ 0" },
    ],
  },
  mix: {
    title: "Mix de Vendas (Produto)",
    rows: [
      { label: "CONSELHEIRO", value: 4, suffix: "VDS", accent: "amber" },
      { label: "PRESIDENTE", value: 2, suffix: "VDS", accent: "rose" },
      { label: "EMBAIXADOR", value: 1, suffix: "VD", accent: "violet" },
    ],
  },
  opportunities: {
    title: "Top Opportunities",
    rows: [
      {
        title: "Grupo Votorantim",
        owner: "DECISOR: CARLOS ERMIRIO",
        value: "R$ 89B",
        status: "PRESIDENTE",
        note: "72% Prob.",
        accent: "amber",
      },
      {
        title: "BTG Pactual",
        owner: "DECISOR: ANDRE ESTEVES",
        value: "R$ 42B",
        status: "CONSELHEIRO",
        note: "58% Prob.",
        accent: "blue",
      },
    ],
  },
};
