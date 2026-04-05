"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { LayoutGrid, Sparkles } from "lucide-react";

import { SignedIn, SignedOut } from "@/auth/clerk";
import { Markdown } from "@/components/atoms/Markdown";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { VirtualOfficeOperatorPanel } from "@/components/virtual-office/VirtualOfficeOperatorPanel";
import { PixelVirtualOfficeStage } from "@/components/virtual-office/PixelVirtualOfficeStage";
import { useVirtualOfficeWorkspace } from "@/components/virtual-office/useVirtualOfficeWorkspace";
import { formatTimestamp } from "@/lib/formatters";
import {
  getBoardSyncStateLabel,
  getBoardSyncVariant,
  isOpenSquadSyncedBoard,
} from "@/lib/opensquad-sync";
import { buildPixelAgentSprite } from "@/lib/virtual-office-pixel";

const eventToneClass = (tone: "neutral" | "info" | "warning" | "danger" | "success") => {
  if (tone === "info") return "border-[#2d7abf] bg-[#0f1f36]";
  if (tone === "warning") return "border-[#b7892d] bg-[#291e0d]";
  if (tone === "danger") return "border-[#b54b61] bg-[#2c1016]";
  if (tone === "success") return "border-[#2f8e68] bg-[#0f231c]";
  return "border-[#314061] bg-[#0f1728]";
};

