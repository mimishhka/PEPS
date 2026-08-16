from typing import Optional

from fastapi import APIRouter, Depends

import server as s

router = APIRouter(prefix="/api")


@router.put("/admin/products/{product_id}/stock")
async def admin_adjust_stock(product_id: str, payload: s.StockAdjustIn, _admin: dict = Depends(s.require_area("products", "manage"))):
    return await s.admin_adjust_stock(product_id, payload, _admin)


@router.post("/admin/products/{product_id}/restock")
async def admin_bulk_restock(product_id: str, payload: s.StockRestockIn,
                              admin: dict = Depends(s.require_area("products", "manage"))):
    return await s.admin_bulk_restock(product_id, payload, admin)


@router.post("/admin/products/bulk-restock")
async def admin_bulk_restock_csv(payload: s.StockBulkRestockIn,
                                  admin: dict = Depends(s.require_area("products", "manage"))):
    return await s.admin_bulk_restock_csv(payload, admin)


@router.get("/admin/products/{product_id}/stock-history")
async def admin_product_stock_history(product_id: str, limit: int = 50,
                                       _admin: dict = Depends(s.require_area("products", "view"))):
    return await s.admin_product_stock_history(product_id, limit, _admin)


@router.get("/admin/low-stock-alerts")
async def admin_list_low_stock_alerts(_admin: dict = Depends(s.require_area("products", "view"))):
    return await s.admin_list_low_stock_alerts(_admin)


@router.get("/admin/stock-notifications")
async def admin_list_stock_notifications(_admin: dict = Depends(s.require_area("products", "view"))):
    return await s.admin_list_stock_notifications(_admin)


@router.get("/admin/coupons")
async def admin_list_coupons(_admin: dict = Depends(s.require_area("coupons", "view"))):
    return await s.admin_list_coupons(_admin)


@router.post("/admin/coupons")
async def admin_create_coupon(payload: s.CouponIn, _admin: dict = Depends(s.require_area("coupons", "manage"))):
    return await s.admin_create_coupon(payload, _admin)


@router.put("/admin/coupons/{coupon_id}")
async def admin_update_coupon(coupon_id: str, payload: s.CouponIn, _admin: dict = Depends(s.require_area("coupons", "manage"))):
    return await s.admin_update_coupon(coupon_id, payload, _admin)


@router.delete("/admin/coupons/{coupon_id}")
async def admin_delete_coupon(coupon_id: str, admin: dict = Depends(s.require_area("coupons", "manage"))):
    return await s.admin_delete_coupon(coupon_id, admin)


@router.post("/coupons/validate")
async def validate_coupon(code: str, subtotal: float, email: Optional[str] = None, items: Optional[str] = None):
    return await s.validate_coupon(code, subtotal, email, items)


@router.get("/admin/shipping/zones")
async def admin_list_zones(_admin: dict = Depends(s.require_area("shipping", "view"))):
    return await s.admin_list_zones(_admin)


@router.post("/admin/shipping/zones")
async def admin_create_zone(payload: s.ShippingZoneIn, _admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_create_zone(payload, _admin)


@router.put("/admin/shipping/zones/{zone_id}")
async def admin_update_zone(zone_id: str, payload: s.ShippingZoneIn, _admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_update_zone(zone_id, payload, _admin)


@router.delete("/admin/shipping/zones/{zone_id}")
async def admin_delete_zone(zone_id: str, admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_delete_zone(zone_id, admin)


@router.post("/admin/shipping/methods")
async def admin_create_method(payload: s.ShippingMethodIn, _admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_create_method(payload, _admin)


@router.put("/admin/shipping/methods/{method_id}")
async def admin_update_method(method_id: str, payload: s.ShippingMethodIn, _admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_update_method(method_id, payload, _admin)


@router.delete("/admin/shipping/methods/{method_id}")
async def admin_delete_method(method_id: str, admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_delete_method(method_id, admin)


@router.get("/admin/shipping/boxes")
async def admin_list_boxes(_admin: dict = Depends(s.require_area("shipping", "view"))):
    return await s.admin_list_boxes(_admin)


@router.post("/admin/shipping/boxes")
async def admin_create_box(payload: s.ShippingBoxIn, _admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_create_box(payload, _admin)


@router.put("/admin/shipping/boxes/{box_id}")
async def admin_update_box(box_id: str, payload: s.ShippingBoxIn, _admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_update_box(box_id, payload, _admin)


@router.delete("/admin/shipping/boxes/{box_id}")
async def admin_delete_box(box_id: str, admin: dict = Depends(s.require_area("shipping", "manage"))):
    return await s.admin_delete_box(box_id, admin)


@router.get("/admin/analytics")
async def admin_analytics(_admin: dict = Depends(s.require_area("dashboard", "view"))):
    return await s.admin_analytics(_admin)


@router.get("/admin/orders.csv")
async def admin_orders_csv(status_group: Optional[str] = None, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_orders_csv(status_group, _admin)


@router.get("/admin/orders.xlsx")
async def admin_orders_xlsx(status_group: Optional[str] = None, _admin: dict = Depends(s.require_area("orders", "view"))):
    return await s.admin_orders_xlsx(status_group, _admin)


@router.get("/admin/products.csv")
async def admin_products_csv(_admin: dict = Depends(s.require_area("products", "view"))):
    return await s.admin_products_csv(_admin)


@router.get("/admin/products.xlsx")
async def admin_products_xlsx(_admin: dict = Depends(s.require_area("products", "view"))):
    return await s.admin_products_xlsx(_admin)