from fastapi import APIRouter, Body, Depends, Request, Response

import server as s
from server import (
    AccountDeleteIn,
    AdminGateIn,
    EmailChangeRequestIn,
    ForgotPasswordIn,
    LoginIn,
    MagicRequestIn,
    PasswordChangeIn,
    ProfileUpdateIn,
    RegisterIn,
    ResetPasswordIn,
    SavedAddressIn,
    get_admin_user,
    get_current_user,
)

router = APIRouter(prefix="/api")


@router.post("/admin/gate/verify")
async def admin_gate_verify(payload: AdminGateIn, request: Request):
    return await s.admin_gate_verify(payload, request)


@router.get("/admin/autologin")
async def admin_autologin(_admin: dict = Depends(get_admin_user)):
    return await s.admin_autologin(_admin)


@router.post("/auth/register")
async def register(payload: RegisterIn, response: Response, request: Request):
    return await s.register(payload, response, request)


@router.post("/auth/login")
async def login(payload: LoginIn, response: Response, request: Request):
    return await s.login(payload, response, request)


@router.post("/auth/logout")
async def logout_route(response: Response):
    return await s.logout(response)


@router.post("/auth/logout-all")
async def logout_all_devices_route(response: Response, user: dict = Depends(get_current_user)):
    return await s.logout_all_devices(response, user)


@router.get("/auth/me")
async def me_route(request: Request):
    return await s.me(request)


@router.post("/auth/magic/request")
async def magic_request(payload: MagicRequestIn, request: Request):
    return await s.magic_request(payload, request)


@router.post("/auth/magic/verify")
async def magic_verify(response: Response, request: Request, token: str = Body(..., embed=True)):
    return await s.magic_verify(response, request, token)


@router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordIn, request: Request):
    return await s.forgot_password(payload, request)


@router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordIn, response: Response, request: Request):
    return await s.reset_password(payload, response, request)


@router.put("/account/profile")
async def account_update_profile(payload: ProfileUpdateIn, user: dict = Depends(get_current_user)):
    return await s.account_update_profile(payload, user)


@router.put("/account/password")
async def account_change_password(payload: PasswordChangeIn, response: Response, user: dict = Depends(get_current_user)):
    return await s.account_change_password(payload, response, user)


@router.post("/account/email/request-change")
async def account_request_email_change(payload: EmailChangeRequestIn, request: Request, user: dict = Depends(get_current_user)):
    return await s.account_request_email_change(payload, request, user)


@router.get("/account/email/confirm")
async def account_confirm_email_change(token: str, request: Request):
    return await s.account_confirm_email_change(token, request)


@router.get("/account/addresses")
async def account_list_addresses(user: dict = Depends(get_current_user)):
    return await s.account_list_addresses(user)


@router.post("/account/addresses")
async def account_add_address(payload: SavedAddressIn, user: dict = Depends(get_current_user)):
    return await s.account_add_address(payload, user)


@router.put("/account/addresses/{address_id}")
async def account_update_address(address_id: str, payload: SavedAddressIn, user: dict = Depends(get_current_user)):
    return await s.account_update_address(address_id, payload, user)


@router.delete("/account/addresses/{address_id}")
async def account_delete_address(address_id: str, user: dict = Depends(get_current_user)):
    return await s.account_delete_address(address_id, user)


@router.post("/account/delete")
async def account_delete(payload: AccountDeleteIn, response: Response, user: dict = Depends(get_current_user)):
    return await s.account_delete(payload, response, user)
