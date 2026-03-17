import type { DashboardSnapshot } from "../types/dashboard";

export const ALEMDAIDEIA_DASHBOARD_MOCK: DashboardSnapshot = {
  header: {
    brand: "ALÉM DA IDEIA",
    context: "COMMERCIAL INTELLIGENCE",
    subtitle: "ANÁLISE DE MIX, ORIGEM E PERFORMANCE HIGH-TICKET",
    liveMetricLabel: "LTV ESTIMADO",
    liveMetricValue: "R$ 14.2M",
    status: "BRADTAIL CHAT: ATIVO",
  },
  kpis: [
    {
      label: "LEADS MÊS / SEMANA",
      value: "161",
      note: "▲ 70",
      noteAccent: "emerald",
      accent: "emerald",
    },
    {
      label: "AGENDAMENTOS (CLICKUP)",
      value: "74",
      note: "46.2% CONV.",
      accent: "emerald",
    },
    {
      label: "PIPELINE EM NEGOCIAÇÃO",
      value: "R$ 2.33M",
      accent: "amber",
    },
    {
      label: "REFERRAL POWER (%)",
      value: "68%",
      note: "🏆 INDICAÇÃO",
      noteAccent: "emerald",
      accent: "emerald",
    },
  ],
  efficiency: {
    title: "⚡ BRADIAL CHAT • SLA TARGET",
    trailing: "STATUS: ATIVO",
    rows: [
      {
        label: "LinkedIn (Zé Vicente)",
        note: "42 Leads • 12% Conv.",
        progress: 76,
        accent: "violet",
      },
      {
        label: "LinkedIn (Reginaldo)",
        note: "38 Leads • 9.5% Conv.",
        progress: 60,
        accent: "blue",
      },
      {
        label: "LinkedIn (Regina)",
        note: "24 Leads • 7.2% Conv.",
        progress: 41,
        accent: "rose",
      },
      {
        label: "Indicação Direta",
        note: "57 Leads • 68% Conv.",
        progress: 94,
        accent: "amber",
      },
    ],
  },
  squad: {
    title: "🏅 RANKING PERFORMANCE • ELITE SQUAD",
    columns: ["VENDEDOR", "ATENDIMENTOS", "SLA MÉDIO", "CONV. %"],
    rows: [
      {
        name: "Kauê Bordignon",
        role: "CLOSER / STRATEGIC",
        initials: "KB",
        avatarAccent: "emerald",
        atendimentos: "342",
        sla: "01m 12s",
        slaAccent: "emerald",
        volume: "14.5%",
        volumeAccent: "emerald",
      },
      {
        name: "Thomas Silva",
        role: "SDR / HUNTER",
        initials: "TS",
        avatarAccent: "amber",
        atendimentos: "289",
        sla: "02m 45s",
        slaAccent: "amber",
        volume: "11.1%",
        volumeAccent: "amber",
      },
      {
        name: "Jota Carnaíba",
        role: "SDR / HUNTER",
        initials: "JC",
        avatarAccent: "blue",
        atendimentos: "156",
        sla: "04m 10s",
        slaAccent: "rose",
        volume: "4.2%",
        volumeAccent: "rose",
      },
    ],
  },
  mix: {
    title: "📊 Mix de Vendas (Produto)",
    rows: [
      { label: "CONSELHEIRO", value: 4, suffix: "VDS", accent: "amber" },
      { label: "PRESIDENTE", value: 2, suffix: "VDS", accent: "rose" },
      { label: "EMBAIXADOR", value: 1, suffix: "VD", accent: "violet" },
    ],
  },
  opportunities: {
    title: "👑 TOP OPPORTUNITIES",
    rows: [
      {
        title: "Grupo Votorantim",
        owner: "Carlos Ermírio",
        value: "R$ 89B",
        status: "👑 PRESIDENTE",
        note: "ETAPA: NEGOCIAÇÃO / 72% Prob.",
        accent: "amber",
      },
      {
        title: "BTG Pactual",
        owner: "André Esteves",
        value: "R$ 42B",
        status: "🛡️ CONSELHEIRO",
        note: "ETAPA: FOLLOW-UP / 58% Prob.",
        accent: "blue",
      },
    ],
  },
};
