"""Schemas for OpenSquad hybrid synchronization status endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from sqlmodel import Field, SQLModel

RUNTIME_ANNOTATION_TYPES = (datetime, UUID)


class OpenSquadBoardSyncRead(SQLModel):
    """Per-board sync state exposed by the OpenSquad adapter."""

    board_id: UUID | None = None
    organization_id: UUID | None = None
    slug: str
    name: str
    workspace_path: str
    sync_source: Literal["opensquad"] = "opensquad"
    sync_state: Literal["healthy", "stale", "error"]
    last_synced_at: datetime | None = None
    source_updated_at: datetime | None = None
    last_error: str | None = None


class OpenSquadSyncStatusRead(SQLModel):
    """Top-level hybrid sync status payload."""

    enabled: bool
    root: str | None = None
    interval_seconds: float = Field(ge=0.5)
    gateway_name: str
    state: Literal["disabled", "healthy", "stale", "error"]
    last_run_at: datetime | None = None
    last_error: str | None = None
    boards: list[OpenSquadBoardSyncRead] = Field(default_factory=list)
