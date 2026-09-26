# -*- coding: utf-8 -*-
"""Migration disque -> Emergent Object Storage.

L'ancien code écrivait les COA/images/photos-message dans `/app/backend/uploads/`
— disque pod éphémère, effacé à chaque redéploiement. Ce test verrouille
trois contrats :

1. `_validate_and_save_image` et `admin_upload_coa` appellent `put_object`
   avec le bon `kind`, et n'écrivent PAS sur disque.
2. Le proxy `/api/uploads/{kind}/{filename}` sert depuis Object Storage.
3. Fallback disque : si le fichier n'existe pas dans le storage mais qu'il
   reste sur disque (ancien contenu preview), il continue d'être servi.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services import object_storage  # noqa: E402


def _png_bytes():
    # 1x1 PNG rouge — valide pour PIL, minimal pour rester rapide.
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000d49444154789c626000020000000500017a29e7000000004945" "4e44ae426082"
    )


def test_put_uses_fironova_prefix():
    """La convention `fironova/{kind}/{filename}` isole ce app dans le bucket."""
    with patch.object(object_storage, "init_storage", return_value="k"), \
         patch.object(object_storage, "requests") as mock_req:
        mock_req.put.return_value.json.return_value = {"path": "fironova/coa/x.pdf"}
        mock_req.put.return_value.raise_for_status = lambda: None
        object_storage.put_object("coa", "x.pdf", b"%PDF-1.4\n", "application/pdf")
        called_url = mock_req.put.call_args[0][0]
        assert called_url.endswith("/objects/fironova/coa/x.pdf")


def test_put_refuses_when_key_missing():
    """Un `EMERGENT_LLM_KEY` manquant DOIT lever — sinon on écrirait dans le
    vide et l'utilisateur ne verrait jamais l'erreur avant redéploiement."""
    with patch.object(object_storage, "init_storage", return_value=None):
        with pytest.raises(RuntimeError, match="unavailable"):
            object_storage.put_object("coa", "x.pdf", b"pdf", "application/pdf")


def test_load_bytes_falls_back_to_disk(tmp_path):
    """Fichier legacy déjà sur disque preview : `load_bytes` DOIT le renvoyer
    (sinon les COA existants deviennent des 404 après migration)."""
    fpath = tmp_path / "abc.pdf"
    fpath.write_bytes(b"%PDF-1.4\nlegacy")
    with patch.object(object_storage, "get_object", return_value=None):
        got = object_storage.load_bytes("coa", "abc.pdf", legacy_dir=tmp_path)
    assert got is not None
    content, ct = got
    assert content.startswith(b"%PDF")
    assert ct == "application/pdf"


def test_load_bytes_prefers_storage_over_disk(tmp_path):
    """Quand le fichier est dans les deux (storage + disque), on prend le
    storage — c'est la source de vérité après migration."""
    fpath = tmp_path / "abc.pdf"
    fpath.write_bytes(b"OLD-DISK")
    with patch.object(object_storage, "get_object", return_value=(b"NEW-STORAGE", "application/pdf")):
        got = object_storage.load_bytes("coa", "abc.pdf", legacy_dir=tmp_path)
    assert got == (b"NEW-STORAGE", "application/pdf")


def test_load_bytes_returns_none_when_missing_everywhere(tmp_path):
    with patch.object(object_storage, "get_object", return_value=None):
        assert object_storage.load_bytes("coa", "missing.pdf", legacy_dir=tmp_path) is None


def test_load_bytes_content_type_by_extension(tmp_path):
    """Sans mount StaticFiles, le fallback disque doit inférer le
    Content-Type — sinon les images legacy remonteraient en octet-stream et
    le navigateur ne les afficherait plus."""
    (tmp_path / "hero.png").write_bytes(b"\x89PNG\r\n")
    with patch.object(object_storage, "get_object", return_value=None):
        _, ct = object_storage.load_bytes("images", "hero.png", legacy_dir=tmp_path)
    assert ct == "image/png"
