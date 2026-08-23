from fastapi import APIRouter

from server import (
    COA_PAGE_ENABLED,
    PRELAUNCH_ENABLED,
    is_canada_post_configured,
    PROVINCES_CA,
    SHIPPING_FLAT_CAD,
    FREE_SHIPPING_THRESHOLD_CAD,
    _seo_get_settings,
)

router = APIRouter(prefix="/api")


@router.get("/meta")
async def meta():
    return {
        "store": "FIRONOVA",
        "currency": "CAD",
        "shipping_flat_cad": SHIPPING_FLAT_CAD,
        # Le seuil de gratuite manquait ici alors que le prix y figurait. Le
        # checkout le portait donc en dur (200), et l'annoncait au client
        # pendant que le serveur appliquait la valeur configuree. Les deux
        # chiffres qui decident du total voyagent desormais ensemble.
        "free_shipping_threshold_cad": FREE_SHIPPING_THRESHOLD_CAD,
        "provinces": PROVINCES_CA,
        "min_age": 19,
        "coa_page_enabled": COA_PAGE_ENABLED,
        "canada_post_enabled": is_canada_post_configured(),
        "prelaunch_enabled": PRELAUNCH_ENABLED,
        "seo": await _seo_get_settings(),
    }


@router.get("/")
async def root():
    return {"service": "fironova-api", "status": "ok"}
