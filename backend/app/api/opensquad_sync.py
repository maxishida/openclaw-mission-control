"""OpenSquad hybrid sync status endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_org_admin, require_org_member
from app.core.config import settings
from app.schemas.opensquad_sync import OpenSquadSyncStatusRead
from app.services.opensquad_sync import get_opensquad_sync_service
from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/opensquad", tags=["opensquad-sync"])

ORG_ADMIN_DEP = Depends(require_org_admin)
ORG_MEMBER_DEP = Depends(require_org_member)


@router.get("/sync-status", response_model=OpenSquadSyncStatusRead)
def get_opensquad_sync_status(
    ctx: OrganizationContext = ORG_MEMBER_DEP,
) -> OpenSquadSyncStatusRead:
    """Return current hybrid sync health and the synced board set."""
    service = get_opensquad_sync_service()
    if service is None:
        return OpenSquadSyncStatusRead(
            enabled=False,
            root=None,
            interval_seconds=settings.opensquad_sync_interval_seconds,
            gateway_name=settings.opensquad_gateway_name,
            state="disabled",
            boards=[],
        )
    return service.status_snapshot(organization_id=ctx.organization.id)


@router.post("/resync", response_model=OpenSquadSyncStatusRead)
async def force_opensquad_resync(
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> OpenSquadSyncStatusRead:
    """Force a fresh scan of the configured OpenSquad workspace."""
    service = get_opensquad_sync_service()
    if service is None or not service.enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenSquad sync is not enabled.",
        )
    status_read = await service.force_resync()
    return status_read.model_copy(
        update={
            "boards": [
                board for board in status_read.boards if board.organization_id == ctx.organization.id
            ]
        }
    )
