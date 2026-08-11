from typing import Optional

from fastapi import APIRouter, Depends

import server as s

router = APIRouter(prefix="/api")


@router.get("/admin/dispatch/{date}/manifest.pdf")
async def admin_dispatch_manifest_pdf(date: str, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_dispatch_manifest_pdf(date, _admin)


@router.post("/admin/dispatch/{date}/retry-manifest")
async def admin_retry_manifest(date: str, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_retry_manifest(date, _admin)


@router.get("/admin/dispatch/{date}/manifest-status")
async def admin_dispatch_manifest_status(date: str, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_dispatch_manifest_status(date, _admin)


@router.get("/admin/dispatch/today")
async def admin_dispatch_today(
    date: Optional[str] = None,
    service_code: Optional[str] = None,
    _admin: dict = Depends(s.require_area("orders", "view")),
):
    return await s.admin_dispatch_today(date, service_code, _admin)


@router.patch("/admin/orders/{order_id}/shipping-box")
async def admin_order_set_shipping_box(order_id: str, payload: s.OrderShippingBoxIn, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_order_set_shipping_box(order_id, payload, _admin)


@router.post("/admin/orders/{order_id}/dispatch/refresh-estimate")
async def admin_order_refresh_dispatch_estimate(order_id: str, service_code: Optional[str] = None, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_order_refresh_dispatch_estimate(order_id, service_code, _admin)


@router.post("/admin/dispatch/{date}/labels")
async def admin_dispatch_labels(date: str, payload: s.DispatchLabelsIn, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_dispatch_labels(date, payload, _admin)


@router.get("/admin/dispatch/{date}/labels.pdf")
async def admin_dispatch_labels_pdf(date: str, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_dispatch_labels_pdf(date, _admin)


@router.get("/admin/dispatch/{date}/packing-slips.pdf")
async def admin_dispatch_slips_pdf(date: str, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_dispatch_slips_pdf(date, _admin)


@router.get("/admin/fulfillment/day")
async def admin_fulfillment_day(date: Optional[str] = None, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_fulfillment_day(date, _admin)


@router.post("/admin/fulfillment/{order_id}/advance")
async def admin_fulfillment_advance(order_id: str, payload: s.FulfillmentTransitionIn, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_fulfillment_advance(order_id, payload, _admin)


@router.post("/admin/fulfillment/bulk-advance")
async def admin_fulfillment_bulk(payload: s.FulfillmentBulkIn, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_fulfillment_bulk(payload, _admin)


@router.get("/admin/fulfillment/{date}/picking-list.pdf")
async def admin_fulfillment_picking_pdf(date: str, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_fulfillment_picking_pdf(date, _admin)


@router.post("/admin/dispatch/{date}/mark-printed")
async def admin_dispatch_mark_printed(date: str, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_dispatch_mark_printed(date, _admin)