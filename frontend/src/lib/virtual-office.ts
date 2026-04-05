import type {
  ActivityEventRead,
  AgentRead,
  ApprovalRead,
  BoardMemoryRead,
  BoardRead,
  TaskCardRead,
} from "@/api/generated/model";
import { AGENT_EMOJI_GLYPHS } from "@/lib/agent-emoji";
import { apiDatetimeToMs } from "@/lib/datetime";

export type VirtualOfficeAgentStatus =
  | "idle"
  | "working"
  | "delivering"
  | "done"
  | "checkpoint"
  | "retry"
  | "error"
  | "monitoring";

export type VirtualOfficeLane =
  | "lead"
  | "research"
  | "build"
  | "review"
  | "publish"
  | "monitor";

export type VirtualOfficeFeedEvent = {
  id: string;
  created_at: string;
  title: string;
  message: string;
  tone: "neutral" | "info" | "warning" | "danger" | "success";
  source: "agent" | "task" | "approval" | "memory";
  agent_id?: string | null;
  task_id?: string | null;
  event_type?: string | null;
};

type NullableFeedEvent = VirtualOfficeFeedEvent | null | undefined;

export type VirtualOfficeHandoff = {
  created_at: string;
  from: string;
  from_agent_id: string | null;
  message: string;
  to: string;
  to_agent_id: string | null;
};

export type VirtualOfficeAgentView = {
  active_task_count: number;
  agent: AgentRead;
  deliver_to?: string | null;
  glyph: string;
  id: string;
  is_lead: boolean;
  lane: VirtualOfficeLane;
  name: string;
  role: string;
  status: VirtualOfficeAgentStatus;
  task_count: number;
  task_label?: string | null;
};

export type VirtualOfficePipelineSummary = {
  current: number;
  handoff: VirtualOfficeHandoff | null;
  phase: string;
  quality_gate_status: "approved" | "retry_required" | "blocked" | "pending" | null;
  retries: number;
  score: number | null;
  status: "idle" | "running" | "checkpoint" | "done";
  step_label: string | null;
  total: number;
};

export type VirtualOfficeSignals = {
  active_count: number;
  attention_count: number;
  completed_count: number;
  delivery_count: number;
  notification_count: number;
  watching_count: number;
};

export type VirtualOfficeDerivedState = {
  agents: VirtualOfficeAgentView[];
  attention_agents: VirtualOfficeAgentView[];
  handoff: VirtualOfficeHandoff | null;
  pipeline: VirtualOfficePipelineSummary;
  signals: VirtualOfficeSignals;
};

export type VirtualOfficeLayoutAgent = {
  agent: VirtualOfficeAgentView;
  centerX: number;
  centerY: number;
  index: number;
  scale: number;
  x: number;
  y: number;
};

export type VirtualOfficeStageLayout = {
  floorH: number;
  floorW: number;
  floorX: number;
  floorY: number;
  positionedAgents: VirtualOfficeLayoutAgent[];
  stageH: number;
  stageW: number;
};

const DEFAULT_STAGE_W = 920;
const DEFAULT_STAGE_H = 540;

const OFFICE_STATUS_PRIORITY: Record<VirtualOfficeAgentStatus, number> = {
  error: 0,
  retry: 1,
  checkpoint: 2,
  delivering: 3,
  working: 4,
  monitoring: 5,
  done: 6,
  idle: 7,
};

const LANE_ORDER: VirtualOfficeLane[] = [
  "lead",
  "research",
  "build",
  "review",
  "publish",
  "monitor",
];

const LANE_ANCHORS: Record<VirtualOfficeLane, { x: number; y: number }> = {
  lead: { x: 0.18, y: 0.22 },
  research: { x: 0.18, y: 0.56 },
  build: { x: 0.5, y: 0.34 },
  review: { x: 0.8, y: 0.3 },
  publish: { x: 0.8, y: 0.58 },
  monitor: { x: 0.5, y: 0.74 },
};

const normalizeRuntimeStatus = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

