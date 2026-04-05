import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardRead } from "@/api/generated/model";
import type { VirtualOfficeAgentView, VirtualOfficeDerivedState } from "@/lib/virtual-office";

import { VirtualOfficeStage } from "./VirtualOfficeStage";

const board: BoardRead = {
  created_at: "2026-04-05T00:00:00Z",
  description: "Board description",
  goal_confirmed: true,
  id: "board-1",
  last_synced_at: "2026-04-05T02:00:00Z",
  name: "Instagram Hot News Carousel",
  organization_id: "org-1",
  slug: "instagram-hot-news-carousel",
  sync_source: "opensquad",
  sync_state: "healthy",
  updated_at: "2026-04-05T02:00:00Z",
};

const agent: VirtualOfficeAgentView = {
  active_task_count: 1,
  agent: {
    board_id: "board-1",
    created_at: "2026-04-05T00:00:00Z",
    gateway_id: "gateway-1",
    id: "agent-1",
    is_board_lead: true,
    name: "Chief Orchestrator",
    status: "online",
    updated_at: "2026-04-05T02:01:00Z",
  },
  glyph: "LD",
  id: "agent-1",
  is_lead: true,
  lane: "lead",
  name: "Chief Orchestrator",
  role: "Lead Agent",
  status: "checkpoint",
  task_count: 1,
  task_label: "Approve package",
};

const derived: VirtualOfficeDerivedState = {
  agents: [agent],
  attention_agents: [agent],
  handoff: null,
  pipeline: {
    current: 7,
    handoff: null,
    phase: "REVIEW",
    quality_gate_status: "pending",
    retries: 0,
    score: 84,
    status: "checkpoint",
    step_label: "Approve package",
    total: 11,
  },
  signals: {
    active_count: 1,
    attention_count: 1,
    completed_count: 2,
    delivery_count: 0,
    notification_count: 1,
    watching_count: 0,
  },
};

describe("VirtualOfficeStage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the decluttered office scene with sync metadata and focused agent context", () => {
    render(
      <VirtualOfficeStage
        board={board}
        boardKey={board.id}
        derived={derived}
        onSelectAgent={vi.fn()}
        selectedAgentId={agent.id}
      />,
    );

    expect(screen.getByRole("heading", { name: /prompthub pixel floor/i })).toBeInTheDocument();
    expect(screen.getByText(/instagram hot news carousel/i)).toBeInTheDocument();
    expect(screen.getByText(/^opensquad$/i)).toBeInTheDocument();
    expect(screen.getByText(/^healthy$/i)).toBeInTheDocument();
    expect(screen.getByText(/selected agent/i)).toBeInTheDocument();
    expect(screen.getAllByText(/waiting on checkpoint/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/chief orchestrator/i)).toBeInTheDocument();
  });
});
