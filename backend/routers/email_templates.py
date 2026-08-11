from fastapi import APIRouter, Depends

import server as s

router = APIRouter(prefix="/api")


@router.get("/admin/email-templates")
async def admin_email_templates_list(_admin: dict = Depends(s.require_area("settings", "view"))):
    return await s.admin_email_templates_list(_admin)


@router.post("/admin/email-templates")
async def admin_email_template_create(payload: s.EmailTemplateCreateIn, _admin: dict = Depends(s.require_area("settings", "manage"))):
    return await s.admin_email_template_create(payload, _admin)


@router.put("/admin/email-templates/{key}")
async def admin_email_template_update(key: str, payload: s.EmailTemplateIn, _admin: dict = Depends(s.require_area("settings", "manage"))):
    return await s.admin_email_template_update(key, payload, _admin)


@router.delete("/admin/email-templates/{key}")
async def admin_email_template_delete(key: str, _admin: dict = Depends(s.require_area("settings", "manage"))):
    return await s.admin_email_template_delete(key, _admin)


@router.post("/admin/email-templates/{key}/reset")
async def admin_email_template_reset(key: str, _admin: dict = Depends(s.require_area("settings", "manage"))):
    return await s.admin_email_template_reset(key, _admin)


@router.post("/admin/email-templates/{key}/preview")
async def admin_email_template_preview(key: str, lang: str = "fr", _admin: dict = Depends(s.require_area("settings", "view"))):
    return await s.admin_email_template_preview(key, lang, _admin)