# Development

This section is for contributors developing Mission Control locally.

## Recommended workflow (fast loop)

Run Postgres in Docker, run backend + frontend on your host.

### 1) Start Postgres

From repo root:

```bash
cp .env.example .env
docker compose -f compose.yml --env-file .env up -d db
```

### 2) Run the backend (dev)

```bash
cd backend
cp .env.example .env

uv sync --extra dev
python scripts/run_uvicorn_dev.py
```

On Windows, prefer `python scripts/run_uvicorn_dev.py` so the backend uses the
selector event loop required by `psycopg`.

Verify:

```bash
curl -f http://localhost:8000/healthz
```

### 3) Run the frontend (dev)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## Useful repo-root commands

```bash
make help
make setup
make check
npm run dev
cd backend && .venv\\Scripts\\python.exe scripts/seed_opensquad_control_plane.py
```

- `make setup`: sync backend + frontend deps
- `make check`: lint + typecheck + tests + build (closest CI parity)
- `npm run dev`: starts `db` + `redis`, seeds the local OpenSquad control plane, keeps the seeded agents alive for local status demos, and runs backend/frontend on the host
- `seed_opensquad_control_plane.py`: bootstraps the 3 local Virtual Office squads used in manual validation
- `keep_seed_agents_alive.py`: refreshes heartbeat timestamps for seeded demo agents during local development

## OpenSquad hybrid sync

Use these backend env vars when you want Mission Control to mirror a real local OpenSquad workspace instead of the demo seed:

```env
OPENSQUAD_SYNC_ENABLED=true
OPENSQUAD_ROOT=C:\path\to\opensquad
OPENSQUAD_SYNC_INTERVAL_SECONDS=2
OPENSQUAD_GATEWAY_NAME=OpenSquad Bridge
```

When enabled, Mission Control scans `OPENSQUAD_ROOT/squads/*/state.json`, materializes the runtime into the existing `boards/agents/tasks/approvals/activity/memory` model, and exposes sync health on `/api/v1/opensquad/sync-status`.

## Related docs

- [Testing](../testing/README.md)
- [Release checklist](../release/README.md)
