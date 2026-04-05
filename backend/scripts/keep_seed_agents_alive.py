"""Keep locally-seeded OpenSquad demo agents online during development.

This is a dev-only helper. It refreshes `last_seen_at` for seeded board agents so
Mission Control can continue to show live operational status instead of aging the
demo fleet into `offline` after the default heartbeat timeout.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from sqlmodel import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.chdir(BACKEND_ROOT)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from app.core.time import utcnow
from app.db.session import async_session_maker, init_db
from app.models.agents import Agent

HEARTBEAT_INTERVAL_SECONDS = 45
SEED_SESSION_PREFIX = "seed:"


def _role(agent: Agent) -> str:
    if not isinstance(agent.identity_profile, dict):
        return ""
    role = agent.identity_profile.get("role")
    return role.strip().lower() if isinstance(role, str) else ""


def _is_seed_agent(agent: Agent) -> bool:
    session_id = (agent.openclaw_session_id or "").strip().lower()
    return session_id.startswith(SEED_SESSION_PREFIX) or _role(agent) == "gateway main"


async def refresh_seed_agents() -> int:
    async with async_session_maker() as session:
        agents = list(await session.exec(select(Agent)))
        now = utcnow()
        refreshed = 0

        for agent in agents:
            if not _is_seed_agent(agent):
                continue

            agent.last_seen_at = now
            if (agent.status or "").strip().lower() in {"offline", "provisioning", "error"}:
                agent.status = "online"
            session.add(agent)
            refreshed += 1

        if refreshed > 0:
            await session.commit()

        return refreshed


async def run() -> None:
    await init_db()
    if "--once" in sys.argv[1:]:
        refreshed = await refresh_seed_agents()
        print(f"Refreshed seed agents: {refreshed}", flush=True)
        return

    while True:
        refreshed = await refresh_seed_agents()
        print(f"Refreshed seed agents: {refreshed}", flush=True)
        await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass
