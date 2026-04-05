import { describe, expect, it } from "vitest";

import type {
  ActivityEventRead,
  AgentRead,
  ApprovalRead,
  BoardMemoryRead,
  BoardRead,
  TaskCardRead,
} from "@/api/generated/model";
import {
  buildVirtualOfficeLayout,
  buildSeededVirtualOfficeEvents,
  deriveVirtualOfficeState,
  extractVirtualOfficeHandoff,
  mapAgentEvent,
  mergeVirtualOfficeEvents,
  resolveOfficeAgentGlyph,
  resolveOfficeAgentRole,
} from "@/lib/virtual-office";

const board: BoardRead = {
  created_at: "2026-04-02T00:00:00Z",
  description: "Board description",
  goal_confirmed: true,
  id: "board-1",
  name: "Growth Board",
  organization_id: "org-1",
  slug: "growth-board",
  updated_at: "2026-04-02T00:00:00Z",
};

const leadAgent: AgentRead = {
  board_id: board.id,
  created_at: "2026-04-02T00:00:00Z",
  gateway_id: "gateway-1",
  id: "agent-lead",
  is_board_lead: true,
  name: "Chief Agent",
  status: "online",
  updated_at: "2026-04-02T00:10:00Z",
};

const reviewerAgent: AgentRead = {
  board_id: board.id,
  created_at: "2026-04-02T00:00:00Z",
  gateway_id: "gateway-1",
  id: "agent-review",
  identity_profile: {
    emoji: ":brain:",
    role: "Quality reviewer",
  },
  name: "Quality Reviewer",
  status: "online",
  updated_at: "2026-04-02T00:11:00Z",
};

const publisherAgent: AgentRead = {
  board_id: board.id,
  created_at: "2026-04-02T00:00:00Z",
  gateway_id: "gateway-1",
  id: "agent-publish",
  identity_profile: {
    role: "Publisher",
  },
  name: "Clip Publisher",
  status: "online",
  updated_at: "2026-04-02T00:12:00Z",
};

const workingTask: TaskCardRead = {
  assigned_agent_id: reviewerAgent.id,
  board_id: board.id,
  created_at: "2026-04-02T00:00:00Z",
  created_by_user_id: null,
  id: "task-1",
  in_progress_at: "2026-04-02T00:05:00Z",
  status: "in_progress",
  title: "Review clip pack",
  updated_at: "2026-04-02T00:05:00Z",
};

const reviewTask: TaskCardRead = {
  assigned_agent_id: publisherAgent.id,
  approvals_pending_count: 1,
  board_id: board.id,
  created_at: "2026-04-02T00:02:00Z",
  created_by_user_id: null,
  id: "task-2",
  in_progress_at: null,
  status: "review",
  title: "Approve publish package",
  updated_at: "2026-04-02T00:12:00Z",
};

const pendingApproval: ApprovalRead = {
  action_type: "publish.review",
  board_id: board.id,
  confidence: 91,
  created_at: "2026-04-02T00:12:00Z",
  id: "approval-1",
  status: "pending",
  task_id: reviewTask.id,
};

const handoffNote: BoardMemoryRead = {
  board_id: board.id,
  content: "Chief Agent handoff to Clip Publisher for final release window.",
  created_at: "2026-04-02T00:13:00Z",
  id: "memory-1",
  is_chat: false,
  source: "Chief Agent",
  tags: ["handoff"],
};

const statusEvent: ActivityEventRead = {
  agent_id: reviewerAgent.id,
  board_id: board.id,
  created_at: "2026-04-02T00:12:30Z",
  event_type: "task.status_changed",
  id: "activity-1",
  message: "Quality Reviewer moved Approve publish package into review.",
  task_id: reviewTask.id,
};

