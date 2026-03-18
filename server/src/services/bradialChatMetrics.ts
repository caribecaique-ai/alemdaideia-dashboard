import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";
import type { DashboardSnapshot } from "../schemas/dashboard.js";

type Accent = DashboardSnapshot["kpis"][number]["accent"];
type DashboardChatSla = NonNullable<DashboardSnapshot["chatSla"]>;

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
  waiting_since?: string | number;
  meta?: {
    assignee?: ChatwootAssignee;
  };
}

interface ChatwootConversationPage {
  meta?: {
    all_count?: number;
  };
  payload?: ChatwootConversation[];
}

interface ConversationCollectionResult {
  conversations: ChatwootConversation[];
  partialData: boolean;
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
}

const DEFAULT_PAGE_LIMIT = 8;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SLA_TARGET_SEC = 300;
const DEFAULT_LOOKBACK_DAYS = 7;
const MINIMUM_PAGE_SIZE_HINT = 25;
const DEFAULT_REQUEST_RETRIES = 2;

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

  return {
    conversations,
    partialData,
  };
}

function buildNameTokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length >= 3));
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

  const averageReplyMs = repliedDurationsMs.length ? safeAverage(repliedDurationsMs) : null;
  const withinTargetCount = repliedDurationsMs.filter((value) => value <= config.slaTargetSec * 1000).length;
  const compliancePct = repliedDurationsMs.length
    ? Number(
        ((withinTargetCount / repliedDurationsMs.length) * 100).toFixed(1),
      )
    : 0;
  const outsideTargetCount = Math.max(0, repliedDurationsMs.length - withinTargetCount);
  const waitingCount = waitingDurationsMs.length;
  const accent = accentForSla((averageReplyMs || 0) / 1000, config.slaTargetSec, compliancePct);
  const status =
    !repliedDurationsMs.length
      ? "SEM AMOSTRA"
      : averageReplyMs !== null && averageReplyMs <= config.slaTargetSec * 1000
        ? "MEDIA DENTRO DA META"
        : "MEDIA ACIMA DA META";
  const noteParts = repliedDurationsMs.length
    ? [
        `${String(compliancePct).replace(".", ",")}% dentro da meta (${withinTargetCount}/${repliedDurationsMs.length})`,
        outsideTargetCount > 0 ? `${outsideTargetCount} acima de ${formatDurationCompact(config.slaTargetSec * 1000)}` : null,
        partialData ? "amostra parcial" : null,
      ].filter(Boolean)
    : [`Sem respostas no periodo de ${config.lookbackDays} dias`, partialData ? "amostra parcial" : null].filter(Boolean);

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
      withinTargetCount,
      outsideTargetCount,
      waitingCount,
    },
    byAgent: agentMetrics,
  };
}
