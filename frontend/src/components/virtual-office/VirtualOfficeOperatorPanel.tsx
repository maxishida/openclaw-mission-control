"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { ApiError } from "@/api/mutator";
import {
  getListApprovalsApiV1BoardsBoardIdApprovalsGetQueryKey,
  useUpdateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch,
} from "@/api/generated/approvals/approvals";
import {
  getGetBoardSnapshotApiV1BoardsBoardIdSnapshotGetQueryKey,
  getListBoardsApiV1BoardsGetQueryKey,
} from "@/api/generated/boards/boards";
import { useSyncGatewayTemplatesApiV1GatewaysGatewayIdTemplatesSyncPost } from "@/api/generated/gateways/gateways";
import { useForceOpensquadResyncApiV1OpensquadResyncPost } from "@/api/generated/opensquad-sync/opensquad-sync";
import type { ApprovalRead } from "@/api/generated/model";
import { Badge } from "@/components/ui/badge";
import { formatTimestamp } from "@/lib/formatters";
import type { VirtualOfficeAgentView } from "@/lib/virtual-office";

type VirtualOfficeOperatorPanelProps = {
  approvals: ApprovalRead[];
  boardId: string | null;
  gatewayId?: string | null;
  isAdmin: boolean;
  isOpenSquadSynced?: boolean;
  selectedAgent: VirtualOfficeAgentView | null;
  variant?: "classic" | "pixel";
};

const statusLabel: Record<VirtualOfficeAgentView["status"], string> = {
  checkpoint: "Waiting at checkpoint",
  delivering: "In handoff",
  done: "Completed route",
  error: "Needs operator attention",
  idle: "Standing by",
  monitoring: "Monitoring",
  retry: "Retry requested",
  working: "Actively working",
};

const panelTone = (variant: "classic" | "pixel") => {
  if (variant === "pixel") {
    return {
      body: "pixel-panel",
      card: "pixel-subpanel",
      empty: "pixel-empty",
      kicker: "pixel-kicker",
      title:
        "mt-2 font-mono text-xl font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]",
      text: "text-sm text-[#c7d2f2]",
      muted: "text-xs text-[#95a3cf]",
      action:
        "inline-flex h-9 items-center justify-center rounded-[14px] border px-3 text-xs font-semibold uppercase tracking-[0.14em] transition",
      primaryAction:
        "border-[#fff4a1]/30 bg-[#fff4a1]/10 text-[#fff8cf] hover:border-[#fff4a1]/45 hover:bg-[#fff4a1]/16",
      secondaryAction:
        "border-[#7390d9]/24 bg-[#0e1830] text-[#d8e1fb] hover:border-[#9bb4ff]/34 hover:bg-[#152241]",
      dangerAction:
        "border-[#b54b61]/28 bg-[#2c1016] text-[#ffd7dd] hover:border-[#cf6a7d]/38 hover:bg-[#39131c]",
      successAction:
        "border-[#2f8e68]/28 bg-[#0f231c] text-[#d8fff0] hover:border-[#4db18a]/38 hover:bg-[#143126]",
      notice: "rounded-[18px] border px-4 py-3 text-sm",
      noticeInfo: "border-[#2d7abf] bg-[#0f1f36] text-[#d8e8ff]",
      noticeError: "border-[#b54b61] bg-[#2c1016] text-[#ffd7dd]",
      row: "rounded-[18px] border border-[#314061] bg-[#0f1728] px-4 py-3",
    };
  }

  return {
    body: "galaxy-card rounded-[32px] p-5",
    card: "rounded-[24px] border border-white/8 bg-white/5 px-4 py-3",
    empty: "rounded-[22px] border border-white/8 bg-white/5 px-4 py-4 text-sm text-slate-400",
    kicker: "text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500",
    title: "mt-2 text-xl font-semibold text-white",
    text: "text-sm text-slate-300",
    muted: "text-xs text-slate-400",
    action:
      "inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition",
    primaryAction:
      "border-emerald-300/30 bg-emerald-500/12 text-emerald-100 hover:border-emerald-200/45 hover:bg-emerald-500/16",
    secondaryAction:
      "border-white/10 bg-white/6 text-slate-100 hover:border-sky-300/30 hover:bg-white/10",
    dangerAction:
      "border-rose-300/30 bg-rose-500/12 text-rose-100 hover:border-rose-200/45 hover:bg-rose-500/16",
    successAction:
      "border-emerald-300/30 bg-emerald-500/12 text-emerald-100 hover:border-emerald-200/45 hover:bg-emerald-500/16",
    notice: "rounded-[22px] border px-4 py-3 text-sm",
    noticeInfo: "border-sky-300/30 bg-sky-500/10 text-sky-100",
    noticeError: "border-rose-300/30 bg-rose-500/10 text-rose-100",
    row: "rounded-[22px] border border-white/8 bg-white/5 px-4 py-3",
  };
};

