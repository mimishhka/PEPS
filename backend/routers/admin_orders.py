from typing import Optional

from fastapi import APIRouter, Depends

import server as s

router = APIRouter(prefix="/api")


@router.post("/admin/orders/{order_id}/sync-delivery")
async def admin_sync_delivery_status(order_id: str, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_sync_delivery_status(order_id, _admin)


@router.get("/admin/orders")
async def admin_orders(status_group: Optional[str] = None, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_orders(status_group, _admin)


@router.get("/admin/orders/page")
async def admin_orders_page(
    page: int = 1,
    limit: int = 50,
    status_group: Optional[str] = None,
    query: Optional[str] = None,
    payment_status: Optional[str] = None,
    fulfillment_status: Optional[str] = None,
    late_only: bool = False,
    _admin: dict = Depends(s.require_area("orders", "view")),
):
    return await s.admin_orders_page(
        page, limit, status_group, query, payment_status, fulfillment_status,
        late_only, _admin,
    )


@router.delete("/admin/orders/{order_id}")
async def admin_delete_order(order_id: str, admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_delete_order(order_id, admin)


@router.get("/admin/orders/counts")
async def admin_order_counts(_admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_order_counts(_admin)


@router.get("/admin/orders/dispatch-batch")
async def admin_dispatch_batch(date: Optional[str] = None, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_dispatch_batch(date, _admin)


@router.put("/admin/orders/{order_id}/status")
async def admin_update_order(
    order_id: str,
    payment_status: Optional[str] = None,
    fulfillment_status: Optional[str] = None,
    _admin: dict = Depends(s.require_area("orders", "manage")),
):
    return await s.admin_update_order(order_id, payment_status, fulfillment_status, _admin)


@router.post("/admin/orders/{order_id}/confirm-payment")
async def admin_confirm_payment(order_id: str, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_confirm_payment(order_id, _admin)


@router.post("/admin/orders/{order_id}/reopen")
async def admin_reopen_order(order_id: str, payload: s.ReopenOrderIn, admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_reopen_order(order_id, payload, admin)