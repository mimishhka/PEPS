from typing import Optional

from fastapi import APIRouter, Depends, Request, Response

import server as s

router = APIRouter(prefix="/api")


@router.get("/admin/staff")
async def admin_list_staff(_admin: dict = Depends(s.get_admin_user)):
    return await s.admin_list_staff(_admin)


@router.get("/admin/staff/invites")
async def admin_list_staff_invites(_admin: dict = Depends(s.get_admin_user)):
    return await s.admin_list_staff_invites(_admin)


@router.post("/admin/staff/invite")
async def admin_invite_staff(payload: s.StaffInviteIn, request: Request, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_invite_staff(payload, request, admin)


@router.delete("/admin/staff/invites/{invite_id}")
async def admin_cancel_staff_invite(invite_id: str, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_cancel_staff_invite(invite_id, admin)


@router.post("/staff/accept")
async def staff_accept_invite(payload: s.StaffAcceptIn, response: Response):
    return await s.staff_accept_invite(payload, response)


@router.put("/admin/staff/{user_id}/permissions")
async def admin_update_staff_permissions(user_id: str, payload: s.StaffPermissionsIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_update_staff_permissions(user_id, payload, admin)


@router.post("/admin/staff/{user_id}/promote")
async def admin_promote_to_owner(user_id: str, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_promote_to_owner(user_id, admin)


@router.delete("/admin/staff/{user_id}")
async def admin_revoke_staff(user_id: str, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_revoke_staff(user_id, admin)


@router.get("/admin/audit-log")
async def admin_audit_log(limit: int = 200, _admin: dict = Depends(s.get_admin_user)):
    return await s.admin_audit_log(limit, _admin)


@router.get("/admin/customers")
async def admin_customers(_admin: dict = Depends(s.require_area("customers", "view"))):
    return await s.admin_customers(_admin)


@router.get("/admin/subscribers")
async def admin_list_subscribers(status: Optional[str] = None, _admin: dict = Depends(s.require_area("subscribers", "view"))):
    return await s.admin_list_subscribers(status, _admin)


@router.get("/admin/subscribers.csv")
async def admin_subscribers_csv(status: Optional[str] = None, _admin: dict = Depends(s.require_area("subscribers", "view"))):
    return await s.admin_subscribers_csv(status, _admin)


@router.get("/admin/stats")
async def admin_stats(_admin: dict = Depends(s.require_area("dashboard", "view"))):
    return await s.admin_stats(_admin)


@router.get("/admin/shipping/pending-manifest")
async def admin_pending_manifest(_admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_pending_manifest(_admin)


@router.get("/admin/shipping/config-status")
async def admin_shipping_config_status(_admin: dict = Depends(s.require_area("shipping", "view"))):
    return await s.admin_shipping_config_status(_admin)


@router.post("/admin/shipping/backfill-label-costs")
async def admin_backfill_label_costs(limit: int = 300, force: bool = False, _admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_backfill_label_costs(limit, force, _admin)


@router.post("/admin/shipping/transmit")
async def admin_transmit_manifest(_admin: dict = Depends(s.require_area("orders", "manage"))):
    return await s.admin_transmit_manifest(_admin)


@router.get("/admin/ops/signals")
async def admin_ops_signals(_admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_ops_signals(_admin)


# --- Item 1.2 B4 SMART : Reconciliation checkout failures ---------------

@router.get("/admin/reconciliation/checkout-failures")
async def admin_checkout_failures_list(
    status: Optional[str] = None,
    limit: int = 50,
    _admin: dict = Depends(s.require_area("orders", "view")),
):
    return await s.admin_checkout_failures_list(status, limit)


@router.post("/admin/reconciliation/checkout-failures/{failure_id}/retry")
async def admin_checkout_failures_retry(
    failure_id: str,
    _admin: dict = Depends(s.require_area("orders", "manage")),
):
    return await s.admin_checkout_failures_retry(failure_id, _admin)


@router.post("/admin/reconciliation/checkout-failures/{failure_id}/resolve")
async def admin_checkout_failures_resolve(
    failure_id: str,
    payload: s.CheckoutFailureResolveIn,
    _admin: dict = Depends(s.require_area("orders", "manage")),
):
    return await s.admin_checkout_failures_resolve(failure_id, payload, _admin)


@router.get("/admin/reconciliation/checkout-breaker")
async def admin_checkout_breaker_state(
    _admin: dict = Depends(s.require_area("orders", "view")),
):
    return await s.admin_checkout_breaker_state()


@router.post("/admin/reconciliation/checkout-breaker/reset")
async def admin_checkout_breaker_reset(
    _admin: dict = Depends(s.require_area("orders", "manage")),
):
    return await s.admin_checkout_breaker_reset(_admin)