export function VirtualOfficeOperatorPanel({
  approvals,
  boardId,
  gatewayId,
  isAdmin,
  isOpenSquadSynced = false,
  selectedAgent,
  variant = "classic",
}: VirtualOfficeOperatorPanelProps) {
  const tone = panelTone(variant);
  const queryClient = useQueryClient();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingApprovalId, setUpdatingApprovalId] = useState<string | null>(null);
  const [gatewayAction, setGatewayAction] = useState<"sync" | "rebootstrap" | null>(null);

  const updateApprovalMutation =
    useUpdateApprovalApiV1BoardsBoardIdApprovalsApprovalIdPatch<ApiError>();
  const syncGatewayMutation =
    useSyncGatewayTemplatesApiV1GatewaysGatewayIdTemplatesSyncPost<ApiError>();
  const resyncMutation = useForceOpensquadResyncApiV1OpensquadResyncPost<ApiError>();

  const pendingApprovals = useMemo(
    () =>
      [...approvals]
        .filter((approval) => approval.status === "pending")
        .sort(
          (left, right) =>
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
        )
        .slice(0, 4),
    [approvals],
  );

  const refreshBoardState = () => {
    queryClient.invalidateQueries({
      queryKey: getListBoardsApiV1BoardsGetQueryKey({ limit: 200 }),
    });
    if (!boardId) return;
    queryClient.invalidateQueries({
      queryKey: getListApprovalsApiV1BoardsBoardIdApprovalsGetQueryKey(boardId),
    });
    queryClient.invalidateQueries({
      queryKey: getGetBoardSnapshotApiV1BoardsBoardIdSnapshotGetQueryKey(boardId),
    });
  };

  const handleApprovalDecision = (
    approvalId: string,
    status: "approved" | "rejected",
  ) => {
    if (!boardId) return;

    setUpdatingApprovalId(approvalId);
    setActionMessage(null);
    setActionError(null);

    updateApprovalMutation.mutate(
      { boardId, approvalId, data: { status } },
      {
        onSuccess: (result) => {
          if (result.status !== 200) {
            setActionError("Unable to update approval status.");
            return;
          }
          setActionMessage(
            status === "approved"
              ? "Checkpoint approved and board snapshot queued for refresh."
              : "Checkpoint rejected and board snapshot queued for refresh.",
          );
          refreshBoardState();
        },
        onError: (error) => {
          setActionError(error.message || "Unable to update approval status.");
        },
        onSettled: () => {
          setUpdatingApprovalId(null);
        },
      },
    );
  };

  const handleGatewaySync = (mode: "sync" | "rebootstrap") => {
    if (!gatewayId) return;

    setGatewayAction(mode);
    setActionMessage(null);
    setActionError(null);

    syncGatewayMutation.mutate(
      {
        gatewayId,
        params: {
          board_id: boardId ?? null,
          force_bootstrap: mode === "rebootstrap",
          include_main: true,
          overwrite: mode === "rebootstrap",
          reset_sessions: mode === "rebootstrap",
        },
      },
      {
        onSuccess: (result) => {
          if (result.status !== 200) {
            setActionError("Gateway template sync did not complete.");
            return;
          }

          setActionMessage(
            `Gateway sync finished. Updated ${result.data.agents_updated} agents and skipped ${result.data.agents_skipped}.`,
          );
          refreshBoardState();
        },
        onError: (error) => {
          setActionError(error.message || "Gateway template sync failed.");
        },
        onSettled: () => {
          setGatewayAction(null);
        },
      },
    );
  };

  const handleOpenSquadResync = () => {
    setActionMessage(null);
    setActionError(null);
    resyncMutation.mutate(undefined, {
      onSuccess: (result) => {
        if (result.status !== 200) {
          setActionError("OpenSquad resync did not complete.");
          return;
        }
        setActionMessage(
          `OpenSquad workspace resynced. ${result.data.boards?.length ?? 0} boards scanned.`,
        );
        refreshBoardState();
      },
      onError: (error) => {
        setActionError(error.message || "OpenSquad resync failed.");
      },
    });
  };

  return (
    <section className={tone.body}>
      <div>
        <p className={tone.kicker}>OPERATOR CONTROLS</p>
        <h2 className={tone.title}>Hybrid control surface</h2>
      </div>

      <div className="mt-4 grid gap-3">
        <div className={tone.card}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={tone.kicker}>FOCUSED AGENT</p>
              <p className="mt-2 truncate text-base font-semibold text-white">
                {selectedAgent?.name ?? "No agent selected"}
              </p>
              <p className={`mt-1 ${tone.muted}`}>
                {selectedAgent ? statusLabel[selectedAgent.status] : "Select an agent station"}
              </p>
            </div>
            <Badge variant="outline" className="border-white/15 text-slate-300">
              {selectedAgent?.lane ?? "idle"}
            </Badge>
          </div>
          {selectedAgent ? (
            <>
              <p className={`mt-3 ${tone.text}`}>
                {selectedAgent.task_label ?? "No active assignment right now."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {boardId ? (
                  <Link
                    href={`/boards/${boardId}`}
                    className={`${tone.action} ${tone.secondaryAction}`}
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Open board
                  </Link>
                ) : null}
                {isAdmin ? (
                  <Link
                    href={`/agents/${selectedAgent.id}`}
                    className={`${tone.action} ${tone.secondaryAction}`}
                  >
                    Agent record
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <div className={tone.card}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={tone.kicker}>CHECKPOINT QUEUE</p>
              <p className="mt-2 text-base font-semibold text-white">
                {pendingApprovals.length} pending
              </p>
            </div>
            {boardId ? (
              <Link
                href={`/approvals`}
                className={`${tone.action} ${tone.secondaryAction}`}
              >
                All approvals
              </Link>
            ) : null}
          </div>

          <div className="mt-3 space-y-3">
            {pendingApprovals.length > 0 ? (
              pendingApprovals.map((approval) => (
                <article key={approval.id} className={tone.row}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {approval.action_type}
                      </p>
                      <p className={`mt-1 ${tone.muted}`}>
                        {approval.task_titles?.[0] || approval.task_id || "Board-level approval"}
                      </p>
                    </div>
                    <Badge variant="warning">pending</Badge>
                  </div>
                  <div className={`mt-3 flex items-center justify-between gap-3 ${tone.muted}`}>
                    <span>{approval.confidence}% confidence</span>
                    <span>{formatTimestamp(approval.created_at)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`${tone.action} ${tone.successAction}`}
                      onClick={() => handleApprovalDecision(approval.id, "approved")}
                      disabled={updatingApprovalId === approval.id}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      className={`${tone.action} ${tone.dangerAction}`}
                      onClick={() => handleApprovalDecision(approval.id, "rejected")}
                      disabled={updatingApprovalId === approval.id}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className={tone.empty}>
                No pending checkpoints are blocking this board right now.
              </div>
            )}
          </div>
        </div>

        <div className={tone.card}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={tone.kicker}>GATEWAY CONTROL</p>
              <p className="mt-2 text-base font-semibold text-white">
                {gatewayId ? "Template sync and bootstrap" : "No gateway on this board"}
              </p>
              <p className={`mt-1 ${tone.muted}`}>
                {gatewayId
                  ? "Use the existing Mission Control gateway admin endpoints to refresh runtime templates."
                  : "Assign a gateway to this board to unlock runtime controls."}
              </p>
            </div>
            {gatewayId && isAdmin ? (
              <Link
                href={`/gateways/${gatewayId}`}
                className={`${tone.action} ${tone.secondaryAction}`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Gateway
              </Link>
            ) : null}
          </div>

          {gatewayId ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={`${tone.action} ${tone.secondaryAction}`}
                onClick={() => handleGatewaySync("sync")}
                disabled={!isAdmin || gatewayAction !== null}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync templates
              </button>
              <button
                type="button"
                className={`${tone.action} ${tone.primaryAction}`}
                onClick={() => handleGatewaySync("rebootstrap")}
                disabled={!isAdmin || gatewayAction !== null}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Rebootstrap
              </button>
            </div>
          ) : null}

          {gatewayId && !isAdmin ? (
            <p className={`mt-3 ${tone.text}`}>
              Gateway template sync is restricted to organization admins.
            </p>
          ) : null}
        </div>

        {isOpenSquadSynced ? (
          <div className={tone.card}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={tone.kicker}>OPENSQUAD SYNC</p>
                <p className="mt-2 text-base font-semibold text-white">Workspace adapter</p>
                <p className={`mt-1 ${tone.muted}`}>
                  Pull the latest runtime state from the local OpenSquad workspace into Mission
                  Control.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={`${tone.action} ${tone.secondaryAction}`}
                onClick={handleOpenSquadResync}
                disabled={!isAdmin || resyncMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Resync workspace
              </button>
            </div>
          </div>
        ) : null}

        {actionMessage ? (
          <div className={`${tone.notice} ${tone.noticeInfo}`}>{actionMessage}</div>
        ) : null}
        {actionError ? (
          <div className={`${tone.notice} ${tone.noticeError}`}>{actionError}</div>
        ) : null}
      </div>
    </section>
  );
}