const normalizeName = (value?: string | null) =>
  (value ?? "").trim().toLowerCase();

const profileRecord = (agent: AgentRead): Record<string, unknown> | null => {
  if (!agent.identity_profile || typeof agent.identity_profile !== "object") {
    return null;
  }
  return agent.identity_profile as Record<string, unknown>;
};

const profileString = (agent: AgentRead, key: string): string | null => {
  const record = profileRecord(agent);
  const value = record?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const agentInitials = (agent: AgentRead): string => {
  const parts = agent.name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "AG";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

const resolveEmoji = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (AGENT_EMOJI_GLYPHS[trimmed]) return AGENT_EMOJI_GLYPHS[trimmed];
  if (trimmed.startsWith(":") && trimmed.endsWith(":")) return null;
  return trimmed;
};

export const resolveOfficeAgentGlyph = (agent: AgentRead): string => {
  if (agent.is_board_lead) return "LD";
  return resolveEmoji(profileString(agent, "emoji")) ?? agentInitials(agent);
};

export const resolveOfficeAgentRole = (agent: AgentRead): string => {
  const configuredRole = profileString(agent, "role");
  if (configuredRole) return configuredRole;
  if (agent.is_board_lead) return "Lead agent";
  return "Board agent";
};

const laneKeywords = (agent: AgentRead): string => {
  const role = resolveOfficeAgentRole(agent);
  return `${agent.id} ${agent.name} ${role}`.toLowerCase();
};

export const classifyOfficeLane = (agent: AgentRead): VirtualOfficeLane => {
  const keywords = laneKeywords(agent);
  if (agent.is_board_lead || keywords.includes("chief") || keywords.includes("orchestrator")) {
    return "lead";
  }
  if (
    keywords.includes("scout") ||
    keywords.includes("research") ||
    keywords.includes("trend") ||
    keywords.includes("news") ||
    keywords.includes("intake")
  ) {
    return "research";
  }
  if (
    keywords.includes("review") ||
    keywords.includes("quality") ||
    keywords.includes("qa") ||
    keywords.includes("approve")
  ) {
    return "review";
  }
  if (
    keywords.includes("publish") ||
    keywords.includes("social") ||
    keywords.includes("distribution") ||
    keywords.includes("release") ||
    keywords.includes("seo")
  ) {
    return "publish";
  }
  if (keywords.includes("monitor") || keywords.includes("ops") || keywords.includes("watch")) {
    return "monitor";
  }
  return "build";
};

const matchesTask = (agent: AgentRead, task: TaskCardRead): boolean => {
  if (task.assigned_agent_id && task.assigned_agent_id === agent.id) return true;
  if (task.assignee && normalizeName(task.assignee) === normalizeName(agent.name)) return true;
  return false;
};

const approvalTaskIds = (approval: ApprovalRead): string[] => {
  const ids = new Set<string>();
  if (approval.task_id) ids.add(approval.task_id);
  (approval.task_ids ?? []).forEach((taskId) => {
    if (taskId) ids.add(taskId);
  });
  return [...ids];
};

const sortNewestFirst = <T extends { created_at: string }>(items: T[]): T[] =>
  [...items].sort(
    (left, right) =>
      (apiDatetimeToMs(right.created_at) ?? 0) - (apiDatetimeToMs(left.created_at) ?? 0),
  );

const uniqueById = <T extends { id: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const latestTaskLabel = (tasks: TaskCardRead[]): string | null => {
  const current =
    tasks.find((task) => task.status === "in_progress") ??
    tasks.find((task) => task.status === "review") ??
    tasks.find((task) => task.status === "inbox") ??
    sortNewestFirst(tasks)[0] ??
    null;
  return current?.title ?? null;
};

const averageConfidence = (approvals: ApprovalRead[]): number | null => {
  if (approvals.length === 0) return null;
  const total = approvals.reduce((sum, approval) => sum + approval.confidence, 0);
  return Math.round(total / approvals.length);
};

const completionScore = (tasks: TaskCardRead[]): number | null => {
  if (tasks.length === 0) return null;
  const done = tasks.filter((task) => task.status === "done").length;
  return Math.round((done / tasks.length) * 100);
};

const containsHandoffKeyword = (value: string): boolean =>
  /\b(handoff|route|transfer|delegate|delivery)\b/i.test(value);

const detectNamedAgent = (value: string, agents: AgentRead[], excludeId?: string | null): AgentRead | null => {
  const content = value.toLowerCase();
  for (const agent of agents) {
    if (excludeId && agent.id === excludeId) continue;
    if (content.includes(agent.name.toLowerCase())) {
      return agent;
    }
  }
  return null;
};

export const extractVirtualOfficeHandoff = (
  memoryEntries: BoardMemoryRead[],
  liveEvents: VirtualOfficeFeedEvent[],
  agents: AgentRead[],
): VirtualOfficeHandoff | null => {
  const candidates = sortNewestFirst(
    uniqueById([
      ...memoryEntries
        .filter((entry) => {
          const tags = entry.tags ?? [];
          return tags.includes("handoff") || containsHandoffKeyword(entry.content);
        })
        .map((entry) => ({
          id: entry.id,
          created_at: entry.created_at,
          message: entry.content,
          source: entry.source ?? "",
        })),
      ...liveEvents
        .filter((event) => containsHandoffKeyword(event.message))
        .map((event) => ({
          id: event.id,
          created_at: event.created_at,
          message: event.message,
          source:
            agents.find((agent) => agent.id === event.agent_id)?.name ??
            event.title ??
            "",
        })),
    ]),
  );

  for (const candidate of candidates) {
    const sourceAgent =
      agents.find((agent) => normalizeName(agent.name) === normalizeName(candidate.source)) ??
      detectNamedAgent(candidate.source, agents) ??
      detectNamedAgent(candidate.message, agents);
    const targetAgent = detectNamedAgent(candidate.message, agents, sourceAgent?.id ?? null);
    if (!sourceAgent && !targetAgent) continue;

    return {
      created_at: candidate.created_at,
      from: sourceAgent?.name ?? candidate.source ?? "Lead agent",
      from_agent_id: sourceAgent?.id ?? null,
      message: candidate.message,
      to: targetAgent?.name ?? "Next station",
      to_agent_id: targetAgent?.id ?? null,
    };
  }

  return null;
};

const deriveAgentStatus = ({
  agent,
  approvals,
  handoff,
  tasks,
}: {
  agent: AgentRead;
  approvals: ApprovalRead[];
  handoff: VirtualOfficeHandoff | null;
  tasks: TaskCardRead[];
}): VirtualOfficeAgentStatus => {
  const runtimeStatus = normalizeRuntimeStatus(agent.status);
  const assignedTasks = tasks.filter((task) => matchesTask(agent, task));
  const taskIds = new Set(assignedTasks.map((task) => task.id));
  const taskApprovals = approvals.filter((approval) =>
    approvalTaskIds(approval).some((taskId) => taskIds.has(taskId)),
  );

  const hasBlockedTask = assignedTasks.some((task) => task.is_blocked);
  const hasRejectedApproval = taskApprovals.some((approval) => approval.status === "rejected");
  const hasPendingApproval = taskApprovals.some((approval) => approval.status === "pending");
  const hasReviewTask = assignedTasks.some((task) => task.status === "review");
  const hasInProgressTask = assignedTasks.some((task) => task.status === "in_progress");
  const hasDoneTasks = assignedTasks.length > 0 && assignedTasks.every((task) => task.status === "done");
  const isHandoffAgent =
    Boolean(handoff) &&
    (handoff?.from_agent_id === agent.id || handoff?.to_agent_id === agent.id);

  if (
    runtimeStatus === "offline" ||
    runtimeStatus === "error" ||
    runtimeStatus === "failed" ||
    runtimeStatus === "disabled"
  ) {
    return "error";
  }
  if (isHandoffAgent) return "delivering";
  if (hasBlockedTask || hasRejectedApproval) return "retry";
  if (hasPendingApproval || hasReviewTask) return "checkpoint";
  if (hasInProgressTask) return "working";
  if (hasDoneTasks && agent.is_board_lead) return "done";
  if (hasDoneTasks || agent.is_board_lead) return "monitoring";
  return "idle";
};

const derivePipeline = ({
  approvals,
  board,
  handoff,
  tasks,
}: {
  approvals: ApprovalRead[];
  board: BoardRead | null;
  handoff: VirtualOfficeHandoff | null;
  tasks: TaskCardRead[];
}): VirtualOfficePipelineSummary => {
  const total = Math.max(tasks.length, 1);
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const inProgressCount = tasks.filter((task) => task.status === "in_progress").length;
  const reviewCount = tasks.filter((task) => task.status === "review").length;
  const blockedCount = tasks.filter((task) => task.is_blocked).length;
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const rejectedApprovals = approvals.filter((approval) => approval.status === "rejected");
  const current = Math.min(total, Math.max(1, doneCount + inProgressCount + reviewCount));
  const score = averageConfidence(approvals) ?? completionScore(tasks);

  let phase = "QUEUE";
  if (tasks.length === 0 || (board?.board_type !== "general" && !board?.goal_confirmed)) {
    phase = "PLAN";
  } else if (pendingApprovals.length > 0 || reviewCount > 0) {
    phase = "REVIEW";
  } else if (inProgressCount > 0) {
    phase = "EXECUTE";
  } else if (blockedCount > 0 || rejectedApprovals.length > 0) {
    phase = "RECOVER";
  } else if (doneCount === tasks.length && tasks.length > 0) {
    phase = "COMPLETE";
  }

  let qualityGateStatus: VirtualOfficePipelineSummary["quality_gate_status"] = null;
  if (pendingApprovals.length > 0) {
    qualityGateStatus = "pending";
  } else if (rejectedApprovals.length > 0) {
    qualityGateStatus = blockedCount > 0 ? "blocked" : "retry_required";
  } else if (approvals.some((approval) => approval.status === "approved")) {
    qualityGateStatus = "approved";
  }

  let status: VirtualOfficePipelineSummary["status"] = "idle";
  if (pendingApprovals.length > 0 || reviewCount > 0) {
    status = "checkpoint";
  } else if (inProgressCount > 0 || handoff) {
    status = "running";
  } else if (tasks.length > 0 && doneCount === tasks.length) {
    status = "done";
  }

  return {
    current,
    handoff,
    phase,
    quality_gate_status: qualityGateStatus,
    retries: blockedCount + rejectedApprovals.length,
    score,
    status,
    step_label: latestTaskLabel(tasks),
    total,
  };
};

export const deriveVirtualOfficeState = ({
  agents,
  approvals,
  board,
  liveEvents,
  memoryEntries,
  tasks,
}: {
  agents: AgentRead[];
  approvals: ApprovalRead[];
  board: BoardRead | null;
  liveEvents: VirtualOfficeFeedEvent[];
  memoryEntries: BoardMemoryRead[];
  tasks: TaskCardRead[];
}): VirtualOfficeDerivedState => {
  const handoff = extractVirtualOfficeHandoff(memoryEntries, liveEvents, agents);

  const agentViews = [...agents]
    .map((agent) => {
      const assignedTasks = tasks.filter((task) => matchesTask(agent, task));
      const activeTasks = assignedTasks.filter(
        (task) => task.status === "in_progress" || task.status === "review",
      );
      return {
        active_task_count: activeTasks.length,
        agent,
        deliver_to: handoff?.from_agent_id === agent.id ? handoff.to : null,
        glyph: resolveOfficeAgentGlyph(agent),
        id: agent.id,
        is_lead: Boolean(agent.is_board_lead),
        lane: classifyOfficeLane(agent),
        name: agent.name,
        role: resolveOfficeAgentRole(agent),
        status: deriveAgentStatus({ agent, approvals, handoff, tasks }),
        task_count: assignedTasks.length,
        task_label: latestTaskLabel(assignedTasks),
      } satisfies VirtualOfficeAgentView;
    })
    .sort((left, right) => {
      const laneCompare = LANE_ORDER.indexOf(left.lane) - LANE_ORDER.indexOf(right.lane);
      if (laneCompare !== 0) return laneCompare;
      const statusCompare = OFFICE_STATUS_PRIORITY[left.status] - OFFICE_STATUS_PRIORITY[right.status];
      if (statusCompare !== 0) return statusCompare;
      return left.name.localeCompare(right.name);
    });

  const attentionAgents = agentViews.filter((agent) =>
    ["checkpoint", "retry", "error"].includes(agent.status),
  );
  const pipeline = derivePipeline({ approvals, board, handoff, tasks });
  const activeCount = agentViews.filter((agent) =>
    ["working", "delivering"].includes(agent.status),
  ).length;
  const watchingCount = agentViews.filter((agent) => agent.status === "monitoring").length;

  return {
    agents: agentViews,
    attention_agents: attentionAgents,
    handoff,
    pipeline,
    signals: {
      active_count: activeCount,
      attention_count: attentionAgents.length,
      completed_count: tasks.filter((task) => task.status === "done").length,
      delivery_count: handoff ? 1 : 0,
      notification_count:
        attentionAgents.length +
        approvals.filter((approval) => approval.status === "pending").length,
      watching_count: watchingCount,
    },
  };
};

export const buildVirtualOfficeLayout = (
  agents: VirtualOfficeAgentView[],
  stageW = DEFAULT_STAGE_W,
  stageH = DEFAULT_STAGE_H,
): VirtualOfficeStageLayout => {
  const floorX = 72;
  const floorY = 58;
  const floorW = stageW - 144;
  const floorH = stageH - 116;
  const grouped = new Map<VirtualOfficeLane, VirtualOfficeAgentView[]>();

  LANE_ORDER.forEach((lane) => grouped.set(lane, []));
  agents.forEach((agent) => {
    grouped.get(agent.lane)?.push(agent);
  });

  const positionedAgents: VirtualOfficeLayoutAgent[] = [];

  LANE_ORDER.forEach((lane) => {
    const laneAgents = grouped.get(lane) ?? [];
    const anchor = LANE_ANCHORS[lane];
    const baseX = floorX + floorW * anchor.x;
    const baseY = floorY + floorH * anchor.y;

    laneAgents.forEach((agent, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const offsetX = (column - 0.5) * 116;
      const offsetY = row * 104 - (laneAgents.length > 1 ? 24 : 0);
      const centerX = Math.max(floorX + 56, Math.min(floorX + floorW - 56, baseX + offsetX));
      const centerY = Math.max(floorY + 56, Math.min(floorY + floorH - 56, baseY + offsetY));
      positionedAgents.push({
        agent,
        centerX,
        centerY,
        index,
        scale: agent.is_lead ? 1.08 : agent.status === "delivering" ? 1.02 : 1,
        x: centerX - 44,
        y: centerY - 44,
      });
    });
  });

  return {
    floorH,
    floorW,
    floorX,
    floorY,
    positionedAgents,
    stageH,
    stageW,
  };
};

export const mapAgentEvent = (
  agent: AgentRead,
  previousAgent: AgentRead | null,
): VirtualOfficeFeedEvent | null => {
  const currentStatus = normalizeRuntimeStatus(agent.status) || "offline";
  const previousStatus = normalizeRuntimeStatus(previousAgent?.status);

  if (!previousAgent) {
    return {
      agent_id: agent.id,
      created_at: agent.updated_at,
      id: `agent-${agent.id}-${agent.updated_at}`,
      message: `${agent.name} joined the board.`,
      source: "agent",
      title: "Agent online",
      tone: "info",
    };
  }

  if (currentStatus === previousStatus) return null;

  return {
    agent_id: agent.id,
    created_at: agent.updated_at,
    event_type: currentStatus,
    id: `agent-${agent.id}-${agent.updated_at}`,
    message:
      currentStatus === "online"
        ? `${agent.name} checked in.`
        : `${agent.name} changed status to ${currentStatus}.`,
    source: "agent",
    title: currentStatus === "online" ? "Agent online" : "Agent update",
    tone: currentStatus === "online" ? "success" : "warning",
  };
};

export const mapApprovalEvent = (approval: ApprovalRead): VirtualOfficeFeedEvent => ({
  agent_id: approval.agent_id ?? null,
  created_at: approval.created_at,
  event_type: approval.status ?? null,
  id: `approval-${approval.id}-${approval.created_at}`,
  message: `${approval.action_type} - ${approval.confidence}% confidence`,
  source: "approval",
  task_id: approval.task_id ?? approval.task_ids?.[0] ?? null,
  title:
    approval.status === "approved"
      ? "Approval cleared"
      : approval.status === "rejected"
        ? "Approval rejected"
        : "Checkpoint waiting",
  tone:
    approval.status === "approved"
      ? "success"
      : approval.status === "rejected"
        ? "danger"
        : "warning",
});

export const mapMemoryEvent = (memory: BoardMemoryRead): VirtualOfficeFeedEvent => ({
  created_at: memory.created_at,
  id: `memory-${memory.id}`,
  message: memory.content,
  source: "memory",
  title: memory.tags?.includes("handoff") ? "Handoff note" : memory.source ?? "Board note",
  tone: memory.tags?.includes("handoff") ? "info" : "neutral",
});

export const mapTaskActivityEvent = (
  activity: ActivityEventRead,
  task?: TaskCardRead | null,
): VirtualOfficeFeedEvent => ({
  agent_id: activity.agent_id,
  created_at: activity.created_at,
  event_type: activity.event_type,
  id: `activity-${activity.id}`,
  message: activity.message ?? task?.title ?? "Board activity updated.",
  source: "task",
  task_id: activity.task_id,
  title:
    activity.event_type === "task.comment"
      ? "Task comment"
      : activity.event_type === "task.status_changed"
        ? "Task status changed"
        : "Task updated",
  tone:
    activity.event_type === "task.status_changed"
      ? "info"
      : activity.event_type === "task.comment"
        ? "neutral"
        : "warning",
});

export const mergeVirtualOfficeEvents = (
  eventLists: NullableFeedEvent[][],
  limit = 60,
): VirtualOfficeFeedEvent[] => {
  const merged = uniqueById(
    eventLists
      .flat()
      .filter((event): event is VirtualOfficeFeedEvent => Boolean(event))
      .sort(
        (left, right) =>
          (apiDatetimeToMs(right.created_at) ?? 0) - (apiDatetimeToMs(left.created_at) ?? 0),
      ),
  );

  return merged.slice(0, limit);
};

export const buildSeededVirtualOfficeEvents = ({
  activityEvents,
  agents,
  approvals,
  memoryEntries,
  tasks,
}: {
  activityEvents: ActivityEventRead[];
  agents: AgentRead[];
  approvals: ApprovalRead[];
  memoryEntries: BoardMemoryRead[];
  tasks: TaskCardRead[];
}): VirtualOfficeFeedEvent[] =>
  mergeVirtualOfficeEvents([
    agents.map((agent) => mapAgentEvent(agent, null)),
    approvals.map((approval) => mapApprovalEvent(approval)),
    memoryEntries.map((memory) => mapMemoryEvent(memory)),
    activityEvents.map((activity) =>
      mapTaskActivityEvent(
        activity,
        tasks.find((task) => task.id === activity.task_id) ?? null,
      ),
    ),
  ]);

export const mergeTaskCard = (
  previous: TaskCardRead | undefined,
  task: TaskCardRead,
): TaskCardRead => ({
  ...previous,
  ...task,
  approvals_count: task.approvals_count ?? previous?.approvals_count,
  approvals_pending_count:
    task.approvals_pending_count ?? previous?.approvals_pending_count,
});
