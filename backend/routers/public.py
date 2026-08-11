from fastapi import APIRouter

from server import (
    COA_PAGE_ENABLED,
    INTERAC_EMAIL,
    LAUNCH_COUPON_CODE,
    PRELAUNCH_ENABLED,
    is_canada_post_configured,
    PROVINCES_CA,
    SHIPPING_FLAT_CAD,
    _seo_get_settings,
)

router = APIRouter(prefix="/api")


@router.get("/meta")
async def meta():
    return {
        "store": "FIRONOVA",
        "currency": "CAD",
        "shipping_flat_cad": SHIPPING_FLAT_CAD,
        "provinces": PROVINCES_CA,
        "min_age": 19,
        "interac_email": INTERAC_EMAIL,
        "coa_page_enabled": COA_PAGE_ENABLED,
        "canada_post_enabled": is_canada_post_configured(),
        "prelaunch_enabled": PRELAUNCH_ENABLED,
        "launch_coupon_code": LAUNCH_COUPON_CODE,
        "seo": await _seo_get_settings(),
    }


@router.get("/")
async def root():
    return {"service": "fironova-api", "status": "ok"}
