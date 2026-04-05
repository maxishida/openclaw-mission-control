"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { usePageActive } from "@/hooks/usePageActive";
import type { VirtualOfficeAgentView } from "@/lib/virtual-office";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

import { useVirtualOfficeBoardState } from "./useVirtualOfficeBoardState";

type UseVirtualOfficeWorkspaceArgs = {
  routeBase: string;
};

export const resolveSelectedBoardId = ({
  boards,
  preferredBoardId,
  selectedBoardFromUrl,
}: {
  boards: Array<{ id: string }>;
  preferredBoardId: string | null;
  selectedBoardFromUrl: string | null;
}) => {
  if (selectedBoardFromUrl) {
    if (boards.length === 0) return selectedBoardFromUrl;
    return boards.some((board) => board.id === selectedBoardFromUrl)
      ? selectedBoardFromUrl
      : boards[0]?.id ?? null;
  }

  if (preferredBoardId) {
    return boards.some((board) => board.id === preferredBoardId)
      ? preferredBoardId
      : boards[0]?.id ?? null;
  }

  return boards[0]?.id ?? null;
};

export const resolveSelectedAgent = ({
  agents,
  attentionAgents,
  preferredAgentId,
}: {
  agents: VirtualOfficeAgentView[];
  attentionAgents: VirtualOfficeAgentView[];
  preferredAgentId: string | null;
}) => {
  if (preferredAgentId) {
    const matchingAgent = agents.find((agent) => agent.id === preferredAgentId);
    if (matchingAgent) {
      return matchingAgent;
    }
  }

  return attentionAgents[0] ?? agents[0] ?? null;
};

export function useVirtualOfficeWorkspace({
  routeBase,
}: UseVirtualOfficeWorkspaceArgs) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const isPageActive = usePageActive();
  const selectedBoardFromUrl = searchParams.get("boardId");

  const boardsQuery = useListBoardsApiV1BoardsGet<listBoardsApiV1BoardsGetResponse, ApiError>(
    { limit: 200 },
    {
      query: {
        enabled: Boolean(isSignedIn),
        refetchInterval: 30_000,
        refetchOnMount: "always",
      },
    },
  );

  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? [...(boardsQuery.data.data.items ?? [])].sort((left, right) =>
            left.name.localeCompare(right.name),
          )
        : [],
    [boardsQuery.data],
  );

  const [preferredBoardId, setPreferredBoardId] = useState<string | null>(null);
  const [preferredAgentId, setPreferredAgentId] = useState<string | null>(null);

  const selectedBoardId = useMemo(
    () =>
      resolveSelectedBoardId({
        boards,
        preferredBoardId,
        selectedBoardFromUrl,
      }),
    [boards, preferredBoardId, selectedBoardFromUrl],
  );

  const boardState = useVirtualOfficeBoardState({
    boardId: selectedBoardId,
    enabled: Boolean(isSignedIn),
    isPageActive,
  });

  const selectedAgent = useMemo(
    () =>
      resolveSelectedAgent({
        agents: boardState.derived.agents,
        attentionAgents: boardState.derived.attention_agents,
        preferredAgentId,
      }),
    [
      boardState.derived.agents,
      boardState.derived.attention_agents,
      preferredAgentId,
    ],
  );

  const selectedAgentId = selectedAgent?.id ?? null;

  const selectedBoard =
    boards.find((board) => board.id === selectedBoardId) ?? boardState.board ?? null;

  const handleBoardSelect = (boardId: string) => {
    startTransition(() => {
      setPreferredBoardId(boardId);
      setPreferredAgentId(null);
      router.replace(`${routeBase}?boardId=${encodeURIComponent(boardId)}`);
    });
  };

  return {
    boardState,
    boards,
    boardsQuery,
    isAdmin,
    isSignedIn,
    selectedAgent,
    selectedAgentId,
    selectedBoard,
    selectedBoardId,
    setPreferredAgentId,
    handleBoardSelect,
  };
}
