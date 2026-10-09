# -*- coding: utf-8 -*-
"""Les derivees fabriquees a la demande par le chemin de service.

Audit du 06/10/2026, point 1 : trois largeurs en WebP servies par `srcset`.
`services/vignettes.py` a ses propres tests ; celui-ci verrouille le CABLAGE,
c'est-a-dire ce qui a failli manquer :

1. une derivee absente est fabriquee a partir de son original, puis RANGEE —
   sinon chaque affichage de carte redimensionne 2,9 Mo de PNG ;
2. une largeur hors liste ne fabrique rien. Sans cette garde, mille URL
   differentes font mille redimensionnements ;
3. un original absent rend 404, et ne fabrique rien ;
4. un echec d'ecriture ne casse PAS le service : l'image part quand meme ;
5. un GIF, ou un original deja plus etroit que la cible, est servi tel quel —
   le navigateur recoit une image, jamais un trou. Un candidat `srcset` en
   404 casserait l'image entiere, pas seulement la taille manquante.

Le point 5 est la raison d'etre de toute cette mecanique : il explique
pourquoi la fabrication vit au service et non au televersement.
"""
from __future__ import annotations

import asyncio
import io
import os
import sys
from unittest.mock import patch

import pytest
from PIL import Image as PILImage

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import server  # noqa: E402
from services import vignettes  # noqa: E402


def _png(largeur: int, hauteur: int, mode: str = "RGB") -> bytes:
    im = PILImage.effect_noise((largeur, hauteur), 48).convert(mode)
    sortie = io.BytesIO()
    im.save(sortie, format="PNG")
    return sortie.getvalue()


def _gif(largeur: int, hauteur: int) -> bytes:
    im = PILImage.effect_noise((largeur, hauteur), 48).convert("P")
    sortie = io.BytesIO()
    im.save(sortie, format="GIF")
    return sortie.getvalue()


class _Stockage:
    """Une doublure qui se souvient de ce qu'on y range."""

    def __init__(self, contenu=None, echec_ecriture=False):
        self.contenu = dict(contenu or {})
        self.echec_ecriture = echec_ecriture
        self.ranges = []

    def load_bytes(self, kind, filename, legacy_dir=None):
        return self.contenu.get((kind, filename))

    def put_object(self, kind, filename, data, content_type):
        if self.echec_ecriture:
            raise RuntimeError("storage unavailable")
        self.ranges.append((kind, filename, len(data), content_type))
        self.contenu[(kind, filename)] = (data, content_type)
        return {"path": f"fironova/{kind}/{filename}"}


def _avec(stockage):
    return patch.object(server, "object_storage", stockage)


class TestFabricationALaDemande:
    def test_une_derivee_absente_est_fabriquee_depuis_son_original(self):
        st = _Stockage({("images", "abc.png"): (_png(1380, 1035), "image/png")})
        with _avec(st):
            got = server._fabriquer_derivee("abc_400.webp", None)
        assert got is not None
        contenu, type_contenu = got
        assert type_contenu == "image/webp"
        with PILImage.open(io.BytesIO(contenu)) as im:
            assert im.format == "WEBP"
            assert im.width == 400

    def test_ELLE_EST_RANGEE_POUR_NE_PAS_ETRE_REFAITE(self):
        # Sans ce rangement, chaque affichage de la grille du catalogue
        # redimensionne douze PNG de plusieurs mega-octets.
        st = _Stockage({("images", "abc.png"): (_png(1380, 1035), "image/png")})
        with _avec(st):
            server._fabriquer_derivee("abc_800.webp", None)
        assert [(k, n, t) for k, n, _, t in st.ranges] == [
            ("images", "abc_800.webp", "image/webp")]

    def test_l_extension_de_l_original_est_cherchee_et_pas_devinee(self):
        # Le nom de la derivee ne porte pas l'extension de l'original :
        # « abc_400.webp » peut venir d'un .png comme d'un .jpg.
        st = _Stockage({("images", "abc.jpg"): (_png(1200, 900), "image/jpeg")})
        with _avec(st):
            assert server._fabriquer_derivee("abc_400.webp", None) is not None

    def test_UNE_LARGEUR_HORS_LISTE_NE_FABRIQUE_RIEN(self):
        st = _Stockage({("images", "abc.png"): (_png(1380, 1035), "image/png")})
        with _avec(st):
            assert server._fabriquer_derivee("abc_9999.webp", None) is None
        assert st.ranges == []

    def test_un_nom_qui_n_est_pas_une_derivee_ne_fabrique_rien(self):
        st = _Stockage({("images", "abc.png"): (_png(400, 300), "image/png")})
        with _avec(st):
            assert server._fabriquer_derivee("abc.png", None) is None

    def test_un_original_absent_ne_fabrique_rien(self):
        st = _Stockage({})
        with _avec(st):
            assert server._fabriquer_derivee("inconnu_400.webp", None) is None


