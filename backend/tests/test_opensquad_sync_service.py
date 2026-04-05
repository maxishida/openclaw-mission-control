# ruff: noqa: INP001
"""Tests for the OpenSquad hybrid sync service."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.activity_events import ActivityEvent
from app.models.agents import Agent
from app.models.approvals import Approval
from app.models.board_memory import BoardMemory
from app.models.boards import Board
from app.models.tasks import Task
from app.services.opensquad_sync import OpenSquadSyncService


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _write_workspace(root: Path) -> None:
    squad_dir = root / "squads" / "instagram-hot-news-carousel"
    output_dir = squad_dir / "output" / "run-001"
    context_dir = root / ".context" / "instagram-carousel" / "2026-04-04-theme-rollout" / "carousel-01"
    output_dir.mkdir(parents=True)
    context_dir.mkdir(parents=True)

    state = {
        "name": "Instagram Hot News Carousel",
        "objective": "Ship one carousel with live checkpoints.",
        "phase": "review",
        "agents": [
            {"name": "Instagram Lead", "role": "Squad Lead", "is_lead": True},
            {"name": "News Scout", "role": "Research Scout"},
            {"name": "Carousel Writer", "role": "Writer"},
        ],
        "pipeline": {
            "steps": [
                {"id": "trend-sweep", "title": "Trend sweep", "agent": "News Scout", "status": "done"},
                {
                    "id": "copy-pass",
                    "title": "Copy pass",
                    "agent": "Carousel Writer",
                    "status": "review",
                    "description": "Final copy pass before publish",
                },
            ]
        },
        "checkpoints": [
            {
                "id": "publish-review",
                "action_type": "publish.review",
                "task": "Copy pass",
                "status": "pending",
                "reason": "Operator sign-off is still required.",
                "confidence": 84,
                "agent": "Instagram Lead",
            }
        ],
        "handoffs": [
            {
                "from": "News Scout",
                "to": "Carousel Writer",
                "message": "Angle is locked, continue with copy.",
            }
        ],
        "activity": [
            {
                "event_type": "task.status_changed",
                "message": "Carousel Writer moved Copy pass into review.",
                "task_title": "Copy pass",
                "agent": "Carousel Writer",
            }
        ],
    }
    (squad_dir / "state.json").write_text(json.dumps(state), encoding="utf-8")
    (squad_dir / "squad.yaml").write_text(
        "\n".join(
            [
                "name: Instagram Hot News Carousel",
                "description: Fast-turn Instagram carousel squad",
                "objective: Ship one carousel with live checkpoints.",
                "success_metrics:",
                "  slides: 8",
                "  channel: instagram",
            ]
        ),
        encoding="utf-8",
    )
    (squad_dir / "squad-party.csv").write_text(
        "name,role,lead\nInstagram Lead,Squad Lead,true\nNews Scout,Research Scout,false\n",
        encoding="utf-8",
    )
    (squad_dir / "memories.md").write_text(
        "# Memory\n\nAngle brief approved.\n\nKeep the hook anchored on the market shock headline.\n",
        encoding="utf-16",
    )
    (squad_dir / "runs.md").write_text(
        "# Runs\n\nRun 001 closed after review checkpoint.\n",
        encoding="utf-8",
    )
    (output_dir / "carousel.md").write_text("# Draft\n\nSlide deck output.\n", encoding="utf-8")
    (context_dir / "post.md").write_text(
        "## Post\n\nOne approval queue can erase the gains from five automations.\n",
        encoding="utf-8",
    )
    (context_dir / "rollout-summary.md").write_text(
        "# Instagram rollout\n\nTemas aplicados:\n- carousel-01 -> cyber-green\n\npublish real concluido\n",
        encoding="utf-8",
    )
    (context_dir / "publish-result.txt").write_text(
        "[dotenv@17.2.3] injecting env from .env.local\n✅ Instagram carousel published\n",
        encoding="utf-8",
    )


@pytest.mark.asyncio
async def test_opensquad_sync_service_materializes_and_dedupes_workspace() -> None:
    tmp_path = (
        Path(__file__).resolve().parents[1] / ".tmp-tests" / f"opensquad-sync-{uuid4().hex}"
    )
    tmp_path.mkdir(parents=True, exist_ok=True)
    _write_workspace(tmp_path)
    engine = await _make_engine()
    session_maker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    service = OpenSquadSyncService(
        session_factory=session_maker,
        enabled=True,
        root=tmp_path,
        interval_seconds=1.0,
        gateway_name="OpenSquad Bridge",
    )

    try:
        await service.run_once()

        async with session_maker() as session:
            boards = list(await session.exec(select(Board)))
            assert len(boards) == 1
            board = boards[0]
            assert board.slug == "instagram-hot-news-carousel"
            assert board.goal_source == "opensquad-sync"

            agents = list(await session.exec(select(Agent).where(col(Agent.board_id) == board.id)))
            assert len(agents) >= 3

            tasks = list(await session.exec(select(Task).where(col(Task.board_id) == board.id)))
            assert len(tasks) == 2

            approvals = list(
                await session.exec(select(Approval).where(col(Approval.board_id) == board.id)),
            )
            assert len(approvals) == 1
            assert approvals[0].status == "pending"

            memories = list(
                await session.exec(select(BoardMemory).where(col(BoardMemory.board_id) == board.id)),
            )
            assert len(memories) >= 3
            assert any(
                ".context/instagram-carousel/2026-04-04-theme-rollout/carousel-01/post.md"
                in memory.content
                for memory in memories
            )

            activity = list(
                await session.exec(select(ActivityEvent).where(col(ActivityEvent.board_id) == board.id)),
            )
            assert len(activity) >= 1
            assert any(event.event_type == "opensquad.publish" for event in activity)

        status_read = service.status_snapshot()
        assert status_read.enabled is True
        assert status_read.state == "healthy"
        assert len(status_read.boards) == 1
        assert status_read.boards[0].slug == "instagram-hot-news-carousel"

        commands_path = await service.append_control_command(
            board_slug="instagram-hot-news-carousel",
            payload={"type": "checkpoint.resolve", "status": "approved"},
        )
        assert commands_path is not None
        assert commands_path.is_file()

        async with session_maker() as session:
            counts_before = {
                "agents": len(list(await session.exec(select(Agent).where(col(Agent.board_id) == board.id)))),
                "tasks": len(list(await session.exec(select(Task).where(col(Task.board_id) == board.id)))),
                "approvals": len(list(await session.exec(select(Approval).where(col(Approval.board_id) == board.id)))),
                "memories": len(list(await session.exec(select(BoardMemory).where(col(BoardMemory.board_id) == board.id)))),
                "activity": len(list(await session.exec(select(ActivityEvent).where(col(ActivityEvent.board_id) == board.id)))),
            }

        await service.run_once()

        async with session_maker() as session:
            counts_after = {
                "agents": len(list(await session.exec(select(Agent).where(col(Agent.board_id) == board.id)))),
                "tasks": len(list(await session.exec(select(Task).where(col(Task.board_id) == board.id)))),
                "approvals": len(list(await session.exec(select(Approval).where(col(Approval.board_id) == board.id)))),
                "memories": len(list(await session.exec(select(BoardMemory).where(col(BoardMemory.board_id) == board.id)))),
                "activity": len(list(await session.exec(select(ActivityEvent).where(col(ActivityEvent.board_id) == board.id)))),
            }

        assert counts_after == counts_before
    finally:
        await engine.dispose()
        shutil.rmtree(tmp_path, ignore_errors=True)
