"use client";

export const dynamic = "force-dynamic";

import { type KeyboardEvent, type MouseEvent, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Info,
  LayoutGrid,
  Shield,
  Sparkles,
  Timer,
} from "lucide-react";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Markdown } from "@/components/atoms/Markdown";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { ApiError } from "@/api/mutator";
import {
  type dashboardMetricsApiV1MetricsDashboardGetResponse,
  useDashboardMetricsApiV1MetricsDashboardGet,
} from "@/api/generated/metrics/metrics";
import {
  gatewaysStatusApiV1GatewaysStatusGet,
} from "@/api/generated/gateways/gateways";
import type { GatewaysStatusResponse } from "@/api/generated/model/gatewaysStatusResponse";
import {
  type listAgentsApiV1AgentsGetResponse,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type listActivityApiV1ActivityGetResponse,
  useListActivityApiV1ActivityGet,
} from "@/api/generated/activity/activity";
import type { ActivityEventRead } from "@/api/generated/model";
import {
  formatRelativeTimestamp,
  formatTimestamp,
  parseTimestamp,
} from "@/lib/formatters";
import { isOpenSquadSyncedBoard } from "@/lib/opensquad-sync";

type SessionSummary = {
  key: string;
  title: string;
  subtitle: string;
  usage: string;
  lastSeenAt: string | null;
  isMain: boolean;
};

type SummaryRow = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
};

type GatewayTarget = {
  gatewayId: string;
  boardId: string;
  boardName: string;
};

type GatewaySnapshot = GatewayTarget & {
  connected: boolean;
  gatewayUrl: string | null;
  sessionsCount: number;
  sessions: unknown[];
  mainSession: unknown | null;
  mainSessionError: string | null;
  error: string | null;
  requestError: string | null;
};

const DASH = "--";
const DASHBOARD_RANGE = "7d";
const DASHBOARD_RANGE_DAYS = 7;
const DASHBOARD_RANGE_LABEL = "7 days";

const numberFormatter = new Intl.NumberFormat("en-US");
const SESSION_ID_KEYS = ["key", "id", "session_key", "sessionKey", "sessionId"];

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const readString = (
  record: Record<string, unknown> | null,
  keys: string[],
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readNumber = (
  record: Record<string, unknown> | null,
  keys: string[],
): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/[^0-9.-]/g, "");
      const parsed = Number.parseFloat(cleaned);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const readStringFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null => {
  for (const record of records) {
    const value = readString(record, keys);
    if (value) return value;
  }
  return null;
};

const readNumberFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): number | null => {
  for (const record of records) {
    const value = readNumber(record, keys);
    if (value !== null) return value;
  }
  return null;
};

const normalizeEpochMs = (value: number): number => {
  if (value >= 1_000_000_000_000) return value;
  if (value >= 1_000_000_000) return value * 1000;
  return value;
};

const readTimestamp = (
  record: Record<string, unknown> | null,
  keys: string[],
): string | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const date = new Date(normalizeEpochMs(value));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const numeric = Number.parseFloat(trimmed);
      if (Number.isFinite(numeric)) {
        const date = new Date(normalizeEpochMs(numeric));
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      }
      const parsed = parseTimestamp(trimmed);
      if (parsed) return parsed.toISOString();
    }
  }
  return null;
};

const readTimestampFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null => {
  for (const record of records) {
    const value = readTimestamp(record, keys);
    if (value) return value;
  }
  return null;
};

const sessionIdentifiers = (record: Record<string, unknown> | null): string[] => {
  if (!record) return [];
  const ids = SESSION_ID_KEYS.map((key) => readString(record, [key])).filter(Boolean) as string[];
  return [...new Set(ids)];
};

const sharesSessionIdentity = (left: string[], right: string[]): boolean =>
  left.some((value) => right.includes(value));

const compactNumber = (value: number): string => {
  if (!Number.isFinite(value)) return DASH;
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return numberFormatter.format(value);
};

const formatCount = (value: number): string =>
  Number.isFinite(value) ? numberFormatter.format(Math.max(0, Math.round(value))) : "0";

const formatPercent = (value: number): string =>
  Number.isFinite(value) ? `${value.toFixed(1)}%` : DASH;

const formatPerDay = (total: number, days: number): string => {
  if (!Number.isFinite(total) || !Number.isFinite(days) || days <= 0) return DASH;
  return `${(total / days).toFixed(1)}/day`;
};

