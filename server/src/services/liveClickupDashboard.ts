import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_SLUG,
  DEFAULT_CLICKUP_TEAM_ID,
  DEFAULT_FOLDER_NAME,
  DEFAULT_SPACE_NAME,
  DEFAULT_WORKSPACE_NAME,
} from "../config/dashboardScope.js";
import { DEFAULT_DASHBOARD_SNAPSHOT } from "../lib/defaultSnapshot.js";
import type { DashboardSnapshot } from "../schemas/dashboard.js";
import {
  fetchBradialChatMetrics,
  loadBradialChatConfig,
  matchBradialAgentMetric,
  type BradialChatMetricsResult,
} from "./bradialChatMetrics.js";
import { getSnapshot, saveSnapshot } from "../storage/dashboardRepository.js";

type Accent = DashboardSnapshot["kpis"][number]["accent"];

interface ClickUpTeam {
  id: string | number;
  name?: string;
}

interface ClickUpSpace {
  id: string | number;
  name?: string;
}

interface ClickUpFolder {
  id: string | number;
  name?: string;
}

interface ClickUpList {
  id: string | number;
  name?: string;
}

interface ClickUpCustomFieldOption {
  id?: string | number;
  orderindex?: string | number;
  name?: string;
  label?: string;
}

interface ClickUpCustomField {
  name?: string;
  type?: string;
  value?: unknown;
  type_config?: {
    options?: ClickUpCustomFieldOption[];
  };
}

interface ClickUpAssignee {
  username?: string;
  email?: string;
  name?: string;
}

interface ClickUpTask {
  id: string | number;
  name?: string;
  status?: {
    status?: string;
    type?: string;
  };
  assignees?: ClickUpAssignee[];
  custom_fields?: ClickUpCustomField[];
  date_created?: string | number;
  date_updated?: string | number;
  date_closed?: string | number;
}

interface SalesScope {
  teamId: string;
  teamName: string;
  spaceId: string;
  spaceName: string;
  folderId: string;
  folderName: string;
  lists: Array<{ id: string; name: string }>;
}

interface LeadRecord {
  id: string;
  title: string;
  status: string;
  statusType: string;
  primaryAssignee: string;
  assignees: string[];
  origin: string | null;
  product: string | null;
  saleValue: number | null;
  annualRevenue: number | null;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  closedAtMs: number | null;
}

interface ServiceConfig {
  apiBaseUrl: string;
  apiToken: string | null;
  teamId: string;
  workspaceName: string;
  spaceName: string;
  folderName: string;
  listNames: string[];
  refreshMs: number;
  timeoutMs: number;
  maxPages: number;
  navigationTtlMs: number;
}

export interface LiveDashboardStatus {
  enabled: boolean;
  healthy: boolean;
  slug: string;
  lastSyncAt: string | null;
  lastError: string | null;
  syncInProgress: boolean;
  refreshMs: number;
  version: number;
  teamId: string;
  workspaceName: string;
  spaceName: string;
  folderName: string;
  lists: string[];
}

export interface LiveSnapshotEvent {
  snapshot: DashboardSnapshot;
  meta: {
    slug: string;
    source: string;
    updatedAt: string;
    version: number;
    changed: boolean;
    teamId: string;
    workspaceName: string;
    spaceName: string;
    folderName: string;
    lists: string[];
  };
}

interface DashboardNumbers {
  totalLeads: number;
  pipelineValue: number;
  salesWithValue: number;
  modeTicket: number;
  averageTicket: number;
  estimatedLtv: number;
}

interface RefreshResult {
  snapshot: DashboardSnapshot;
  changed: boolean;
  updatedAt: string;
}

