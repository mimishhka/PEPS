from typing import Optional

from fastapi import APIRouter, Depends, File, Request, UploadFile

import server as s

router = APIRouter(prefix="/api")


@router.get("/products")
async def list_products(category: Optional[str] = None, q: Optional[str] = None, featured: Optional[bool] = None):
    return await s.list_products(category, q, featured)


@router.get("/products/{slug}")
async def get_product(slug: str):
    return await s.get_product(slug)


@router.post("/notify-stock")
async def notify_stock_request(payload: s.StockNotifyIn, request: Request):
    return await s.notify_stock_request(payload, request)


@router.get("/categories")
async def list_categories():
    return await s.list_categories()


@router.get("/admin/categories")
async def admin_list_categories(_admin: dict = Depends(s.get_admin_user)):
    return await s.admin_list_categories(_admin)


@router.post("/admin/categories")
async def admin_create_category(payload: s.CategoryIn, _admin: dict = Depends(s.get_admin_user)):
    return await s.admin_create_category(payload, _admin)


@router.put("/admin/categories/{cat_id}")
async def admin_update_category(cat_id: str, payload: s.CategoryIn, _admin: dict = Depends(s.get_admin_user)):
    return await s.admin_update_category(cat_id, payload, _admin)


@router.delete("/admin/categories/{cat_id}")
async def admin_delete_category(cat_id: str, _admin: dict = Depends(s.get_admin_user)):
    return await s.admin_delete_category(cat_id, _admin)


@router.get("/menus")
async def list_menus(location: Optional[str] = None):
    return await s.list_menus(location)


@router.get("/admin/menus")
async def admin_list_menus(_admin: dict = Depends(s.get_admin_user)):
    return await s.admin_list_menus(_admin)


@router.post("/admin/menus")
async def admin_create_menu(payload: s.MenuIn, _admin: dict = Depends(s.get_admin_user)):
    return await s.admin_create_menu(payload, _admin)


@router.put("/admin/menus/{menu_id}")
async def admin_update_menu(menu_id: str, payload: s.MenuIn, _admin: dict = Depends(s.get_admin_user)):
    return await s.admin_update_menu(menu_id, payload, _admin)


@router.delete("/admin/menus/{menu_id}")
async def admin_delete_menu(menu_id: str, _admin: dict = Depends(s.get_admin_user)):
    return await s.admin_delete_menu(menu_id, _admin)


@router.get("/prelaunch/preview")
async def prelaunch_preview(token: str, request: Request):
    return await s.prelaunch_preview(token, request)


@router.post("/newsletter/subscribe")
async def newsletter_subscribe(payload: s.NewsletterSubscribeIn, request: Request):
    return await s.newsletter_subscribe(payload, request)


@router.get("/newsletter/unsubscribe")
async def newsletter_unsubscribe(token: str, request: Request):
    return await s.newsletter_unsubscribe(token, request)


@router.post("/admin/products")
async def admin_create_product(payload: s.ProductIn, _admin: dict = Depends(s.require_area("products", "manage"))):
    return await s.admin_create_product(payload, _admin)


@router.put("/admin/products/{product_id}")
async def admin_update_product(product_id: str, payload: s.ProductIn, _admin: dict = Depends(s.require_area("products", "manage"))):
    return await s.admin_update_product(product_id, payload, _admin)


@router.delete("/admin/products/{product_id}")
async def admin_delete_product(product_id: str, admin: dict = Depends(s.require_area("products", "manage"))):
    return await s.admin_delete_product(product_id, admin)


@router.post("/admin/upload/coa")
async def admin_upload_coa(file: UploadFile = File(...), _admin: dict = Depends(s.require_area("products", "manage"))):
    return await s.admin_upload_coa(file, _admin)


@router.post("/admin/upload/image")
async def admin_upload_image(file: UploadFile = File(...), _admin: dict = Depends(s.require_area("products", "manage"))):
    return await s.admin_upload_image(file, _admin)


@router.post("/shipping/rates")
async def get_shipping_rates(payload: s.ShippingRateRequest, request: Request):
    return await s.get_shipping_rates(payload, request)


@router.post("/checkout")
async def checkout(payload: s.CheckoutIn, request: Request):
    return await s.checkout(payload, request)