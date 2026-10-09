"""Les derivees d'images : ce qu'elles fabriquent, et ce qu'elles refusent.

Audit du 06/10/2026, point 1 du plan : « Compresser les images produit en
WebP < 150 Ko avec srcset ». Mesure du depot le 09/10/2026 : 30 Mo pour 24
fichiers, dont trois a 2,91 Mo, affiches en 154 px sur une carte.

Ce fichier tient les trois promesses qui rendent le `srcset` sur :

  - la derivee est VRAIMENT plus legere, et d'un ordre de grandeur. Un test
    qui verifierait seulement « c'est du WebP » laisserait passer une
    conversion sans redimensionnement, qui ne gagne presque rien ;
  - les largeurs sont une liste FERMEE. C'est la garde qui empeche de
    commander mille redimensionnements differents de la meme photo de 2,9 Mo,
    chacun coutant du processeur et une ecriture ;
  - on ne grossit jamais une image.
"""

import io
from pathlib import Path
import sys

from PIL import Image as PILImage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import vignettes  # noqa: E402


IMAGES_REELLES = Path(__file__).resolve().parents[1] / "uploads" / "images"


def _image(largeur: int, hauteur: int, fmt: str = "PNG", mode: str = "RGB") -> bytes:
    """Une image de bruit, parce qu'un aplat se compresse si bien que la
    comparaison de poids ne voudrait plus rien dire.

    `effect_noise` fabrique le bruit en C. La premiere version remplissait
    les pixels par une boucle Python : les seize tests mettaient 216 s.
    """
    bruit = PILImage.effect_noise((largeur, hauteur), 64).convert("RGB")
    if mode == "RGBA":
        bruit = bruit.convert("RGBA")
    sortie = io.BytesIO()
    bruit.save(sortie, format=fmt)
    return sortie.getvalue()


class TestNommage:
    def test_le_nom_de_la_derivee_se_deduit_de_l_original(self):
        assert vignettes.nom_derivee("a1b2c3.png", 800) == "a1b2c3_800.webp"
        assert vignettes.nom_derivee("a1b2c3.jpeg", 400) == "a1b2c3_400.webp"

    def test_et_se_relit_dans_l_autre_sens(self):
        assert vignettes.analyser_nom("a1b2c3_800.webp") == ("a1b2c3", 800)

    def test_un_aller_retour_sur_chaque_largeur(self):
        for largeur in vignettes.LARGEURS:
            nom = vignettes.nom_derivee("deadbeef.png", largeur)
            assert vignettes.analyser_nom(nom) == ("deadbeef", largeur)

    def test_UNE_LARGEUR_HORS_LISTE_EST_REFUSEE(self):
        # La garde qui compte : sans elle, « _9999.webp » repete mille fois
        # fait mille redimensionnements d'une image de 2,9 Mo.
        assert vignettes.analyser_nom("a1b2c3_9999.webp") is None
        assert vignettes.analyser_nom("a1b2c3_401.webp") is None
        assert vignettes.analyser_nom("a1b2c3_1.webp") is None

    def test_un_nom_qui_n_est_pas_une_derivee_est_refuse(self):
        for nom in ["a1b2c3.png", "a1b2c3_800.png", "_800.webp",
                    "a1b2c3_800.webp.exe", "../secret_800.webp", ""]:
            assert vignettes.analyser_nom(nom) is None, nom


