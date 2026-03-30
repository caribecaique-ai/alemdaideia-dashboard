import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";
import type { DashboardSnapshot } from "../schemas/dashboard.js";

type Accent = DashboardSnapshot["kpis"][number]["accent"];
type DashboardChatSla = NonNullable<DashboardSnapshot["chatSla"]>;
type DashboardAtendimento = NonNullable<DashboardSnapshot["atendimento"]>;

interface BradialChatConfig {
  baseUrl: string;
  apiToken: string;
  accountId: string;
  inboxId: string | null;
  pageLimit: number;
  timeoutMs: number;
  slaTargetSec: number;
  lookbackDays: number;
}

interface ChatwootAssignee {
  id?: string | number;
  name?: string;
  email?: string;
  available_name?: string;
  role?: string;
}

interface ChatwootConversation {
  id: string | number;
  status?: string;
  inbox_id?: string | number;
  is_onboarding?: boolean;
  created_at?: string | number;
  first_reply_created_at?: string | number;
  last_activity_at?: string | number;
  resolved_at?: string | number;
  waiting_since?: string | number;
  unread_count?: string | number;
  priority?: string;
  meta?: {
    assignee?: ChatwootAssignee;
  };
}

interface ChatwootConversationPage {
  meta?: {
    all_count?: number;
    unassigned_count?: number;
    open_or_pending_and_unassigned?: number;
  };
  payload?: ChatwootConversation[];
}

interface ChatwootMessageSender extends ChatwootAssignee {
  type?: string;
}

interface ChatwootMessage {
  message_type?: string | number;
  created_at?: string | number;
  sender_type?: string;
  sender?: ChatwootMessageSender;
}

interface ChatwootConversationMessagesPage {
  payload?: ChatwootMessage[];
}

interface ConversationCollectionResult {
  conversations: ChatwootConversation[];
  partialData: boolean;
}

interface ConversationMetaCounts {
  allCount: number;
  unassignedCount: number;
}

interface AtendimentoAgentBucket {
  agentName: string;
  keys: string[];
  newConversations: number;
  activeConversations: number;
  messagesSent: number;
}

interface AtendimentoMessageScanTask {
  conversationId: string;
  fallbackAgentName: string;
  fallbackKeys: string[];
}

interface AtendimentoMessageScanResult {
  agentMessages: number;
  contactMessages: number;
  byAgent: Array<{
    agentName: string;
    keys: string[];
    count: number;
  }>;
}

interface DayWindow {
  startMs: number;
  endMs: number;
}

export interface BradialChatAgentMetric {
  agentName: string;
  role?: string;
  averageSeconds: number;
  compliancePct: number;
  repliedCount: number;
  accent: Accent;
  keys: string[];
}

export interface BradialChatMetricsResult {
  summary: DashboardChatSla;
  byAgent: BradialChatAgentMetric[];
  atendimento: DashboardAtendimento;
}

const DEFAULT_PAGE_LIMIT = 8;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SLA_TARGET_SEC = 300;
const DEFAULT_LOOKBACK_DAYS = 7;
const MINIMUM_PAGE_SIZE_HINT = 25;
const DEFAULT_REQUEST_RETRIES = 2;
const MINIMUM_REPLIED_SAMPLE_SIZE = 5;
const ALEM_TIMEZONE = "America/Sao_Paulo";
const MESSAGE_SCAN_MAX_PAGES = 2;
const MESSAGE_SCAN_MAX_CONVERSATIONS = 80;
const MESSAGE_SCAN_CONCURRENCY = 4;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeAverage(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pluralizeConversations(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.max(0, value));
}

