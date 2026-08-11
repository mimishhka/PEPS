from fastapi import APIRouter, Depends, Request

import server as s

router = APIRouter(prefix="/api")


@router.get("/orders/mine")
async def my_orders(user: dict = Depends(s.get_current_user)):
    return await s.my_orders(user)


@router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    return await s.get_order(order_id, request)


@router.get("/orders/{order_id}/tracking")
async def order_tracking(order_id: str, request: Request):
    return await s.order_tracking(order_id, request)


@router.get("/orders/{order_id}/invoice.pdf")
async def order_invoice_pdf(order_id: str, request: Request):
    return await s.order_invoice_pdf(order_id, request)