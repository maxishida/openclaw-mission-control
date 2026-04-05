"""Seed an OpenSquad-style control plane for the local Mission Control database.

This script bootstraps a gateway plus three boards (Instagram, LinkedIn, YouTube)
with agents, tasks, approvals, memory, and activity so the Virtual Office routes
render meaningful state in a fresh local environment.
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

from sqlmodel import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.chdir(BACKEND_ROOT)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.core.auth import LOCAL_AUTH_EMAIL, LOCAL_AUTH_NAME, LOCAL_AUTH_USER_ID
from app.core.time import utcnow
from app.db.session import async_session_maker, init_db
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
from app.services.openclaw.constants import DEFAULT_HEARTBEAT_CONFIG
from app.services.openclaw.shared import GatewayAgentIdentity

DEFAULT_GATEWAY_NAME = "OpenSquad Bridge"
DEFAULT_GATEWAY_URL = "ws://localhost:18789"
DEFAULT_WORKSPACE_ROOT = "~/.openclaw"
DEFAULT_ORGANIZATION_NAME = "Prompthub"


def _slugify(value: str) -> str:
    return "-".join(
        filter(None, "".join(ch.lower() if ch.isalnum() else "-" for ch in value).split("-")),
    )


@dataclass(frozen=True, slots=True)
class AgentSeed:
    name: str
    role: str
    emoji: str
    is_lead: bool = False
    last_seen_minutes_ago: int = 2
    status: str = "online"
    purpose: str | None = None
    personality: str | None = None


@dataclass(frozen=True, slots=True)
class TaskSeed:
    title: str
    description: str
    agent_name: str
    status: str
    priority: str = "medium"
    minutes_ago: int = 30


@dataclass(frozen=True, slots=True)
class ApprovalSeed:
    action_type: str
    task_title: str
    confidence: float
    status: str
    reason: str
    agent_name: str | None = None
    minutes_ago: int = 10


@dataclass(frozen=True, slots=True)
class MemorySeed:
    content: str
    source: str
    tags: tuple[str, ...] = ()
    minutes_ago: int = 20


@dataclass(frozen=True, slots=True)
class ActivitySeed:
    event_type: str
    message: str
    task_title: str | None = None
    agent_name: str | None = None
    minutes_ago: int = 15


@dataclass(frozen=True, slots=True)
class BoardSeed:
    name: str
    slug: str
    description: str
    objective: str
    success_metrics: dict[str, object]
    agents: tuple[AgentSeed, ...]
    tasks: tuple[TaskSeed, ...]
    approvals: tuple[ApprovalSeed, ...] = ()
    memory: tuple[MemorySeed, ...] = ()
    activity: tuple[ActivitySeed, ...] = ()


SEED_BOARDS: tuple[BoardSeed, ...] = (
    BoardSeed(
        name="Instagram Hot News Carousel",
        slug="instagram-hot-news-carousel",
        description=(
            "Fast-turn content squad for Instagram news carousels with editorial "
            "review and publish checkpoints."
        ),
        objective="Ship a high-signal Instagram carousel from current news in one operating loop.",
        success_metrics={"slides": 8, "format": "carousel", "status": "active"},
        agents=(
            AgentSeed(
                name="Instagram Lead",
                role="Squad Orchestrator",
                emoji=":sparkles:",
                is_lead=True,
                last_seen_minutes_ago=1,
                purpose="Keep the Instagram content pipeline moving through each checkpoint.",
            ),
            AgentSeed(name="News Scout", role="Research Scout", emoji=":mag:", last_seen_minutes_ago=2),
            AgentSeed(name="Angle Editor", role="Angle Editor", emoji=":bulb:", last_seen_minutes_ago=2),
            AgentSeed(name="Carousel Writer", role="Carousel Writer", emoji=":memo:", last_seen_minutes_ago=2),
            AgentSeed(name="Visual Designer", role="Visual Designer", emoji=":art:", last_seen_minutes_ago=3),
            AgentSeed(
                name="Quality Reviewer",
                role="Quality Reviewer",
                emoji=":brain:",
                last_seen_minutes_ago=2,
            ),
            AgentSeed(
                name="Instagram Publisher",
                role="Instagram Publisher",
                emoji=":rocket:",
                last_seen_minutes_ago=4,
            ),
        ),
        tasks=(
            TaskSeed("Trend sweep", "Collect top stories and shortlist signal-rich angles.", "News Scout", "done", minutes_ago=70),
            TaskSeed("Source shortlist", "Validate sources and pick carousel-worthy evidence.", "News Scout", "done", minutes_ago=64),
            TaskSeed("Angle brief", "Frame the editorial angle for the carousel sequence.", "Angle Editor", "in_progress", minutes_ago=26),
            TaskSeed("Carousel outline", "Build the slide-by-slide narrative arc.", "Carousel Writer", "in_progress", minutes_ago=22),
            TaskSeed("Slide copy draft", "Draft final captions and transitions for each slide.", "Carousel Writer", "in_progress", minutes_ago=18),
            TaskSeed("Visual pack draft", "Assemble visual references and layout directions.", "Visual Designer", "in_progress", minutes_ago=16),
            TaskSeed("Quality gate review", "Review facts, tone, pacing, and CTA consistency.", "Quality Reviewer", "review", minutes_ago=11),
            TaskSeed("Caption polish", "Refine the CTA and voice for the publish-ready version.", "Instagram Publisher", "inbox", minutes_ago=9),
            TaskSeed("Scheduling window", "Select timing and rollout slot for the post.", "Instagram Publisher", "inbox", minutes_ago=7),
            TaskSeed("Publish asset package", "Package final assets for release.", "Instagram Publisher", "inbox", minutes_ago=6),
            TaskSeed("Post-launch monitoring", "Watch comments and initial retention signals.", "Instagram Lead", "inbox", minutes_ago=4),
        ),
        approvals=(
            ApprovalSeed(
                action_type="publish.review",
                task_title="Quality gate review",
                confidence=84,
                status="pending",
                reason="Final compliance and tone approval required before publish handoff.",
                agent_name="Quality Reviewer",
                minutes_ago=8,
            ),
        ),
        memory=(
            MemorySeed(
                content="Angle Editor handoff to Carousel Writer: keep the hook anchored on the market shock headline.",
                source="Angle Editor",
                tags=("handoff", "editorial"),
                minutes_ago=14,
            ),
            MemorySeed(
                content="Quality Reviewer flagged slide 4 for one last tone pass before publish.",
                source="Quality Reviewer",
                tags=("review", "checkpoint"),
                minutes_ago=9,
            ),
        ),
        activity=(
            ActivitySeed(
                event_type="task.status_changed",
                task_title="Angle brief",
                agent_name="Angle Editor",
                message="Angle Editor moved Angle brief into in_progress.",
                minutes_ago=26,
            ),
            ActivitySeed(
                event_type="task.status_changed",
                task_title="Quality gate review",
                agent_name="Quality Reviewer",
                message="Quality Reviewer moved Quality gate review into review.",
                minutes_ago=11,
            ),
            ActivitySeed(
                event_type="task.comment",
                task_title="Quality gate review",
                agent_name="Quality Reviewer",
                message="Need one more tone adjustment before release.",
                minutes_ago=8,
            ),
        ),
    ),
    BoardSeed(
        name="LinkedIn AI Trends Posts",
        slug="linkedin-ai-trends-posts",
        description="Thought-leadership squad for LinkedIn trend posts and analysis drops.",
        objective="Publish a complete LinkedIn AI trends post package with finished review.",
        success_metrics={"posts": 9, "status": "complete", "channel": "linkedin"},
        agents=(
            AgentSeed(name="LinkedIn Lead", role="Squad Orchestrator", emoji=":sparkles:", is_lead=True, last_seen_minutes_ago=2),
            AgentSeed(name="Trend Scout", role="Research Scout", emoji=":mag:", last_seen_minutes_ago=3),
            AgentSeed(name="Insight Distiller", role="Research Analyst", emoji=":chart_with_upwards_trend:", last_seen_minutes_ago=3),
            AgentSeed(name="Post Strategist", role="Post Strategist", emoji=":bulb:", last_seen_minutes_ago=4),
            AgentSeed(name="Copywriter", role="Copywriter", emoji=":memo:", last_seen_minutes_ago=4),
            AgentSeed(name="Editorial Reviewer", role="Quality Reviewer", emoji=":brain:", last_seen_minutes_ago=3),
            AgentSeed(name="LinkedIn Publisher", role="LinkedIn Publisher", emoji=":rocket:", last_seen_minutes_ago=4),
        ),
        tasks=(
            TaskSeed("Topic shortlist", "Choose the winning AI trend for the post.", "Trend Scout", "done", minutes_ago=95),
            TaskSeed("Source validation", "Validate the trend against recent market evidence.", "Trend Scout", "done", minutes_ago=92),
            TaskSeed("Insight synthesis", "Turn source material into a LinkedIn-native angle.", "Insight Distiller", "done", minutes_ago=88),
            TaskSeed("Post frame", "Build the opening hook and sequencing.", "Post Strategist", "done", minutes_ago=84),
            TaskSeed("Draft post copy", "Write the primary LinkedIn post draft.", "Copywriter", "done", minutes_ago=80),
            TaskSeed("Proof and polish", "Tighten clarity and remove weak phrasing.", "Editorial Reviewer", "done", minutes_ago=74),
            TaskSeed("Compliance review", "Confirm safe claims and attribution.", "Editorial Reviewer", "done", minutes_ago=70),
            TaskSeed("Scheduling setup", "Choose release timing and metadata.", "LinkedIn Publisher", "done", minutes_ago=66),
            TaskSeed("Publish handoff", "Close the run and hand results back to lead.", "LinkedIn Lead", "done", minutes_ago=60),
        ),
        approvals=(
            ApprovalSeed(
                action_type="publish.release",
                task_title="Publish handoff",
                confidence=96,
                status="approved",
                reason="Editorial and compliance checks cleared for release.",
                agent_name="LinkedIn Lead",
                minutes_ago=58,
            ),
        ),
        memory=(
            MemorySeed(
                content="LinkedIn Publisher handoff to LinkedIn Lead: package shipped and post scheduled.",
                source="LinkedIn Publisher",
                tags=("handoff", "publish"),
                minutes_ago=57,
            ),
        ),
        activity=(
            ActivitySeed(
                event_type="task.status_changed",
                task_title="Publish handoff",
                agent_name="LinkedIn Lead",
                message="LinkedIn Lead marked Publish handoff as done.",
                minutes_ago=60,
            ),
            ActivitySeed(
                event_type="task.comment",
                task_title="Draft post copy",
                agent_name="Editorial Reviewer",
                message="Final draft cleared after last edit pass.",
                minutes_ago=73,
            ),
        ),
    ),
    BoardSeed(
        name="YouTube Viral Clips",
        slug="youtube-viral-clips",
        description="Clip production squad with publishing and monitor-performance follow-through.",
        objective="Close the full YouTube viral clips pipeline and retain monitor-performance telemetry.",
        success_metrics={"clips": 11, "status": "complete", "channel": "youtube"},
        agents=(
            AgentSeed(name="YouTube Lead", role="Squad Orchestrator", emoji=":sparkles:", is_lead=True, last_seen_minutes_ago=2),
            AgentSeed(name="Trend Monitor", role="Trend Monitor", emoji=":chart_with_upwards_trend:", last_seen_minutes_ago=3),
            AgentSeed(name="Hook Writer", role="Hook Writer", emoji=":bulb:", last_seen_minutes_ago=4),
            AgentSeed(name="Script Writer", role="Script Writer", emoji=":memo:", last_seen_minutes_ago=4),
            AgentSeed(name="Thumbnail Designer", role="Visual Designer", emoji=":art:", last_seen_minutes_ago=4),
            AgentSeed(name="Quality Reviewer", role="Quality Reviewer", emoji=":brain:", last_seen_minutes_ago=3),
            AgentSeed(name="YouTube Publisher", role="YouTube Publisher", emoji=":rocket:", last_seen_minutes_ago=4),
        ),
        tasks=(
            TaskSeed("Trend pull", "Identify the best clip opportunity from the latest feed.", "Trend Monitor", "done", minutes_ago=110),
            TaskSeed("Signal ranking", "Rank candidates by click and watch potential.", "Trend Monitor", "done", minutes_ago=106),
            TaskSeed("Hook concept", "Write the opening line and first beat.", "Hook Writer", "done", minutes_ago=102),
            TaskSeed("Script pass", "Draft the short-form script.", "Script Writer", "done", minutes_ago=98),
            TaskSeed("Script tighten", "Trim dead words and sharpen the pacing.", "Script Writer", "done", minutes_ago=94),
            TaskSeed("Visual direction", "Define thumbnail and scene cues.", "Thumbnail Designer", "done", minutes_ago=90),
            TaskSeed("Thumbnail build", "Produce the thumbnail package.", "Thumbnail Designer", "done", minutes_ago=86),
            TaskSeed("QA watchthrough", "Check hook retention and clarity.", "Quality Reviewer", "done", minutes_ago=82),
            TaskSeed("Metadata pack", "Prepare title, description, and tags.", "YouTube Publisher", "done", minutes_ago=78),
            TaskSeed("Publish clip", "Ship the clip to the channel.", "YouTube Publisher", "done", minutes_ago=74),
            TaskSeed("Monitor performance", "Track the first performance window.", "Trend Monitor", "done", minutes_ago=70),
        ),
        approvals=(
            ApprovalSeed(
                action_type="publish.release",
                task_title="Publish clip",
                confidence=94,
                status="approved",
                reason="Creative QA and metadata pack both cleared.",
                agent_name="YouTube Publisher",
                minutes_ago=73,
            ),
        ),
        memory=(
            MemorySeed(
                content="Trend Monitor handoff to YouTube Lead: monitor-performance window closed with a strong first-hour curve.",
                source="Trend Monitor",
                tags=("handoff", "monitor"),
                minutes_ago=69,
            ),
        ),
        activity=(
            ActivitySeed(
                event_type="task.status_changed",
                task_title="Monitor performance",
                agent_name="Trend Monitor",
                message="Trend Monitor marked Monitor performance as done.",
                minutes_ago=70,
            ),
            ActivitySeed(
                event_type="task.comment",
                task_title="QA watchthrough",
                agent_name="Quality Reviewer",
                message="Clip cleared after final watchthrough.",
                minutes_ago=81,
            ),
        ),
    ),
)


async def _first_or_none(session: Any, statement: Any) -> Any | None:
    return (await session.exec(statement)).first()


async def ensure_local_user_and_org(session: Any) -> tuple[User, Organization]:
    user = await _first_or_none(
        session,
        select(User).where(User.clerk_user_id == LOCAL_AUTH_USER_ID),
    )
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

    membership = await _first_or_none(
        session,
        select(OrganizationMember).where(OrganizationMember.user_id == user.id),
    )

    organization: Organization | None = None
    if membership is not None:
        organization = await _first_or_none(
            session,
            select(Organization).where(Organization.id == membership.organization_id),
        )

    if organization is None:
        organization = await _first_or_none(session, select(Organization))

    if organization is None:
        organization = Organization(name=DEFAULT_ORGANIZATION_NAME)
        session.add(organization)
        await session.commit()
        await session.refresh(organization)

    if membership is None:
        membership = OrganizationMember(
            organization_id=organization.id,
            user_id=user.id,
            role="owner",
            all_boards_read=True,
            all_boards_write=True,
        )
        session.add(membership)
        await session.commit()

    if user.active_organization_id != organization.id:
        user.active_organization_id = organization.id
        session.add(user)
        await session.commit()

    return user, organization


async def ensure_gateway(session: Any, organization: Organization) -> Gateway:
    gateway = await _first_or_none(
        session,
        select(Gateway).where(
            Gateway.organization_id == organization.id,
            Gateway.name == DEFAULT_GATEWAY_NAME,
        ),
    )
    if gateway is None:
        gateway = Gateway(
            organization_id=organization.id,
            name=DEFAULT_GATEWAY_NAME,
            url=DEFAULT_GATEWAY_URL,
            token=None,
            workspace_root=DEFAULT_WORKSPACE_ROOT,
            allow_insecure_tls=False,
            disable_device_pairing=False,
        )
        session.add(gateway)
        await session.commit()
        await session.refresh(gateway)
    return gateway


async def ensure_gateway_main_agent(session: Any, gateway: Gateway) -> Agent:
    agent = await _first_or_none(
        session,
        select(Agent).where(Agent.gateway_id == gateway.id, Agent.board_id.is_(None)),
    )
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
            last_seen_at=now - timedelta(minutes=1),
            is_board_lead=False,
            created_at=now - timedelta(minutes=10),
            updated_at=now - timedelta(minutes=1),
        )
        session.add(agent)
        await session.commit()
        await session.refresh(agent)
        return agent

    changed = False
    if agent.board_id is not None:
        agent.board_id = None
        changed = True
    if agent.openclaw_session_id != GatewayAgentIdentity.session_key(gateway):
        agent.openclaw_session_id = GatewayAgentIdentity.session_key(gateway)
        changed = True
    if agent.heartbeat_config is None:
        agent.heartbeat_config = DEFAULT_HEARTBEAT_CONFIG.copy()
        changed = True
    if not isinstance(agent.identity_profile, dict):
        agent.identity_profile = {"role": "Gateway Main", "emoji": ":gear:"}
        changed = True
    if agent.status != "online":
        agent.status = "online"
        changed = True
    agent.last_seen_at = now - timedelta(minutes=1)
    agent.updated_at = now - timedelta(minutes=1)
    if changed:
        session.add(agent)
        await session.commit()
    return agent


async def upsert_board(session: Any, organization: Organization, gateway: Gateway, seed: BoardSeed) -> Board:
    board = await _first_or_none(
        session,
        select(Board).where(
            Board.organization_id == organization.id,
            Board.slug == seed.slug,
        ),
    )
    now = utcnow()
    if board is None:
        board = Board(
            organization_id=organization.id,
            gateway_id=gateway.id,
            name=seed.name,
            slug=seed.slug,
            description=seed.description,
            board_type="goal",
            objective=seed.objective,
            success_metrics=seed.success_metrics,
            goal_confirmed=True,
            goal_source="opensquad-seed",
            require_approval_for_done=False,
            require_review_before_done=False,
            max_agents=len(seed.agents),
            created_at=now - timedelta(minutes=120),
            updated_at=now - timedelta(minutes=2),
        )
        session.add(board)
        await session.commit()
        await session.refresh(board)
        return board

    board.gateway_id = gateway.id
    board.name = seed.name
    board.description = seed.description
    board.board_type = "goal"
    board.objective = seed.objective
    board.success_metrics = seed.success_metrics
    board.goal_confirmed = True
    board.goal_source = "opensquad-seed"
    board.require_approval_for_done = False
    board.require_review_before_done = False
    board.max_agents = len(seed.agents)
    board.updated_at = now - timedelta(minutes=2)
    session.add(board)
    await session.commit()
    return board


def _agent_identity(seed: AgentSeed) -> dict[str, str]:
    profile = {
        "role": seed.role,
        "emoji": seed.emoji,
    }
    if seed.purpose:
        profile["purpose"] = seed.purpose
    if seed.personality:
        profile["personality"] = seed.personality
    return profile


async def upsert_agents(session: Any, board: Board, gateway: Gateway, seed: BoardSeed) -> dict[str, Agent]:
    existing = list(
        await session.exec(select(Agent).where(Agent.board_id == board.id)),
    )
    by_name = {agent.name: agent for agent in existing}
    agents: dict[str, Agent] = {}
    now = utcnow()

    for index, agent_seed in enumerate(seed.agents):
        agent = by_name.get(agent_seed.name)
        seen_at = now - timedelta(minutes=agent_seed.last_seen_minutes_ago)
        created_at = now - timedelta(minutes=90 - index)
        if agent is None:
            agent = Agent(
                board_id=board.id,
                gateway_id=gateway.id,
                name=agent_seed.name,
                status=agent_seed.status,
                openclaw_session_id=f"seed:{board.slug}:{_slugify(agent_seed.name)}",
                heartbeat_config=DEFAULT_HEARTBEAT_CONFIG.copy(),
                identity_profile=_agent_identity(agent_seed),
                last_seen_at=seen_at,
                is_board_lead=agent_seed.is_lead,
                created_at=created_at,
                updated_at=seen_at,
            )
            session.add(agent)
        else:
            agent.board_id = board.id
            agent.gateway_id = gateway.id
            agent.name = agent_seed.name
            agent.status = agent_seed.status
            agent.openclaw_session_id = agent.openclaw_session_id or f"seed:{board.slug}:{_slugify(agent_seed.name)}"
            agent.heartbeat_config = agent.heartbeat_config or DEFAULT_HEARTBEAT_CONFIG.copy()
            agent.identity_profile = _agent_identity(agent_seed)
            agent.last_seen_at = seen_at
            agent.is_board_lead = agent_seed.is_lead
            agent.updated_at = seen_at
            session.add(agent)
        agents[agent_seed.name] = agent

    await session.commit()
    for agent in agents.values():
        await session.refresh(agent)
    return agents


async def upsert_tasks(session: Any, board: Board, agents_by_name: dict[str, Agent], seed: BoardSeed) -> dict[str, Task]:
    existing = list(await session.exec(select(Task).where(Task.board_id == board.id)))
    by_title = {task.title: task for task in existing}
    tasks: dict[str, Task] = {}
    now = utcnow()

    for task_seed in seed.tasks:
        task = by_title.get(task_seed.title)
        assigned_agent = agents_by_name[task_seed.agent_name]
        created_at = now - timedelta(minutes=task_seed.minutes_ago)
        in_progress_at = created_at if task_seed.status == "in_progress" else None
        if task is None:
            task = Task(
                board_id=board.id,
                title=task_seed.title,
                description=task_seed.description,
                status=task_seed.status,
                priority=task_seed.priority,
                assigned_agent_id=assigned_agent.id,
                created_at=created_at,
                updated_at=created_at,
                in_progress_at=in_progress_at,
            )
            session.add(task)
        else:
            task.description = task_seed.description
            task.status = task_seed.status
            task.priority = task_seed.priority
            task.assigned_agent_id = assigned_agent.id
            task.in_progress_at = in_progress_at
            task.updated_at = created_at
            session.add(task)
        tasks[task_seed.title] = task

    await session.commit()
    for task in tasks.values():
        await session.refresh(task)
    return tasks


async def upsert_approvals(
    session: Any,
    board: Board,
    agents_by_name: dict[str, Agent],
    tasks_by_title: dict[str, Task],
    seed: BoardSeed,
) -> None:
    existing = list(await session.exec(select(Approval).where(Approval.board_id == board.id)))
    by_key = {(approval.action_type, approval.task_id): approval for approval in existing}
    now = utcnow()

    for approval_seed in seed.approvals:
        task = tasks_by_title[approval_seed.task_title]
        key = (approval_seed.action_type, task.id)
        approval = by_key.get(key)
        created_at = now - timedelta(minutes=approval_seed.minutes_ago)
        resolved_at = created_at + timedelta(minutes=1) if approval_seed.status != "pending" else None
        agent_id = agents_by_name[approval_seed.agent_name].id if approval_seed.agent_name else None
        payload = {"reason": approval_seed.reason}
        if approval is None:
            approval = Approval(
                board_id=board.id,
                task_id=task.id,
                agent_id=agent_id,
                action_type=approval_seed.action_type,
                payload=payload,
                confidence=approval_seed.confidence,
                status=approval_seed.status,
                created_at=created_at,
                resolved_at=resolved_at,
            )
            session.add(approval)
        else:
            approval.task_id = task.id
            approval.agent_id = agent_id
            approval.payload = payload
            approval.confidence = approval_seed.confidence
            approval.status = approval_seed.status
            approval.created_at = created_at
            approval.resolved_at = resolved_at
            session.add(approval)

    await session.commit()


async def upsert_memory(session: Any, board: Board, seed: BoardSeed) -> None:
    existing = list(await session.exec(select(BoardMemory).where(BoardMemory.board_id == board.id)))
    by_content = {memory.content: memory for memory in existing}
    now = utcnow()

    for memory_seed in seed.memory:
        memory = by_content.get(memory_seed.content)
        created_at = now - timedelta(minutes=memory_seed.minutes_ago)
        if memory is None:
            memory = BoardMemory(
                board_id=board.id,
                content=memory_seed.content,
                tags=list(memory_seed.tags) or None,
                is_chat=False,
                source=memory_seed.source,
                created_at=created_at,
            )
            session.add(memory)
        else:
            memory.tags = list(memory_seed.tags) or None
            memory.is_chat = False
            memory.source = memory_seed.source
            memory.created_at = created_at
            session.add(memory)

    await session.commit()


async def upsert_activity(
    session: Any,
    board: Board,
    agents_by_name: dict[str, Agent],
    tasks_by_title: dict[str, Task],
    seed: BoardSeed,
) -> None:
    existing = list(await session.exec(select(ActivityEvent).where(ActivityEvent.board_id == board.id)))
    by_key = {(event.event_type, event.message or ""): event for event in existing}
    now = utcnow()

    for activity_seed in seed.activity:
        activity = by_key.get((activity_seed.event_type, activity_seed.message))
        task = tasks_by_title.get(activity_seed.task_title) if activity_seed.task_title else None
        agent = agents_by_name.get(activity_seed.agent_name) if activity_seed.agent_name else None
        created_at = now - timedelta(minutes=activity_seed.minutes_ago)
        if activity is None:
            activity = ActivityEvent(
                event_type=activity_seed.event_type,
                message=activity_seed.message,
                agent_id=agent.id if agent else None,
                task_id=task.id if task else None,
                board_id=board.id,
                created_at=created_at,
            )
            session.add(activity)
        else:
            activity.agent_id = agent.id if agent else None
            activity.task_id = task.id if task else None
            activity.board_id = board.id
            activity.created_at = created_at
            session.add(activity)

    await session.commit()


async def seed_board_surface(session: Any, organization: Organization, gateway: Gateway, seed: BoardSeed) -> None:
    board = await upsert_board(session, organization, gateway, seed)
    agents_by_name = await upsert_agents(session, board, gateway, seed)
    tasks_by_title = await upsert_tasks(session, board, agents_by_name, seed)
    await upsert_approvals(session, board, agents_by_name, tasks_by_title, seed)
    await upsert_memory(session, board, seed)
    await upsert_activity(session, board, agents_by_name, tasks_by_title, seed)


async def run() -> None:
    await init_db()
    async with async_session_maker() as session:
        _, organization = await ensure_local_user_and_org(session)
        gateway = await ensure_gateway(session, organization)
        await ensure_gateway_main_agent(session, gateway)
        for board_seed in SEED_BOARDS:
            await seed_board_surface(session, organization, gateway, board_seed)

        boards_count = len(list(await session.exec(select(Board).where(Board.organization_id == organization.id))))
        agents_count = len(list(await session.exec(select(Agent).where(Agent.gateway_id == gateway.id))))
        tasks_count = len(list(await session.exec(select(Task))))
        approvals_count = len(list(await session.exec(select(Approval))))
        memory_count = len(list(await session.exec(select(BoardMemory))))
        activity_count = len(list(await session.exec(select(ActivityEvent))))

    print("OpenSquad control plane seeded.")
    print(f"organization={organization.name}")
    print(f"gateway={DEFAULT_GATEWAY_NAME}")
    print(f"boards={boards_count}")
    print(f"agents={agents_count}")
    print(f"tasks={tasks_count}")
    print(f"approvals={approvals_count}")
    print(f"memory={memory_count}")
    print(f"activity={activity_count}")


if __name__ == "__main__":
    asyncio.run(run())
