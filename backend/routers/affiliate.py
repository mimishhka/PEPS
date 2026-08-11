from typing import Optional

from fastapi import APIRouter, Depends, Request, Response

import server as s

router = APIRouter(prefix="/api")


@router.post("/affiliate/join")
async def affiliate_join(payload: s.AffiliateJoinIn, request: Request):
    return await s.affiliate_join(payload, request)


@router.get("/affiliate/me")
async def affiliate_me(request: Request, lang: str = "fr"):
    return await s.affiliate_me(request, lang)


@router.get("/affiliate/referrals")
async def affiliate_referrals(request: Request, limit: int = 200):
    return await s.affiliate_referrals(request, limit)


@router.get("/affiliate/payouts")
async def affiliate_payouts(request: Request):
    return await s.affiliate_payouts(request)


@router.put("/affiliate/payout-settings")
async def affiliate_payout_settings(payload: s.AffiliatePayoutSettingsIn, request: Request):
    return await s.affiliate_payout_settings(payload, request)


@router.get("/affiliate/performance")
async def affiliate_performance(request: Request):
    return await s.affiliate_performance(request)


@router.get("/affiliate/insights")
async def affiliate_insights(request: Request):
    return await s.affiliate_insights(request)


@router.get("/affiliate/top-products")
async def affiliate_top_products(request: Request, limit: int = 5):
    return await s.affiliate_top_products(request, limit)


@router.get("/affiliate/clicks/sources")
async def affiliate_clicks_sources(request: Request, days: int = 30):
    return await s.affiliate_clicks_sources(request, days)


@router.get("/affiliate/activity")
async def affiliate_activity(request: Request, limit: int = 20):
    return await s.affiliate_activity(request, limit)


@router.get("/affiliate/ref/{code}")
async def affiliate_ref(code: str, request: Request, response: Response, page: str = "", referrer: str = "", device: str = ""):
    return await s.affiliate_ref(code, request, response, page, referrer, device)


@router.post("/admin/affiliates/invite")
async def admin_affiliate_invite(payload: s.AffiliateInviteIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliate_invite(payload, admin)


@router.post("/admin/affiliates/{affiliate_id}/resend-invite")
async def admin_affiliate_resend(affiliate_id: str, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliate_resend(affiliate_id, admin)


@router.post("/admin/affiliates/bulk-invite")
async def admin_affiliate_bulk_invite(payload: s.AffiliateBulkInviteIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliate_bulk_invite(payload, admin)


@router.get("/admin/affiliates")
async def admin_affiliates_list(admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliates_list(admin)


@router.get("/admin/affiliates/overview")
async def admin_affiliates_overview(admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliates_overview(admin)


@router.get("/admin/affiliates/clicks")
async def admin_affiliates_clicks(admin: dict = Depends(s.get_admin_user), days: int = 30):
    return await s.admin_affiliates_clicks(admin, days)


@router.get("/admin/affiliates/risk")
async def admin_affiliates_risk(admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliates_risk(admin)


@router.get("/admin/affiliates/{affiliate_id}")
async def admin_affiliate_detail(affiliate_id: str, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliate_detail(affiliate_id, admin)


@router.put("/admin/affiliates/{affiliate_id}")
async def admin_affiliate_update(affiliate_id: str, payload: s.AffiliateAdminUpdateIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliate_update(affiliate_id, payload, admin)


@router.post("/admin/affiliates/payouts/run")
async def admin_affiliate_run_payouts(admin: dict = Depends(s.get_admin_user), period: Optional[str] = None):
    return await s.admin_affiliate_run_payouts(admin, period)


@router.post("/admin/affiliates/payouts/{payout_id}/mark-paid")
async def admin_affiliate_mark_paid(payout_id: str, payload: s.AffiliatePayoutMarkIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_affiliate_mark_paid(payout_id, payload, admin)


@router.get("/admin/affiliates/payouts/all")
async def admin_affiliate_payouts_all(admin: dict = Depends(s.get_admin_user), status: Optional[str] = None):
    return await s.admin_affiliate_payouts_all(admin, status)


@router.post("/admin/affiliates/payouts/{payout_id}/execute")
async def admin_payout_execute(payout_id: str, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_payout_execute(payout_id, admin)


@router.post("/admin/affiliates/payouts/{payout_id}/verify")
async def admin_payout_verify(payout_id: str, payload: s.PayoutVerifyIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_payout_verify(payout_id, payload, admin)


@router.get("/admin/affiliates/payouts/{payout_id}/status")
async def admin_payout_status(payout_id: str, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_payout_status(payout_id, admin)