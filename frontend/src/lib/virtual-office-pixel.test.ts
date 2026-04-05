import { describe, expect, it } from "vitest";

import type { AgentRead } from "@/api/generated/model";
import { buildPixelAgentSprite } from "@/lib/virtual-office-pixel";
import { type VirtualOfficeAgentView } from "@/lib/virtual-office";

const baseAgent: AgentRead = {
  board_id: "board-1",
  created_at: "2026-04-03T00:00:00Z",
  gateway_id: "gateway-1",
  id: "agent-1",
  is_board_lead: false,
  name: "Pixel Researcher",
  status: "online",
  updated_at: "2026-04-03T00:00:00Z",
};

const makeView = (overrides?: Partial<VirtualOfficeAgentView>): VirtualOfficeAgentView => ({
  active_task_count: 1,
  agent: baseAgent,
  glyph: "PR",
  id: baseAgent.id,
  is_lead: false,
  lane: "research",
  name: baseAgent.name,
  role: "Research lead",
  status: "working",
  task_count: 2,
  task_label: "Review feed",
  ...overrides,
});

describe("virtual-office pixel sprites", () => {
  it("builds a stable sprite for the same agent", () => {
    const first = buildPixelAgentSprite(makeView());
    const second = buildPixelAgentSprite(makeView());

    expect(first.cells).toEqual(second.cells);
    expect(first.frame).toBe(second.frame);
    expect(first.size).toBe(12);
  });

  it("changes the frame color based on runtime status", () => {
    const working = buildPixelAgentSprite(makeView({ status: "working" }));
    const blocked = buildPixelAgentSprite(makeView({ status: "error" }));

    expect(working.frame).not.toBe(blocked.frame);
    expect(working.cells).toEqual(blocked.cells);
  });

  it("adds lead crown pixels for lead agents", () => {
    const worker = buildPixelAgentSprite(makeView());
    const lead = buildPixelAgentSprite(
      makeView({
        agent: { ...baseAgent, id: "lead-1", is_board_lead: true, name: "Chief Pixel" },
        id: "lead-1",
        is_lead: true,
        lane: "lead",
        name: "Chief Pixel",
        role: "Lead agent",
      }),
    );

    expect(worker.cells[6 * 12 + 5]).not.toBe(lead.cells[6 * 12 + 5]);
    expect(lead.cells[6 * 12 + 5]).not.toBe("transparent");
  });
});