function toEpochMs(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

function formatDurationCompact(valueMs: number | null): string {
  if (valueMs === null || !Number.isFinite(valueMs) || valueMs < 0) {
    return "--";
  }

  const totalSeconds = Math.round(valueMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function accentForSla(averageSeconds: number, targetSeconds: number, compliancePct: number): Accent {
  if (averageSeconds <= targetSeconds && compliancePct >= 82) return "emerald";
  if (averageSeconds <= targetSeconds * 1.35 && compliancePct >= 60) return "amber";
  if (averageSeconds <= targetSeconds * 1.9) return "blue";
  return "rose";
}

function summarizeSampleQuality(
  repliedCount: number,
  partialData: boolean,
): { status: string; accent: Accent } | null {
  if (!repliedCount) {
    return {
      status: partialData ? "SEM AMOSTRA (PARCIAL)" : "SEM AMOSTRA",
      accent: "blue",
    };
  }

  if (partialData || repliedCount < MINIMUM_REPLIED_SAMPLE_SIZE) {
    return {
      status: partialData ? "AMOSTRA PARCIAL" : "AMOSTRA INSUFICIENTE",
      accent: "blue",
    };
  }

  return null;
}

function extractDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 0);
  const day = Number(parts.find((part) => part.type === "day")?.value || 0);
  return { year, month, day };
}

function resolveTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offsetLabel = parts.find((part) => part.type === "timeZoneName")?.value || "GMT+0";
  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);

  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function getTodayWindow(timeZone: string): DayWindow {
  const now = new Date();
  const { year, month, day } = extractDateParts(now, timeZone);
  const utcMidnightMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offsetMinutes = resolveTimeZoneOffsetMinutes(new Date(utcMidnightMs), timeZone);
  const startMs = utcMidnightMs - offsetMinutes * 60_000;
  return {
    startMs,
    endMs: now.getTime(),
  };
}

function isInWindow(valueMs: number | null, window: DayWindow): boolean {
  return valueMs !== null && valueMs >= window.startMs && valueMs < window.endMs;
}

function ratioProgress(numerator: number, denominator: number): number {
  if (denominator <= 0 || numerator <= 0) return 0;
  return clamp(Math.round((numerator / denominator) * 100), 0, 100);
}

function accentFromPressure(ratio: number): Accent {
  if (ratio <= 0.12) return "emerald";
  if (ratio <= 0.28) return "blue";
  if (ratio <= 0.45) return "amber";
  return "rose";
}

function accentFromName(value: string): Accent {
  const normalized = normalizeText(value);
  const accents: Accent[] = ["emerald", "amber", "blue", "violet", "rose"];
  let hash = 0;

  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return accents[hash % accents.length];
}

function buildConfigFileCandidates(): string[] {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const configuredPath = String(process.env.BRADIAL_CHAT_CONFIG_PATH || "").trim();

  return [configuredPath, path.resolve(repoRoot, "../alemdaideia-sync-console/backend/.env")].filter(Boolean);
}

function loadFallbackEnv(): Record<string, string> {
  for (const filePath of buildConfigFileCandidates()) {
    try {
      if (!fs.existsSync(filePath)) continue;
      return parseDotenv(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    } catch {
      continue;
    }
  }
  return {};
}

function resolveEnvValue(key: string, fallbackEnv: Record<string, string>): string {
  return String(process.env[key] || fallbackEnv[key] || "").trim();
}

export function loadBradialChatConfig(): BradialChatConfig | null {
  const fallbackEnv = loadFallbackEnv();
  const baseUrl = resolveEnvValue("BRADIAL_CHAT_BASE_URL", fallbackEnv).replace(/\/+$/, "");
  const apiToken = resolveEnvValue("BRADIAL_CHAT_API_TOKEN", fallbackEnv);
  const accountId = resolveEnvValue("BRADIAL_CHAT_ACCOUNT_ID", fallbackEnv);
  const inboxId = resolveEnvValue("BRADIAL_CHAT_INBOX_ID", fallbackEnv) || null;

  if (!baseUrl || !apiToken || !accountId) {
    return null;
  }

  return {
    baseUrl,
    apiToken,
    accountId,
    inboxId,
    pageLimit: Math.max(
      1,
      Number(resolveEnvValue("BRADIAL_CONVERSATION_SEARCH_PAGES", fallbackEnv) || DEFAULT_PAGE_LIMIT),
    ),
    timeoutMs: Math.max(
      5_000,
      Number(resolveEnvValue("BRADIAL_CHAT_TIMEOUT_MS", fallbackEnv) || DEFAULT_TIMEOUT_MS),
    ),
    slaTargetSec: Math.max(
      30,
      Number(resolveEnvValue("BRADIAL_CHAT_SLA_TARGET_SEC", fallbackEnv) || DEFAULT_SLA_TARGET_SEC),
    ),
    lookbackDays: Math.max(
      1,
      Number(resolveEnvValue("BRADIAL_CHAT_SLA_LOOKBACK_DAYS", fallbackEnv) || DEFAULT_LOOKBACK_DAYS),
    ),
  };
}

function extractConversationPage(payload: unknown): ChatwootConversationPage {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as ChatwootConversationPage;
  }
  return {};
}