export function PixelVirtualOfficePage() {
  const {
    boardState,
    boards,
    boardsQuery,
    isAdmin,
    selectedAgent,
    selectedAgentId,
    selectedBoard,
    selectedBoardId,
    setPreferredAgentId,
    handleBoardSelect,
  } = useVirtualOfficeWorkspace({ routeBase: "/virtual-office/pixel" });
  const pendingApprovals = boardState.approvals.filter(
    (approval) => approval.status === "pending",
  ).length;
  const syncedBoards = boards.filter(isOpenSquadSyncedBoard);
  const classicHref = selectedBoardId
    ? `/virtual-office?boardId=${encodeURIComponent(selectedBoardId)}`
    : "/virtual-office";

  return (
    <DashboardShell>
      <SignedOut>
        <SignedOutPanel
          message="Sign in to open the pixel Virtual Office and monitor live agents, handoffs, and checkpoints."
          forceRedirectUrl="/virtual-office/pixel"
        />
      </SignedOut>

      <SignedIn>
        <DashboardSidebar />
        <main className="galaxy-main px-4 py-6 md:px-6">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
            <section className="pixel-panel">
              <div className="pixel-header flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#fff4a1]/30 bg-[#fff4a1]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#fff4a1]">
                    <Sparkles className="h-4 w-4" />
                    Pixel Virtual Office
                  </div>
                  <h1 className="mt-4 font-mono text-4xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff] md:text-[3rem]">
                    Agent control in pixel mode
                  </h1>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-[#c7d2f2]">
                    This page reuses the same Mission Control snapshots and SSE streams as the
                    live board view, but renders the stations as deterministic pixel agents.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="pixel-chip">
                    {syncedBoards.length}/{boards.length} synced
                  </span>
                  <span className="pixel-chip">{boardState.derived.agents.length} agents</span>
                  <span className="pixel-chip">{pendingApprovals} pending gates</span>
                  <Link href={classicHref} className="pixel-button">
                    <LayoutGrid className="mr-2 h-4 w-4" />
                    Classic view
                  </Link>
                </div>
              </div>
            </section>

            {boards.length === 0 && !boardsQuery.isLoading ? (
              <section className="pixel-panel text-center">
                <p className="pixel-kicker">NO BOARDS ONLINE</p>
                <h2 className="mt-3 font-mono text-2xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                  Create a board before opening pixel mode
                </h2>
                <p className="mt-3 text-sm text-[#c7d2f2]">
                  The pixel surface uses the existing Mission Control board state and live agent
                  streams.
                </p>
                <div className="mt-6 flex justify-center">
                  <Link href="/boards/new" className="pixel-button">
                    Create board
                  </Link>
                </div>
              </section>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
                <aside className="space-y-6">
                  <section className="pixel-panel">
                    <div className="pixel-header">
                      <p className="pixel-kicker">BOARD SELECTOR</p>
                      <h2 className="mt-2 font-mono text-xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                        Control rooms
                      </h2>
                    </div>
                    <div className="mt-4 space-y-3">
                      {boards.map((board) => {
                        const isSelected = board.id === selectedBoardId;
                        return (
                          <button
                            key={board.id}
                            type="button"
                            onClick={() => handleBoardSelect(board.id)}
                            className={`pixel-select-card ${isSelected ? "pixel-select-card-active" : ""}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-sm font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                                  {board.name}
                                </p>
                                <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#95a3cf]">
                                  {board.board_type === "general" ? "General board" : "Goal board"}
                                </p>
                              </div>
                              <Badge variant={board.goal_confirmed ? "success" : "warning"}>
                                {board.goal_confirmed ? "Aligned" : "Planning"}
                              </Badge>
                            </div>
                            <p className="mt-3 line-clamp-2 text-sm text-[#d8e1fb]">
                              {board.objective || board.description || "No board objective yet."}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge variant={getBoardSyncVariant(board)}>
                                {getBoardSyncStateLabel(board)}
                              </Badge>
                              {board.last_synced_at ? (
                                <Badge
                                  variant="outline"
                                  className="border-white/15 text-slate-300"
                                >
                                  {formatTimestamp(board.last_synced_at)}
                                </Badge>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="pixel-panel">
                    <div className="pixel-header">
                      <p className="pixel-kicker">MEMORY LOG</p>
                      <h2 className="mt-2 font-mono text-xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                        Board context
                      </h2>
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedBoard && isOpenSquadSyncedBoard(selectedBoard) ? (
                        <div className="pixel-empty">
                          Context below is mirrored from the OpenSquad runtime workspace.
                        </div>
                      ) : null}
                      {boardState.memoryEntries.length > 0 ? (
                        boardState.memoryEntries.slice(0, 6).map((entry) => (
                          <article key={entry.id} className="pixel-log-card">
                            <div className="flex items-start justify-between gap-3">
                              <p className="truncate font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#f4f6ff]">
                                {entry.source ?? "Board note"}
                              </p>
                              <p className="shrink-0 text-[11px] text-[#95a3cf]">
                                {formatTimestamp(entry.created_at)}
                              </p>
                            </div>
                            <div className="mt-2 text-sm leading-6 text-[#d8e1fb] [&_p]:mb-0">
                              <Markdown content={entry.content} variant="comment" />
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="pixel-empty">
                          Board notes and handoff context will appear here once the stream is live.
                        </div>
                      )}
                    </div>
                  </section>
                </aside>

                <div className="space-y-6">
                  <section className="pixel-panel">
                    <div className="pixel-header flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                      <div className="min-w-0">
                        <p className="pixel-kicker">LIVE BOARD</p>
                        <h2 className="mt-2 truncate font-mono text-2xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                          {selectedBoard?.name ?? "No board selected"}
                        </h2>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#c7d2f2]">
                          {selectedBoard?.objective ||
                            selectedBoard?.description ||
                            "Select a board to project its current agent floor."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="pixel-chip">
                          STEP {boardState.derived.pipeline.current}/{boardState.derived.pipeline.total}
                        </span>
                        {selectedBoard ? (
                          <Badge variant={getBoardSyncVariant(selectedBoard)}>
                            {getBoardSyncStateLabel(selectedBoard)}
                          </Badge>
                        ) : null}
                        <span className="pixel-chip">{boardState.derived.pipeline.phase}</span>
                        <span className="pixel-chip">
                          {boardState.derived.pipeline.quality_gate_status ?? "NO GATE"}
                        </span>
                        {selectedBoard?.last_synced_at ? (
                          <Badge variant="outline" className="border-white/15 text-slate-300">
                            {formatTimestamp(selectedBoard.last_synced_at)}
                          </Badge>
                        ) : null}
                        {selectedBoard ? (
                          <Link href={`/boards/${selectedBoard.id}`} className="pixel-button">
                            Open board
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  <PixelVirtualOfficeStage
                    derived={boardState.derived}
                    onSelectAgent={setPreferredAgentId}
                    selectedAgentId={selectedAgentId}
                  />

                  <section className="pixel-panel">
                    <div className="pixel-header">
                      <p className="pixel-kicker">RUNTIME TELEMETRY</p>
                      <h2 className="mt-2 font-mono text-xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                        Live execution strip
                      </h2>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      <div className="pixel-subpanel">
                        <p className="pixel-kicker">STREAM</p>
                        <p className="mt-3 font-mono text-lg font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                          {boardState.error
                            ? "RECONNECT"
                            : boardState.isLoading
                              ? "LOADING"
                              : "LIVE"}
                        </p>
                        <p className="mt-2 text-sm text-[#c7d2f2]">
                          {boardState.error ?? "Snapshot and SSE feed are synchronized."}
                        </p>
                      </div>
                      <div className="pixel-subpanel">
                        <p className="pixel-kicker">CURRENT STEP</p>
                        <p className="mt-3 font-mono text-lg font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                          {boardState.derived.pipeline.step_label ?? "WAITING"}
                        </p>
                        <p className="mt-2 text-sm text-[#c7d2f2]">
                          Retries {boardState.derived.pipeline.retries} and score{" "}
                          {boardState.derived.pipeline.score !== null
                            ? `${boardState.derived.pipeline.score}/100`
                            : "n/a"}
                        </p>
                      </div>
                      <div className="pixel-subpanel">
                        <p className="pixel-kicker">CHECKPOINTS</p>
                        <p className="mt-3 font-mono text-lg font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                          {pendingApprovals}
                        </p>
                        <p className="mt-2 text-sm text-[#c7d2f2]">
                          Pending approvals locked behind the current board flow.
                        </p>
                      </div>
                      <div className="pixel-subpanel">
                        <p className="pixel-kicker">HANDOFF</p>
                        <p className="mt-3 font-mono text-lg font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                          {boardState.derived.handoff ? "ACTIVE" : "IDLE"}
                        </p>
                        <p className="mt-2 text-sm text-[#c7d2f2]">
                          {boardState.derived.handoff
                            ? `${boardState.derived.handoff.from} -> ${boardState.derived.handoff.to}`
                            : "No live handoff detected right now."}
                        </p>
                      </div>
                    </div>
                  </section>
                </div>

                <aside className="space-y-6">
                  <section className="pixel-panel">
                    <div className="pixel-header">
                      <p className="pixel-kicker">AGENT ROSTER</p>
                      <h2 className="mt-2 font-mono text-xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                        Pixel stations
                      </h2>
                    </div>
                    <div className="mt-4 space-y-3">
                      {boardState.derived.agents.length > 0 ? (
                        boardState.derived.agents.map((agent) => {
                          const sprite = buildPixelAgentSprite(agent);
                          const isSelected = selectedAgentId === agent.id;

                          return (
                            <button
                              key={agent.id}
                              type="button"
                              onClick={() => setPreferredAgentId(agent.id)}
                              className={`pixel-roster-row ${isSelected ? "pixel-roster-row-active" : ""}`}
                            >
                              <span
                                className="pixel-roster-swatch"
                                style={{
                                  background: `linear-gradient(180deg, ${sprite.frame} 0%, ${sprite.background} 100%)`,
                                  boxShadow: `0 0 18px ${sprite.glow}`,
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate font-mono text-sm font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                                    {agent.name}
                                  </p>
                                  <span className="pixel-chip">{agent.lane}</span>
                                </div>
                                <p className="mt-1 truncate text-xs text-[#95a3cf]">{agent.role}</p>
                                <p className="mt-2 text-xs text-[#d8e1fb]">
                                  {agent.task_label ?? "No active assignment"}
                                </p>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="pixel-empty">
                          Agent pixels will render here after the board snapshot arrives.
                        </div>
                      )}
                    </div>
                  </section>

                  <VirtualOfficeOperatorPanel
                    approvals={boardState.approvals}
                    boardId={selectedBoardId}
                    gatewayId={selectedBoard?.gateway_id ?? null}
                    isAdmin={isAdmin}
                    isOpenSquadSynced={selectedBoard ? isOpenSquadSyncedBoard(selectedBoard) : false}
                    selectedAgent={selectedAgent}
                    variant="pixel"
                  />

                  <section className="pixel-panel">
                    <div className="pixel-header">
                      <p className="pixel-kicker">EVENT CONSOLE</p>
                      <h2 className="mt-2 font-mono text-xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                        Recent movement
                      </h2>
                    </div>
                    <div className="mt-4 space-y-3">
                      {boardState.events.length > 0 ? (
                        boardState.events.slice(0, 12).map((event) => (
                          <article
                            key={event.id}
                            className={`pixel-log-card border ${eventToneClass(event.tone)}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#f4f6ff]">
                                {event.title}
                              </p>
                              <p className="shrink-0 text-[11px] text-[#95a3cf]">
                                {formatTimestamp(event.created_at)}
                              </p>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#d8e1fb]">
                              {event.message}
                            </p>
                          </article>
                        ))
                      ) : (
                        <div className="pixel-empty">
                          Agent, task, approval, and board events will stream into this console.
                        </div>
                      )}
                    </div>
                  </section>
                </aside>
              </div>
            )}
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}
