import { z } from "zod";
import { DASHBOARD_SLUG } from "../config/dashboardScope.js";

export const referenceAccentSchema = z.enum(["emerald", "violet", "amber", "blue", "rose"]);

const dashboardHeaderSchema = z.object({
  brand: z.string().min(1),
  context: z.string().min(1),
  subtitle: z.string().min(1),
  liveMetricLabel: z.string().min(1),
  liveMetricValue: z.string().min(1),
  status: z.string().min(1),
});

const dashboardKpiCardSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  note: z.string().optional(),
  noteAccent: referenceAccentSchema.optional(),
  accent: referenceAccentSchema,
});

const dashboardChatSlaSchema = z.object({
  title: z.string().min(1),
  value: z.string().min(1),
  note: z.string().min(1),
  status: z.string().min(1),
  progress: z.number().min(0).max(100),
  accent: referenceAccentSchema,
  targetSeconds: z.number().positive().optional(),
  averageSeconds: z.number().nonnegative().optional(),
  compliancePct: z.number().min(0).max(100).optional(),
  sampleSize: z.number().int().nonnegative().optional(),
  partialData: z.boolean().optional(),
  withinTargetCount: z.number().int().nonnegative().optional(),
  outsideTargetCount: z.number().int().nonnegative().optional(),
  waitingCount: z.number().int().nonnegative().optional(),
});

const dashboardEfficiencyRowSchema = z.object({
  label: z.string().min(1),
  note: z.string().min(1),
  progress: z.number().min(0).max(100),
  accent: referenceAccentSchema,
});

const dashboardAtendimentoAgentRowSchema = z.object({
  name: z.string().min(1),
  messages: z.string().min(1),
  messagesValue: z.number().int().nonnegative().optional(),
  activeConversations: z.string().min(1),
  activeConversationsValue: z.number().int().nonnegative().optional(),
  newConversations: z.string().min(1),
  newConversationsValue: z.number().int().nonnegative().optional(),
  accent: referenceAccentSchema,
});

const dashboardOperacaoOwnerRowSchema = z.object({
  name: z.string().min(1),
  active: z.string().min(1),
  activeValue: z.number().int().nonnegative().optional(),
  stalled: z.string().min(1),
  stalledValue: z.number().int().nonnegative().optional(),
  closed: z.string().min(1),
  closedValue: z.number().int().nonnegative().optional(),
  accent: referenceAccentSchema,
});

const dashboardFinanceiroOwnerRowSchema = z.object({
  name: z.string().min(1),
  pipeline: z.string().min(1),
  pipelineValue: z.number().nonnegative().optional(),
  forecast: z.string().min(1),
  forecastValue: z.number().nonnegative().optional(),
  won: z.string().min(1),
  wonValue: z.number().nonnegative().optional(),
  accent: referenceAccentSchema,
});

const dashboardMixRowSchema = z.object({
  label: z.string().min(1),
  value: z.number().nonnegative(),
  suffix: z.string().min(1),
  accent: referenceAccentSchema,
});

const dashboardSquadRowSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).optional(),
  initials: z.string().min(1).optional(),
  avatarAccent: referenceAccentSchema.optional(),
  chatCount: z.number().int().nonnegative().optional(),
  volume: z.string().min(1),
  volumeValue: z.number().nonnegative().optional(),
  volumeAccent: referenceAccentSchema.optional(),
  atendimentos: z.string().min(1),
  atendimentosValue: z.number().int().nonnegative().optional(),
  sla: z.string().min(1),
  slaSeconds: z.number().nonnegative().optional(),
  slaAccent: referenceAccentSchema.optional(),
});

const dashboardOpportunitySchema = z.object({
  title: z.string().min(1),
  owner: z.string().min(1),
  value: z.string().min(1),
  status: z.string().min(1),
  note: z.string().min(1),
  accent: referenceAccentSchema,
});

export const dashboardSnapshotSchema = z.object({
  header: dashboardHeaderSchema,
  kpis: z.array(dashboardKpiCardSchema),
  chatSla: dashboardChatSlaSchema.optional(),
  atendimento: z
    .object({
      title: z.string().min(1),
      status: z.string().min(1),
      note: z.string().min(1),
      metrics: z.array(dashboardKpiCardSchema),
      backlog: z.object({
        title: z.string().min(1),
        trailing: z.string().min(1),
        rows: z.array(dashboardEfficiencyRowSchema),
      }),
      agents: z.object({
        title: z.string().min(1),
        columns: z.array(z.string().min(1)),
        rows: z.array(dashboardAtendimentoAgentRowSchema),
      }),
    })
    .optional(),
  operacao: z
    .object({
      title: z.string().min(1),
      status: z.string().min(1),
      note: z.string().min(1),
      metrics: z.array(dashboardKpiCardSchema),
      stages: z.object({
        title: z.string().min(1),
        trailing: z.string().min(1),
        rows: z.array(dashboardEfficiencyRowSchema),
      }),
      owners: z.object({
        title: z.string().min(1),
        columns: z.array(z.string().min(1)),
        rows: z.array(dashboardOperacaoOwnerRowSchema),
      }),
    })
    .optional(),
  financeiro: z
    .object({
      title: z.string().min(1),
      status: z.string().min(1),
      note: z.string().min(1),
      metrics: z.array(dashboardKpiCardSchema),
      breakdown: z.object({
        title: z.string().min(1),
        trailing: z.string().min(1),
        rows: z.array(dashboardEfficiencyRowSchema),
      }),
      owners: z.object({
        title: z.string().min(1),
        columns: z.array(z.string().min(1)),
        rows: z.array(dashboardFinanceiroOwnerRowSchema),
      }),
    })
    .optional(),
  efficiency: z.object({
    title: z.string().min(1),
    trailing: z.string().min(1),
    rows: z.array(dashboardEfficiencyRowSchema),
  }),
  squad: z.object({
    title: z.string().min(1),
    columns: z.array(z.string().min(1)),
    rows: z.array(dashboardSquadRowSchema),
  }),
  mix: z.object({
    title: z.string().min(1),
    rows: z.array(dashboardMixRowSchema),
  }),
  opportunities: z.object({
    title: z.string().min(1),
    rows: z.array(dashboardOpportunitySchema),
  }),
});

export const snapshotEnvelopeSchema = z.object({
  slug: z.string().trim().min(1).default(DASHBOARD_SLUG),
  source: z.string().trim().min(1).default("manual"),
  snapshot: dashboardSnapshotSchema,
});

export const snapshotQuerySchema = z.object({
  slug: z.string().trim().min(1).optional().default(DASHBOARD_SLUG),
});

export const snapshotHistoryQuerySchema = z.object({
  slug: z.string().trim().min(1).optional().default(DASHBOARD_SLUG),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>;
export type SnapshotEnvelope = z.infer<typeof snapshotEnvelopeSchema>;