function buildAgentKeys(assignee: ChatwootAssignee | undefined): string[] {
  const email = String(assignee?.email || "").trim();
  const emailLocal = email ? email.split("@")[0] : "";
  const values = [
    assignee?.available_name,
    assignee?.name,
    emailLocal.replace(/[._-]+/g, " "),
    email,
  ];

  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function resolveAgentName(assignee: ChatwootAssignee | undefined): string {
  return (
    String(assignee?.available_name || assignee?.name || assignee?.email || "Sem agente").trim() ||
    "Sem agente"
  );
}

async function requestBradialChat<T>(
  config: BradialChatConfig,
  resourcePath: string,
  {
    method = "GET",
    params,
    body,
  }: {
    method?: "GET" | "POST";
    params?: Record<string, string | number>;
    body?: unknown;
  } = {},
): Promise<T> {
  const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

  for (let attempt = 0; attempt <= DEFAULT_REQUEST_RETRIES; attempt += 1) {
    const url = new URL(`${config.baseUrl}${resourcePath}`);
    for (const [key, value] of Object.entries(params || {})) {
      if (value === "" || value === null || value === undefined) continue;
      url.searchParams.append(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          api_access_token: config.apiToken,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        if (attempt < DEFAULT_REQUEST_RETRIES && isRetryableStatus(response.status)) {
          await wait(350 * (attempt + 1));
          continue;
        }
        throw new Error(`Bradial Chat request failed (${response.status}): ${text.slice(0, 220)}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      const isAbortError = error instanceof Error && error.name === "AbortError";
      const isNetworkError = error instanceof TypeError;
      if (attempt < DEFAULT_REQUEST_RETRIES && (isAbortError || isNetworkError)) {
        await wait(350 * (attempt + 1));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Bradial Chat request failed after retries.");
}

async function listConversations(config: BradialChatConfig): Promise<ConversationCollectionResult> {
  const conversations: ChatwootConversation[] = [];
  const seenIds = new Set<string>();
  let totalExpected = 0;
  let partialData = false;

  for (let page = 1; page <= config.pageLimit; page += 1) {
    let payload: ChatwootConversationPage;
    try {
      payload = await requestBradialChat<ChatwootConversationPage>(
        config,
        `/api/v1/accounts/${config.accountId}/conversations/filter`,
        {
          method: "POST",
          params: {
            page,
            status: "all",
            inbox_id: config.inboxId || "",
          },
          body: { payload: [] },
        },
      );
    } catch (error) {
      if (!conversations.length) {
        throw error;
      }
      partialData = true;
      break;
    }

    const pagePayload = extractConversationPage(payload);
    const batch = Array.isArray(pagePayload.payload) ? pagePayload.payload : [];
    if (!batch.length) break;

    for (const conversation of batch) {
      const id = String(conversation.id);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      conversations.push(conversation);
    }

    totalExpected = Number(pagePayload.meta?.all_count || totalExpected || 0);
    if (totalExpected > 0 && conversations.length >= totalExpected) break;
    if (batch.length < MINIMUM_PAGE_SIZE_HINT) break;
  }

  if (totalExpected > 0 && conversations.length < totalExpected) {
    partialData = true;
  }

  return {
    conversations,
    partialData,
  };
}

function extractConversationMetaCounts(payload: unknown): ConversationMetaCounts {
  const page = extractConversationPage(payload);
  return {
    allCount: Number(page.meta?.all_count || 0),
    unassignedCount: Number(page.meta?.open_or_pending_and_unassigned || page.meta?.unassigned_count || 0),
  };
}

async function getConversationMetaCounts(config: BradialChatConfig): Promise<ConversationMetaCounts> {
  const payload = await requestBradialChat<ChatwootConversationPage>(
    config,
    `/api/v1/accounts/${config.accountId}/conversations/filter`,
    {
      method: "POST",
      params: {
        page: 1,
        status: "open",
        inbox_id: config.inboxId || "",
      },
      body: { payload: [] },
    },
  );

  return extractConversationMetaCounts(payload);
}

async function listConversationMessages(
  config: BradialChatConfig,
  conversationId: string,
  maxPages = MESSAGE_SCAN_MAX_PAGES,
): Promise<ChatwootMessage[]> {
  const messages: ChatwootMessage[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await requestBradialChat<ChatwootConversationMessagesPage>(
      config,
      `/api/v1/accounts/${config.accountId}/conversations/${conversationId}/messages`,
      {
        method: "GET",
        params: { page },
      },
    );

    const batch = Array.isArray(payload?.payload) ? payload.payload : [];
    if (!batch.length) break;
    messages.push(...batch);
  }

  return messages;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      try {
        const value = await mapper(items[index]);
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function ensureAtendimentoAgentBucket(
  agentBuckets: Map<string, AtendimentoAgentBucket>,
  agentName: string,
  keys: string[],
): AtendimentoAgentBucket {
  const bucketKey = keys[0] || `agent:${normalizeText(agentName) || "sem-agente"}`;
  const existing = agentBuckets.get(bucketKey);

  if (existing) {
    return existing;
  }

  const created: AtendimentoAgentBucket = {
    agentName,
    keys: [...new Set(keys.filter(Boolean))],
    newConversations: 0,
    activeConversations: 0,
    messagesSent: 0,
  };
  agentBuckets.set(bucketKey, created);
  return created;
}

async function scanConversationMessagesForToday(
  config: BradialChatConfig,
  task: AtendimentoMessageScanTask,
  dayWindow: DayWindow,
): Promise<AtendimentoMessageScanResult> {
  const messages = await listConversationMessages(config, task.conversationId);
  const byAgent = new Map<string, { agentName: string; keys: string[]; count: number }>();
  let agentMessages = 0;
  let contactMessages = 0;

  for (const message of messages) {
    const messageType = Number(message.message_type || 0);
    if (messageType === 2) continue;

    const createdAtMs = toEpochMs(message.created_at);
    if (!isInWindow(createdAtMs, dayWindow)) continue;

    const senderType = normalizeText(message.sender?.type || message.sender_type || "");
    if (senderType === "contact") {
      contactMessages += 1;
      continue;
    }

    if (senderType !== "user") {
      continue;
    }

    agentMessages += 1;
    const senderKeys = buildAgentKeys(message.sender).length ? buildAgentKeys(message.sender) : task.fallbackKeys;
    const senderName = resolveAgentName(message.sender) === "Sem agente" ? task.fallbackAgentName : resolveAgentName(message.sender);
    const key = senderKeys[0] || task.fallbackKeys[0] || `agent:${task.conversationId}`;
    const bucket = byAgent.get(key) || {
      agentName: senderName,
      keys: [...new Set(senderKeys.filter(Boolean))],
      count: 0,
    };
    bucket.count += 1;
    byAgent.set(key, bucket);
  }

  return {
    agentMessages,
    contactMessages,
    byAgent: [...byAgent.values()],
  };
}

function buildNameTokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length >= 3));
}

async function buildAtendimentoSnapshot(
  config: BradialChatConfig,
  conversations: ChatwootConversation[],
  initialPartialData: boolean,
): Promise<DashboardAtendimento> {
  const dayWindow = getTodayWindow(ALEM_TIMEZONE);
  const agentBuckets = new Map<string, AtendimentoAgentBucket>();
  const messageTasks: AtendimentoMessageScanTask[] = [];
  let partialData = initialPartialData;
  let waitingCount = 0;
  let waitingOverOneHour = 0;
  let unreadConversations = 0;
  let unreadMessages = 0;

  for (const conversation of conversations) {
    if (conversation.is_onboarding) continue;
    if (config.inboxId && String(conversation.inbox_id || "") !== config.inboxId) continue;

    const assignee = conversation.meta?.assignee;
    const agentName = resolveAgentName(assignee);
    const agentKeys = buildAgentKeys(assignee);
    const agentBucket = ensureAtendimentoAgentBucket(agentBuckets, agentName, agentKeys);
    const createdAtMs = toEpochMs(conversation.created_at);
    const lastActivityAtMs = toEpochMs(conversation.last_activity_at || conversation.first_reply_created_at || conversation.created_at);
    const status = normalizeText(conversation.status);
    const waitingSinceMs = toEpochMs(conversation.waiting_since);
    const unreadCount = Math.max(0, Number(conversation.unread_count || 0));

    if (isInWindow(createdAtMs, dayWindow)) {
      agentBucket.newConversations += 1;
    }

    const isActiveToday = isInWindow(lastActivityAtMs, dayWindow);
    if (isActiveToday) {
      agentBucket.activeConversations += 1;
    }

    if ((status === "open" || status === "pending") && waitingSinceMs && waitingSinceMs <= dayWindow.endMs) {
      waitingCount += 1;
      if (dayWindow.endMs - waitingSinceMs >= 3_600_000) {
        waitingOverOneHour += 1;
      }
    }

    if (unreadCount > 0) {
      unreadConversations += 1;
      unreadMessages += unreadCount;
    }

    if ((isActiveToday || isInWindow(createdAtMs, dayWindow)) && conversation.id) {
      messageTasks.push({
        conversationId: String(conversation.id),
        fallbackAgentName: agentName,
        fallbackKeys: agentKeys,
      });
    }
  }

  const openMetaResult = await Promise.allSettled([getConversationMetaCounts(config)]);
  const openMeta = openMetaResult[0];

  let openNow =
    openMeta?.status === "fulfilled"
      ? openMeta.value.allCount
      : conversations.filter((conversation) => {
          const status = normalizeText(conversation.status);
          return status === "open" || status === "pending";
        }).length;
  let openUnassignedNow =
    openMeta?.status === "fulfilled"
      ? openMeta.value.unassignedCount
      : conversations.filter((conversation) => {
          const status = normalizeText(conversation.status);
          return (status === "open" || status === "pending") && buildAgentKeys(conversation.meta?.assignee).length === 0;
        }).length;
  const resolvedToday = conversations.filter((conversation) => isInWindow(toEpochMs(conversation.resolved_at), dayWindow)).length;

  if (openMeta?.status === "rejected") {
    partialData = true;
  }

  const limitedTasks = messageTasks.slice(0, MESSAGE_SCAN_MAX_CONVERSATIONS);
  if (limitedTasks.length < messageTasks.length) {
    partialData = true;
  }

  let totalAgentMessages = 0;
  let totalContactMessages = 0;
  if (limitedTasks.length) {
    const messageResults = await mapWithConcurrency(limitedTasks, MESSAGE_SCAN_CONCURRENCY, (task) =>
      scanConversationMessagesForToday(config, task, dayWindow),
    );

    for (const result of messageResults) {
      if (result.status !== "fulfilled") {
        partialData = true;
        continue;
      }

      totalAgentMessages += result.value.agentMessages;
      totalContactMessages += result.value.contactMessages;

      for (const agentMessageBucket of result.value.byAgent) {
        const targetBucket = ensureAtendimentoAgentBucket(
          agentBuckets,
          agentMessageBucket.agentName,
          agentMessageBucket.keys,
        );
        targetBucket.messagesSent += agentMessageBucket.count;
      }
    }
  }

  openNow = Math.max(0, openNow);
  openUnassignedNow = Math.max(0, openUnassignedNow);

  const backlogRows: DashboardAtendimento["backlog"]["rows"] = [
    {
      label: "Fila aguardando",
      note: `${formatInteger(waitingCount)} conversas`,
      progress: ratioProgress(waitingCount, openNow),
      accent: accentFromPressure(openNow > 0 ? waitingCount / openNow : 0),
    },
    {
      label: "Nao lidas",
      note: `${formatInteger(unreadConversations)} conversas • ${formatInteger(unreadMessages)} mensagens`,
      progress: ratioProgress(unreadConversations, openNow),
      accent: accentFromPressure(openNow > 0 ? unreadConversations / openNow : 0),
    },
    {
      label: "Espera acima de 1h",
      note: `${formatInteger(waitingOverOneHour)} conversas`,
      progress: ratioProgress(waitingOverOneHour, waitingCount),
      accent: accentFromPressure(waitingCount > 0 ? waitingOverOneHour / waitingCount : 0),
    },
    {
      label: "Abertas sem agente",
      note: `${formatInteger(openUnassignedNow)} conversas`,
      progress: ratioProgress(openUnassignedNow, openNow),
      accent: accentFromPressure(openNow > 0 ? openUnassignedNow / openNow : 0),
    },
  ];

  const totalNewConversations = [...agentBuckets.values()].reduce((sum, bucket) => sum + bucket.newConversations, 0);
  const totalActiveConversations = [...agentBuckets.values()].reduce((sum, bucket) => sum + bucket.activeConversations, 0);

  const agentRows = [...agentBuckets.values()]
    .filter((bucket) => bucket.messagesSent > 0 || bucket.activeConversations > 0 || bucket.newConversations > 0)
    .sort(
      (left, right) =>
        right.messagesSent - left.messagesSent ||
        right.activeConversations - left.activeConversations ||
        right.newConversations - left.newConversations,
    )
    .slice(0, 8)
    .map((bucket) => ({
      name: bucket.agentName,
      messages: formatInteger(bucket.messagesSent),
      messagesValue: bucket.messagesSent,
      activeConversations: formatInteger(bucket.activeConversations),
      activeConversationsValue: bucket.activeConversations,
      newConversations: formatInteger(bucket.newConversations),
      newConversationsValue: bucket.newConversations,
      accent: accentFromName(bucket.agentName),
    }));

  return {
    title: "Atendimento Bradial",
    status: partialData ? "COLETA PARCIAL" : "ATENDIMENTO AO VIVO",
    note: partialData
      ? "Janela de hoje com parte das conversas e mensagens do atendimento"
      : "Janela de hoje com backlog, mensagens e produtividade por agente",
    metrics: [
      {
        label: "CONVERSAS HOJE",
        value: formatInteger(totalNewConversations),
        note: "criadas desde 00:00",
        accent: "emerald",
      },
      {
        label: "CONVERSAS ATIVAS",
        value: formatInteger(totalActiveConversations),
        note: "com atividade hoje",
        accent: "blue",
      },
      {
        label: "ABERTAS AGORA",
        value: formatInteger(openNow),
        note: `${formatInteger(openUnassignedNow)} sem agente`,
        accent: "amber",
      },
      {
        label: "MSGS ENVIADAS",
        value: formatInteger(totalAgentMessages),
        note: "por agentes hoje",
        accent: "violet",
      },
      {
        label: "MSGS RECEBIDAS",
        value: formatInteger(totalContactMessages),
        note: "de contatos hoje",
        accent: "rose",
      },
      {
        label: "RESOLVIDAS HOJE",
        value: formatInteger(resolvedToday),
        note: "finalizadas na janela",
        accent: "emerald",
      },
    ],
    backlog: {
      title: "Backlog do Atendimento",
      trailing: `OPEN NOW: ${formatInteger(openNow)}`,
      rows: backlogRows,
    },
    agents: {
      title: "Produtividade por Agente",
      columns: ["Agente", "Msgs enviadas", "Ativas", "Novas"],
      rows: agentRows,
    },
  };
}

export function matchBradialAgentMetric(
  squadName: string,
  metrics: BradialChatAgentMetric[],
): BradialChatAgentMetric | null {
  const normalizedSquadName = normalizeText(squadName);
  if (!normalizedSquadName) return null;

  const squadTokens = buildNameTokens(squadName);
  let winner: { score: number; metric: BradialChatAgentMetric } | null = null;

  for (const metric of metrics) {
    let score = 0;
    for (const key of metric.keys) {
      if (!key) continue;
      if (key === normalizedSquadName) score += 100;
      if (normalizedSquadName.includes(key) || key.includes(normalizedSquadName)) score += 40;

      const keyTokens = buildNameTokens(key);
      let sharedTokens = 0;
      for (const token of keyTokens) {
        if (squadTokens.has(token)) sharedTokens += 1;
      }
      score += sharedTokens * 18;
    }

    if (!winner || score > winner.score) {
      winner = { score, metric };
    }
  }

  return winner && winner.score >= 30 ? winner.metric : null;
}

export async function fetchBradialChatMetrics(config: BradialChatConfig): Promise<BradialChatMetricsResult> {
  const now = Date.now();
  const lookbackCutoffMs = now - config.lookbackDays * 86_400_000;
  const { conversations, partialData } = await listConversations(config);
  const repliedDurationsMs: number[] = [];
  const waitingDurationsMs: number[] = [];
  const byAgent = new Map<
    string,
    {
      agentName: string;
      role?: string;
      keys: string[];
      durationsMs: number[];
      withinTarget: number;
    }
  >();

  for (const conversation of conversations) {
    if (conversation.is_onboarding) continue;
    if (config.inboxId && String(conversation.inbox_id || "") !== config.inboxId) continue;

    const createdAtMs = toEpochMs(conversation.created_at);
    if (!createdAtMs || createdAtMs < lookbackCutoffMs) continue;

    const firstReplyAtMs = toEpochMs(conversation.first_reply_created_at);
    if (firstReplyAtMs && firstReplyAtMs >= createdAtMs) {
      const durationMs = Math.max(0, firstReplyAtMs - createdAtMs);
      repliedDurationsMs.push(durationMs);

      const assignee = conversation.meta?.assignee;
      const agentKey = buildAgentKeys(assignee)[0] || `agent:${String(assignee?.id || "na")}`;
      const bucket = byAgent.get(agentKey) || {
        agentName: resolveAgentName(assignee),
        role: assignee?.role,
        keys: buildAgentKeys(assignee),
        durationsMs: [],
        withinTarget: 0,
      };

      bucket.durationsMs.push(durationMs);
      if (durationMs <= config.slaTargetSec * 1000) {
        bucket.withinTarget += 1;
      }
      byAgent.set(agentKey, bucket);
    }

    const status = normalizeText(conversation.status);
    const waitingSinceMs = toEpochMs(conversation.waiting_since);
    if ((status === "open" || status === "pending") && waitingSinceMs && waitingSinceMs <= now) {
      waitingDurationsMs.push(now - waitingSinceMs);
    }
  }

  const atendimento = await buildAtendimentoSnapshot(config, conversations, partialData);
  const combinedPartialData = partialData || atendimento.status === "COLETA PARCIAL";
  const averageReplyMs = repliedDurationsMs.length ? safeAverage(repliedDurationsMs) : null;
  const withinTargetCount = repliedDurationsMs.filter((value) => value <= config.slaTargetSec * 1000).length;
  const compliancePct = repliedDurationsMs.length
    ? Number(
        ((withinTargetCount / repliedDurationsMs.length) * 100).toFixed(1),
      )
    : 0;
  const outsideTargetCount = Math.max(0, repliedDurationsMs.length - withinTargetCount);
  const waitingCount = waitingDurationsMs.length;
  const sampleQuality = summarizeSampleQuality(repliedDurationsMs.length, combinedPartialData);
  const accent =
    sampleQuality?.accent || accentForSla((averageReplyMs || 0) / 1000, config.slaTargetSec, compliancePct);
  const status =
    sampleQuality?.status ||
    (averageReplyMs !== null && averageReplyMs <= config.slaTargetSec * 1000
      ? "MEDIA DENTRO DA META"
      : "MEDIA ACIMA DA META");
  const noteParts = repliedDurationsMs.length
    ? [
        `Amostra: ${pluralizeConversations(repliedDurationsMs.length, "resposta", "respostas")}`,
        `${String(compliancePct).replace(".", ",")}% dentro da meta (${withinTargetCount}/${repliedDurationsMs.length})`,
        outsideTargetCount > 0 ? `${outsideTargetCount} acima de ${formatDurationCompact(config.slaTargetSec * 1000)}` : null,
        combinedPartialData ? "coleta parcial" : repliedDurationsMs.length < MINIMUM_REPLIED_SAMPLE_SIZE ? "base curta" : null,
      ].filter(Boolean)
    : [
        `Sem respostas no periodo de ${config.lookbackDays} dias`,
        waitingCount > 0 ? `${pluralizeConversations(waitingCount, "conversa aguardando", "conversas aguardando")}` : null,
        combinedPartialData ? "coleta parcial" : null,
      ].filter(Boolean);

  const agentMetrics = [...byAgent.values()]
    .filter((bucket) => bucket.durationsMs.length > 0)
    .map((bucket) => {
      const averageSeconds = Math.round(safeAverage(bucket.durationsMs) / 1000);
      const agentCompliance = Number(((bucket.withinTarget / bucket.durationsMs.length) * 100).toFixed(1));
      return {
        agentName: bucket.agentName,
        role: bucket.role,
        averageSeconds,
        compliancePct: agentCompliance,
        repliedCount: bucket.durationsMs.length,
        accent: accentForSla(averageSeconds, config.slaTargetSec, agentCompliance),
        keys: bucket.keys,
      } satisfies BradialChatAgentMetric;
    })
    .sort((left, right) => left.averageSeconds - right.averageSeconds || right.repliedCount - left.repliedCount);

  return {
    summary: {
      title: "SLA Bradial Chat",
      value: formatDurationCompact(averageReplyMs),
      note: noteParts.join(" • "),
      status,
      progress: repliedDurationsMs.length ? clamp(Math.round(compliancePct), 0, 100) : 0,
      accent,
      targetSeconds: config.slaTargetSec,
      averageSeconds: averageReplyMs === null ? undefined : Math.round(averageReplyMs / 1000),
      compliancePct,
      sampleSize: repliedDurationsMs.length,
      partialData: combinedPartialData,
      withinTargetCount,
      outsideTargetCount,
      waitingCount,
    },
    byAgent: agentMetrics,
    atendimento,
  };
}
