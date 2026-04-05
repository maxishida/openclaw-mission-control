"""Hybrid OpenSquad adapter that materializes local squads into Mission Control."""

from __future__ import annotations

import asyncio
import csv
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal
from uuid import UUID

from sqlmodel import col, select

from app.core.auth import LOCAL_AUTH_EMAIL, LOCAL_AUTH_NAME, LOCAL_AUTH_USER_ID
from app.core.config import settings
from app.core.logging import get_logger
from app.core.time import utcnow
from app.db.session import async_session_maker
from app.models.activity_events import ActivityEvent
from app.models.agents import Agent
from app.models.approvals import Approval
from app.models.board_memory import BoardMemory
from app.models.boards import Board
from app.models.gateways import Gateway
from app.models.organization_members import OrganizationMember
from app.models.organizations import Organization
from app.models.tasks import Task
from app.models.users import User
from app.schemas.boards import BoardRead
from app.schemas.opensquad_sync import OpenSquadBoardSyncRead, OpenSquadSyncStatusRead
from app.services.openclaw.constants import DEFAULT_HEARTBEAT_CONFIG
from app.services.openclaw.shared import GatewayAgentIdentity

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from sqlmodel.ext.asyncio.session import AsyncSession

try:  # pragma: no cover - optional dependency in some local environments
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

logger = get_logger(__name__)

SyncState = Literal["healthy", "stale", "error"]
SyncServiceState = Literal["disabled", "healthy", "stale", "error"]
SessionFactory = "async_sessionmaker[AsyncSession]"
OPENSQUAD_BOARD_SOURCE = "opensquad-sync"
_SYNC_TAG = "opensquad-sync"
_MEMORY_KEY_PREFIX = "opensquad:key:"
_CONTEXT_MEMORY_FILES = frozenset(
    {
        "assets-manifest.json",
        "batch-report.md",
        "caption.txt",
        "carousel-manifest.json",
        "post.md",
        "publish-dry-run.txt",
        "publish-result-live.json",
        "publish-result.json",
        "publish-result.txt",
        "rollout-summary.md",
        "youtube-publish-batch.json",
        "youtube-publish-batch.md",
    },
)
_CONTEXT_EVENT_FILES = frozenset(
    {
        "publish-dry-run.txt",
        "publish-result-live.json",
        "publish-result.json",
        "publish-result.txt",
        "rollout-summary.md",
    },
)


def _slugify(value: str) -> str:
    normalized = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    return "-".join(part for part in normalized.split("-") if part)


def _safe_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)
    if not isinstance(value, str):
        return None
    normalized = value.strip().replace("Z", "+00:00")
    if not normalized:
        return None
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed
    return parsed.astimezone(UTC).replace(tzinfo=None)


def _as_mapping(value: object) -> Mapping[str, object] | None:
    if isinstance(value, Mapping):
        return value
    return None


def _as_list(value: object) -> list[object]:
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return list(value)
    return []


def _read_json(path: Path) -> Mapping[str, object]:
    if not path.is_file():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.warning("opensquad.sync.read_json_failed path=%s", path)
        return {}
    mapping = _as_mapping(loaded)
    return dict(mapping) if mapping is not None else {}


def _read_yaml(path: Path) -> Mapping[str, object]:
    if not path.is_file():
        return {}
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        logger.warning("opensquad.sync.read_yaml_failed path=%s", path)
        return {}
    if yaml is None:
        return {}
    try:
        loaded = yaml.safe_load(raw)
    except Exception:
        logger.warning("opensquad.sync.parse_yaml_failed path=%s", path)
        return {}
    mapping = _as_mapping(loaded)
    return dict(mapping) if mapping is not None else {}


def _max_datetime(*values: datetime | None) -> datetime | None:
    resolved = [value for value in values if value is not None]
    if not resolved:
        return None
    return max(resolved)


def _read_text_excerpt(path: Path, *, max_lines: int = 10, max_chars: int = 1200) -> str:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    lines: list[str] = []
    for raw_line in raw.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("[dotenv@"):
            continue
        lines.append(line)
        if len(lines) >= max_lines:
            break
    if not lines:
        return ""
    content = "\n".join(lines)
    if len(content) > max_chars:
        return f"{content[: max_chars - 3]}..."
    return content


def _read_markdown_summary(path: Path, *, source: str, key: str, tag: str) -> list["ParsedMemory"]:
    if not path.is_file():
        return []
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return []
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    if not lines:
        return []
    content = "\n".join(lines[:12]).strip()
    if len(content) > 1600:
        content = f"{content[:1597]}..."
    created_at = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).replace(tzinfo=None)
    return [
        ParsedMemory(
            key=f"{tag}:{key}",
            content=content,
            source=source,
            tags=[_SYNC_TAG, tag],
            created_at=created_at,
        )
    ]


def _read_party_csv(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    try:
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            rows = []
            for row in reader:
                normalized = {
                    str(key).strip().lower(): str(value).strip()
                    for key, value in row.items()
                    if key is not None and value is not None and str(value).strip()
                }
                if normalized:
                    rows.append(normalized)
            return rows
    except OSError:
        return []


def _string_from_mapping(mapping: Mapping[str, object] | None, *keys: str) -> str | None:
    if mapping is None:
        return None
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _float_from_mapping(mapping: Mapping[str, object] | None, *keys: str) -> float | None:
    if mapping is None:
        return None
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, (float, int)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value.strip())
            except ValueError:
                continue
    return None


def _extract_markdown_title(path: Path) -> str:
    stem = path.stem.replace(".agent", "")
    return " ".join(part.capitalize() for part in stem.replace("_", "-").split("-") if part)


def _normalize_task_status(raw_status: str | None) -> str:
    status_value = (raw_status or "").strip().lower()
    if status_value in {"done", "complete", "completed", "published", "success"}:
        return "done"
    if status_value in {"in_progress", "running", "active", "working", "executing"}:
        return "in_progress"
    if status_value in {"review", "checkpoint", "waiting_approval", "pending_approval"}:
        return "review"
    return "inbox"


def _normalize_approval_status(raw_status: str | None) -> str:
    status_value = (raw_status or "").strip().lower()
    if status_value in {"approved", "accept", "accepted", "done"}:
        return "approved"
    if status_value in {"rejected", "reject", "failed", "denied"}:
        return "rejected"
    return "pending"


def _flatten_pipeline(raw_pipeline: object) -> list[object]:
    pipeline_map = _as_mapping(raw_pipeline)
    if pipeline_map is not None:
        for key in ("steps", "pipeline", "stages"):
            steps = _as_list(pipeline_map.get(key))
            if steps:
                return steps
    return _as_list(raw_pipeline)


