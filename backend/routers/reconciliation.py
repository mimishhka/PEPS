from fastapi import APIRouter, Depends, HTTPException, Query

from server import (
    InteracReconcileDismissIn,
    InteracReconcileMatchIn,
    _reconciliation_dismiss_item,
    _reconciliation_match_item,
    db,
    require_area,
)

router = APIRouter(prefix="/api")


@router.get("/admin/reconciliation/payments")
@router.get("/admin/reconciliation/interac")
async def admin_payment_reconciliation_list(
    status: str = Query("pending"),
    provider: str = Query("all"),
    limit: int = Query(200, ge=1, le=1000),
    _admin: dict = Depends(require_area("orders", "view")),
):
    filt = {}
    if status != "all":
        filt["status"] = status
    if provider != "all":
        filt["provider"] = provider
    rows = await db.interac_reconciliation_queue.find(filt, {"_id": 0}).sort("detected_at", -1).to_list(limit)
    return rows


@router.post("/admin/reconciliation/payments/{item_id}/match")
@router.post("/admin/reconciliation/interac/{item_id}/match")
async def admin_payment_reconciliation_match(
    item_id: str,
    payload: InteracReconcileMatchIn,
    admin: dict = Depends(require_area("orders", "manage")),
):
    return await _reconciliation_match_item(item_id, payload, admin)


@router.post("/admin/reconciliation/payments/{item_id}/dismiss")
@router.post("/admin/reconciliation/interac/{item_id}/dismiss")
async def admin_payment_reconciliation_dismiss(
    item_id: str,
    payload: InteracReconcileDismissIn,
    admin: dict = Depends(require_area("orders", "manage")),
):
    return await _reconciliation_dismiss_item(item_id, payload, admin)