describe("virtual-office helpers", () => {
  it("resolves configured emoji glyphs and roles", () => {
    expect(resolveOfficeAgentGlyph(reviewerAgent)).toBe("🧠");
    expect(resolveOfficeAgentRole(reviewerAgent)).toBe("Quality reviewer");
    expect(resolveOfficeAgentGlyph(leadAgent)).toBe("LD");
  });

  it("extracts handoffs from memory entries", () => {
    const handoff = extractVirtualOfficeHandoff(
      [handoffNote],
      [],
      [leadAgent, reviewerAgent, publisherAgent],
    );

    expect(handoff).not.toBeNull();
    expect(handoff?.from).toBe("Chief Agent");
    expect(handoff?.to).toBe("Clip Publisher");
  });

  it("derives board pipeline, agent statuses, and alerts", () => {
    const derived = deriveVirtualOfficeState({
      agents: [leadAgent, reviewerAgent, publisherAgent],
      approvals: [pendingApproval],
      board,
      liveEvents: [],
      memoryEntries: [handoffNote],
      tasks: [workingTask, reviewTask],
    });

    expect(derived.pipeline.phase).toBe("REVIEW");
    expect(derived.pipeline.quality_gate_status).toBe("pending");
    expect(derived.pipeline.status).toBe("checkpoint");
    expect(derived.signals.notification_count).toBeGreaterThan(0);

    const reviewer = derived.agents.find((agent) => agent.id === reviewerAgent.id);
    const publisher = derived.agents.find((agent) => agent.id === publisherAgent.id);
    expect(reviewer?.status).toBe("working");
    expect(publisher?.status).toBe("delivering");
  });

  it("creates layout positions for every agent", () => {
    const derived = deriveVirtualOfficeState({
      agents: [leadAgent, reviewerAgent, publisherAgent],
      approvals: [pendingApproval],
      board,
      liveEvents: [],
      memoryEntries: [handoffNote],
      tasks: [workingTask, reviewTask],
    });

    const layout = buildVirtualOfficeLayout(derived.agents);
    expect(layout.positionedAgents).toHaveLength(3);
    expect(layout.positionedAgents.every((agent) => agent.centerX > 0 && agent.centerY > 0)).toBe(
      true,
    );
  });

  it("maps agent state changes into feed events", () => {
    const previousAgent = {
      ...reviewerAgent,
      status: "offline",
      updated_at: "2026-04-02T00:04:00Z",
    };

    const event = mapAgentEvent(reviewerAgent, previousAgent);
    expect(event?.title).toBe("Agent online");
    expect(event?.tone).toBe("success");
  });

  it("seeds the feed from snapshot and activity data", () => {
    const seeded = buildSeededVirtualOfficeEvents({
      activityEvents: [statusEvent],
      agents: [reviewerAgent],
      approvals: [pendingApproval],
      memoryEntries: [handoffNote],
      tasks: [reviewTask],
    });

    expect(
      seeded.some((event) => event.id === `approval-${pendingApproval.id}-${pendingApproval.created_at}`),
    ).toBe(true);
    expect(seeded.some((event) => event.id === `memory-${handoffNote.id}`)).toBe(true);
    expect(seeded.some((event) => event.id === `activity-${statusEvent.id}`)).toBe(true);
  });

  it("deduplicates and sorts merged events", () => {
    const newest = {
      id: "event-new",
      created_at: "2026-04-02T00:14:00Z",
      title: "Newest",
      message: "Latest message",
      tone: "info" as const,
      source: "memory" as const,
    };
    const duplicate = { ...newest, title: "Changed title should be ignored after dedupe" };
    const older = {
      id: "event-old",
      created_at: "2026-04-02T00:09:00Z",
      title: "Older",
      message: "Earlier message",
      tone: "neutral" as const,
      source: "task" as const,
    };

    const merged = mergeVirtualOfficeEvents([[older, newest], [duplicate]]);

    expect(merged.map((event) => event.id)).toEqual(["event-new", "event-old"]);
    expect(merged[0]?.title).toBe("Newest");
  });
});