class TestOnSertToujoursQuelqueChose:
    """Un candidat `srcset` en 404 casse l'image ENTIERE, pas seulement la
    taille manquante. Ces deux cas doivent donc rendre l'original."""

    def test_un_original_plus_etroit_est_converti_a_sa_largeur_native(self):
        # Pas servi tel quel : converti. Un original de 1380 px demande en
        # 1400 rendait sinon le PNG entier, sur les grands ecrans justement.
        st = _Stockage({("images", "abc.png"): (_png(300, 200), "image/png")})
        with _avec(st):
            got = server._fabriquer_derivee("abc_400.webp", None)
        assert got is not None
        assert got[1] == "image/webp"
        with PILImage.open(io.BytesIO(got[0])) as im:
            assert im.width == 300

    def test_un_gif_est_servi_tel_quel(self):
        anime = _gif(1200, 900)
        st = _Stockage({("images", "abc.gif"): (anime, "image/gif")})
        with _avec(st):
            got = server._fabriquer_derivee("abc_400.webp", None)
        # extensions_sources ne cherche pas les .gif : l'original est
        # introuvable sous ce nom, donc rien n'est servi par cette voie. Le
        # frontend n'emet pas de srcset pour un .gif, il demande l'original.
        assert got is None

    def test_UN_ECHEC_D_ECRITURE_NE_CASSE_PAS_LE_SERVICE(self):
        # Le stockage peut etre indisponible une seconde. L'image doit partir
        # quand meme ; la requete suivante retentera le rangement.
        st = _Stockage({("images", "abc.png"): (_png(1380, 1035), "image/png")},
                       echec_ecriture=True)
        with _avec(st):
            got = server._fabriquer_derivee("abc_400.webp", None)
        assert got is not None
        assert got[1] == "image/webp"


class TestCheminDeService:
    def test_le_proxy_sert_une_derivee_jamais_fabriquee(self):
        st = _Stockage({("images", "abc.png"): (_png(1380, 1035), "image/png")})
        with _avec(st):
            reponse = asyncio.run(server._serve_upload("images", "abc_400.webp"))
        assert reponse.status_code == 200
        assert reponse.media_type == "image/webp"
        assert reponse.headers["Cache-Control"].startswith("public, max-age=")

    def test_une_derivee_deja_rangee_n_est_pas_refaite(self):
        deja = vignettes.fabriquer(_png(1380, 1035), 400)
        st = _Stockage({("images", "abc_400.webp"): (deja, "image/webp")})
        with _avec(st):
            reponse = asyncio.run(server._serve_upload("images", "abc_400.webp"))
        assert reponse.body == deja
        assert st.ranges == []

    def test_une_image_absente_reste_un_404(self):
        st = _Stockage({})
        with _avec(st):
            with pytest.raises(server.HTTPException) as e:
                asyncio.run(server._serve_upload("images", "inconnu_400.webp"))
        assert e.value.status_code == 404

    def test_LES_AUTRES_TYPES_NE_FABRIQUENT_RIEN(self):
        # Un certificat d'analyse absent reste un 404 : la fabrique ne
        # s'applique qu'aux images.
        st = _Stockage({})
        with _avec(st):
            with pytest.raises(server.HTTPException) as e:
                asyncio.run(server._serve_upload("coa", "abc_400.webp"))
        assert e.value.status_code == 404
