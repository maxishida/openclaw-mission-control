"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "@/api/mutator";
import { streamAgentsApiV1AgentsStreamGet } from "@/api/generated/agents/agents";
import { useListActivityApiV1ActivityGet } from "@/api/generated/activity/activity";
import { streamApprovalsApiV1BoardsBoardIdApprovalsStreamGet } from "@/api/generated/approvals/approvals";
import {
  streamBoardMemoryApiV1BoardsBoardIdMemoryStreamGet,
  useListBoardMemoryApiV1BoardsBoardIdMemoryGet,
} from "@/api/generated/board-memory/board-memory";
import {
  type getBoardSnapshotApiV1BoardsBoardIdSnapshotGetResponse,
  useGetBoardSnapshotApiV1BoardsBoardIdSnapshotGet,
} from "@/api/generated/boards/boards";
import { streamTasksApiV1BoardsBoardIdTasksStreamGet } from "@/api/generated/tasks/tasks";
import type {
  ActivityEventRead,
  AgentRead,
  ApprovalRead,
  BoardMemoryRead,
  BoardRead,
  TaskCardRead,
  TaskCommentRead,
  TaskRead,
} from "@/api/generated/model";
import { createExponentialBackoff } from "@/lib/backoff";
import { apiDatetimeToMs } from "@/lib/datetime";
import {
  buildSeededVirtualOfficeEvents,
  deriveVirtualOfficeState,
  mapAgentEvent,
  mapApprovalEvent,
  mapMemoryEvent,
  mapTaskActivityEvent,
  mergeVirtualOfficeEvents,
  mergeTaskCard,
  type VirtualOfficeDerivedState,
  type VirtualOfficeFeedEvent,
} from "@/lib/virtual-office";

const SSE_RECONNECT_BACKOFF = {
  baseMs: 1_000,
  factor: 2,
  jitter: 0.2,
  maxMs: 5 * 60_000,
} as const;

const MAX_LIVE_EVENTS = 60;

const normalizeAgent = (agent: AgentRead): AgentRead => ({
  ...agent,
  status: (agent.status ?? "offline").trim() || "offline",
});

const sortByUpdatedAt = <T extends { updated_at: string }>(items: T[]) =>
  [...items].sort(
    (left, right) =>
      (apiDatetimeToMs(right.updated_at) ?? 0) - (apiDatetimeToMs(left.updated_at) ?? 0),
  );

const sortByCreatedAt = <T extends { created_at: string }>(items: T[]) =>
  [...items].sort(
    (left, right) =>
      (apiDatetimeToMs(right.created_at) ?? 0) - (apiDatetimeToMs(left.created_at) ?? 0),
  );

const latestTimestamp = <T extends { created_at?: string | null; updated_at?: string | null }>(
  items: T[],
) =>
  items.reduce<string | null>((latest, item) => {
    const candidate = item.updated_at ?? item.created_at ?? null;
    if (!candidate) return latest;
    if (!latest) return candidate;
    return (apiDatetimeToMs(candidate) ?? 0) >= (apiDatetimeToMs(latest) ?? 0) ? candidate : latest;
  }, null);

const pushLiveEvent = (
  setEvents: Dispatch<SetStateAction<VirtualOfficeFeedEvent[]>>,
  event: VirtualOfficeFeedEvent | null,
) => {
  if (!event) return;
  setEvents((previous) => {
    const next = [event, ...previous.filter((item) => item.id !== event.id)];
    next.sort(
      (left, right) =>
        (apiDatetimeToMs(right.created_at) ?? 0) - (apiDatetimeToMs(left.created_at) ?? 0),
    );
    return next.slice(0, MAX_LIVE_EVENTS);
  });
};

const consumeSseResponse = async (
  response: Response,
  onEvent: (eventType: string, data: string) => void,
  onHeartbeat?: () => void,
) => {
  if (!response.body) {
    throw new Error("Missing event-stream body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length) {
      onHeartbeat?.();
    }
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");

    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const lines = raw.split("\n");
      let eventType = "message";
      let data = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          data += line.slice(5).trim();
        }
      }

      if (data) {
        onEvent(eventType, data);
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
};

type UseVirtualOfficeBoardStateArgs = {
  boardId: string | null;
  enabled: boolean;
  isPageActive: boolean;
};

