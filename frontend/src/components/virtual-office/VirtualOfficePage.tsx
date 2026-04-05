"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

import { SignedIn, SignedOut } from "@/auth/clerk";
import { LayoutGrid, Sparkles } from "lucide-react";

import { Markdown } from "@/components/atoms/Markdown";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { VirtualOfficeOperatorPanel } from "@/components/virtual-office/VirtualOfficeOperatorPanel";
import { VirtualOfficeStage } from "@/components/virtual-office/VirtualOfficeStage";
import { useVirtualOfficeWorkspace } from "@/components/virtual-office/useVirtualOfficeWorkspace";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp } from "@/lib/formatters";
import {
  getBoardSyncStateLabel,
  getBoardSyncVariant,
  isOpenSquadSyncedBoard,
} from "@/lib/opensquad-sync";

const eventToneClass = (tone: "neutral" | "info" | "warning" | "danger" | "success") => {
  if (tone === "info") return "border-sky-300/30 bg-sky-500/10";
  if (tone === "warning") return "border-amber-300/30 bg-amber-500/10";
  if (tone === "danger") return "border-rose-300/30 bg-rose-500/10";
  if (tone === "success") return "border-emerald-300/30 bg-emerald-500/10";
  return "border-white/8 bg-white/5";
};

export function VirtualOfficePage() {
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
  } = useVirtualOfficeWorkspace({ routeBase: "/virtual-office" });
  const syncedBoards = boards.filter(isOpenSquadSyncedBoard);

  return (
    <DashboardShell>
      <SignedOut>
        <SignedOutPanel
          message="Sign in to open the Virtual Office and monitor live boards, checkpoints, handoffs, and agent activity."
          forceRedirectUrl="/virtual-office"
        />
      </SignedOut>

      <SignedIn>
        <DashboardSidebar />
        <main className="galaxy-main px-4 py-6 md:px-6">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
            <section className="galaxy-card rounded-[34px] p-6 md:p-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/25 bg-fuchsia-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-fuchsia-100">
                    <Sparkles className="h-4 w-4" />
                    Virtual Office
                  </div>
                  <h1 className="mt-4 font-heading text-4xl font-semibold text-white md:text-[3.1rem]">
                    OpenSquad behavior, adapted to Mission Control boards
                  </h1>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                    This view ports the live squad surface into the existing Next.js shell and
                    reuses Mission Control snapshots plus SSE instead of the old Vite watcher.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={
                        selectedBoardId
                          ? `/virtual-office/pixel?boardId=${encodeURIComponent(selectedBoardId)}`
                          : "/virtual-office/pixel"
                      }
                      className="inline-flex items-center rounded-full border border-[#fff4a1]/30 bg-[#fff4a1]/10 px-4 py-2 text-sm font-medium text-[#fff8cf] transition hover:border-[#fff4a1]/45 hover:bg-[#fff4a1]/16"
                    >
                      <LayoutGrid className="mr-2 h-4 w-4" />
                      Pixel mode
                    </Link>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Synced boards
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {syncedBoards.length}/{boards.length}
                    </p>
                  </div>
                  <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Active agents
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {boardState.derived.signals.active_count}
                    </p>
                  </div>
                  <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Checkpoints
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {
                        boardState.approvals.filter((approval) => approval.status === "pending")
                          .length
                      }
                    </p>
                  </div>
                  <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      Alerts
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {boardState.derived.signals.notification_count}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {boards.length === 0 && !boardsQuery.isLoading ? (
              <section className="galaxy-card rounded-[32px] p-8 text-center">
                <p className="text-sm uppercase tracking-[0.28em] text-slate-500">
                  No boards available
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  Create a board before opening the Virtual Office
                </h2>
                <p className="mt-3 text-sm text-slate-300">
                  The migrated view relies on the existing Mission Control board model.
                </p>
                <Link
                  href="/boards/new"
                  className="mt-6 inline-flex items-center rounded-full border border-fuchsia-300/30 bg-fuchsia-500/12 px-4 py-2 text-sm font-medium text-fuchsia-50 transition hover:border-fuchsia-200/40 hover:bg-fuchsia-500/16"
                >
                  Create board
                </Link>
              </section>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
                <aside className="space-y-6">
                  <section className="galaxy-card rounded-[32px] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                          Boards
                        </p>
                        <h2 className="mt-2 text-xl font-semibold text-white">
                          Monitor surface
                        </h2>
                      </div>
                      {boardsQuery.isFetching ? (
                        <Badge variant="outline" className="border-white/15 text-slate-300">
                          Refreshing
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-4 space-y-3">
                      {boards.map((board) => {
                        const isSelected = board.id === selectedBoardId;
                        return (
                          <button
                            key={board.id}
                            type="button"
                            onClick={() => handleBoardSelect(board.id)}
                            className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                              isSelected
                                ? "border-fuchsia-300/35 bg-fuchsia-500/12 shadow-[0_0_28px_rgba(109,13,170,0.16)]"
                                : "border-white/8 bg-white/5 hover:border-white/12 hover:bg-white/8"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-white">
                                  {board.name}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                                  {board.board_type === "general" ? "General board" : "Goal board"}
                                </p>
                              </div>
                              {board.goal_confirmed ? (
                                <Badge variant="success">Aligned</Badge>
                              ) : (
                                <Badge variant="warning">Planning</Badge>
                              )}
                            </div>
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
                            <p className="mt-3 line-clamp-2 text-sm text-slate-300">
                              {board.objective || board.description || "No objective configured yet."}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="galaxy-card rounded-[32px] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Pipeline
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Current route</h2>
                    <div className="mt-4 space-y-3">
                      <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                          Step
                        </p>
                        <p className="mt-2 text-base font-semibold text-white">
                          {boardState.derived.pipeline.current}/{boardState.derived.pipeline.total}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          {boardState.derived.pipeline.step_label || "Waiting for board activity"}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Phase
                          </p>
                          <p className="mt-2 text-base font-semibold text-white">
                            {boardState.derived.pipeline.phase}
                          </p>
                        </div>
                        <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Gate
                          </p>
                          <p className="mt-2 text-base font-semibold text-white">
                            {boardState.derived.pipeline.quality_gate_status ?? "No gate"}
                          </p>
                        </div>
                        <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Score
                          </p>
                          <p className="mt-2 text-base font-semibold text-white">
                            {boardState.derived.pipeline.score !== null
                              ? `${boardState.derived.pipeline.score}/100`
                              : "Unavailable"}
                          </p>
                        </div>
                        <div className="galaxy-subcard rounded-[24px] px-4 py-3">
                          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                            Retries
                          </p>
                          <p className="mt-2 text-base font-semibold text-white">
                            {boardState.derived.pipeline.retries}
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="galaxy-card rounded-[32px] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Context log
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Board memory</h2>
                    {selectedBoard && isOpenSquadSyncedBoard(selectedBoard) ? (
                      <p className="mt-2 text-sm text-slate-400">
                        Context below is mirrored from the OpenSquad runtime workspace.
                      </p>
                    ) : null}
                    <div className="mt-4 space-y-3">
                      {boardState.memoryEntries.length > 0 ? (
                        boardState.memoryEntries.slice(0, 5).map((entry) => (
                          <article
                            key={entry.id}
                            className="rounded-[22px] border border-white/8 bg-white/5 px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-sm font-medium text-white">
                                {entry.source ?? "Board note"}
                              </p>
                              <p className="text-xs text-slate-500">
                                {formatTimestamp(entry.created_at)}
                              </p>
                            </div>
                            <div className="mt-2 text-sm leading-6 text-slate-300 [&_p]:mb-0">
                              <Markdown content={entry.content} variant="comment" />
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-white/8 bg-white/5 px-4 py-4 text-sm text-slate-400">
                          Board memory will appear here when the selected board emits notes or
                          handoff context.
                        </div>
                      )}
                    </div>
                  </section>
                </aside>

                <div className="space-y-6">
                  {selectedBoard ? (
                    <section className="galaxy-card rounded-[32px] p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                            Selected board
                          </p>
                          <h2 className="mt-2 truncate text-2xl font-semibold text-white">
                            {selectedBoard.name}
                          </h2>
                          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                            {selectedBoard.objective ||
                              selectedBoard.description ||
                              "This board has no objective configured yet."}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={selectedBoard.goal_confirmed ? "success" : "warning"}>
                            {selectedBoard.goal_confirmed ? "Goal confirmed" : "Needs planning"}
                          </Badge>
                          <Badge variant={getBoardSyncVariant(selectedBoard)}>
                            {getBoardSyncStateLabel(selectedBoard)}
                          </Badge>
                          <Badge variant="outline" className="border-white/15 text-slate-300">
                            {selectedBoard.board_type === "general" ? "General board" : "Goal board"}
                          </Badge>
                          {selectedBoard.last_synced_at ? (
                            <Badge variant="outline" className="border-white/15 text-slate-300">
                              Synced {formatTimestamp(selectedBoard.last_synced_at)}
                            </Badge>
                          ) : null}
                          <Link
                            href={`/boards/${selectedBoard.id}`}
                            className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-sky-300/30 hover:bg-white/10"
                          >
                            Open board
                          </Link>
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <VirtualOfficeStage
                    boardKey={selectedBoardId}
                    derived={boardState.derived}
                    onSelectAgent={setPreferredAgentId}
                    selectedAgentId={selectedAgentId}
                  />

                  <section className="galaxy-card rounded-[32px] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                          Footer telemetry
                        </p>
                        <h2 className="mt-2 text-xl font-semibold text-white">
                          Runtime checkpoint strip
                        </h2>
                      </div>
                      {boardState.error ? (
                        <Badge variant="warning">{boardState.error}</Badge>
                      ) : boardState.isLoading ? (
                        <Badge variant="outline" className="border-white/15 text-slate-300">
                          Loading
                        </Badge>
                      ) : (
                        <Badge variant="success">Live</Badge>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-100">
                        Step {boardState.derived.pipeline.current}/{boardState.derived.pipeline.total}
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-100">
                        Mode {boardState.derived.pipeline.status}
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-100">
                        Phase {boardState.derived.pipeline.phase}
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-100">
                        Retries {boardState.derived.pipeline.retries}
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-sm text-slate-100">
                        Score{" "}
                        {boardState.derived.pipeline.score !== null
                          ? `${boardState.derived.pipeline.score}/100`
                          : "n/a"}
                      </div>
                      {boardState.derived.handoff ? (
                        <div className="max-w-full truncate rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                          Handoff {boardState.derived.handoff.from} to {boardState.derived.handoff.to}
                        </div>
                      ) : null}
                    </div>
                  </section>
                </div>

                <aside className="space-y-6">
                  <section className="galaxy-card rounded-[32px] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Agent roster
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Active stations</h2>
                    <div className="mt-4 space-y-3">
                      {boardState.derived.agents.length > 0 ? (
                        boardState.derived.agents.map((agent) => (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => setPreferredAgentId(agent.id)}
                            className={`flex w-full items-start gap-3 rounded-[24px] border px-4 py-3 text-left transition ${
                              selectedAgentId === agent.id
                                ? "border-fuchsia-300/35 bg-fuchsia-500/12"
                                : "border-white/8 bg-white/5 hover:border-white/12 hover:bg-white/8"
                            }`}
                          >
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#0c1222] text-xl text-white">
                              {agent.glyph}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-white">
                                  {agent.name}
                                </p>
                                <Badge variant="outline" className="border-white/15 text-slate-300">
                                  {agent.lane}
                                </Badge>
                              </div>
                              <p className="mt-1 truncate text-xs text-slate-400">{agent.role}</p>
                              <p className="mt-2 text-xs text-slate-300">
                                {agent.task_label || "No assigned step right now."}
                              </p>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-white/8 bg-white/5 px-4 py-4 text-sm text-slate-400">
                          Agent presence will appear here after the board snapshot loads.
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
                  />

                  <section className="galaxy-card rounded-[32px] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      Live feed
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Recent movement</h2>
                    <div className="mt-4 space-y-3">
                      {boardState.events.length > 0 ? (
                        boardState.events.slice(0, 12).map((event) => (
                          <article
                            key={event.id}
                            className={`rounded-[24px] border px-4 py-3 ${eventToneClass(event.tone)}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white">{event.title}</p>
                                <p className="mt-2 text-sm leading-6 text-slate-200">
                                  {event.message}
                                </p>
                              </div>
                              <p className="shrink-0 text-xs text-slate-400">
                                {formatTimestamp(event.created_at)}
                              </p>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-white/8 bg-white/5 px-4 py-4 text-sm text-slate-400">
                          Live updates will populate here as agents, tasks, approvals, and board
                          notes stream in.
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
