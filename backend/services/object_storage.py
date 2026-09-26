"""Emergent Object Storage — persistant, deployable file storage.

Replaces the previous local-disk uploads (`/app/backend/uploads/*`) which do not
survive a redeploy. All new uploads go here; legacy on-disk files are still
readable through the fallback in `load_bytes`, so existing product COAs and
customer message photos keep resolving during the transition.

Path convention:
    fironova/{kind}/{filename}
where `kind` is one of {"coa", "images", "messages"} and `filename` is a
uuid-based safe name (already sanitized upstream). The `fironova/` prefix
isolates this app's objects from other apps in the shared bucket.

Storage is init'd once at FastAPI startup — the `storage_key` is session-scoped
and cheap to reuse. See `services/__init__` (called from server.py startup).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

_STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
_STORAGE_URL = _STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
_EMERGENT_KEY = (os.environ.get("EMERGENT_LLM_KEY") or "").strip()

APP_PREFIX = "fironova"

# Session-scoped storage key — set once at startup and reused for every op.
_storage_key: str | None = None
_init_failed: bool = False


def _remote_path(kind: str, filename: str) -> str:
    return f"{APP_PREFIX}/{kind}/{filename}"


def init_storage() -> str | None:
    """Provision or reuse a storage session. Idempotent.

    Returns the session key on success, or None if the integration is
    unavailable (missing EMERGENT_LLM_KEY, proxy down, etc.). Callers must
    handle the None case — usually by falling back to legacy disk read.
    """
    global _storage_key, _init_failed
    if _storage_key:
        return _storage_key
    if _init_failed or not _EMERGENT_KEY:
        return None
    try:
        resp = requests.post(
            f"{_STORAGE_URL}/init",
            json={"emergent_key": _EMERGENT_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        _storage_key = resp.json().get("storage_key")
        if _storage_key:
            logger.info("Emergent Object Storage initialized")
        return _storage_key
    except Exception as e:
        _init_failed = True
        logger.error("Emergent Object Storage init failed: %s", e)
        return None


def put_object(kind: str, filename: str, data: bytes, content_type: str) -> dict:
    """Upload bytes. Raises on failure — callers should not silently fall back
    to disk on write, else we end up with objects lost on redeploy."""
    key = init_storage()
    if not key:
        raise RuntimeError("Object storage unavailable — EMERGENT_LLM_KEY missing or init failed")
    path = _remote_path(kind, filename)
    resp = requests.put(
        f"{_STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(kind: str, filename: str) -> tuple[bytes, str] | None:
    """Download bytes. Returns (content, content_type) or None if missing/unavailable."""
    key = init_storage()
    if not key:
        return None
    path = _remote_path(kind, filename)
    try:
        resp = requests.get(
            f"{_STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
    except Exception as e:
        logger.warning("Object storage read failed (%s): %s", path, e)
        return None


def load_bytes(kind: str, filename: str, legacy_dir: Path | None = None) -> tuple[bytes, str] | None:
    """Fetch a file, checking Object Storage first, then falling back to a
    legacy on-disk copy if a directory is provided. This is what the public
    proxy endpoints call, so existing files uploaded before the migration
    keep serving without a manual backfill."""
    got = get_object(kind, filename)
    if got is not None:
        return got
    if legacy_dir is not None:
        fpath = legacy_dir / filename
        if fpath.is_file():
            # Best-effort content-type by extension — matches what the previous
            # StaticFiles mount served, so downstream ETag/caching behaviour
            # doesn't change for legacy files.
            ext = fpath.suffix.lower().lstrip(".")
            ct = _MIME_BY_EXT.get(ext, "application/octet-stream")
            return fpath.read_bytes(), ct
    return None


_MIME_BY_EXT = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
}
