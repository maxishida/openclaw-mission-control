"""Production-like local Uvicorn launcher with Windows-compatible asyncio policy."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import uvicorn
from uvicorn import Config, Server

BACKEND_ROOT = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_ROOT)
sys.path.insert(0, str(BACKEND_ROOT))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


if __name__ == "__main__":
    config = Config(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
    server = Server(config)

    if sys.platform == "win32":
        asyncio.run(server.serve(), loop_factory=asyncio.SelectorEventLoop)
    else:
        server.run()