@dataclass(slots=True)
class ParsedAgent:
    key: str
    name: str
    role: str
    status: str = "online"
    emoji: str = ":gear:"
    is_lead: bool = False


@dataclass(slots=True)
class ParsedTask:
    key: str
    title: str
    description: str | None
    status: str
    agent_name: str | None = None
    created_at: datetime | None = None


@dataclass(slots=True)
class ParsedApproval:
    key: str
    action_type: str
    task_key: str | None
    task_title: str | None
    status: str
    confidence: float
    reason: str
    agent_name: str | None = None
    created_at: datetime | None = None
    resolved_at: datetime | None = None


@dataclass(slots=True)
class ParsedMemory:
    key: str
    content: str
    source: str | None = None
    tags: list[str] = field(default_factory=list)
    created_at: datetime | None = None


@dataclass(slots=True)
class ParsedActivity:
    key: str
    event_type: str
    message: str
    task_key: str | None = None
    task_title: str | None = None
    agent_name: str | None = None
    created_at: datetime | None = None


@dataclass(slots=True)
class ParsedBoard:
    slug: str
    name: str
    description: str
    objective: str
    success_metrics: dict[str, object]
    workspace_path: Path
    source_updated_at: datetime | None
    agents: list[ParsedAgent] = field(default_factory=list)
    tasks: list[ParsedTask] = field(default_factory=list)
    approvals: list[ParsedApproval] = field(default_factory=list)
    memories: list[ParsedMemory] = field(default_factory=list)
    activity: list[ParsedActivity] = field(default_factory=list)


@dataclass(slots=True)
class SyncBoardMeta:
    slug: str
    name: str
    workspace_path: str
    board_id: UUID | None = None
    organization_id: UUID | None = None
    sync_state: SyncState = "healthy"
    last_synced_at: datetime | None = None
    source_updated_at: datetime | None = None
    last_error: str | None = None

    def to_read(self) -> OpenSquadBoardSyncRead:
        return OpenSquadBoardSyncRead(
            board_id=self.board_id,
            organization_id=self.organization_id,
            slug=self.slug,
            name=self.name,
            workspace_path=self.workspace_path,
            sync_state=self.sync_state,
            last_synced_at=self.last_synced_at,
            source_updated_at=self.source_updated_at,
            last_error=self.last_error,
        )


class OpenSquadSyncService:
    """Continuously synchronize an OpenSquad workspace into Mission Control models."""

    def __init__(
        self,
        *,
        session_factory: SessionFactory = async_session_maker,
        enabled: bool | None = None,
        root: str | Path | None = None,
        interval_seconds: float | None = None,
        gateway_name: str | None = None,
    ) -> None:
        self._session_factory = session_factory
        self.enabled = settings.opensquad_sync_enabled if enabled is None else enabled
        configured_root = settings.opensquad_root if root is None else root
        self.root = Path(configured_root).expanduser() if configured_root else None
        self.interval_seconds = (
            settings.opensquad_sync_interval_seconds
            if interval_seconds is None
            else interval_seconds
        )
        self.gateway_name = settings.opensquad_gateway_name if gateway_name is None else gateway_name
        self._task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        self._stop_event = asyncio.Event()
        self._board_meta_by_slug: dict[str, SyncBoardMeta] = {}
        self._board_slug_by_id: dict[UUID, str] = {}
        self._last_run_at: datetime | None = None
        self._last_error: str | None = None
        self._state: SyncServiceState = "disabled" if not self.enabled else "healthy"

    @property
    def configured(self) -> bool:
        return self.enabled and self.root is not None

    @property
    def stale_after_seconds(self) -> float:
        return max(self.interval_seconds * 10, 30.0)

    async def start(self) -> None:
        """Run an initial sync and start the polling loop."""
        if not self.enabled:
            self._state = "disabled"
            logger.info("opensquad.sync.disabled")
            return
        await self.run_once()
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        """Cancel the polling loop."""
        self._stop_event.set()
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def force_resync(self) -> OpenSquadSyncStatusRead:
        """Trigger an immediate full rescan."""
        await self.run_once()
        return self.status_snapshot()

    async def run_once(self) -> None:
        """Synchronize the workspace exactly once."""
        async with self._lock:
            if not self.configured:
                self._state = "disabled" if not self.enabled else "error"
                self._last_run_at = utcnow()
                self._last_error = (
                    None if not self.enabled else "OPENSQUAD_ROOT is not configured."
                )
                return
            if self.root is None or not self.root.exists():
                self._state = "error"
                self._last_run_at = utcnow()
                self._last_error = f"OpenSquad root not found: {self.root}"
                logger.warning("opensquad.sync.root_missing root=%s", self.root)
                return

            now = utcnow()
            seen_slugs: set[str] = set()
            try:
                parsed_boards = self._scan_workspace()
                async with self._session_factory() as session:
                    organization = await self._ensure_local_user_and_org(session)
                    gateway = await self._ensure_gateway(session, organization)
                    await self._ensure_gateway_main_agent(session, gateway)
                    for parsed_board in parsed_boards:
                        seen_slugs.add(parsed_board.slug)
                        board = await self._upsert_board(
                            session,
                            organization=organization,
                            gateway=gateway,
                            parsed=parsed_board,
                        )
                        agents_by_key = await self._upsert_agents(
                            session,
                            board=board,
                            gateway=gateway,
                            parsed=parsed_board,
                        )
                        tasks_by_key = await self._upsert_tasks(
                            session,
                            board=board,
                            agents_by_key=agents_by_key,
                            parsed=parsed_board,
                        )
                        await self._upsert_approvals(
                            session,
                            board=board,
                            agents_by_key=agents_by_key,
                            tasks_by_key=tasks_by_key,
                            parsed=parsed_board,
                        )
                        await self._upsert_memories(
                            session,
                            board=board,
                            parsed=parsed_board,
                        )
                        await self._upsert_activity(
                            session,
                            board=board,
                            agents_by_key=agents_by_key,
                            tasks_by_key=tasks_by_key,
                            parsed=parsed_board,
                        )
                        self._record_board_meta(
                            parsed=parsed_board,
                            board=board,
                            synced_at=now,
                        )
                self._mark_missing_boards_stale(seen_slugs, synced_at=now)
                self._last_run_at = now
                self._last_error = None
                self._state = self._derive_service_state()
            except Exception as exc:  # pragma: no cover - defensive service guard
                self._last_run_at = now
                self._last_error = str(exc)
                self._state = "error"
                logger.exception("opensquad.sync.run_failed")

    async def append_control_command(
        self,
        *,
        board_slug: str,
        payload: Mapping[str, object],
    ) -> Path | None:
        """Write a control command into the synced OpenSquad workspace."""
        meta = self._board_meta_by_slug.get(board_slug)
        if meta is None:
            return None
        commands_dir = Path(meta.workspace_path) / ".mission-control"
        commands_path = commands_dir / "commands.ndjson"
        serialized = json.dumps(
            {
                **payload,
                "board_slug": board_slug,
                "issued_at": utcnow().isoformat(),
                "source": "mission_control",
            },
            ensure_ascii=True,
            sort_keys=True,
        )

        def _append() -> Path:
            commands_dir.mkdir(parents=True, exist_ok=True)
            with commands_path.open("a", encoding="utf-8") as handle:
                handle.write(serialized)
                handle.write("\n")
            return commands_path

        return await asyncio.to_thread(_append)

    def board_meta_for_id(self, board_id: UUID) -> SyncBoardMeta | None:
        slug = self._board_slug_by_id.get(board_id)
        if slug is None:
            return None
        return self._board_meta_by_slug.get(slug)

    def board_meta_for_slug(self, slug: str) -> SyncBoardMeta | None:
        return self._board_meta_by_slug.get(slug)

    def status_snapshot(
        self,
        *,
        organization_id: UUID | None = None,
    ) -> OpenSquadSyncStatusRead:
        boards = [
            meta.to_read()
            for meta in sorted(self._board_meta_by_slug.values(), key=lambda item: item.name.lower())
            if organization_id is None or meta.organization_id == organization_id
        ]
        root = str(self.root) if self.root is not None else None
        return OpenSquadSyncStatusRead(
            enabled=self.enabled,
            root=root,
            interval_seconds=self.interval_seconds,
            gateway_name=self.gateway_name,
            state=self._state,
            last_run_at=self._last_run_at,
            last_error=self._last_error,
            boards=boards,
        )

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self.interval_seconds,
                )
            except TimeoutError:
                await self.run_once()

    def _scan_workspace(self) -> list[ParsedBoard]:
        if self.root is None:
            return []
        squads_root = self.root / "squads"
        workspace_root = squads_root if squads_root.is_dir() else self.root
        candidates = [
            path
            for path in workspace_root.iterdir()
            if path.is_dir() and (path / "state.json").is_file()
        ]
        parsed: list[ParsedBoard] = []
        for candidate in sorted(candidates, key=lambda item: item.name.lower()):
            try:
                parsed.append(self._parse_board(candidate))
            except Exception as exc:
                logger.exception("opensquad.sync.parse_board_failed path=%s", candidate)
                self._board_meta_by_slug[candidate.name] = SyncBoardMeta(
                    slug=candidate.name,
                    name=candidate.name.replace("-", " ").title(),
                    workspace_path=str(candidate),
                    sync_state="error",
                    last_synced_at=utcnow(),
                    source_updated_at=None,
                    last_error=str(exc),
                )
        return parsed

    def _context_roots_for_slug(self, slug: str) -> list[Path]:
        if self.root is None:
            return []
        context_root = self.root / ".context"
        if not context_root.is_dir():
            return []
        names: list[str] = []
        lowered = slug.lower()
        if "linkedin" in lowered:
            names.extend(["linkedin-carousel"])
        if "instagram" in lowered:
            names.extend(
                [
                    "instagram-carousel",
                    "instagram-infographic",
                    "instagram-orchestrator",
                    "instagram-publisher",
                ]
            )
        if "youtube" in lowered:
            names.extend(["social-scheduler", "youtube-retry"])

        resolved: list[Path] = []
        seen: set[str] = set()
        for name in names:
            candidate = context_root / name
            if not candidate.is_dir():
                continue
            key = str(candidate).lower()
            if key in seen:
                continue
            seen.add(key)
            resolved.append(candidate)
        return resolved

    def _latest_context_updated_at(self, context_roots: Sequence[Path]) -> datetime | None:
        latest: datetime | None = None
        for root in context_roots:
            for path in root.rglob("*"):
                if not path.is_file():
                    continue
                current = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).replace(tzinfo=None)
                latest = _max_datetime(latest, current)
        return latest

    def _recent_context_files(
        self,
        *,
        context_roots: Sequence[Path],
        names: frozenset[str],
        limit: int,
    ) -> list[Path]:
        files: list[Path] = []
        for root in context_roots:
            for path in root.rglob("*"):
                if path.is_file() and path.name in names:
                    files.append(path)
        return sorted(files, key=lambda item: item.stat().st_mtime, reverse=True)[:limit]

    def _parse_context_memories(self, *, context_roots: Sequence[Path]) -> list[ParsedMemory]:
        if self.root is None:
            return []
        memories: list[ParsedMemory] = []
        for path in self._recent_context_files(
            context_roots=context_roots,
            names=_CONTEXT_MEMORY_FILES,
            limit=12,
        ):
            relative_path = path.relative_to(self.root)
            excerpt = _read_text_excerpt(path, max_lines=12, max_chars=1500)
            content = f"Context artifact available: `{relative_path.as_posix()}`"
            if excerpt:
                content = f"{content}\n\n{excerpt}"
            created_at = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).replace(tzinfo=None)
            memories.append(
                ParsedMemory(
                    key=f"context-{_slugify(relative_path.as_posix())}",
                    content=content,
                    source="OpenSquad context",
                    tags=[_SYNC_TAG, "context", "artifact"],
                    created_at=created_at,
                )
            )
        return memories

    def _parse_context_activity(self, *, context_roots: Sequence[Path]) -> list[ParsedActivity]:
        if self.root is None:
            return []
        activity: list[ParsedActivity] = []
        for path in self._recent_context_files(
            context_roots=context_roots,
            names=_CONTEXT_EVENT_FILES,
            limit=8,
        ):
            relative_path = path.relative_to(self.root)
            excerpt = _read_text_excerpt(path, max_lines=4, max_chars=260)
            event_type = "opensquad.context"
            if path.name == "publish-dry-run.txt":
                event_type = "opensquad.publish.dry_run"
            elif path.name.startswith("publish-result"):
                event_type = "opensquad.publish"
            elif path.name == "rollout-summary.md":
                event_type = "opensquad.rollout"
            message = excerpt or f"Updated `{relative_path.as_posix()}`."
            created_at = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).replace(tzinfo=None)
            activity.append(
                ParsedActivity(
                    key=f"context-{_slugify(relative_path.as_posix())}",
                    event_type=event_type,
                    message=message,
                    created_at=created_at,
                )
            )
        return activity

    def _parse_board(self, squad_dir: Path) -> ParsedBoard:
        state = _read_json(squad_dir / "state.json")
        config = _read_yaml(squad_dir / "squad.yaml")
        party_rows = _read_party_csv(squad_dir / "squad-party.csv")
        agent_docs = sorted(squad_dir.glob("*.agent.md"))
        context_roots = self._context_roots_for_slug(squad_dir.name)

        slug = squad_dir.name
        name = (
            _string_from_mapping(_as_mapping(state.get("squad")), "name")
            or _string_from_mapping(state, "name", "title")
            or _string_from_mapping(config, "name", "title")
            or slug.replace("-", " ").title()
        )
        description = (
            _string_from_mapping(config, "description", "summary")
            or _string_from_mapping(state, "description", "summary")
            or f"OpenSquad synchronized board for {name}."
        )
        objective = (
            _string_from_mapping(config, "objective", "goal", "mission")
            or _string_from_mapping(state, "objective", "goal", "mission")
            or description
        )
        success_metrics = dict(_as_mapping(config.get("success_metrics")) or {})
        phase = (
            _string_from_mapping(_as_mapping(state.get("pipeline")), "phase", "status")
            or _string_from_mapping(state, "phase", "status")
            or _string_from_mapping(config, "phase", "status")
        )
        if phase:
            success_metrics.setdefault("phase", phase)
        success_metrics.setdefault("sync_origin", "opensquad")
        success_metrics.setdefault("sync_slug", slug)
        if context_roots:
            success_metrics.setdefault("context_roots", [root.name for root in context_roots])

        state_updated_at = datetime.fromtimestamp(
            (squad_dir / "state.json").stat().st_mtime,
            tz=UTC,
        ).replace(tzinfo=None)
        context_updated_at = self._latest_context_updated_at(context_roots)
        source_updated_at = _max_datetime(state_updated_at, context_updated_at)
        agents = self._parse_agents(
            slug=slug,
            state=state,
            config=config,
            party_rows=party_rows,
            agent_docs=agent_docs,
        )
        tasks = self._parse_tasks(state=state, config=config, agents=agents)
        approvals = self._parse_approvals(state=state, tasks=tasks)
        memories = self._parse_memories(squad_dir=squad_dir, state=state)
        activity = self._parse_activity(squad_dir=squad_dir, state=state, tasks=tasks)
        memories.extend(self._parse_context_memories(context_roots=context_roots))
        activity.extend(self._parse_context_activity(context_roots=context_roots))

        return ParsedBoard(
            slug=slug,
            name=name,
            description=description,
            objective=objective,
            success_metrics=success_metrics,
            workspace_path=squad_dir,
            source_updated_at=source_updated_at,
            agents=agents,
            tasks=tasks,
            approvals=approvals,
            memories=memories,
            activity=activity,
        )

    def _parse_agents(
        self,
        *,
        slug: str,
        state: Mapping[str, object],
        config: Mapping[str, object],
        party_rows: list[dict[str, str]],
        agent_docs: list[Path],
    ) -> list[ParsedAgent]:
        agents_by_key: dict[str, ParsedAgent] = {}

        def _merge_agent(
            *,
            name: str,
            role: str | None = None,
            emoji: str | None = None,
            is_lead: bool = False,
            status: str | None = None,
        ) -> None:
            key = _slugify(name)
            if not key:
                return
            existing = agents_by_key.get(key)
            if existing is None:
                agents_by_key[key] = ParsedAgent(
                    key=key,
                    name=name.strip(),
                    role=(role or "Agent").strip(),
                    emoji=(emoji or ":gear:").strip() or ":gear:",
                    is_lead=is_lead,
                    status=(status or "online").strip() or "online",
                )
                return
            if role and existing.role == "Agent":
                existing.role = role.strip()
            if emoji and existing.emoji == ":gear:":
                existing.emoji = emoji.strip() or ":gear:"
            if status:
                existing.status = status.strip() or existing.status
            existing.is_lead = existing.is_lead or is_lead

        state_agents_raw = state.get("agents")
        if isinstance(state_agents_raw, Mapping):
            for raw_name, raw_agent in state_agents_raw.items():
                name = str(raw_name).strip()
                agent_data = _as_mapping(raw_agent)
                _merge_agent(
                    name=name,
                    role=_string_from_mapping(agent_data, "role", "title", "type"),
                    emoji=_string_from_mapping(agent_data, "emoji", "avatar"),
                    is_lead=bool(agent_data and agent_data.get("is_lead")),
                    status=_string_from_mapping(agent_data, "status"),
                )
        else:
            for raw_agent in _as_list(state_agents_raw):
                agent_data = _as_mapping(raw_agent)
                if agent_data is None:
                    if isinstance(raw_agent, str) and raw_agent.strip():
                        _merge_agent(name=raw_agent.strip())
                    continue
                name = _string_from_mapping(agent_data, "name", "agent", "title")
                if not name:
                    continue
                _merge_agent(
                    name=name,
                    role=_string_from_mapping(agent_data, "role", "title", "type"),
                    emoji=_string_from_mapping(agent_data, "emoji", "avatar"),
                    is_lead=bool(agent_data.get("is_lead") or agent_data.get("lead")),
                    status=_string_from_mapping(agent_data, "status"),
                )

        for raw_agent in _as_list(config.get("agents")):
            agent_data = _as_mapping(raw_agent)
            if agent_data is None:
                if isinstance(raw_agent, str) and raw_agent.strip():
                    _merge_agent(name=raw_agent.strip())
                continue
            name = _string_from_mapping(agent_data, "name", "agent", "title")
            if not name:
                continue
            _merge_agent(
                name=name,
                role=_string_from_mapping(agent_data, "role", "type", "title"),
                emoji=_string_from_mapping(agent_data, "emoji"),
                is_lead=bool(agent_data.get("is_lead") or agent_data.get("lead")),
            )

        for row in party_rows:
            name = row.get("name") or row.get("agent") or row.get("member")
            if not name:
                continue
            _merge_agent(
                name=name,
                role=row.get("role") or row.get("title") or row.get("responsibility"),
                emoji=row.get("emoji"),
                is_lead=(row.get("lead", "").lower() in {"1", "true", "yes"}),
            )

        for path in agent_docs:
            title = _extract_markdown_title(path)
            if title:
                _merge_agent(name=title)

        if agents_by_key:
            ordered = sorted(
                agents_by_key.values(),
                key=lambda item: (not item.is_lead, item.name.lower()),
            )
            if not any(agent.is_lead for agent in ordered):
                ordered[0].is_lead = True
            return ordered

        fallback_name = slug.replace("-", " ").title()
        return [
            ParsedAgent(
                key=_slugify(fallback_name),
                name=fallback_name,
                role="Squad Lead",
                is_lead=True,
            )
        ]

    def _parse_tasks(
        self,
        *,
        state: Mapping[str, object],
        config: Mapping[str, object],
        agents: list[ParsedAgent],
    ) -> list[ParsedTask]:
        tasks: list[ParsedTask] = []
        raw_pipeline = (
            state.get("pipeline")
            or config.get("pipeline")
            or state.get("steps")
            or config.get("steps")
        )
        current_index = -1
        current_step = state.get("current_step") or state.get("current")
        if isinstance(current_step, int):
            current_index = current_step
        elif isinstance(current_step, str):
            try:
                current_index = int(current_step)
            except ValueError:
                current_index = -1

        for index, raw_step in enumerate(_flatten_pipeline(raw_pipeline)):
            step_data = _as_mapping(raw_step)
            if step_data is None:
                if not isinstance(raw_step, str) or not raw_step.strip():
                    continue
                title = raw_step.strip()
                tasks.append(
                    ParsedTask(
                        key=f"step-{index + 1}",
                        title=title,
                        description=None,
                        status="in_progress" if index == current_index else "inbox",
                    )
                )
                continue
            title = _string_from_mapping(step_data, "title", "name", "label", "id")
            if not title:
                continue
            task_key = _slugify(
                _string_from_mapping(step_data, "id", "name", "title") or title,
            )
            status = _normalize_task_status(_string_from_mapping(step_data, "status"))
            if index == current_index and status == "inbox":
                status = "in_progress"
            tasks.append(
                ParsedTask(
                    key=task_key or f"step-{index + 1}",
                    title=title,
                    description=_string_from_mapping(step_data, "description", "goal", "prompt"),
                    status=status,
                    agent_name=_string_from_mapping(
                        step_data,
                        "agent",
                        "assignee",
                        "owner",
                        "role",
                    ),
                    created_at=_safe_datetime(step_data.get("updated_at"))
                    or _safe_datetime(step_data.get("created_at")),
                )
            )

        if tasks:
            return tasks

        pending_title = _string_from_mapping(state, "current_step_label", "current_step_name")
        if pending_title:
            fallback_agent = agents[0].name if agents else None
            return [
                ParsedTask(
                    key=_slugify(pending_title),
                    title=pending_title,
                    description="OpenSquad runtime current step.",
                    status="in_progress",
                    agent_name=fallback_agent,
                )
            ]
        return []

    def _parse_approvals(
        self,
        *,
        state: Mapping[str, object],
        tasks: list[ParsedTask],
    ) -> list[ParsedApproval]:
        approvals: list[ParsedApproval] = []
        tasks_by_key = {task.key: task for task in tasks}
        tasks_by_title = {task.title: task for task in tasks}
        raw_checkpoints = (
            state.get("checkpoints")
            or state.get("approvals")
            or state.get("pending_checkpoints")
        )
        for index, raw_approval in enumerate(_as_list(raw_checkpoints)):
            approval_data = _as_mapping(raw_approval)
            if approval_data is None:
                continue
            task_ref = _string_from_mapping(approval_data, "task", "task_key", "step", "step_id")
            linked_task = tasks_by_key.get(_slugify(task_ref or "")) or tasks_by_title.get(
                task_ref or "",
            )
            task_title = linked_task.title if linked_task is not None else task_ref
            approvals.append(
                ParsedApproval(
                    key=_slugify(
                        _string_from_mapping(approval_data, "id", "name")
                        or f"{index}-{task_title or 'checkpoint'}",
                    )
                    or f"approval-{index + 1}",
                    action_type=(
                        _string_from_mapping(approval_data, "action_type", "type", "action")
                        or "checkpoint.review"
                    ),
                    task_key=(
                        linked_task.key
                        if linked_task is not None
                        else _slugify(task_ref or "")
                    ),
                    task_title=task_title,
                    status=_normalize_approval_status(
                        _string_from_mapping(approval_data, "status"),
                    ),
                    confidence=_float_from_mapping(approval_data, "confidence", "score") or 80.0,
                    reason=(
                        _string_from_mapping(approval_data, "reason", "message", "notes")
                        or "Checkpoint awaiting operator resolution."
                    ),
                    agent_name=_string_from_mapping(approval_data, "agent", "owner", "approver"),
                    created_at=_safe_datetime(approval_data.get("created_at"))
                    or _safe_datetime(approval_data.get("updated_at")),
                    resolved_at=_safe_datetime(approval_data.get("resolved_at")),
                )
            )

        if approvals:
            return approvals

        for task in tasks:
            if task.status != "review":
                continue
            approvals.append(
                ParsedApproval(
                    key=_slugify(f"checkpoint-{task.key}"),
                    action_type="checkpoint.review",
                    task_key=task.key,
                    task_title=task.title,
                    status="pending",
                    confidence=80.0,
                    reason="OpenSquad step is waiting at a review checkpoint.",
                )
            )
        return approvals

    def _parse_memories(
        self,
        *,
        squad_dir: Path,
        state: Mapping[str, object],
    ) -> list[ParsedMemory]:
        memories: list[ParsedMemory] = []
        for index, raw_handoff in enumerate(_as_list(state.get("handoffs"))):
            handoff_data = _as_mapping(raw_handoff)
            if handoff_data is None:
                continue
            source = _string_from_mapping(handoff_data, "from", "source") or "handoff"
            destination = _string_from_mapping(handoff_data, "to", "target") or "next station"
            summary = (
                _string_from_mapping(handoff_data, "message", "summary", "notes")
                or f"Handoff from {source} to {destination}."
            )
            memories.append(
                ParsedMemory(
                    key=f"handoff-{index + 1}",
                    content=summary,
                    source=source,
                    tags=[_SYNC_TAG, "handoff"],
                    created_at=_safe_datetime(handoff_data.get("created_at"))
                    or _safe_datetime(handoff_data.get("updated_at")),
                )
            )

        memories.extend(
            _read_markdown_summary(
                squad_dir / "memories.md",
                source="OpenSquad memory",
                key="memories",
                tag="context",
            )
        )
        memories.extend(
            _read_markdown_summary(
                squad_dir / "runs.md",
                source="OpenSquad runs",
                key="runs",
                tag="run-log",
            )
        )
        output_dir = squad_dir / "output"
        if output_dir.is_dir():
            recent_files = sorted(
                [path for path in output_dir.rglob("*") if path.is_file()],
                key=lambda item: item.stat().st_mtime,
                reverse=True,
            )[:6]
            for index, path in enumerate(recent_files):
                relative_path = path.relative_to(squad_dir)
                created_at = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).replace(
                    tzinfo=None,
                )
                memories.append(
                    ParsedMemory(
                        key=f"artifact-{index + 1}-{_slugify(str(relative_path))}",
                        content=f"Artifact available: `{relative_path.as_posix()}`",
                        source="OpenSquad output",
                        tags=[_SYNC_TAG, "artifact"],
                        created_at=created_at,
                    )
                )
        return memories

    def _parse_activity(
        self,
        *,
        squad_dir: Path,
        state: Mapping[str, object],
        tasks: list[ParsedTask],
    ) -> list[ParsedActivity]:
        activity: list[ParsedActivity] = []
        task_by_title = {task.title: task for task in tasks}
        raw_events = (
            state.get("activity")
            or state.get("events")
            or state.get("history")
            or state.get("log")
        )
        for index, raw_event in enumerate(_as_list(raw_events)):
            event_data = _as_mapping(raw_event)
            if event_data is None:
                if isinstance(raw_event, str) and raw_event.strip():
                    activity.append(
                        ParsedActivity(
                            key=f"log-{index + 1}",
                            event_type="opensquad.log",
                            message=raw_event.strip(),
                        )
                    )
                continue
            task_title = _string_from_mapping(
                event_data,
                "task",
                "task_title",
                "step",
                "step_title",
            )
            linked_task = task_by_title.get(task_title or "")
            activity.append(
                ParsedActivity(
                    key=_slugify(
                        _string_from_mapping(event_data, "id")
                        or f"{index}-{task_title or 'event'}",
                    )
                    or f"event-{index + 1}",
                    event_type=(
                        _string_from_mapping(event_data, "event_type", "type", "kind")
                        or "opensquad.event"
                    ),
                    message=(
                        _string_from_mapping(event_data, "message", "summary", "title", "event")
                        or "OpenSquad runtime event"
                    ),
                    task_key=(
                        linked_task.key
                        if linked_task is not None
                        else _slugify(task_title or "")
                    ),
                    task_title=task_title,
                    agent_name=_string_from_mapping(event_data, "agent", "owner", "from"),
                    created_at=_safe_datetime(event_data.get("created_at"))
                    or _safe_datetime(event_data.get("updated_at")),
                )
            )

        if not activity:
            state_mtime = datetime.fromtimestamp((squad_dir / "state.json").stat().st_mtime, tz=UTC)
            for task in tasks:
                activity.append(
                    ParsedActivity(
                        key=f"task-{task.key}",
                        event_type="opensquad.task",
                        message=f"{task.title} is currently {task.status}.",
                        task_key=task.key,
                        task_title=task.title,
                        agent_name=task.agent_name,
                        created_at=state_mtime.replace(tzinfo=None),
                    )
                )
        return activity

    async def _ensure_local_user_and_org(self, session: AsyncSession) -> Organization:
        user = (
            await session.exec(
                select(User).where(col(User.clerk_user_id) == LOCAL_AUTH_USER_ID),
            )
        ).first()
        if user is None:
            user = User(
                clerk_user_id=LOCAL_AUTH_USER_ID,
                email=LOCAL_AUTH_EMAIL,
                name=LOCAL_AUTH_NAME,
                preferred_name=LOCAL_AUTH_NAME,
                is_super_admin=False,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)

        membership = (
            await session.exec(
                select(OrganizationMember).where(col(OrganizationMember.user_id) == user.id),
            )
        ).first()
        organization = None
        if membership is not None:
            organization = (
                await session.exec(
                    select(Organization).where(col(Organization.id) == membership.organization_id),
                )
            ).first()
        if organization is None:
            organization = (await session.exec(select(Organization))).first()
        if organization is None:
            organization = Organization(name="Prompthub")
            session.add(organization)
            await session.commit()
            await session.refresh(organization)

        if membership is None:
            session.add(
                OrganizationMember(
                    organization_id=organization.id,
                    user_id=user.id,
                    role="owner",
                    all_boards_read=True,
                    all_boards_write=True,
                )
            )
            await session.commit()

        if user.active_organization_id != organization.id:
            user.active_organization_id = organization.id
            session.add(user)
            await session.commit()

        return organization

    async def _ensure_gateway(self, session: AsyncSession, organization: Organization) -> Gateway:
        gateway = (
            await session.exec(
                select(Gateway).where(
                    col(Gateway.organization_id) == organization.id,
                    col(Gateway.name) == self.gateway_name,
                ),
            )
        ).first()
        workspace_root = str(self.root) if self.root is not None else ""
        if gateway is None:
            gateway = Gateway(
                organization_id=organization.id,
                name=self.gateway_name,
                url="ws://localhost:18789",
                token=None,
                workspace_root=workspace_root,
                allow_insecure_tls=False,
                disable_device_pairing=False,
            )
            session.add(gateway)
            await session.commit()
            await session.refresh(gateway)
            return gateway
        if gateway.workspace_root != workspace_root:
            gateway.workspace_root = workspace_root
            session.add(gateway)
            await session.commit()
        return gateway

    async def _ensure_gateway_main_agent(self, session: AsyncSession, gateway: Gateway) -> Agent:
        agent = (
            await session.exec(
                select(Agent).where(
                    col(Agent.gateway_id) == gateway.id,
                    col(Agent.board_id).is_(None),
                ),
            )
        ).first()
        now = utcnow()
        if agent is None:
            agent = Agent(
                board_id=None,
                gateway_id=gateway.id,
                name=f"{gateway.name} Main",
                status="online",
                openclaw_session_id=GatewayAgentIdentity.session_key(gateway),
                heartbeat_config=DEFAULT_HEARTBEAT_CONFIG.copy(),
                identity_profile={"role": "Gateway Main", "emoji": ":gear:"},
                last_seen_at=now,
                is_board_lead=False,
            )
            session.add(agent)
            await session.commit()
            await session.refresh(agent)
            return agent
        agent.status = "online"
        agent.openclaw_session_id = GatewayAgentIdentity.session_key(gateway)
        agent.heartbeat_config = agent.heartbeat_config or DEFAULT_HEARTBEAT_CONFIG.copy()
        agent.identity_profile = {"role": "Gateway Main", "emoji": ":gear:"}
        agent.last_seen_at = now
        agent.updated_at = now
        session.add(agent)
        await session.commit()
        return agent

    async def _upsert_board(
        self,
        session: AsyncSession,
        *,
        organization: Organization,
        gateway: Gateway,
        parsed: ParsedBoard,
    ) -> Board:
        board = (
            await session.exec(
                select(Board).where(
                    col(Board.organization_id) == organization.id,
                    col(Board.slug) == parsed.slug,
                ),
            )
        ).first()
        success_metrics = {
            **parsed.success_metrics,
            "sync_origin": "opensquad",
            "sync_slug": parsed.slug,
        }
        now = utcnow()
        if board is None:
            board = Board(
                organization_id=organization.id,
                gateway_id=gateway.id,
                name=parsed.name,
                slug=parsed.slug,
                description=parsed.description,
                board_type="goal",
                objective=parsed.objective,
                success_metrics=success_metrics,
                goal_confirmed=True,
                goal_source=OPENSQUAD_BOARD_SOURCE,
                require_approval_for_done=False,
                require_review_before_done=False,
                max_agents=max(len(parsed.agents), 1),
                created_at=now,
                updated_at=now,
            )
            session.add(board)
            await session.commit()
            await session.refresh(board)
            return board

        board.gateway_id = gateway.id
        board.name = parsed.name
        board.description = parsed.description
        board.board_type = "goal"
        board.objective = parsed.objective
        board.success_metrics = success_metrics
        board.goal_confirmed = True
        board.goal_source = OPENSQUAD_BOARD_SOURCE
        board.require_approval_for_done = False
        board.require_review_before_done = False
        board.max_agents = max(len(parsed.agents), 1)
        board.updated_at = now
        session.add(board)
        await session.commit()
        await session.refresh(board)
        return board

    async def _upsert_agents(
        self,
        session: AsyncSession,
        *,
        board: Board,
        gateway: Gateway,
        parsed: ParsedBoard,
    ) -> dict[str, Agent]:
        existing_agents = list(
            await session.exec(select(Agent).where(col(Agent.board_id) == board.id)),
        )
        by_session = {
            agent.openclaw_session_id: agent
            for agent in existing_agents
            if agent.openclaw_session_id
        }
        by_name = {agent.name: agent for agent in existing_agents}
        now = utcnow()
        agents_by_key: dict[str, Agent] = {}
        for parsed_agent in parsed.agents:
            session_key = f"opensquad:{parsed.slug}:{parsed_agent.key}"
            agent = by_session.get(session_key) or by_name.get(parsed_agent.name)
            identity_profile = {
                "role": parsed_agent.role,
                "emoji": parsed_agent.emoji,
                "sync_source": "opensquad",
                "sync_slug": parsed.slug,
            }
            if agent is None:
                agent = Agent(
                    board_id=board.id,
                    gateway_id=gateway.id,
                    name=parsed_agent.name,
                    status="online",
                    openclaw_session_id=session_key,
                    heartbeat_config=DEFAULT_HEARTBEAT_CONFIG.copy(),
                    identity_profile=identity_profile,
                    last_seen_at=now,
                    is_board_lead=parsed_agent.is_lead,
                    created_at=now,
                    updated_at=now,
                )
                session.add(agent)
            else:
                agent.board_id = board.id
                agent.gateway_id = gateway.id
                agent.name = parsed_agent.name
                agent.status = "online"
                agent.openclaw_session_id = session_key
                agent.heartbeat_config = agent.heartbeat_config or DEFAULT_HEARTBEAT_CONFIG.copy()
                agent.identity_profile = identity_profile
                agent.last_seen_at = now
                agent.is_board_lead = parsed_agent.is_lead
                agent.updated_at = now
                session.add(agent)
            agents_by_key[parsed_agent.key] = agent
            agents_by_key[_slugify(parsed_agent.name)] = agent

        await session.commit()
        refreshed_agent_ids: set[UUID] = set()
        for agent in agents_by_key.values():
            if agent.id in refreshed_agent_ids:
                continue
            refreshed_agent_ids.add(agent.id)
            await session.refresh(agent)
        return agents_by_key

    async def _upsert_tasks(
        self,
        session: AsyncSession,
        *,
        board: Board,
        agents_by_key: Mapping[str, Agent],
        parsed: ParsedBoard,
    ) -> dict[str, Task]:
        existing_tasks = list(await session.exec(select(Task).where(col(Task.board_id) == board.id)))
        by_auto_reason = {
            task.auto_reason: task for task in existing_tasks if task.auto_reason is not None
        }
        tasks_by_key: dict[str, Task] = {}
        now = utcnow()
        for parsed_task in parsed.tasks:
            auto_reason = f"opensquad:{parsed.slug}:task:{parsed_task.key}"
            task = by_auto_reason.get(auto_reason)
            assigned_agent = agents_by_key.get(_slugify(parsed_task.agent_name or ""))
            created_at = parsed_task.created_at or now
            if task is None:
                task = Task(
                    board_id=board.id,
                    title=parsed_task.title,
                    description=parsed_task.description,
                    status=parsed_task.status,
                    priority="medium",
                    assigned_agent_id=assigned_agent.id if assigned_agent else None,
                    auto_created=True,
                    auto_reason=auto_reason,
                    created_at=created_at,
                    updated_at=created_at,
                    in_progress_at=created_at if parsed_task.status == "in_progress" else None,
                )
                session.add(task)
            else:
                task.title = parsed_task.title
                task.description = parsed_task.description
                task.status = parsed_task.status
                task.assigned_agent_id = assigned_agent.id if assigned_agent else None
                task.auto_created = True
                task.auto_reason = auto_reason
                task.updated_at = created_at
                task.in_progress_at = created_at if parsed_task.status == "in_progress" else None
                session.add(task)
            tasks_by_key[parsed_task.key] = task
            tasks_by_key[parsed_task.title] = task

        await session.commit()
        refreshed_task_ids: set[UUID] = set()
        for task in tasks_by_key.values():
            if task.id in refreshed_task_ids:
                continue
            refreshed_task_ids.add(task.id)
            await session.refresh(task)
        return tasks_by_key

    async def _upsert_approvals(
        self,
        session: AsyncSession,
        *,
        board: Board,
        agents_by_key: Mapping[str, Agent],
        tasks_by_key: Mapping[str, Task],
        parsed: ParsedBoard,
    ) -> None:
        existing_approvals = list(
            await session.exec(select(Approval).where(col(Approval.board_id) == board.id)),
        )
        by_key: dict[str, Approval] = {}
        for approval in existing_approvals:
            payload = _as_mapping(approval.payload)
            payload_key = _string_from_mapping(payload, "opensquad_key")
            if payload_key:
                by_key[payload_key] = approval
        for parsed_approval in parsed.approvals:
            approval = by_key.get(parsed_approval.key)
            linked_task = (
                tasks_by_key.get(parsed_approval.task_key or "")
                or tasks_by_key.get(parsed_approval.task_title or "")
            )
            linked_agent = agents_by_key.get(_slugify(parsed_approval.agent_name or ""))
            payload = {
                "reason": parsed_approval.reason,
                "opensquad_key": parsed_approval.key,
            }
            created_at = parsed_approval.created_at or utcnow()
            resolved_at = (
                parsed_approval.resolved_at if parsed_approval.status != "pending" else None
            )
            if approval is None:
                approval = Approval(
                    board_id=board.id,
                    task_id=linked_task.id if linked_task else None,
                    agent_id=linked_agent.id if linked_agent else None,
                    action_type=parsed_approval.action_type,
                    payload=payload,
                    confidence=parsed_approval.confidence,
                    status=parsed_approval.status,
                    created_at=created_at,
                    resolved_at=resolved_at,
                )
                session.add(approval)
            else:
                approval.task_id = linked_task.id if linked_task else None
                approval.agent_id = linked_agent.id if linked_agent else None
                approval.action_type = parsed_approval.action_type
                approval.payload = payload
                approval.confidence = parsed_approval.confidence
                approval.status = parsed_approval.status
                approval.created_at = created_at
                approval.resolved_at = resolved_at
                session.add(approval)
        await session.commit()

    async def _upsert_memories(
        self,
        session: AsyncSession,
        *,
        board: Board,
        parsed: ParsedBoard,
    ) -> None:
        existing_memories = list(
            await session.exec(select(BoardMemory).where(col(BoardMemory.board_id) == board.id)),
        )
        by_key: dict[str, BoardMemory] = {}
        for memory in existing_memories:
            for tag in memory.tags or []:
                if tag.startswith(_MEMORY_KEY_PREFIX):
                    by_key[tag.removeprefix(_MEMORY_KEY_PREFIX)] = memory
        for parsed_memory in parsed.memories:
            memory = by_key.get(parsed_memory.key)
            tags = sorted(
                {*(parsed_memory.tags or []), _SYNC_TAG, f"{_MEMORY_KEY_PREFIX}{parsed_memory.key}"},
            )
            created_at = parsed_memory.created_at or utcnow()
            if memory is None:
                memory = BoardMemory(
                    board_id=board.id,
                    content=parsed_memory.content,
                    tags=tags,
                    is_chat=False,
                    source=parsed_memory.source,
                    created_at=created_at,
                )
                session.add(memory)
            else:
                memory.content = parsed_memory.content
                memory.tags = tags
                memory.is_chat = False
                memory.source = parsed_memory.source
                memory.created_at = created_at
                session.add(memory)
        await session.commit()

    async def _upsert_activity(
        self,
        session: AsyncSession,
        *,
        board: Board,
        agents_by_key: Mapping[str, Agent],
        tasks_by_key: Mapping[str, Task],
        parsed: ParsedBoard,
    ) -> None:
        existing_events = list(
            await session.exec(select(ActivityEvent).where(col(ActivityEvent.board_id) == board.id)),
        )
        existing_keys = {
            (event.event_type, event.message or "", event.agent_id, event.task_id)
            for event in existing_events
        }
        for parsed_event in parsed.activity:
            linked_task = (
                tasks_by_key.get(parsed_event.task_key or "")
                or tasks_by_key.get(parsed_event.task_title or "")
            )
            linked_agent = agents_by_key.get(_slugify(parsed_event.agent_name or ""))
            event_key = (
                parsed_event.event_type,
                parsed_event.message,
                linked_agent.id if linked_agent else None,
                linked_task.id if linked_task else None,
            )
            if event_key in existing_keys:
                continue
            session.add(
                ActivityEvent(
                    event_type=parsed_event.event_type,
                    message=parsed_event.message,
                    agent_id=linked_agent.id if linked_agent else None,
                    task_id=linked_task.id if linked_task else None,
                    board_id=board.id,
                    created_at=parsed_event.created_at or utcnow(),
                )
            )
            existing_keys.add(event_key)
        await session.commit()

    def _record_board_meta(
        self,
        *,
        parsed: ParsedBoard,
        board: Board,
        synced_at: datetime,
    ) -> None:
        age_seconds = (
            (synced_at - parsed.source_updated_at).total_seconds()
            if parsed.source_updated_at is not None
            else 0.0
        )
        sync_state: SyncState = "stale" if age_seconds > self.stale_after_seconds else "healthy"
        meta = SyncBoardMeta(
            slug=parsed.slug,
            name=parsed.name,
            workspace_path=str(parsed.workspace_path),
            board_id=board.id,
            organization_id=board.organization_id,
            sync_state=sync_state,
            last_synced_at=synced_at,
            source_updated_at=parsed.source_updated_at,
            last_error=None,
        )
        self._board_meta_by_slug[parsed.slug] = meta
        self._board_slug_by_id[board.id] = parsed.slug

    def _mark_missing_boards_stale(self, seen_slugs: set[str], *, synced_at: datetime) -> None:
        for slug, meta in list(self._board_meta_by_slug.items()):
            if slug in seen_slugs:
                continue
            self._board_meta_by_slug[slug] = SyncBoardMeta(
                slug=meta.slug,
                name=meta.name,
                workspace_path=meta.workspace_path,
                board_id=meta.board_id,
                organization_id=meta.organization_id,
                sync_state="stale",
                last_synced_at=synced_at,
                source_updated_at=meta.source_updated_at,
                last_error="Squad directory is no longer present in the OpenSquad workspace.",
            )

    def _derive_service_state(self) -> SyncServiceState:
        if not self.enabled:
            return "disabled"
        if not self._board_meta_by_slug:
            return "healthy"
        states = {meta.sync_state for meta in self._board_meta_by_slug.values()}
        if "error" in states and states == {"error"}:
            return "error"
        if "stale" in states or "error" in states:
            return "stale"
        return "healthy"


_service: OpenSquadSyncService | None = None


def set_opensquad_sync_service(service: OpenSquadSyncService | None) -> None:
    """Register the process-wide OpenSquad sync service."""
    global _service
    _service = service


def get_opensquad_sync_service() -> OpenSquadSyncService | None:
    """Return the process-wide OpenSquad sync service, if configured."""
    return _service


def build_board_read(board: Board) -> BoardRead:
    """Serialize a board with hybrid sync metadata included."""
    model = BoardRead.model_validate(board, from_attributes=True)
    service = get_opensquad_sync_service()
    meta = service.board_meta_for_id(board.id) if service is not None else None
    sync_source: Literal["mission_control", "opensquad"] = (
        "opensquad"
        if meta is not None or board.goal_source == OPENSQUAD_BOARD_SOURCE
        else "mission_control"
    )
    return model.model_copy(
        update={
            "sync_source": sync_source,
            "sync_state": meta.sync_state if meta is not None else None,
            "last_synced_at": meta.last_synced_at if meta is not None else None,
        }
    )