class TestFabrication:
    def test_elle_rend_du_webp_a_la_largeur_demandee(self):
        derivee = vignettes.fabriquer(_image(1380, 1035), 400)
        assert derivee is not None
        with PILImage.open(io.BytesIO(derivee)) as im:
            assert im.format == "WEBP"
            assert im.width == 400

    def test_les_proportions_sont_gardees(self):
        derivee = vignettes.fabriquer(_image(1380, 1035), 800)
        with PILImage.open(io.BytesIO(derivee)) as im:
            # 1035 / 1380 = 0,75 -> 600
            assert im.height == 600

    def test_ELLE_ALLEGE_VRAIMENT_ET_PAS_UN_PEU(self):
        # Le coeur du point 1. Une conversion sans redimensionnement
        # passerait les autres tests et ne gagnerait presque rien : on exige
        # un ordre de grandeur sur le cas reel (un PNG large affiche petit).
        original = _image(1380, 1035)
        derivee = vignettes.fabriquer(original, 400)
        assert len(derivee) < len(original) / 10

    def test_MEME_SUR_DU_BRUIT_LA_DERIVEE_NE_GONFLE_JAMAIS(self):
        # Du bruit aleatoire est INCOMPRESSIBLE : c'est le pire cas possible,
        # et aucune photo ne lui ressemble. J'ai d'abord exige 150 Ko ici, et
        # le test a echoue a 201 Ko ; puis 400 Ko, et il a echoue a 684 Ko en
        # 1400 px. C'etait chaque fois le seuil qui avait tort, pas le code —
        # la cible de l'audit parle de photos.
        #
        # Poursuivre le bon nombre magique n'aurait mesure que mon obstination.
        # Ce qui se verifie ici est l'invariant qui, lui, doit tenir quelle que
        # soit l'image : reduire ne doit JAMAIS produire plus d'octets que
        # l'original. Une conversion ratee peut gonfler, et elle le ferait en
        # silence. Le poids reel se mesure plus bas, sur le catalogue.
        original = _image(2000, 1500)
        for largeur in vignettes.LARGEURS:
            derivee = vignettes.fabriquer(original, largeur)
            assert derivee is not None
            assert len(derivee) < len(original), (largeur, len(derivee))

    def test_ON_NE_GROSSIT_JAMAIS_MAIS_ON_CONVERTIT_TOUJOURS(self):
        # Une image plus etroite que la cible garde sa largeur native, et
        # passe quand meme en WebP.
        #
        # La premiere version rendait None dans ce cas, et l'appelant servait
        # l'original. C'etait un piege : la plus grande photo du catalogue
        # fait 1380 px, donc un navigateur sur grand ecran demandait 1400,
        # n'obtenait rien, et recevait le PNG de 2,78 Mo — sur l'ecran ou
        # l'image compte le plus.
        for source, demande, attendu in [(300, 400, 300), (400, 400, 400),
                                         (401, 400, 400), (1380, 1400, 1380)]:
            derivee = vignettes.fabriquer(_image(source, round(source * 0.75)), demande)
            assert derivee is not None, (source, demande)
            with PILImage.open(io.BytesIO(derivee)) as im:
                assert im.format == "WEBP"
                assert im.width == attendu, (source, demande, im.width)

    def test_LE_CAS_QUI_RENDAIT_LE_PNG_ENTIER(self):
        # Le defaut nomme ci-dessus, sur le cas reel : 1380 px demandes en
        # 1400. Il doit sortir un WebP bien plus leger que l'original.
        original = _image(1380, 1035)
        derivee = vignettes.fabriquer(original, 1400)
        assert derivee is not None
        assert len(derivee) < len(original)

    def test_la_transparence_survit(self):
        derivee = vignettes.fabriquer(_image(1000, 1000, mode="RGBA"), 400)
        with PILImage.open(io.BytesIO(derivee)) as im:
            assert im.mode in ("RGBA", "RGB")
            assert im.width == 400

    def test_un_jpeg_se_convertit_aussi(self):
        derivee = vignettes.fabriquer(_image(1200, 900, fmt="JPEG"), 800)
        assert derivee is not None
        with PILImage.open(io.BytesIO(derivee)) as im:
            assert im.format == "WEBP"

    def test_un_gif_est_laisse_tranquille(self):
        # Convertir perdrait l'animation. L'original sera servi tel quel, et
        # le frontend n'emet pas de srcset pour un .gif.
        assert vignettes.fabriquer(_image(1200, 900, fmt="GIF"), 800) is None

    def test_une_largeur_hors_liste_ne_fabrique_rien(self):
        assert vignettes.fabriquer(_image(2000, 1500), 9999) is None

    def test_un_fichier_qui_n_est_pas_une_image_ne_fait_pas_tomber(self):
        assert vignettes.fabriquer(b"ceci n'est pas une image", 400) is None
        assert vignettes.fabriquer(b"", 400) is None


class TestOriginaux:
    def test_les_extensions_a_essayer_couvrent_les_formats_convertibles(self):
        noms = vignettes.extensions_sources("a1b2c3")
        assert "a1b2c3.png" in noms
        assert "a1b2c3.jpg" in noms
        assert "a1b2c3.jpeg" in noms
        assert "a1b2c3.webp" in noms


class TestSurLeCatalogueReel:
    """La cible de l'audit, mesuree sur SES images — pas sur un substitut.

    Les vingt fichiers de `backend/uploads/images` sont suivis par git, donc
    presents en integration continue. C'est la verification la plus forte
    disponible : elle porte sur les octets que ses clientes telechargent.
    """

    @staticmethod
    def _originaux():
        if not IMAGES_REELLES.is_dir():
            return []
        return sorted(
            f for f in IMAGES_REELLES.iterdir()
            if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
        )

    def test_il_y_a_bien_des_images_a_mesurer(self):
        # Sans ce garde-fou, un repertoire vide rendrait les deux tests
        # suivants vides, donc verts, donc muets.
        assert len(self._originaux()) >= 10

    def test_CHAQUE_IMAGE_DU_CATALOGUE_PASSE_SOUS_150_KO(self):
        trop_lourdes = []
        for chemin in self._originaux():
            contenu = chemin.read_bytes()
            for largeur in vignettes.LARGEURS:
                derivee = vignettes.fabriquer(contenu, largeur)
                if derivee is None:
                    continue  # original deja plus etroit : il sert tel quel
                if len(derivee) >= 150 * 1024:
                    trop_lourdes.append((chemin.name, largeur, len(derivee)))
        assert not trop_lourdes, trop_lourdes

    def test_LE_GAIN_EST_D_UN_ORDRE_DE_GRANDEUR_SUR_LES_PLUS_LOURDES(self):
        # Mesure du 09/10/2026 : trois fichiers a 2,91 Mo, affiches en
        # 154 px sur une carte de catalogue. C'est ce gras-la que le point 1
        # vise.
        lourdes = [c for c in self._originaux() if c.stat().st_size > 1_000_000]
        assert lourdes, "aucune image lourde : la mesure de l'audit a change"
        for chemin in lourdes:
            contenu = chemin.read_bytes()
            derivee = vignettes.fabriquer(contenu, 400)
            assert derivee is not None, chemin.name
            assert len(derivee) < len(contenu) / 10, (
                chemin.name, len(contenu), len(derivee))
