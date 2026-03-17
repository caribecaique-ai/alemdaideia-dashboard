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
  accent: referenceAccentSchema,
});

const dashboardEfficiencyRowSchema = z.object({
  label: z.string().min(1),
  note: z.string().min(1),
  progress: z.number().min(0).max(100),
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
  volume: z.string().min(1),
  atendimentos: z.string().min(1),
  sla: z.string().min(1),
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
