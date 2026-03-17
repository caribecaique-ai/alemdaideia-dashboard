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
  if (!value || !Number.isFinite(value) || value <= 0) {
    return "--";
  }
  const totalSeconds = Math.round(value / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

  private timer: NodeJS.Timeout | null = null;

  private inFlight: Promise<RefreshResult> | null = null;

  private currentHash: string | null = null;

  private cachedScope: { value: SalesScope; expiresAt: number } | null = null;

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

  private async doRefresh(trigger: string): Promise<RefreshResult> {
    if (!this.config.apiToken) {
      throw new Error(
        "Missing CLICKUP_API_TOKEN/CLICKUP_API_KEY. Configure env or CLICKUP_CLIENTS_BACKUP_PATH for live sync.",
      );
    }

    const scope = await this.resolveSalesScope();
    const tasks = await this.fetchTasksForScope(scope);
    const snapshot = this.buildSnapshot(scope, tasks);
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

  private buildSnapshot(scope: SalesScope, tasks: ClickUpTask[]): DashboardSnapshot {
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
      { count: number; volume: number; responseTimes: number[] }
    >();
    for (const lead of leads) {
      const owner = lead.primaryAssignee || "Sem responsavel";
      const current = assigneeMap.get(owner) || { count: 0, volume: 0, responseTimes: [] };
      current.count += 1;
      current.volume += lead.saleValue || 0;
      if (lead.createdAtMs && lead.updatedAtMs && lead.updatedAtMs >= lead.createdAtMs) {
        current.responseTimes.push(lead.updatedAtMs - lead.createdAtMs);
      }
      assigneeMap.set(owner, current);
    }
    const squadRows = [...assigneeMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([name, data]) => ({
        name,
        atendimentos: String(data.count),
        sla: formatDurationFromMs(safeAverage(data.responseTimes)),
        volume: compactBrCurrency(data.volume),
      }));

    const mixRows = [...productCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
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

    return {
      header: {
        brand: "ALEM DA IDEIA",
        context: "COMMERCIAL INTELLIGENCE",
        subtitle: "ANALISE DE MIX, ORIGEM E PERFORMANCE HIGH-TICKET",
        liveMetricLabel: "LTV ESTIMADO",
        liveMetricValue: compactBrCurrency(numbers.estimatedLtv),
        status: "CLICKUP LIVE: ATIVO",
      },
      kpis: [
        {
          label: "TICKET MEDIO (GERAL)",
          value: integerBrCurrency(ticketReference),
          note: `${numbers.salesWithValue} negocios com valor`,
          accent: "emerald",
        },
        {
          label: "BEST-SELLER (VOLUME)",
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
      efficiency: {
        title: "Eficiencia por Origem (SDR)",
        trailing: `TOTAL LEADS: ${numbers.totalLeads}`,
        rows: efficiencyRows,
      },
      squad: {
        title: "Elite Squad Performance",
        columns: ["Consultor", "Atendimentos", "SLA BRADTAIL", "VOLUME VENDAS"],
        rows: squadRows,
      },
      mix: {
        title: "Mix de Vendas (Produto)",
        rows: mixRows,
      },
      opportunities: {
        title: "Top Opportunities",
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
