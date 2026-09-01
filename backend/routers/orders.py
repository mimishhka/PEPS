from fastapi import APIRouter, Depends, Request, File, UploadFile, Form

import server as s

router = APIRouter(prefix="/api")


@router.get("/orders/mine")
async def my_orders(user: dict = Depends(s.get_current_user)):
    return await s.my_orders(user)


@router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    return await s.get_order(order_id, request)


@router.post("/orders/{order_id}/guest-access")
async def request_guest_order_access(order_id: str, payload: s.GuestOrderAccessIn, request: Request):
    return await s.request_guest_order_access(order_id, payload, request)


@router.get("/orders/{order_id}/tracking")
async def order_tracking(order_id: str, request: Request):
    return await s.order_tracking(order_id, request)


@router.get("/orders/{order_id}/invoice.pdf")
async def order_invoice_pdf(order_id: str, request: Request):
    return await s.order_invoice_pdf(order_id, request)

@router.post("/orders/{order_id}/refund-request")
async def order_request_refund(order_id: str, payload: s.RefundRequestIn, request: Request):
    return await s.order_request_refund(order_id, payload, request)


@router.get("/orders/{order_id}/messages")
async def order_messages(order_id: str, request: Request):
    return await s.order_messages(order_id, request)


@router.post("/orders/{order_id}/messages")
async def order_post_message(order_id: str, request: Request,
                             text: str = Form("", max_length=2000),
                             file: UploadFile = File(None)):
    return await s.order_post_message(order_id, request, text, file)