const ALEM_TIMEZONE = "America/Sao_Paulo";
const LOST_STATUS_KEYWORDS = ["perdido", "desqualificado", "arquivado"];
const WON_STATUS_KEYWORDS = ["negocio fechado", "negocio ganho", "ganho", "fechado"];
const ACTIVE_STATUS_FOR_OPPORTUNITY = [
  "oportunidade",
  "em negociacao",
  "em qualificacao",
  "reuniao agendada",
  "followup",
  "convidado para o evento",
  "confirmado",
  "compareceu",
];
const EFFICIENCY_ACCENTS: Accent[] = ["violet", "blue", "rose", "amber", "emerald"];
const MIX_ACCENTS: Accent[] = ["amber", "rose", "violet", "blue", "emerald"];
const PERSON_ACCENTS: Accent[] = ["emerald", "amber", "blue", "violet", "rose"];
const CHAT_METRICS_TTL_MS = 60_000;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cleanScopeName(value: unknown): string {
  return normalizeText(value).replace(/^\d+(?:[\.\-]\d+)*\s*[\)\.-]?\s*/, "");
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function toMs(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function compactBrCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "R$ 0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `R$ ${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function integerBrCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function parseCurrencyLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const raw = value
    .trim()
    .replace(/[R$\s]/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(1)).toString().replace(".", ",")}%`;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: ALEM_TIMEZONE,
  }).format(value);
}

function formatDurationFromMs(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return "--";
  }
  const totalSeconds = Math.round(value / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function accentFromName(value: string): Accent {
  const normalized = normalizeText(value);
  if (!normalized) return "blue";

  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PERSON_ACCENTS[hash % PERSON_ACCENTS.length];
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

function accentForSlaSeconds(value: number | null | undefined, targetSeconds = 300): Accent {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return "blue";
  if (value <= targetSeconds) return "emerald";
  if (value <= targetSeconds * 1.35) return "amber";
  if (value <= targetSeconds * 2) return "blue";
  return "rose";
}

function accentForVolume(value: number, maxValue: number): Accent {
  if (!Number.isFinite(value) || value <= 0) return "rose";
  const ratio = maxValue > 0 ? value / maxValue : 0;
  if (ratio >= 0.72) return "emerald";
  if (ratio >= 0.4) return "amber";
  if (ratio >= 0.2) return "blue";
  return "violet";
}

function formatBradialChatLabel(count: number | null | undefined): string {
  if (count === null || count === undefined || !Number.isFinite(count) || count <= 0) {
    return "0 chats no Bradial";
  }
  if (count === 1) {
    return "1 chat no Bradial";
  }
  return `${count} chats no Bradial`;
}

function extractPrimaryAssignee(assignees: ClickUpAssignee[] | undefined): string {
  if (!Array.isArray(assignees) || assignees.length === 0) {
    return "Sem responsavel";
  }
  const first = assignees[0];
  return String(first.username || first.name || first.email || "Sem responsavel").trim();
}

function extractAssigneeList(assignees: ClickUpAssignee[] | undefined): string[] {
  if (!Array.isArray(assignees)) {
    return [];
  }
  return assignees
    .map((item) => String(item.username || item.name || item.email || "").trim())
    .filter(Boolean);
}

function resolveCustomFieldValue(field: ClickUpCustomField): unknown {
  if (!field) return null;

  if (field.type === "drop_down") {
    const options = Array.isArray(field.type_config?.options) ? field.type_config.options : [];
    const selected = options.find(
      (option) => String(option.orderindex) === String(field.value) || String(option.id) === String(field.value),
    );
    return selected?.name || selected?.label || field.value || null;
  }

  if (field.type === "labels") {
    const selectedIds = Array.isArray(field.value) ? field.value : [];
    const options = Array.isArray(field.type_config?.options) ? field.type_config.options : [];
    const labels = selectedIds
      .map((id) => options.find((option) => String(option.id) === String(id)))
      .map((option) => option?.label || option?.name || null)
      .filter(Boolean);
    return labels.length ? labels.join(", ") : null;
  }

  return field.value ?? null;
}

function buildFieldMap(task: ClickUpTask): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const field of Array.isArray(task.custom_fields) ? task.custom_fields : []) {
    const key = normalizeText(field.name);
    if (!key) continue;
    result.set(key, resolveCustomFieldValue(field));
  }
  return result;
}

function getFieldValue(fields: Map<string, unknown>, candidates: string[]): unknown {
  for (const candidate of candidates) {
    const value = fields.get(normalizeText(candidate));
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function normalizeStatus(status: string): string {
  return normalizeText(status);
}

function isLostLead(lead: LeadRecord): boolean {
  const status = normalizeStatus(lead.status);
  return LOST_STATUS_KEYWORDS.some((keyword) => status.includes(keyword));
}

function isWonLead(lead: LeadRecord): boolean {
  const status = normalizeStatus(lead.status);
  if (WON_STATUS_KEYWORDS.some((keyword) => status.includes(keyword))) {
    return true;
  }
  return normalizeText(lead.statusType) === "closed" && !isLostLead(lead);
}

function isActiveOpportunityLead(lead: LeadRecord): boolean {
  if (isLostLead(lead) || isWonLead(lead)) return false;
  const status = normalizeStatus(lead.status);
  return ACTIVE_STATUS_FOR_OPPORTUNITY.some((keyword) => status.includes(keyword));
}

function statusProbability(status: string): number {
  const normalized = normalizeStatus(status);
  if (normalized.includes("negocio fechado") || normalized.includes("ganho")) return 95;
  if (normalized.includes("em negociacao")) return 75;
  if (normalized.includes("oportunidade")) return 62;
  if (normalized.includes("reuniao agendada")) return 48;
  if (normalized.includes("em qualificacao")) return 35;
  if (normalized.includes("followup")) return 28;
  if (normalized.includes("convidado")) return 24;
  if (normalized.includes("confirmado")) return 22;
  if (normalized.includes("perdido") || normalized.includes("desqualificado")) return 8;
  return 20;
}

function accentForProbability(probability: number): Accent {
  if (probability >= 70) return "amber";
  if (probability >= 55) return "blue";
  if (probability >= 40) return "violet";
  if (probability >= 25) return "emerald";
  return "rose";
}

function accentForOperationalStatus(status: string): Accent {
  const normalized = normalizeStatus(status);
  if (normalized.includes("qualific")) return "amber";
  if (normalized.includes("oportun")) return "emerald";
  if (normalized.includes("reuniao")) return "blue";
  if (normalized.includes("follow")) return "violet";
  if (normalized.includes("negocio fechado") || normalized.includes("ganho")) return "emerald";
  if (normalized.includes("perdido") || normalized.includes("desqualificado")) return "rose";
  return "blue";
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)));
}

function pickMode(values: number[]): number | null {
  if (!values.length) return null;
  const map = new Map<number, number>();
  for (const value of values) {
    map.set(value, (map.get(value) || 0) + 1);
  }
  const ranked = [...map.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return ranked[0]?.[0] ?? null;
}

function safeAverage(values: number[]): number {
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function hashSnapshot(snapshot: DashboardSnapshot): string {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function parseListNames(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveBackupToken(): string | null {
  const backupPathRaw = String(process.env.CLICKUP_CLIENTS_BACKUP_PATH || "").trim();
  if (!backupPathRaw) return null;

  const backupPath = path.isAbsolute(backupPathRaw)
    ? backupPathRaw
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", backupPathRaw);
  if (!fs.existsSync(backupPath)) return null;

  const backupClientName = normalizeText(process.env.CLICKUP_BACKUP_CLIENT_NAME || "Stev");
  try {
    const raw = fs.readFileSync(backupPath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw) as Array<{
      name?: string;
      clickupToken?: string;
      clickupTeamId?: string | number;
    }>;

    if (!Array.isArray(parsed)) return null;
    const candidates = parsed.filter((item) => normalizeText(item?.name || "") === backupClientName);
    const preferredTeamId = String(process.env.CLICKUP_TEAM_ID || DEFAULT_CLICKUP_TEAM_ID);
    const found =
      candidates.find((item) => String(item?.clickupTeamId || "") === preferredTeamId) || candidates[0];
    const token = String(found?.clickupToken || "").trim();
    return token || null;
  } catch {
    return null;
  }
}

function loadConfig(): ServiceConfig {
  const directToken =
    String(process.env.CLICKUP_API_TOKEN || "").trim() || String(process.env.CLICKUP_API_KEY || "").trim();
  const apiToken = directToken || resolveBackupToken();

  return {
    apiBaseUrl: String(process.env.CLICKUP_API_BASE_URL || "https://api.clickup.com/api/v2")
      .replace(/\/+$/, "")
      .trim(),
    apiToken: apiToken || null,
    teamId: String(process.env.CLICKUP_TEAM_ID || DEFAULT_CLICKUP_TEAM_ID).trim(),
    workspaceName: normalizeText(process.env.CLICKUP_WORKSPACE_NAME || DEFAULT_WORKSPACE_NAME),
    spaceName: cleanScopeName(process.env.CLICKUP_SPACE_NAME || DEFAULT_SPACE_NAME),
    folderName: cleanScopeName(process.env.CLICKUP_FOLDER_NAME || DEFAULT_FOLDER_NAME),
    listNames: parseListNames(String(process.env.CLICKUP_LIST_NAMES || "")),
    refreshMs: Math.max(5_000, Number(process.env.CLICKUP_REFRESH_MS || 15_000)),
    timeoutMs: Math.max(5_000, Number(process.env.CLICKUP_TIMEOUT_MS || 30_000)),
    maxPages: Math.max(1, Number(process.env.CLICKUP_MAX_PAGES || 12)),
    navigationTtlMs: Math.max(30_000, Number(process.env.CLICKUP_NAVIGATION_TTL_MS || 300_000)),
  };
}

export class LiveClickupDashboardService extends EventEmitter {
  private readonly slug = DASHBOARD_SLUG;

  private readonly config: ServiceConfig;

  private readonly chatConfig = loadBradialChatConfig();

  private timer: NodeJS.Timeout | null = null;

  private inFlight: Promise<RefreshResult> | null = null;

  private currentHash: string | null = null;

  private cachedScope: { value: SalesScope; expiresAt: number } | null = null;

  private cachedChatMetrics: { value: BradialChatMetricsResult; expiresAt: number } | null = null;

  private version = 0;

  private lastSyncAt: string | null = null;

  private lastError: string | null = null;

  private syncInProgress = false;

  constructor() {
    super();
    this.config = loadConfig();
    const stored = getSnapshot(this.slug);
    if (stored?.payload) {
      this.currentHash = hashSnapshot(stored.payload);
      this.lastSyncAt = stored.updatedAt;
    }
  }

  public start(): void {
    if (this.timer) return;

    void this.refresh("startup").catch(() => undefined);
    this.timer = setInterval(() => {
      void this.refresh("interval").catch(() => undefined);
    }, this.config.refreshMs);
    this.timer.unref();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  public async refresh(trigger: string): Promise<RefreshResult> {
    if (this.inFlight) {
      return this.inFlight;
    }

    this.syncInProgress = true;
    this.emitStatus();

    this.inFlight = this.doRefresh(trigger)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "unknown_error";
        this.lastError = message;
        this.emitStatus();
        throw error;
      })
      .finally(() => {
        this.inFlight = null;
        this.syncInProgress = false;
        this.emitStatus();
      });

    return this.inFlight;
  }

  public getStatus(): LiveDashboardStatus {
    const scopeLists = this.cachedScope?.value.lists.map((item) => item.name) ?? [];
    return {
      enabled: Boolean(this.config.apiToken),
      healthy: Boolean(this.config.apiToken) && !this.lastError,
      slug: this.slug,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      syncInProgress: this.syncInProgress,
      refreshMs: this.config.refreshMs,
      version: this.version,
      teamId: this.config.teamId,
      workspaceName: this.config.workspaceName,
      spaceName: this.config.spaceName,
      folderName: this.config.folderName,
      lists: scopeLists,
    };
  }

  public getCurrentSnapshot(): DashboardSnapshot {
    return getSnapshot(this.slug)?.payload || DEFAULT_DASHBOARD_SNAPSHOT;
  }

  private async getBradialChatMetrics(): Promise<BradialChatMetricsResult | null> {
    if (!this.chatConfig) return null;
    if (this.cachedChatMetrics && this.cachedChatMetrics.expiresAt > Date.now()) {
      return this.cachedChatMetrics.value;
    }

    try {
      const metrics = await fetchBradialChatMetrics(this.chatConfig);
      this.cachedChatMetrics = {
        value: metrics,
        expiresAt: Date.now() + CHAT_METRICS_TTL_MS,
      };
      return metrics;
    } catch {
      return this.cachedChatMetrics?.value || null;
    }
  }

  private async doRefresh(trigger: string): Promise<RefreshResult> {
    if (!this.config.apiToken) {
      throw new Error(
        "Missing CLICKUP_API_TOKEN/CLICKUP_API_KEY. Configure env or CLICKUP_CLIENTS_BACKUP_PATH for live sync.",
      );
    }

    const scope = await this.resolveSalesScope();
    const [tasks, chatMetrics] = await Promise.all([
      this.fetchTasksForScope(scope),
      this.getBradialChatMetrics(),
    ]);
    const snapshot = this.buildSnapshot(scope, tasks, chatMetrics);
    const snapshotHash = hashSnapshot(snapshot);
    const changed = snapshotHash !== this.currentHash;

    let updatedAt = this.lastSyncAt || toIsoNow();
    if (changed) {
      const saved = saveSnapshot({
        slug: this.slug,
        source: "clickup-live",
        snapshot,
      });
      this.currentHash = snapshotHash;
      this.version += 1;
      updatedAt = saved.updatedAt;

      this.emit("snapshot", {
        snapshot: saved.payload,
        meta: {
          slug: saved.slug,
          source: saved.source,
          updatedAt: saved.updatedAt,
          version: this.version,
          changed: true,
          teamId: scope.teamId,
          workspaceName: scope.teamName,
          spaceName: scope.spaceName,
          folderName: scope.folderName,
          lists: scope.lists.map((item) => item.name),
        },
      } satisfies LiveSnapshotEvent);
    }

    this.lastSyncAt = updatedAt;
    this.lastError = null;
    this.emitStatus();

    this.emit("heartbeat", {
      trigger,
      changed,
      syncAt: this.lastSyncAt,
      version: this.version,
    });

    return {
      snapshot,
      changed,
      updatedAt: this.lastSyncAt || toIsoNow(),
    };
  }

  private emitStatus(): void {
    this.emit("status", this.getStatus());
  }

  private async resolveSalesScope(): Promise<SalesScope> {
    if (this.cachedScope && this.cachedScope.expiresAt > Date.now()) {
      return this.cachedScope.value;
    }

    const teamsPayload = await this.request<{ teams?: ClickUpTeam[] }>("/team");
    const teams = Array.isArray(teamsPayload.teams) ? teamsPayload.teams : [];
    const targetTeam = teams.find((team) => String(team.id) === this.config.teamId);
    if (!targetTeam) {
      throw new Error(`Configured teamId ${this.config.teamId} was not found in ClickUp token scope.`);
    }

    const normalizedTeamName = normalizeText(targetTeam.name || "");
    if (this.config.workspaceName && !normalizedTeamName.includes(this.config.workspaceName)) {
      throw new Error(
        `Team ${targetTeam.name || targetTeam.id} does not match expected workspace ${this.config.workspaceName}.`,
      );
    }

    const spacesPayload = await this.request<{ spaces?: ClickUpSpace[] }>(`/team/${targetTeam.id}/space`, {
      archived: false,
    });
    const spaces = Array.isArray(spacesPayload.spaces) ? spacesPayload.spaces : [];
    const targetSpace = spaces.find((space) => cleanScopeName(space.name || "") === this.config.spaceName);
    if (!targetSpace) {
      throw new Error(`Space ${this.config.spaceName} was not found in team ${targetTeam.id}.`);
    }

    const foldersPayload = await this.request<{ folders?: ClickUpFolder[] }>(`/space/${targetSpace.id}/folder`, {
      archived: false,
    });
    const folders = Array.isArray(foldersPayload.folders) ? foldersPayload.folders : [];
    const targetFolder = folders.find((folder) => cleanScopeName(folder.name || "") === this.config.folderName);
    if (!targetFolder) {
      throw new Error(`Folder ${this.config.folderName} was not found in space ${targetSpace.id}.`);
    }

    const listsPayload = await this.request<{ lists?: ClickUpList[] }>(`/folder/${targetFolder.id}/list`, {
      archived: false,
    });
    const rawLists = Array.isArray(listsPayload.lists) ? listsPayload.lists : [];
    let scopedLists = rawLists;
    if (this.config.listNames.length) {
      const normalizedListNames = this.config.listNames.map((name) => cleanScopeName(name));
      scopedLists = rawLists.filter((item) => normalizedListNames.includes(cleanScopeName(item.name || "")));
    }

    if (!scopedLists.length) {
      throw new Error("No monitored lists found inside configured sales folder.");
    }

    const scope: SalesScope = {
      teamId: String(targetTeam.id),
      teamName: String(targetTeam.name || "alem da ideia").trim(),
      spaceId: String(targetSpace.id),
      spaceName: String(targetSpace.name || "comercial").trim(),
      folderId: String(targetFolder.id),
      folderName: String(targetFolder.name || "area de vendas").trim(),
      lists: scopedLists.map((list) => ({
        id: String(list.id),
        name: String(list.name || "lista sem nome").trim(),
      })),
    };

    this.cachedScope = {
      value: scope,
      expiresAt: Date.now() + this.config.navigationTtlMs,
    };
    return scope;
  }

  private async fetchTasksForScope(scope: SalesScope): Promise<ClickUpTask[]> {
    const batches = await Promise.all(scope.lists.map((list) => this.fetchTasksForList(list.id)));
    const dedupe = new Map<string, ClickUpTask>();
    for (const task of batches.flat()) {
      dedupe.set(String(task.id), task);
    }
    return [...dedupe.values()];
  }

  private async fetchTasksForList(listId: string): Promise<ClickUpTask[]> {
    const tasks: ClickUpTask[] = [];

    for (let page = 0; page < this.config.maxPages; page += 1) {
      const payload = await this.request<{ tasks?: ClickUpTask[] }>(`/list/${listId}/task`, {
        page,
        include_closed: false,
        subtasks: false,
      });

      const rows = Array.isArray(payload.tasks) ? payload.tasks : [];
      if (!rows.length) break;
      tasks.push(...rows);
      if (rows.length < 100) break;
    }

    return tasks;
  }

  private mapLeads(tasks: ClickUpTask[]): LeadRecord[] {
    return tasks.map((task) => {
      const fields = buildFieldMap(task);
      const origin = getFieldValue(fields, ["Origem"]);
      const product = getFieldValue(fields, ["Produto"]);
      const saleValue = parseCurrencyLike(getFieldValue(fields, ["Valor da Venda"]));
      const annualRevenue = parseCurrencyLike(getFieldValue(fields, ["Faturamento Anual"]));

      return {
        id: String(task.id),
        title: String(task.name || "Lead sem nome").trim(),
        status: String(task.status?.status || "Sem status").trim(),
        statusType: String(task.status?.type || "").trim(),
        primaryAssignee: extractPrimaryAssignee(task.assignees),
        assignees: extractAssigneeList(task.assignees),
        origin: origin ? String(origin).trim() : null,
        product: product ? String(product).trim() : null,
        saleValue,
        annualRevenue,
        createdAtMs: toMs(task.date_created),
        updatedAtMs: toMs(task.date_updated),
        closedAtMs: toMs(task.date_closed),
      };
    });
  }

  private computeMainNumbers(leads: LeadRecord[]): DashboardNumbers {
    const saleValues = leads
      .map((item) => item.saleValue)
      .filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item > 0);
    const modeTicket = pickMode(saleValues) || 0;
    const averageTicket = safeAverage(saleValues);
    const pipelineValue = saleValues.reduce((sum, item) => sum + item, 0);
    const activeCount = leads.filter((lead) => isActiveOpportunityLead(lead)).length;
    const estimatedLtv = pipelineValue > 0 ? pipelineValue : modeTicket * activeCount;

    return {
      totalLeads: leads.length,
      pipelineValue,
      salesWithValue: saleValues.length,
      modeTicket,
      averageTicket,
      estimatedLtv,
    };
  }

  private buildSnapshot(
    scope: SalesScope,
    tasks: ClickUpTask[],
    chatMetrics: BradialChatMetricsResult | null,
  ): DashboardSnapshot {
    const leads = this.mapLeads(tasks);
    const numbers = this.computeMainNumbers(leads);

    const ticketReference = numbers.modeTicket > 0 ? numbers.modeTicket : numbers.averageTicket;

    const productCount = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.product) continue;
      productCount.set(lead.product, (productCount.get(lead.product) || 0) + 1);
    }
    const bestSeller = [...productCount.entries()].sort((a, b) => b[1] - a[1])[0];

    const originMap = new Map<string, { leads: number; won: number }>();
    for (const lead of leads) {
      const key = lead.origin || "Origem nao informada";
      const current = originMap.get(key) || { leads: 0, won: 0 };
      current.leads += 1;
      if (isWonLead(lead)) current.won += 1;
      originMap.set(key, current);
    }
    const maxOriginLeads = [...originMap.values()].reduce((max, item) => Math.max(max, item.leads), 0);
    const efficiencyRows = [...originMap.entries()]
      .sort((a, b) => b[1].leads - a[1].leads)
      .slice(0, 5)
      .map(([origin, metrics], index) => {
        const conversion = metrics.leads > 0 ? (metrics.won / metrics.leads) * 100 : 0;
        const distribution = maxOriginLeads > 0 ? (metrics.leads / maxOriginLeads) * 100 : 0;
        const progress = clamp(conversion * 0.7 + distribution * 0.3, 8, 100);
        return {
          label: origin,
          note: `${metrics.leads} Leads • ${formatPercent(conversion)} Conv.`,
          progress: Number(progress.toFixed(1)),
          accent: EFFICIENCY_ACCENTS[index % EFFICIENCY_ACCENTS.length],
        };
      });

    const assigneeMap = new Map<
      string,
      { assignedLeadCount: number; volume: number }
    >();
    for (const lead of leads) {
      const attributedOwners = new Set(
        (lead.assignees.length ? lead.assignees : [lead.primaryAssignee || "Sem responsavel"]).filter(Boolean),
      );

      for (const owner of attributedOwners) {
        const current = assigneeMap.get(owner) || { assignedLeadCount: 0, volume: 0 };
        current.assignedLeadCount += 1;
        assigneeMap.set(owner, current);
      }

      const primaryOwner = lead.primaryAssignee || "Sem responsavel";
      const primaryCurrent = assigneeMap.get(primaryOwner) || { assignedLeadCount: 0, volume: 0 };
      primaryCurrent.volume += lead.saleValue || 0;
      assigneeMap.set(primaryOwner, primaryCurrent);
    }
    const squadRows = [...assigneeMap.entries()]
      .sort((a, b) => b[1].assignedLeadCount - a[1].assignedLeadCount || b[1].volume - a[1].volume)
      .map(([name, data]) => {
        const matchedChatMetric = chatMetrics ? matchBradialAgentMetric(name, chatMetrics.byAgent) : null;
        const chatCount = matchedChatMetric?.repliedCount ?? 0;
        const resolvedSlaSeconds = matchedChatMetric?.averageSeconds;

        return {
          name,
          role: formatBradialChatLabel(chatCount),
          initials: initialsFromName(name),
          avatarAccent: accentFromName(name),
          chatCount,
          atendimentos: String(data.assignedLeadCount),
          atendimentosValue: data.assignedLeadCount,
          sla: resolvedSlaSeconds !== undefined ? formatDurationFromMs(resolvedSlaSeconds * 1000) : "--",
          slaSeconds: resolvedSlaSeconds,
          slaAccent: matchedChatMetric?.accent || accentForSlaSeconds(undefined),
          volume: compactBrCurrency(data.volume),
          volumeValue: data.volume,
          volumeAccent: "blue" as Accent,
        };
      })
      .filter((row) => row.atendimentosValue > 0 || row.volumeValue > 0 || row.chatCount > 0)
      .slice(0, 8);
    const maxSquadVolume = squadRows.reduce((max, row) => Math.max(max, row.volumeValue || 0), 0);
    const rankedSquadRows = squadRows.map((row) => ({
      ...row,
      volumeAccent: accentForVolume(row.volumeValue || 0, maxSquadVolume),
    }));

    const mixRows = [...productCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([product, count], index) => ({
        label: product.toUpperCase(),
        value: count,
        suffix: count > 1 ? "VDS" : "VD",
        accent: MIX_ACCENTS[index % MIX_ACCENTS.length],
      }));

    const opportunities = leads
      .filter((lead) => isActiveOpportunityLead(lead))
      .map((lead) => ({
        ...lead,
        rankingValue: (lead.annualRevenue && lead.annualRevenue > 0 ? lead.annualRevenue : lead.saleValue) || 0,
      }))
      .sort((a, b) => {
        const valueDelta = b.rankingValue - a.rankingValue;
        if (valueDelta !== 0) return valueDelta;
        return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
      })
      .slice(0, 8)
      .map((lead) => {
        const probability = statusProbability(lead.status);
        return {
          title: lead.title,
          owner: `RESPONSAVEL: ${(lead.primaryAssignee || "Sem responsavel").toUpperCase()}`,
          value: compactBrCurrency(lead.rankingValue),
          status: (lead.product || lead.status || "Sem status").toUpperCase(),
          note: `${lead.origin || "Origem n/d"} • ${probability}% Prob.`,
          accent: accentForProbability(probability),
        };
      });

    const now = Date.now();
    const staleCutoffMs = now - 7 * 86_400_000;
    const recentCutoffMs = now - 48 * 3_600_000;
    const activeOperationalLeads = leads.filter((lead) => !isLostLead(lead) && !isWonLead(lead));
    const stalledLeads = activeOperationalLeads.filter(
      (lead) => !lead.updatedAtMs || lead.updatedAtMs < staleCutoffMs,
    );
    const recentlyUpdatedLeads = leads.filter((lead) => lead.updatedAtMs && lead.updatedAtMs >= recentCutoffMs);
    const closedLeads = leads.filter((lead) => isWonLead(lead) || isLostLead(lead) || Boolean(lead.closedAtMs));
    const unassignedLeads = leads.filter((lead) => !lead.primaryAssignee || lead.primaryAssignee === "Sem responsavel");

    const stageMap = new Map<string, number>();
    for (const lead of leads) {
      const label = lead.status || "Sem status";
      stageMap.set(label, (stageMap.get(label) || 0) + 1);
    }
    const maxStageCount = [...stageMap.values()].reduce((max, value) => Math.max(max, value), 0);
    const operationStageRows = [...stageMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([status, count]) => ({
        label: status,
        note: `${formatInteger(count)} tasks`,
        progress: clamp(maxStageCount > 0 ? (count / maxStageCount) * 100 : 0, 8, 100),
        accent: accentForOperationalStatus(status),
      }));

    const ownerMap = new Map<string, { active: number; stalled: number; closed: number }>();
    for (const lead of leads) {
      const owner = lead.primaryAssignee || "Sem responsavel";
      const bucket = ownerMap.get(owner) || { active: 0, stalled: 0, closed: 0 };

      if (isWonLead(lead) || isLostLead(lead) || lead.closedAtMs) {
        bucket.closed += 1;
      } else {
        bucket.active += 1;
        if (!lead.updatedAtMs || lead.updatedAtMs < staleCutoffMs) {
          bucket.stalled += 1;
        }
      }

      ownerMap.set(owner, bucket);
    }
    const operationOwnerRows = [...ownerMap.entries()]
      .sort((a, b) => b[1].active - a[1].active || b[1].stalled - a[1].stalled || b[1].closed - a[1].closed)
      .slice(0, 8)
      .map(([name, data]) => ({
        name,
        active: formatInteger(data.active),
        activeValue: data.active,
        stalled: formatInteger(data.stalled),
        stalledValue: data.stalled,
        closed: formatInteger(data.closed),
        closedValue: data.closed,
        accent: accentFromName(name),
      }));

    const stalledRatio = activeOperationalLeads.length > 0 ? stalledLeads.length / activeOperationalLeads.length : 0;
    const operationStatus =
      stalledRatio >= 0.35 ? "ATENÇÃO OPERACIONAL" : stalledRatio >= 0.18 ? "FLUXO EM ALERTA" : "CLICKUP AO VIVO";
    const dominantStage = [...stageMap.entries()].sort((a, b) => b[1] - a[1])[0];
    const operationNote = dominantStage
      ? `Maior concentracao em ${dominantStage[0]} e ${formatInteger(stalledLeads.length)} tasks paradas ha 7 dias ou mais.`
      : "Panorama operacional das tasks monitoradas no ClickUp.";

    const financialPipelineLeads = leads.filter(
      (lead) => !isLostLead(lead) && !isWonLead(lead) && Number(lead.saleValue || 0) > 0,
    );
    const wonFinancialLeads = leads.filter((lead) => isWonLead(lead) && Number(lead.saleValue || 0) > 0);
    const lostFinancialLeads = leads.filter((lead) => isLostLead(lead) && Number(lead.saleValue || 0) > 0);
    const pipelineValue = financialPipelineLeads.reduce((sum, lead) => sum + (lead.saleValue || 0), 0);
    const weightedForecastValue = financialPipelineLeads.reduce(
      (sum, lead) => sum + (lead.saleValue || 0) * (statusProbability(lead.status) / 100),
      0,
    );
    const wonValue = wonFinancialLeads.reduce((sum, lead) => sum + (lead.saleValue || 0), 0);
    const lostValue = lostFinancialLeads.reduce((sum, lead) => sum + (lead.saleValue || 0), 0);
    const stalledPipelineValue = financialPipelineLeads
      .filter((lead) => !lead.updatedAtMs || lead.updatedAtMs < staleCutoffMs)
      .reduce((sum, lead) => sum + (lead.saleValue || 0), 0);

    const financialStageMap = new Map<string, { count: number; value: number }>();
    for (const lead of financialPipelineLeads) {
      const key = lead.status || "Sem status";
      const current = financialStageMap.get(key) || { count: 0, value: 0 };
      current.count += 1;
      current.value += lead.saleValue || 0;
      financialStageMap.set(key, current);
    }
    const maxFinancialStageValue = [...financialStageMap.values()].reduce((max, item) => Math.max(max, item.value), 0);
    const financialBreakdownRows = [...financialStageMap.entries()]
      .sort((a, b) => b[1].value - a[1].value || b[1].count - a[1].count)
      .slice(0, 6)
      .map(([status, metrics]) => ({
        label: status,
        note: `${compactBrCurrency(metrics.value)} • ${formatInteger(metrics.count)} negocios`,
        progress: clamp(maxFinancialStageValue > 0 ? (metrics.value / maxFinancialStageValue) * 100 : 0, 8, 100),
        accent: accentForOperationalStatus(status),
      }));

    const financialOwnerMap = new Map<string, { pipeline: number; forecast: number; won: number }>();
    for (const lead of leads) {
      const owner = lead.primaryAssignee || "Sem responsavel";
      const bucket = financialOwnerMap.get(owner) || { pipeline: 0, forecast: 0, won: 0 };
      const saleValue = lead.saleValue || 0;

      if (saleValue > 0) {
        if (isWonLead(lead)) {
          bucket.won += saleValue;
        } else if (!isLostLead(lead)) {
          bucket.pipeline += saleValue;
          bucket.forecast += saleValue * (statusProbability(lead.status) / 100);
        }
      }

      financialOwnerMap.set(owner, bucket);
    }
    const financialOwnerRows = [...financialOwnerMap.entries()]
      .filter(([, data]) => data.pipeline > 0 || data.forecast > 0 || data.won > 0)
      .sort((a, b) => b[1].pipeline - a[1].pipeline || b[1].forecast - a[1].forecast || b[1].won - a[1].won)
      .slice(0, 8)
      .map(([name, data]) => ({
        name,
        pipeline: compactBrCurrency(data.pipeline),
        pipelineValue: data.pipeline,
        forecast: compactBrCurrency(data.forecast),
        forecastValue: data.forecast,
        won: compactBrCurrency(data.won),
        wonValue: data.won,
        accent: accentFromName(name),
      }));

    const financialStatus =
      weightedForecastValue >= pipelineValue * 0.6
        ? "PREVISÃO CONSISTENTE"
        : weightedForecastValue >= pipelineValue * 0.4
          ? "PREVISÃO MODERADA"
          : "PREVISÃO EM ALERTA";
    const financialNote =
      pipelineValue > 0
        ? `Pipeline de ${compactBrCurrency(pipelineValue)} com forecast ponderado de ${compactBrCurrency(weightedForecastValue)} e ${compactBrCurrency(stalledPipelineValue)} parados ha 7 dias ou mais.`
        : "Sem pipeline com valor suficiente para leitura financeira.";

    return {
      header: {
        brand: "ALEM DA IDEIA",
        context: "INTELIGÊNCIA COMERCIAL",
        subtitle: "ANÁLISE DE MIX, ORIGEM E PERFORMANCE HIGH-TICKET",
        liveMetricLabel: "LTV ESTIMADO",
        liveMetricValue: compactBrCurrency(numbers.estimatedLtv),
        status: chatMetrics ? "CLICKUP E BRADIAL ATIVOS" : "CLICKUP AO VIVO",
      },
      kpis: [
        {
          label: "TICKET MÉDIO (GERAL)",
          value: integerBrCurrency(ticketReference),
          note: `${numbers.salesWithValue} negócios com valor`,
          accent: "emerald",
        },
        {
          label: "PRODUTO LÍDER (VOLUME)",
          value: bestSeller?.[0] || "Sem dados",
          note: bestSeller ? `${bestSeller[1]} vendas` : undefined,
          accent: "violet",
        },
        {
          label: "PIPELINE ATIVO",
          value: compactBrCurrency(numbers.pipelineValue),
          note: `${numbers.totalLeads} leads monitorados`,
          accent: "amber",
        },
      ],
      chatSla:
        chatMetrics?.summary ||
        ({
          title: "SLA do Chat Bradial",
          value: "--",
          note: "Fonte do chat indisponível para cálculo neste ambiente",
          status: "SEM CHAT",
          progress: 0,
          accent: "blue",
        } satisfies NonNullable<DashboardSnapshot["chatSla"]>),
      atendimento: chatMetrics?.atendimento,
      operacao: {
        title: "Operação ClickUp",
        status: operationStatus,
        note: operationNote,
        metrics: [
          {
            label: "TAREFAS MONITORADAS",
            value: formatInteger(leads.length),
            note: "universo atual do escopo",
            accent: "emerald",
          },
          {
            label: "ATIVAS",
            value: formatInteger(activeOperationalLeads.length),
            note: "em aberto no momento",
            accent: "blue",
          },
          {
            label: "PARADAS 7D+",
            value: formatInteger(stalledLeads.length),
            note: "sem atualizacao recente",
            accent: "rose",
          },
          {
            label: "ATUALIZADAS 48H",
            value: formatInteger(recentlyUpdatedLeads.length),
            note: "movimento recente",
            accent: "violet",
          },
          {
            label: "CONCLUIDAS",
            value: formatInteger(closedLeads.length),
            note: "ganhas ou encerradas",
            accent: "amber",
          },
          {
            label: "SEM RESPONSÁVEL",
            value: formatInteger(unassignedLeads.length),
            note: "pedem triagem",
            accent: "rose",
          },
        ],
        stages: {
          title: "Andamento por Etapa",
          trailing: "STATUS DO CLICKUP",
          rows: operationStageRows,
        },
        owners: {
          title: "Carga por Responsável",
          columns: ["Responsável", "Ativas", "Paradas 7d+", "Concluídas"],
          rows: operationOwnerRows,
        },
      },
      financeiro: {
        title: "Financeiro Comercial",
        status: financialStatus,
        note: financialNote,
        metrics: [
          {
            label: "FUNIL TOTAL",
            value: compactBrCurrency(pipelineValue),
            note: "oportunidades ativas com valor",
            accent: "emerald",
          },
          {
            label: "PREVISÃO PONDERADA",
            value: compactBrCurrency(weightedForecastValue),
            note: "valor x probabilidade por etapa",
            accent: "blue",
          },
          {
            label: "GANHO",
            value: compactBrCurrency(wonValue),
            note: "negocios marcados como ganhos",
            accent: "amber",
          },
          {
            label: "PERDIDO",
            value: compactBrCurrency(lostValue),
            note: "valor perdido no funil",
            accent: "rose",
          },
          {
            label: "TICKET MÉDIO",
            value: integerBrCurrency(ticketReference),
            note: "negocios com valor",
            accent: "violet",
          },
          {
            label: "VALOR PARADO 7D+",
            value: compactBrCurrency(stalledPipelineValue),
            note: "pipeline sem atualizacao recente",
            accent: "rose",
          },
        ],
        breakdown: {
          title: "Receita por Etapa",
          trailing: "FUNIL COMERCIAL",
          rows: financialBreakdownRows,
        },
        owners: {
          title: "Financeiro por Responsável",
          columns: ["Responsável", "Funil", "Previsão", "Ganho"],
          rows: financialOwnerRows,
        },
      },
      efficiency: {
        title: "Eficiencia por Origem (SDR)",
        trailing: `TOTAL LEADS: ${numbers.totalLeads}`,
        rows: efficiencyRows,
      },
      squad: {
        title: "Elite Squad Performance",
        columns: ["Consultor", "Leads atribuídos", "Chats Bradial", "SLA BRADIAL", "VOLUME VENDAS"],
        rows: rankedSquadRows,
      },
      mix: {
        title: "Mix de Vendas (Produto)",
        rows: mixRows,
      },
      opportunities: {
        title: "Principais Oportunidades",
        rows: opportunities,
      },
    };
  }

  private async request<T>(resourcePath: string, params?: Record<string, string | number | boolean>): Promise<T> {
    if (!this.config.apiToken) {
      throw new Error("ClickUp API token is not configured.");
    }

    const url = new URL(`${this.config.apiBaseUrl}${resourcePath}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: this.config.apiToken,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`ClickUp request failed (${response.status}): ${body.slice(0, 300)}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const liveClickupDashboardService = new LiveClickupDashboardService();