type UseVirtualOfficeBoardStateResult = {
  approvals: ApprovalRead[];
  board: BoardRead | null;
  derived: VirtualOfficeDerivedState;
  error: string | null;
  events: VirtualOfficeFeedEvent[];
  isLoading: boolean;
  memoryEntries: BoardMemoryRead[];
  tasks: TaskCardRead[];
};

export function useVirtualOfficeBoardState({
  boardId,
  enabled,
  isPageActive,
}: UseVirtualOfficeBoardStateArgs): UseVirtualOfficeBoardStateResult {
  const snapshotQuery =
    useGetBoardSnapshotApiV1BoardsBoardIdSnapshotGet<
      getBoardSnapshotApiV1BoardsBoardIdSnapshotGetResponse,
      ApiError
    >(boardId ?? "", {
      query: {
        enabled: enabled && Boolean(boardId),
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: 1,
      },
    });

  const notesQuery = useListBoardMemoryApiV1BoardsBoardIdMemoryGet(
    boardId ?? "",
    { is_chat: false, limit: 40 },
    {
      query: {
        enabled: enabled && Boolean(boardId),
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: 1,
      },
    },
  );

  const activityQuery = useListActivityApiV1ActivityGet(
    { limit: 200 },
    {
      query: {
        enabled: enabled && Boolean(boardId),
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: 1,
      },
    },
  );

  const [board, setBoard] = useState<BoardRead | null>(null);
  const [agents, setAgents] = useState<AgentRead[]>([]);
  const [tasks, setTasks] = useState<TaskCardRead[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRead[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<BoardMemoryRead[]>([]);
  const [liveEvents, setLiveEvents] = useState<VirtualOfficeFeedEvent[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);

  const agentsRef = useRef<AgentRead[]>([]);
  const tasksRef = useRef<TaskCardRead[]>([]);
  const approvalsRef = useRef<ApprovalRead[]>([]);
  const memoryEntriesRef = useRef<BoardMemoryRead[]>([]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    approvalsRef.current = approvals;
  }, [approvals]);

  useEffect(() => {
    memoryEntriesRef.current = memoryEntries;
  }, [memoryEntries]);

  useEffect(() => {
    setBoard(null);
    setAgents([]);
    setTasks([]);
    setApprovals([]);
    setMemoryEntries([]);
    setLiveEvents([]);
    setStreamError(null);
  }, [boardId]);

  useEffect(() => {
    if (snapshotQuery.data?.status !== 200) return;
    const snapshot = snapshotQuery.data.data;
    setBoard(snapshot.board ?? null);
    setAgents(sortByUpdatedAt(snapshot.agents.map(normalizeAgent)));
    setTasks(sortByUpdatedAt(snapshot.tasks));
    setApprovals(sortByCreatedAt(snapshot.approvals));
  }, [snapshotQuery.data]);

  useEffect(() => {
    if (notesQuery.data?.status !== 200) return;
    setMemoryEntries(sortByCreatedAt(notesQuery.data.data.items ?? []));
  }, [notesQuery.data]);

  useEffect(() => {
    if (!enabled || !boardId || !isPageActive) return;

    let cancelled = false;
    const abortController = new AbortController();
    const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
    let reconnectTimeout: number | undefined;

    const connect = async () => {
      try {
        const since = latestTimestamp(agentsRef.current);
        const streamResult = await streamAgentsApiV1AgentsStreamGet(
          { board_id: boardId, since: since ?? null },
          {
            headers: { Accept: "text/event-stream" },
            signal: abortController.signal,
          },
        );
        if (streamResult.status !== 200) {
          throw new Error("Unable to connect agent stream.");
        }
        const response = streamResult.data as Response;
        await consumeSseResponse(
          response,
          (eventType, data) => {
            if (eventType !== "agent") return;
            try {
              const payload = JSON.parse(data) as { agent?: AgentRead };
              if (!payload.agent) return;
              const normalized = normalizeAgent(payload.agent);
              const previous =
                agentsRef.current.find((item) => item.id === normalized.id) ?? null;
              pushLiveEvent(setLiveEvents, mapAgentEvent(normalized, previous));
              setAgents((previousAgents) =>
                sortByUpdatedAt([
                  normalized,
                  ...previousAgents.filter((item) => item.id !== normalized.id),
                ]),
              );
            } catch {
              // Ignore malformed payloads.
            }
          },
          () => {
            backoff.reset();
            setStreamError(null);
          },
        );
      } catch {
        setStreamError("Live agent updates are reconnecting.");
      } finally {
        if (!cancelled && !abortController.signal.aborted) {
          reconnectTimeout = window.setTimeout(() => {
            void connect();
          }, backoff.nextDelayMs());
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      abortController.abort();
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
    };
  }, [boardId, enabled, isPageActive]);

  useEffect(() => {
    if (!enabled || !boardId || !isPageActive) return;

    let cancelled = false;
    const abortController = new AbortController();
    const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
    let reconnectTimeout: number | undefined;

    const connect = async () => {
      try {
        const since = latestTimestamp(tasksRef.current);
        const streamResult = await streamTasksApiV1BoardsBoardIdTasksStreamGet(
          boardId,
          since ? { since } : undefined,
          {
            headers: { Accept: "text/event-stream" },
            signal: abortController.signal,
          },
        );
        if (streamResult.status !== 200) {
          throw new Error("Unable to connect task stream.");
        }
        const response = streamResult.data as Response;
        await consumeSseResponse(
          response,
          (eventType, data) => {
            if (eventType !== "task") return;
            try {
              const payload = JSON.parse(data) as {
                activity?: ActivityEventRead;
                comment?: TaskCommentRead;
                task?: TaskRead;
                type?: string;
              };

              let incomingTaskCard: TaskCardRead | null = null;
              if (payload.task) {
                const previousTask = tasksRef.current.find((task) => task.id === payload.task?.id);
                incomingTaskCard = mergeTaskCard(previousTask, payload.task as TaskCardRead);
                setTasks((previousTasks) => {
                  const current = previousTasks.find((task) => task.id === incomingTaskCard?.id);
                  const merged = mergeTaskCard(current, incomingTaskCard as TaskCardRead);
                  return sortByUpdatedAt([
                    merged,
                    ...previousTasks.filter((task) => task.id !== merged.id),
                  ]);
                });
              }

              if (payload.activity) {
                pushLiveEvent(
                  setLiveEvents,
                  mapTaskActivityEvent(
                    payload.activity,
                    incomingTaskCard ??
                      tasksRef.current.find((task) => task.id === payload.activity?.task_id) ??
                      null,
                  ),
                );
              } else if (payload.type === "task.comment" && payload.comment) {
                pushLiveEvent(setLiveEvents, {
                  agent_id: payload.comment.agent_id,
                  created_at: payload.comment.created_at,
                  id: `comment-${payload.comment.id}`,
                  message: payload.comment.message ?? "Task comment added.",
                  source: "task",
                  task_id: payload.comment.task_id,
                  title: "Task comment",
                  tone: "neutral",
                });
              }
            } catch {
              // Ignore malformed payloads.
            }
          },
          () => {
            backoff.reset();
            setStreamError(null);
          },
        );
      } catch {
        setStreamError("Live task updates are reconnecting.");
      } finally {
        if (!cancelled && !abortController.signal.aborted) {
          reconnectTimeout = window.setTimeout(() => {
            void connect();
          }, backoff.nextDelayMs());
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      abortController.abort();
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
    };
  }, [boardId, enabled, isPageActive]);

  useEffect(() => {
    if (!enabled || !boardId || !isPageActive) return;

    let cancelled = false;
    const abortController = new AbortController();
    const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
    let reconnectTimeout: number | undefined;

    const connect = async () => {
      try {
        const since = latestTimestamp(approvalsRef.current);
        const streamResult = await streamApprovalsApiV1BoardsBoardIdApprovalsStreamGet(
          boardId,
          since ? { since } : undefined,
          {
            headers: { Accept: "text/event-stream" },
            signal: abortController.signal,
          },
        );
        if (streamResult.status !== 200) {
          throw new Error("Unable to connect approvals stream.");
        }
        const response = streamResult.data as Response;
        await consumeSseResponse(
          response,
          (eventType, data) => {
            if (eventType !== "approval") return;
            try {
              const payload = JSON.parse(data) as {
                approval?: ApprovalRead;
                pending_approvals_count?: number;
                task_counts?:
                  | {
                      approvals_count?: number;
                      approvals_pending_count?: number;
                      task_id?: string;
                    }
                  | Array<{
                      approvals_count?: number;
                      approvals_pending_count?: number;
                      task_id?: string;
                    }>;
              };
              if (payload.approval) {
                pushLiveEvent(setLiveEvents, mapApprovalEvent(payload.approval));
                setApprovals((previousApprovals) =>
                  sortByCreatedAt([
                    payload.approval as ApprovalRead,
                    ...previousApprovals.filter((item) => item.id !== payload.approval?.id),
                  ]),
                );
              }

              const taskCounts = Array.isArray(payload.task_counts)
                ? payload.task_counts
                : payload.task_counts
                  ? [payload.task_counts]
                  : [];

              if (taskCounts.length > 0) {
                setTasks((previousTasks) =>
                  sortByUpdatedAt(
                    previousTasks.map((task) => {
                      const counts = taskCounts.find((entry) => entry.task_id === task.id);
                      if (!counts) return task;
                      return {
                        ...task,
                        approvals_count: counts.approvals_count ?? task.approvals_count,
                        approvals_pending_count:
                          counts.approvals_pending_count ?? task.approvals_pending_count,
                      };
                    }),
                  ),
                );
              }
            } catch {
              // Ignore malformed payloads.
            }
          },
          () => {
            backoff.reset();
            setStreamError(null);
          },
        );
      } catch {
        setStreamError("Live checkpoint updates are reconnecting.");
      } finally {
        if (!cancelled && !abortController.signal.aborted) {
          reconnectTimeout = window.setTimeout(() => {
            void connect();
          }, backoff.nextDelayMs());
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      abortController.abort();
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
    };
  }, [boardId, enabled, isPageActive]);

  useEffect(() => {
    if (!enabled || !boardId || !isPageActive) return;

    let cancelled = false;
    const abortController = new AbortController();
    const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
    let reconnectTimeout: number | undefined;

    const connect = async () => {
      try {
        const since = latestTimestamp(memoryEntriesRef.current);
        const streamResult = await streamBoardMemoryApiV1BoardsBoardIdMemoryStreamGet(
          boardId,
          { is_chat: false, ...(since ? { since } : {}) },
          {
            headers: { Accept: "text/event-stream" },
            signal: abortController.signal,
          },
        );
        if (streamResult.status !== 200) {
          throw new Error("Unable to connect board memory stream.");
        }
        const response = streamResult.data as Response;
        await consumeSseResponse(
          response,
          (eventType, data) => {
            if (eventType !== "memory") return;
            try {
              const payload = JSON.parse(data) as { memory?: BoardMemoryRead };
              if (!payload.memory) return;
              pushLiveEvent(setLiveEvents, mapMemoryEvent(payload.memory));
              setMemoryEntries((previousEntries) =>
                sortByCreatedAt([
                  payload.memory as BoardMemoryRead,
                  ...previousEntries.filter((item) => item.id !== payload.memory?.id),
                ]),
              );
            } catch {
              // Ignore malformed payloads.
            }
          },
          () => {
            backoff.reset();
            setStreamError(null);
          },
        );
      } catch {
        setStreamError("Board context notes are reconnecting.");
      } finally {
        if (!cancelled && !abortController.signal.aborted) {
          reconnectTimeout = window.setTimeout(() => {
            void connect();
          }, backoff.nextDelayMs());
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      abortController.abort();
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
    };
  }, [boardId, enabled, isPageActive]);

  const activityEvents = useMemo(() => {
    if (!boardId || activityQuery.data?.status !== 200) {
      return [];
    }

    return (activityQuery.data.data.items ?? []).filter((event) => event.board_id === boardId);
  }, [activityQuery.data, boardId]);

  const seededEvents = useMemo(
    () =>
      buildSeededVirtualOfficeEvents({
        activityEvents,
        agents,
        approvals,
        memoryEntries,
        tasks,
      }),
    [activityEvents, agents, approvals, memoryEntries, tasks],
  );

  const events = useMemo(
    () => mergeVirtualOfficeEvents([seededEvents, liveEvents], MAX_LIVE_EVENTS),
    [seededEvents, liveEvents],
  );

  const derived = useMemo(
    () =>
      deriveVirtualOfficeState({
        agents,
        approvals,
        board,
        liveEvents: events,
        memoryEntries,
        tasks,
      }),
    [agents, approvals, board, events, memoryEntries, tasks],
  );

  const error =
    streamError ??
    (snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null) ??
    (notesQuery.error instanceof Error ? notesQuery.error.message : null) ??
    (activityQuery.error instanceof Error ? activityQuery.error.message : null);

  return {
    approvals,
    board,
    derived,
    error,
    events,
    isLoading:
      snapshotQuery.isLoading ||
      (enabled && Boolean(boardId) && !board && snapshotQuery.isFetching),
    memoryEntries,
    tasks,
  };
}
