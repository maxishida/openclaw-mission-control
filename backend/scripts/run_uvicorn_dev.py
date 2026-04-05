"""Development Uvicorn launcher with Windows-compatible asyncio policy."""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import uvicorn

BACKEND_ROOT = Path(__file__).resolve().parents[1]
os.chdir(BACKEND_ROOT)
sys.path.insert(0, str(BACKEND_ROOT))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
