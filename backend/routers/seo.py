from fastapi import APIRouter, Depends

import server as s

router = APIRouter(prefix="/api")


@router.get("/seo/health")
async def seo_health():
    return await s.seo_health()


@router.get("/seo/sitemap")
async def seo_sitemap():
    return await s.seo_sitemap()


@router.get("/products/{slug}/related")
async def get_related_products(slug: str, limit: int = 4):
    return await s.get_related_products(slug, limit)


@router.get("/admin/customers/{user_id}")
async def admin_customer_detail(user_id: str, _admin: dict = Depends(s.require_area("customers", "view"))):
    return await s.admin_customer_detail(user_id, _admin)


@router.get("/admin/analytics/enhanced")
async def admin_analytics_enhanced(period: int = 30, _admin: dict = Depends(s.require_area("dashboard", "view"))):
    return await s.admin_analytics_enhanced(period, _admin)


@router.get("/sitemap.xml")
async def dynamic_sitemap():
    return await s.dynamic_sitemap()


@router.get("/seo/product/{slug}")
async def product_seo(slug: str):
    return await s.product_seo(slug)


@router.get("/admin/seo/settings")
async def admin_seo_get_settings(admin: dict = Depends(s.get_admin_user)):
    return await s.admin_seo_get_settings(admin)


@router.put("/admin/seo/settings")
async def admin_seo_set_settings(payload: s.SeoSettingsIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_seo_set_settings(payload, admin)


@router.get("/admin/seo/health")
async def admin_seo_health(admin: dict = Depends(s.get_admin_user)):
    return await s.admin_seo_health(admin)


@router.get("/admin/seo/products")
async def admin_seo_products(admin: dict = Depends(s.get_admin_user)):
    return await s.admin_seo_products(admin)


@router.put("/admin/seo/products/{slug}")
async def admin_seo_update_product(slug: str, payload: s.ProductSeoIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_seo_update_product(slug, payload, admin)