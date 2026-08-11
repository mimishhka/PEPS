from fastapi import APIRouter, Depends

import server as s

router = APIRouter(prefix="/api")


@router.post("/admin/orders/{order_id}/notes")
async def admin_add_order_note(order_id: str, payload: s.OrderNoteIn, admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_add_order_note(order_id, payload, admin)


@router.post("/admin/orders/{order_id}/refund")
async def admin_refund_order(order_id: str, payload: s.RefundIn, admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_refund_order(order_id, payload, admin)


@router.post("/admin/orders/{order_id}/resend-email")
async def admin_resend_order_email(order_id: str, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_resend_order_email(order_id, _admin)


@router.put("/admin/orders/{order_id}/shipping")
async def admin_set_shipping_info(order_id: str, payload: s.ShippingInfoIn, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_set_shipping_info(order_id, payload, _admin)


@router.get("/admin/orders/{order_id}/shipping-rates")
async def admin_order_shipping_rates(order_id: str, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_order_shipping_rates(order_id, _admin)


@router.post("/admin/orders/{order_id}/create-label")
async def admin_create_label(order_id: str, payload: s.CreateLabelIn, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_create_label(order_id, payload, _admin)


@router.post("/admin/orders/{order_id}/void-label")
async def admin_void_label(order_id: str, _admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_void_label(order_id, _admin)