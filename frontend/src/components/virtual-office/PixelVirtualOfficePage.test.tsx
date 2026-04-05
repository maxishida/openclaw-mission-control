import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ApprovalRead, BoardRead, TaskCardRead } from "@/api/generated/model";
import type { VirtualOfficeAgentView, VirtualOfficeDerivedState } from "@/lib/virtual-office";

import { PixelVirtualOfficePage } from "./PixelVirtualOfficePage";

const replaceMock = vi.fn();
const boardsHookMock = vi.fn();
const boardStateHookMock = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock("next/link", () => {
  type LinkProps = React.PropsWithChildren<{
    href: string | { pathname?: string };
  }> &
    Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

  return {
    default: ({ href, children, ...props }: LinkProps) => (
      <a href={typeof href === "string" ? href : "#"} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock("@/auth/clerk", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  useAuth: () => ({ isSignedIn: true }),
}));

vi.mock("@/lib/use-organization-membership", () => ({
  useOrganizationMembership: () => ({ isAdmin: true }),
}));

vi.mock("@/api/generated/boards/boards", () => ({
  useListBoardsApiV1BoardsGet: (...args: unknown[]) => boardsHookMock(...args),
}));

vi.mock("@/components/virtual-office/useVirtualOfficeBoardState", () => ({
  useVirtualOfficeBoardState: (...args: unknown[]) => boardStateHookMock(...args),
}));

vi.mock("@/hooks/usePageActive", () => ({
  usePageActive: () => true,
}));

vi.mock("@/components/organisms/DashboardSidebar", () => ({
  DashboardSidebar: () => <div data-testid="dashboard-sidebar" />,
}));

vi.mock("@/components/templates/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-shell">{children}</div>
  ),
}));

vi.mock("@/components/atoms/Markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/virtual-office/PixelVirtualOfficeStage", () => ({
  PixelVirtualOfficeStage: ({
    onSelectAgent,
  }: {
    onSelectAgent: (agentId: string) => void;
  }) => (
    <button type="button" onClick={() => onSelectAgent("agent-2")}>
      Select agent two
    </button>
  ),
}));

const makeBoard = (id: string, name: string): BoardRead => ({
  created_at: "2026-04-03T00:00:00Z",
  description: `${name} description`,
  gateway_id: null,
  goal_confirmed: true,
  id,
  name,
  objective: `${name} objective`,
  organization_id: "org-1",
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  updated_at: "2026-04-03T00:00:00Z",
});

const makeAgent = (
  id: string,
  name: string,
  overrides?: Partial<VirtualOfficeAgentView>,
): VirtualOfficeAgentView => ({
  active_task_count: 1,
  agent: {
    board_id: "board-1",
    created_at: "2026-04-03T00:00:00Z",
    gateway_id: "gateway-1",
    id,
    is_board_lead: false,
    name,
    status: "online",
    updated_at: "2026-04-03T00:00:00Z",
  },
  glyph: name.slice(0, 2).toUpperCase(),
  id,
  is_lead: false,
  lane: "research",
  name,
  role: "Research agent",
  status: "working",
  task_count: 1,
  task_label: `${name} task`,
  ...overrides,
});

const makeDerivedState = (agents: VirtualOfficeAgentView[]): VirtualOfficeDerivedState => ({
  agents,
  attention_agents: agents.length > 0 ? [agents[0]] : [],
  handoff: null,
  pipeline: {
    current: 1,
    total: 3,
    phase: "EXECUTE",
    quality_gate_status: null,
    retries: 0,
    score: 91,
    status: "running",
    step_label: "Current step",
    handoff: null,
  },
  signals: {
    active_count: agents.length,
    attention_count: agents.length > 0 ? 1 : 0,
    completed_count: 0,
    delivery_count: 0,
    notification_count: agents.length > 0 ? 1 : 0,
    watching_count: 0,
  },
});

const makeBoardState = (
  board: BoardRead | null,
  agents: VirtualOfficeAgentView[],
  overrides?: Partial<{
    approvals: ApprovalRead[];
    derived: VirtualOfficeDerivedState;
    events: Array<{ id: string; title: string; message: string; created_at: string; tone: "neutral" | "info" | "warning" | "danger" | "success" }>;
    error: string | null;
    isLoading: boolean;
    memoryEntries: Array<{ id: string; content: string; created_at: string; source?: string | null }>;
    tasks: TaskCardRead[];
  }>,
) => ({
  approvals: [],
  board,
  derived: makeDerivedState(agents),
  error: null,
  events: [],
  isLoading: false,
  memoryEntries: [],
  tasks: [],
  ...overrides,
});

const renderWithClient = (ui: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe("PixelVirtualOfficePage", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    boardsHookMock.mockReset();
    boardStateHookMock.mockReset();
    currentSearchParams = new URLSearchParams();
  });

  it("renders the empty-state fallback when no boards are available", () => {
    boardsHookMock.mockReturnValue({
      data: {
        status: 200,
        data: { items: [] },
      },
      isLoading: false,
      isFetching: false,
    });
    boardStateHookMock.mockReturnValue(makeBoardState(null, []));

    renderWithClient(<PixelVirtualOfficePage />);

    expect(
      screen.getByRole("heading", {
        name: /create a board before opening pixel mode/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create board/i })).toHaveAttribute(
      "href",
      "/boards/new",
    );
  });

  it("updates the board selection URL when the operator switches boards", () => {
    currentSearchParams = new URLSearchParams("boardId=board-1");
    const boardOne = makeBoard("board-1", "Alpha Room");
    const boardTwo = makeBoard("board-2", "Beta Room");

    boardsHookMock.mockReturnValue({
      data: {
        status: 200,
        data: { items: [boardOne, boardTwo] },
      },
      isLoading: false,
      isFetching: false,
    });
    boardStateHookMock.mockImplementation(({ boardId }: { boardId: string | null }) =>
      makeBoardState(boardId === "board-2" ? boardTwo : boardOne, [makeAgent("agent-1", "Scout")]),
    );

    renderWithClient(<PixelVirtualOfficePage />);

    fireEvent.click(screen.getByRole("button", { name: /beta room/i }));

    expect(replaceMock).toHaveBeenCalledWith("/virtual-office/pixel?boardId=board-2");
  });

  it("keeps the selected agent in sync with stage interactions", () => {
    currentSearchParams = new URLSearchParams("boardId=board-1");
    const boardOne = makeBoard("board-1", "Alpha Room");
    const agentOne = makeAgent("agent-1", "Scout");
    const agentTwo = makeAgent("agent-2", "Closer", {
      lane: "publish",
      role: "Closer agent",
      task_label: "Publish final pack",
    });

    boardsHookMock.mockReturnValue({
      data: {
        status: 200,
        data: { items: [boardOne] },
      },
      isLoading: false,
      isFetching: false,
    });
    boardStateHookMock.mockReturnValue(makeBoardState(boardOne, [agentOne, agentTwo]));

    renderWithClient(<PixelVirtualOfficePage />);

    expect(screen.getAllByText("Scout").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scout task").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /select agent two/i }));

    expect(screen.getAllByText("Closer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Publish final pack").length).toBeGreaterThan(0);
  });
});