const toSessionSummaries = (
  sessions: unknown[] | null | undefined,
  mainSession: unknown,
): SessionSummary[] => {
  const sessionRecords = (sessions ?? []).map(toRecord).filter(Boolean) as Array<
    Record<string, unknown>
  >;
  const mainRecord = toRecord(mainSession);
  const mainIdentifiers = sessionIdentifiers(mainRecord);

  if (mainRecord && mainIdentifiers.length > 0) {
    const exists = sessionRecords.some(
      (entry) => sharesSessionIdentity(sessionIdentifiers(entry), mainIdentifiers),
    );
    if (!exists) sessionRecords.unshift(mainRecord);
  }

  const uniqueRecords: Record<string, unknown>[] = [];
  const seenIdentifiers = new Set<string>();

  for (const entry of sessionRecords) {
    const identifiers = sessionIdentifiers(entry);
    if (identifiers.length > 0 && identifiers.some((value) => seenIdentifiers.has(value))) {
      continue;
    }
    uniqueRecords.push(entry);
    identifiers.forEach((value) => seenIdentifiers.add(value));
  }

  return uniqueRecords.map((entry, index) => {
    const usageRecord = toRecord(entry.usage);
    const statsRecord = toRecord(entry.stats);
    const metricsRecord = toRecord(entry.metrics);
    const originRecord = toRecord(entry.origin);
    const candidateRecords = [entry, usageRecord, statsRecord, metricsRecord];

    const identifiers = sessionIdentifiers(entry);
    const key =
      readString(entry, ["key", "session_key", "sessionKey", "id", "sessionId"]) ??
      `session-${index}`;
    const label = readString(entry, ["label", "name", "title"]) ?? key;
    const channel = readStringFromRecords([entry, originRecord], [
      "channel",
      "source",
      "kind",
      "chatType",
    ]);
    const model = readString(entry, ["model", "model_name", "provider", "engine"]);
    const modelProvider = readString(entry, ["modelProvider", "model_provider", "provider"]);
    const lastSeenAt = readTimestampFromRecords(candidateRecords, [
      "updated_at",
      "updatedAt",
      "last_updated_at",
      "lastUpdatedAt",
      "last_seen_at",
      "lastSeen",
      "last_seen",
      "last_active_at",
      "lastActiveAt",
      "lastActivityAt",
      "activityAt",
      "created_at",
      "createdAt",
    ]);

    const usedTokens = readNumberFromRecords(candidateRecords, [
      "used",
      "used_tokens",
      "tokens",
      "current",
      "token_count",
      "tokenCount",
      "totalTokens",
      "total_tokens",
      "inputTokens",
      "input_tokens",
    ]);
    const maxTokens = readNumberFromRecords(candidateRecords, [
      "max",
      "limit",
      "token_limit",
      "capacity",
      "max_tokens",
      "maxTokens",
      "context_window",
      "contextWindow",
      "contextTokens",
      "context_tokens",
      "maxContextTokens",
      "max_context_tokens",
    ]);

    const pctFromPayload = readNumberFromRecords(candidateRecords, [
      "pct",
      "percent",
      "ratio_pct",
      "ratioPct",
      "token_pct",
      "usage_pct",
      "percentUsed",
      "contextPercent",
    ]);
    const usagePct = Number.isFinite(pctFromPayload ?? NaN)
      ? Math.max(0, Math.min(100, Math.round(pctFromPayload ?? 0)))
      : usedTokens !== null && maxTokens !== null && maxTokens > 0
        ? Math.max(0, Math.min(100, Math.round((usedTokens / maxTokens) * 100)))
        : 0;

    const usage =
      usedTokens !== null && maxTokens !== null
        ? `${compactNumber(usedTokens)}/${compactNumber(maxTokens)} (${usagePct}%)`
        : usedTokens !== null
          ? `${compactNumber(usedTokens)} tokens`
          : DASH;

    const subtitleBits = [channel, model].filter(Boolean) as string[];
    const subtitle = subtitleBits.length > 0 ? subtitleBits.join(" / ") : "Session";
    const modelWithProvider =
      modelProvider && model && modelProvider !== model ? `${model} / ${modelProvider}` : model;
    const subtitleWithProvider = [channel, modelWithProvider].filter(Boolean).join(" / ");

    return {
      key,
      title: label,
      subtitle: subtitleWithProvider || subtitle,
      usage,
      lastSeenAt,
      isMain:
        mainIdentifiers.length > 0 &&
        sharesSessionIdentity(identifiers, mainIdentifiers),
    };
  });
};

