from fastapi import APIRouter, Request

import server as s

router = APIRouter(prefix="/api")


@router.post("/webhook/nowpayments")
async def nowpayments_ipn(request: Request):
    return await s.nowpayments_ipn(request)


@router.get("/payments/crypto/status/{order_id}")
async def crypto_status(order_id: str):
    return await s.crypto_status(order_id)


@router.post("/webhook/nowpayments-payout")
async def nowpayments_payout_ipn(request: Request):
    return await s.nowpayments_payout_ipn(request)