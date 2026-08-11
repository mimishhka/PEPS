from fastapi import APIRouter, Depends

import server as s

router = APIRouter(prefix="/api")


@router.get("/admin/trash/{resource}")
async def admin_list_trash(resource: str, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_list_trash(resource, admin)


@router.post("/admin/trash/{resource}/restore")
async def admin_restore_trash(resource: str, payload: s.TrashIdsIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_restore_trash(resource, payload, admin)


@router.post("/admin/trash/{resource}/purge")
async def admin_purge_trash(resource: str, payload: s.TrashIdsIn, admin: dict = Depends(s.get_admin_user)):
    return await s.admin_purge_trash(resource, payload, admin)