import { describe, expect, it } from "vitest";

import { getBoardSyncStateLabel, getBoardSyncVariant, isOpenSquadSyncedBoard } from "./opensquad-sync";

describe("opensquad sync helpers", () => {
  it("detects opensquad-synced boards from sync metadata", () => {
    expect(
      isOpenSquadSyncedBoard({
        goal_source: null,
        sync_source: "opensquad",
      }),
    ).toBe(true);
  });

  it("falls back to goal source for synced boards", () => {
    expect(
      isOpenSquadSyncedBoard({
        goal_source: "opensquad-sync",
        sync_source: "mission_control",
      }),
    ).toBe(true);
  });

  it("returns tone and label for stale sync state", () => {
    const board = {
      goal_source: "opensquad-sync",
      sync_source: "opensquad",
      sync_state: "stale",
    } as const;

    expect(getBoardSyncStateLabel(board)).toBe("Sync stale");
    expect(getBoardSyncVariant(board)).toBe("warning");
  });
});