function TopMetricCard({
  title,
  value,
  secondary,
  infoText,
  icon,
  accent,
}: {
  title: string;
  value: string;
  secondary?: string;
  infoText?: string;
  icon: React.ReactNode;
  accent: "blue" | "green" | "violet" | "emerald";
}) {
  const iconTone =
    accent === "blue"
      ? "bg-sky-500/15 text-sky-100 ring-1 ring-sky-400/30"
      : accent === "green"
        ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30"
        : accent === "violet"
          ? "bg-fuchsia-500/15 text-fuchsia-100 ring-1 ring-fuchsia-400/30"
          : "bg-indigo-500/15 text-indigo-100 ring-1 ring-indigo-400/30";

  return (
    <section className="galaxy-card rounded-[28px] p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-400">
              {title}
            </p>
            {infoText ? (
              <span
                className="inline-flex text-slate-500"
                title={infoText}
                aria-label={infoText}
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <p className="font-heading text-4xl font-bold text-white md:text-[2.7rem]">{value}</p>
            {secondary ? (
              <p className="pb-1 text-xs text-slate-400">{secondary}</p>
            ) : null}
          </div>
        </div>
        <div className={`rounded-2xl p-3 shadow-[0_0_30px_rgba(109,13,170,0.12)] ${iconTone}`}>
          {icon}
        </div>
      </div>
      <div className="mt-5 h-px bg-gradient-to-r from-fuchsia-400/30 via-sky-300/25 to-transparent" />
    </section>
  );
}

function InfoBlock({
  title,
  badge,
  infoText,
  rows,
}: {
  title: string;
  badge?: { text: string; tone: "online" | "offline" | "neutral" };
  infoText?: string;
  rows: SummaryRow[];
}) {
  return (
    <section className="galaxy-card rounded-[28px] p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {infoText ? (
            <span
              className="inline-flex text-slate-500"
              title={infoText}
              aria-label={infoText}
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>
        {badge ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
              badge.tone === "online"
                ? "border border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
                : badge.tone === "offline"
                  ? "border border-rose-400/30 bg-rose-500/12 text-rose-200"
                  : "border border-white/10 bg-white/6 text-slate-300"
            }`}
          >
            {badge.text}
          </span>
        ) : null}
      </div>
      <div className="divide-y divide-white/6 rounded-[22px] border border-white/8 bg-white/5">
        {rows.map((row) => (
          <div
            key={`${row.label}-${row.value}`}
            className="flex items-start justify-between gap-3 px-4 py-3"
          >
            <span className="min-w-0 text-sm text-slate-400">{row.label}</span>
            <span
              className={`max-w-[65%] break-words text-right text-sm font-medium leading-5 ${
                row.tone === "success"
                  ? "text-emerald-200"
                  : row.tone === "warning"
                    ? "text-amber-200"
                    : row.tone === "danger"
                      ? "text-rose-200"
                      : "text-slate-100"
              }`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ThroughputSpectrum({
  points,
}: {
  points: Array<{ label?: string | null; value?: number | null }>;
}) {
  const normalizedPoints = points.slice(-7).map((point, index) => ({
    key: `${point.label ?? "point"}-${index}`,
    label: point.label ?? `D${index + 1}`,
    value: Math.max(0, Number(point.value ?? 0)),
  }));
  const maxValue = normalizedPoints.reduce((max, point) => Math.max(max, point.value), 0);

  if (normalizedPoints.length === 0) {
    return (
      <div className="galaxy-subcard flex min-h-[240px] items-center justify-center rounded-[24px] px-6 text-sm text-slate-400">
        Throughput data will light up here once your boards emit production signals.
      </div>
    );
  }

  return (
    <div className="galaxy-subcard rounded-[24px] p-5">
      <div className="grid h-[240px] grid-cols-7 items-end gap-3">
        {normalizedPoints.map((point) => {
          const height = maxValue > 0 ? Math.max(18, (point.value / maxValue) * 100) : 18;
          return (
            <div key={point.key} className="flex h-full flex-col justify-end gap-3">
              <div className="relative flex-1 overflow-hidden rounded-full border border-white/8 bg-[#0c1128]/90">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-fuchsia-500 via-violet-400 to-sky-300 shadow-[0_0_24px_rgba(125,55,200,0.32)] transition-all duration-300"
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-white">{formatCount(point.value)}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                  {point.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  const boardsQuery = useListBoardsApiV1BoardsGet<listBoardsApiV1BoardsGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 30_000,
        refetchOnMount: "always",
      },
    },
  );

  const agentsQuery = useListAgentsApiV1AgentsGet<listAgentsApiV1AgentsGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
      },
    },
  );

  const metricsQuery = useDashboardMetricsApiV1MetricsDashboardGet<
    dashboardMetricsApiV1MetricsDashboardGetResponse,
    ApiError
  >(
    {
      range_key: DASHBOARD_RANGE,
    },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      },
    },
  );

  const activityQuery = useListActivityApiV1ActivityGet<listActivityApiV1ActivityGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 15_000,
        refetchOnMount: "always",
      },
    },
  );

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? [...(boardsQuery.data.data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [boardsQuery.data],
  );

  const agents = useMemo(
    () =>
      agentsQuery.data?.status === 200
        ? [...(agentsQuery.data.data.items ?? [])].sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [agentsQuery.data],
  );

  const metrics = metricsQuery.data?.status === 200 ? metricsQuery.data.data : null;

  const onlineAgents = useMemo(
    () => agents.filter((agent) => (agent.status ?? "").toLowerCase() === "online").length,
    [agents],
  );
  const syncedBoards = useMemo(
    () => boards.filter(isOpenSquadSyncedBoard),
    [boards],
  );
  const staleSyncedBoards = useMemo(
    () =>
      syncedBoards.filter(
        (board) => board.sync_state === "stale" || board.sync_state === "error",
      ).length,
    [syncedBoards],
  );
  const gatewayTargets = useMemo<GatewayTarget[]>(() => {
    const byGateway = new Map<string, GatewayTarget>();
    for (const board of boards) {
      const gatewayId = board.gateway_id;
      if (!gatewayId) continue;
      if (byGateway.has(gatewayId)) continue;
      byGateway.set(gatewayId, {
        gatewayId,
        boardId: board.id,
        boardName: board.name,
      });
    }
    return [...byGateway.values()].sort((a, b) => a.boardName.localeCompare(b.boardName));
  }, [boards]);
  const hasConfiguredGateways = gatewayTargets.length > 0;

  const gatewayStatusesQuery = useQuery<GatewaySnapshot[], ApiError>({
    queryKey: [
      "dashboard",
      "gateway-statuses",
      gatewayTargets.map((target) => `${target.gatewayId}:${target.boardId}`),
    ],
    enabled: Boolean(isSignedIn && hasConfiguredGateways),
    refetchInterval: 15_000,
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      return Promise.all(
        gatewayTargets.map(async (target): Promise<GatewaySnapshot> => {
          try {
            const response = await gatewaysStatusApiV1GatewaysStatusGet(
              { board_id: target.boardId },
              { signal },
            );
            if (response.status !== 200) {
              return {
                ...target,
                connected: false,
                gatewayUrl: null,
                sessionsCount: 0,
                sessions: [],
                mainSession: null,
                mainSessionError: null,
                error: null,
                requestError: `Gateway status request failed (${response.status})`,
              };
            }
            const payload: GatewaysStatusResponse = response.data;
            return {
              ...target,
              connected: Boolean(payload.connected),
              gatewayUrl: payload.gateway_url ?? null,
              sessionsCount: Number(payload.sessions_count ?? 0),
              sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
              mainSession: payload.main_session ?? null,
              mainSessionError: payload.main_session_error ?? null,
              error: payload.error ?? null,
              requestError: null,
            };
          } catch (error) {
            if (signal.aborted) throw error;
            return {
              ...target,
              connected: false,
              gatewayUrl: null,
              sessionsCount: 0,
              sessions: [],
              mainSession: null,
              mainSessionError: null,
              error: null,
              requestError:
                error instanceof Error ? error.message : "Gateway status request failed.",
            };
          }
        }),
      );
    },
  });

  const gatewaySnapshots = useMemo(
    () => gatewayStatusesQuery.data ?? [],
    [gatewayStatusesQuery.data],
  );
  const sessionSummaries = useMemo(
    () =>
      gatewaySnapshots.flatMap((snapshot) => {
        if (snapshot.requestError) return [];
        const sourceLabel = snapshot.gatewayUrl || snapshot.boardName;
        return toSessionSummaries(snapshot.sessions, snapshot.mainSession).map((session) => ({
          ...session,
          key: `${snapshot.gatewayId}:${session.key}`,
          subtitle: `${sourceLabel} / ${session.subtitle}`,
        }));
      }),
    [gatewaySnapshots],
  );

  const activityEvents = useMemo(
    () =>
      activityQuery.data?.status === 200
        ? [...(activityQuery.data.data.items ?? [])]
        : [],
    [activityQuery.data],
  );

  const orderedActivityEvents = useMemo(
    () =>
      [...activityEvents].sort((a, b) => {
        const left = parseTimestamp(a.created_at)?.getTime() ?? 0;
        const right = parseTimestamp(b.created_at)?.getTime() ?? 0;
        return right - left;
      }),
    [activityEvents],
  );

  const recentLogs = orderedActivityEvents.slice(0, 8);

  const throughputPoints = metrics?.throughput.primary.points ?? [];
  const latestThroughputPoint =
    throughputPoints[throughputPoints.length - 1] ?? null;
  const throughputTotal = throughputPoints.reduce(
    (sum, point) => sum + Number(point.value ?? 0),
    0,
  );
  const completionDaysCount = throughputPoints.reduce(
    (sum, point) => sum + (Number(point.value ?? 0) > 0 ? 1 : 0),
    0,
  );

  const inboxTasksMetric = metrics?.kpis.inbox_tasks ?? 0;
  const inProgressTasksMetric = metrics?.kpis.in_progress_tasks ?? 0;
  const reviewTasksMetric = metrics?.kpis.review_tasks ?? 0;
  const doneTasksMetric = metrics?.kpis.done_tasks ?? 0;

  const activeAgentsMetric = onlineAgents;
  const tasksTotal = inboxTasksMetric + inProgressTasksMetric + reviewTasksMetric + doneTasksMetric;
  const tasksInProgressMetric = metrics?.kpis.tasks_in_progress ?? inProgressTasksMetric;
  const errorRateMetric = Number(metrics?.kpis.error_rate_pct ?? 0);
  const reviewBacklogRatio =
    inProgressTasksMetric > 0 ? reviewTasksMetric / inProgressTasksMetric : null;

  const gatewayConnectedCount = gatewaySnapshots.filter(
    (snapshot) => !snapshot.requestError && snapshot.connected,
  ).length;
  const gatewayDisconnectedCount = gatewaySnapshots.filter(
    (snapshot) => !snapshot.requestError && !snapshot.connected,
  ).length;
  const gatewayUnavailableCount = gatewaySnapshots.filter(
    (snapshot) => Boolean(snapshot.requestError),
  ).length;
  const gatewayHealthErrorCount = gatewaySnapshots.filter(
    (snapshot) => Boolean(snapshot.error || snapshot.mainSessionError),
  ).length;

  const countedSessions = gatewaySnapshots.reduce(
    (sum, snapshot) => sum + Math.max(0, snapshot.sessionsCount),
    0,
  );
  const activeSessions = Math.max(countedSessions, sessionSummaries.length);

  const gatewayStatusLabel = !hasConfiguredGateways
    ? "Not configured"
    : gatewayStatusesQuery.isLoading
      ? "Checking"
      : gatewayConnectedCount === gatewayTargets.length
        ? "All connected"
        : gatewayConnectedCount > 0
          ? "Partially connected"
          : gatewayUnavailableCount === gatewayTargets.length
            ? "Unavailable"
            : "Disconnected";
  const gatewayBadgeTone: "online" | "offline" | "neutral" =
    gatewayStatusLabel === "All connected"
      ? "online"
      : gatewayStatusLabel === "Partially connected" ||
          gatewayStatusLabel === "Disconnected" ||
          gatewayStatusLabel === "Unavailable"
        ? "offline"
        : "neutral";
  const gatewayStatusTone: SummaryRow["tone"] =
    gatewayStatusLabel === "All connected"
      ? "success"
      : gatewayStatusLabel === "Checking" || gatewayStatusLabel === "Not configured"
        ? "default"
        : gatewayStatusLabel === "Partially connected" || gatewayStatusLabel === "Disconnected"
          ? "warning"
          : "danger";

  const workloadRows: SummaryRow[] = [
    {
      label: "OpenSquad synced boards",
      value: formatCount(syncedBoards.length),
      tone: syncedBoards.length > 0 ? "success" : "default",
    },
    {
      label: "Stale or errored syncs",
      value: formatCount(staleSyncedBoards),
      tone: staleSyncedBoards > 0 ? "warning" : "success",
    },
    {
      label: "Total work items",
      value: formatCount(tasksTotal),
    },
    {
      label: "Inbox",
      value: formatCount(inboxTasksMetric),
    },
    {
      label: "In progress",
      value: formatCount(inProgressTasksMetric),
      tone: inProgressTasksMetric > 0 ? "warning" : "default",
    },
    {
      label: "In review",
      value: formatCount(reviewTasksMetric),
    },
    {
      label: "Completed",
      value: formatCount(doneTasksMetric),
      tone: doneTasksMetric > 0 ? "success" : "default",
    },
  ];

  const throughputRows: SummaryRow[] = [
    {
      label: "Completed tasks",
      value: formatCount(throughputTotal),
    },
    { label: "Average throughput", value: formatPerDay(throughputTotal, DASHBOARD_RANGE_DAYS) },
    {
      label: "Error rate",
      value: formatPercent(errorRateMetric),
      tone: errorRateMetric > 0 ? "warning" : "success",
    },
    {
      label: "Completion consistency",
      value: `${formatCount(completionDaysCount)} active days`,
      tone: completionDaysCount >= Math.ceil(DASHBOARD_RANGE_DAYS * 0.75) ? "success" : "default",
    },
    {
      label: "Review backlog ratio",
      value:
        reviewBacklogRatio !== null
          ? `${reviewBacklogRatio.toFixed(2)}x`
          : reviewTasksMetric > 0
            ? "inf"
            : "0.00x",
      tone:
        reviewBacklogRatio !== null
          ? reviewBacklogRatio > 1
            ? "warning"
            : "success"
          : reviewTasksMetric > 0
            ? "warning"
            : "success",
    },
  ];

  const gatewayRows: SummaryRow[] = [
    { label: "Gateway status", value: gatewayStatusLabel, tone: gatewayStatusTone },
    { label: "Configured gateways", value: formatCount(gatewayTargets.length) },
    {
      label: "Connected gateways",
      value: formatCount(gatewayConnectedCount),
      tone: gatewayConnectedCount > 0 ? "success" : "default",
    },
    {
      label: "Unavailable gateways",
      value: formatCount(gatewayUnavailableCount),
      tone: gatewayUnavailableCount > 0 ? "danger" : "default",
    },
    {
      label: "Gateways with issues",
      value: formatCount(gatewayHealthErrorCount + gatewayDisconnectedCount),
      tone: gatewayHealthErrorCount + gatewayDisconnectedCount > 0 ? "warning" : "success",
    },
  ];
  const pendingApprovalItems = metrics?.pending_approvals.items ?? [];
  const pendingApprovalsTotal = metrics?.pending_approvals.total ?? 0;
  const hasPendingApprovals = pendingApprovalItems.length > 0;
  const activityFeedHref = "/activity";

  const shouldIgnoreRowNavigation = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("a"));
  };

  const buildActivityEventHref = (event: ActivityEventRead): string => {
    const routeName = event.route_name ?? null;
    const routeParams = event.route_params ?? {};

    if (routeName === "board.approvals") {
      const boardId = routeParams.boardId;
      if (boardId) {
        return `/boards/${encodeURIComponent(boardId)}/approvals`;
      }
    }

    if (routeName === "board") {
      const boardId = routeParams.boardId;
      if (boardId) {
        const params = new URLSearchParams();
        Object.entries(routeParams).forEach(([key, value]) => {
          if (key !== "boardId") params.set(key, value);
        });
        const query = params.toString();
        return query
          ? `/boards/${encodeURIComponent(boardId)}?${query}`
          : `/boards/${encodeURIComponent(boardId)}`;
      }
    }

    const params = new URLSearchParams(
      Object.keys(routeParams).length > 0
        ? routeParams
        : {
            eventId: event.id,
            eventType: event.event_type,
            createdAt: event.created_at,
          },
    );
    if (event.task_id && !params.has("taskId")) {
      params.set("taskId", event.task_id);
    }
    return `${activityFeedHref}?${params.toString()}`;
  };

  const navigateToActivityFeed = (href: string) => {
    router.push(href);
  };

  const handleLogRowClick = (
    event: MouseEvent<HTMLDivElement>,
    href: string,
  ) => {
    if (shouldIgnoreRowNavigation(event.target)) return;
    navigateToActivityFeed(href);
  };

  const handleLogRowKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    href: string,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (shouldIgnoreRowNavigation(event.target)) return;
    event.preventDefault();
    navigateToActivityFeed(href);
  };

  return (
    <DashboardShell>
      <SignedOut>
        <SignedOutPanel
          message="Sign in to access the dashboard."
          forceRedirectUrl="/onboarding"
          signUpForceRedirectUrl="/onboarding"
        />
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="galaxy-main flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-4 md:p-8">
            {metricsQuery.error ? (
              <div className="mb-6 rounded-[24px] border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 backdrop-blur-xl">
                Load failed: {metricsQuery.error.message}
              </div>
            ) : null}

            <section className="galaxy-panel galaxy-grid galaxy-noise rounded-[34px] p-6 md:p-8">
              <div
                className="absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_center,rgba(125,55,200,0.22),transparent_65%)] blur-3xl"
                aria-hidden="true"
              />
              <div className="relative grid gap-6 xl:grid-cols-[1.15fr_0.95fr]">
                <div>
                  <div className="galaxy-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-violet-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Of The Galaxy
                  </div>
                  <h1 className="mt-5 max-w-3xl font-heading text-4xl font-semibold leading-tight text-white md:text-5xl">
                    Deep-space mission control for agents, approvals, and gateway telemetry.
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                    A neon command surface tuned for live operations. Track workload, throughput,
                    sessions, and fleet health from one premium glass control deck.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <div className="galaxy-chip rounded-full px-4 py-2 text-sm text-slate-100">
                      {formatCount(activeAgentsMetric)} agents online
                    </div>
                    <div className="galaxy-chip rounded-full px-4 py-2 text-sm text-slate-100">
                      {gatewayStatusLabel}
                    </div>
                    <div className="galaxy-chip rounded-full px-4 py-2 text-sm text-slate-100">
                      {formatCount(pendingApprovalsTotal)} approvals in orbit
                    </div>
                    <div className="galaxy-chip rounded-full px-4 py-2 text-sm text-slate-100">
                      {formatCount(syncedBoards.length)} OpenSquad boards synced
                    </div>
                    {staleSyncedBoards > 0 ? (
                      <div className="galaxy-chip rounded-full px-4 py-2 text-sm text-amber-100">
                        {formatCount(staleSyncedBoards)} syncs need attention
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <div className="galaxy-subcard rounded-[24px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        Live boards
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-white">{formatCount(boards.length)}</p>
                      <p className="mt-2 text-sm text-slate-400">
                        Connected workflows and review lanes mapped into a single command grid.
                      </p>
                    </div>
                    <div className="galaxy-subcard rounded-[24px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        Active sessions
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-white">{formatCount(activeSessions)}</p>
                      <p className="mt-2 text-sm text-slate-400">
                        Operator and gateway sessions visible with main-line telemetry.
                      </p>
                    </div>
                    <div className="galaxy-subcard rounded-[24px] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        Review velocity
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-white">
                        {formatPerDay(throughputTotal, DASHBOARD_RANGE_DAYS)}
                      </p>
                      <p className="mt-2 text-sm text-slate-400">
                        Completion pace measured across the latest {DASHBOARD_RANGE_LABEL}.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <Link
                      href="/activity"
                      className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/14 px-4 py-2 text-sm font-medium text-fuchsia-50 transition duration-300 hover:scale-[1.02] hover:border-fuchsia-300/50 hover:bg-fuchsia-500/20"
                    >
                      Open live feed
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/boards"
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-slate-100 transition duration-300 hover:scale-[1.02] hover:border-sky-300/30 hover:bg-white/10"
                    >
                      Open command boards
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                    <Link
                      href="/virtual-office"
                      className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-50 transition duration-300 hover:scale-[1.02] hover:border-cyan-200/35 hover:bg-cyan-500/16"
                    >
                      Open Virtual Office
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                <section className="galaxy-card rounded-[30px] p-5 md:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                        Throughput Spectrum
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        Completion pulse across the latest orbit
                      </h2>
                    </div>
                    <div className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-right">
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Latest burst</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {formatCount(Number(latestThroughputPoint?.value ?? 0))}
                      </p>
                    </div>
                  </div>
                  <ThroughputSpectrum points={throughputPoints} />
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="galaxy-subcard rounded-[22px] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Range</p>
                      <p className="mt-2 text-base font-semibold text-white">{DASHBOARD_RANGE_LABEL}</p>
                    </div>
                    <div className="galaxy-subcard rounded-[22px] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                        Error rate
                      </p>
                      <p className="mt-2 text-base font-semibold text-white">{formatPercent(errorRateMetric)}</p>
                    </div>
                    <div className="galaxy-subcard rounded-[22px] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                        Active days
                      </p>
                      <p className="mt-2 text-base font-semibold text-white">
                        {formatCount(completionDaysCount)}
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <TopMetricCard
                title="Online Agents"
                value={formatCount(activeAgentsMetric)}
                secondary={`${formatCount(agents.length)} total`}
                icon={<Bot className="h-4 w-4" />}
                accent="blue"
              />
              <TopMetricCard
                title="Tasks In Progress"
                value={formatCount(tasksInProgressMetric)}
                secondary={`${formatCount(tasksTotal)} total`}
                icon={<LayoutGrid className="h-4 w-4" />}
                accent="green"
              />
              <TopMetricCard
                title="Error Rate"
                value={formatPercent(errorRateMetric)}
                secondary={`${formatCount(Number(latestThroughputPoint?.value ?? 0))} completed latest`}
                icon={<Activity className="h-4 w-4" />}
                accent="violet"
              />
              <TopMetricCard
                title="Completion Speed"
                value={formatPerDay(throughputTotal, DASHBOARD_RANGE_DAYS)}
                secondary={`${formatCount(throughputTotal)} completed`}
                infoText={`Based on ${DASHBOARD_RANGE_LABEL}`}
                icon={<Timer className="h-4 w-4" />}
                accent="emerald"
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
              <InfoBlock title="Workload" rows={workloadRows} />
              <InfoBlock
                title="Throughput"
                infoText={`All throughput values are calculated for ${DASHBOARD_RANGE_LABEL}`}
                rows={throughputRows}
              />
              <InfoBlock
                title="Gateway Health"
                badge={{
                  text: gatewayStatusLabel,
                  tone: gatewayBadgeTone,
                }}
                rows={gatewayRows}
              />
            </div>

            <section className="galaxy-card mt-6 rounded-[30px] p-5 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    Approval Queue
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Pending Approvals</h3>
                </div>
                <Link
                  href="/approvals"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-medium text-slate-200 transition duration-300 hover:border-fuchsia-400/30 hover:bg-white/10 hover:text-white"
                >
                  Open global approvals
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {!metrics && metricsQuery.isLoading ? (
                <div className="galaxy-subcard rounded-[22px] p-4 text-sm text-slate-400">
                  Loading pending approvals...
                </div>
              ) : !metrics && metricsQuery.error ? (
                <div className="rounded-[22px] border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Pending approvals are temporarily unavailable.
                </div>
              ) : hasPendingApprovals ? (
                <div className="space-y-3">
                  <div className="divide-y divide-white/6 overflow-hidden rounded-[24px] border border-white/8 bg-white/5">
                    {pendingApprovalItems.map((item) => (
                      <Link
                        key={item.approval_id}
                        href={`/boards/${item.board_id}/approvals`}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition duration-300 hover:bg-white/6"
                      >
                        <span className="min-w-0 text-sm text-slate-300">
                          <span className="block truncate font-medium text-white">
                            {item.task_title || "Pending approval"}
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {item.board_name} / {item.confidence}% score
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {formatRelativeTimestamp(item.created_at)}
                        </span>
                      </Link>
                    ))}
                  </div>
                  {pendingApprovalsTotal > pendingApprovalItems.length ? (
                    <p className="text-xs text-slate-400">
                      Showing latest {formatCount(pendingApprovalItems.length)} of{" "}
                      {formatCount(pendingApprovalsTotal)} pending approvals.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[22px] border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  No pending approvals across your boards.
                </div>
              )}
            </section>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <section className="galaxy-card min-w-0 overflow-hidden rounded-[30px] p-5 md:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Session Lattice
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Sessions</h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs text-slate-300">
                    {formatCount(activeSessions)}
                  </span>
                </div>
                <div className="galaxy-scrollbar max-h-[340px] space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                  {!hasConfiguredGateways ? (
                    <div className="galaxy-subcard rounded-[22px] p-4 text-sm text-slate-400">
                      No gateways are configured for any board yet.
                    </div>
                  ) : gatewayStatusesQuery.isLoading ? (
                    <div className="galaxy-subcard rounded-[22px] p-4 text-sm text-slate-400">
                      Loading sessions...
                    </div>
                  ) : sessionSummaries.length > 0 ? (
                    <>
                      {gatewayUnavailableCount > 0 ? (
                        <div className="rounded-[22px] border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                          {formatCount(gatewayUnavailableCount)} gateway
                          {gatewayUnavailableCount === 1 ? "" : "s"} unavailable; showing sessions
                          from reachable gateways.
                        </div>
                      ) : null}
                      {sessionSummaries.map((session) => (
                        <div
                          key={session.key}
                          className="galaxy-subcard rounded-[22px] px-4 py-3 transition duration-300 hover:border-fuchsia-400/20 hover:bg-white/6"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-white">
                                <span
                                  className={`mr-2 inline-block h-2 w-2 rounded-full ${
                                    session.isMain ? "bg-emerald-400" : "bg-slate-500"
                                  }`}
                                />
                                {session.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-slate-400">
                                {session.subtitle}
                              </p>
                            </div>
                            <div className="min-w-0 max-w-[45%] text-right">
                              <p className="truncate text-xs font-medium text-slate-200">
                                {session.usage === DASH ? "Usage unavailable" : session.usage}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {session.lastSeenAt
                                  ? formatRelativeTimestamp(session.lastSeenAt)
                                  : "Activity unavailable"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : gatewayUnavailableCount === gatewayTargets.length ? (
                    <div className="rounded-[22px] border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-100">
                      Session data is unavailable for all configured gateways.
                    </div>
                  ) : (
                    <div className="galaxy-subcard rounded-[22px] p-4 text-sm text-slate-400">
                      No active sessions detected.
                    </div>
                  )}
                </div>
              </section>

              <section className="galaxy-card min-w-0 overflow-hidden rounded-[30px] p-5 md:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Event Constellation
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">Recent Activity</h3>
                  </div>
                  <Link
                    href={activityFeedHref}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs font-medium text-slate-200 transition duration-300 hover:border-sky-400/30 hover:bg-white/10 hover:text-white"
                  >
                    Open feed
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="galaxy-scrollbar max-h-[340px] space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                  {recentLogs.length > 0 ? (
                    recentLogs.map((event) => {
                      const eventHref = buildActivityEventHref(event);
                      return (
                        <div
                          key={event.id}
                          role="link"
                          tabIndex={0}
                          aria-label={`Open related context for ${event.event_type} activity`}
                          onClick={(interactionEvent) =>
                            handleLogRowClick(interactionEvent, eventHref)
                          }
                          onKeyDown={(interactionEvent) =>
                            handleLogRowKeyDown(interactionEvent, eventHref)
                          }
                          className="galaxy-subcard cursor-pointer rounded-[22px] px-4 py-3 transition duration-300 hover:border-fuchsia-400/25 hover:bg-white/6 focus-visible:border-fuchsia-300/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/30"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="break-words text-sm font-medium text-slate-100 [&_ol]:mb-0 [&_p]:mb-0 [&_pre]:my-1 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_ul]:mb-0">
                                <Markdown
                                  content={event.message?.trim() || event.event_type}
                                  variant="comment"
                                />
                              </div>
                              <p className="mt-1 text-[11px] uppercase tracking-[0.26em] text-slate-500">
                                {event.event_type}
                              </p>
                            </div>
                            <div className="shrink-0 text-right text-[11px] text-slate-500">
                              <p>{formatRelativeTimestamp(event.created_at)}</p>
                              <p>{formatTimestamp(event.created_at)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="galaxy-subcard flex h-[240px] flex-col items-center justify-center rounded-[24px] text-sm text-slate-400">
                      <Shield className="mb-2 h-5 w-5 text-slate-500" />
                      No activity yet
                      <p className="mt-1 text-xs text-slate-500">
                        Activity appears here when events are emitted.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}
