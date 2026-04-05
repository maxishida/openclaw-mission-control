import type { BoardRead } from "@/api/generated/model";

export const isOpenSquadSyncedBoard = (
  board: Pick<BoardRead, "goal_source" | "sync_source">,
) => board.sync_source === "opensquad" || board.goal_source === "opensquad-sync";

export const getBoardSyncStateLabel = (
  board: Pick<BoardRead, "goal_source" | "sync_source" | "sync_state">,
) => {
  if (!isOpenSquadSyncedBoard(board)) return "Mission Control";
  if (board.sync_state === "error") return "Sync error";
  if (board.sync_state === "stale") return "Sync stale";
  return "OpenSquad synced";
};

export const getBoardSyncVariant = (
  board: Pick<BoardRead, "goal_source" | "sync_source" | "sync_state">,
) => {
  if (!isOpenSquadSyncedBoard(board)) return "outline" as const;
  if (board.sync_state === "error") return "danger" as const;
  if (board.sync_state === "stale") return "warning" as const;
  return "success" as const;
};
