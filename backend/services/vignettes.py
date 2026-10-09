"""Derivees d'images : trois largeurs en WebP, fabriquees a la demande.

Audit UI/UX du 06/10/2026, section 4 :

    « Photo Epitalon : 2,8 Mo. Photo BPC-157 (celle du hero) : 2,6 Mo, en PNG
      1380 px, affichees en 164 a 380 px sur mobile. Sur 4G, plusieurs
      secondes d'attente pour l'image principale. Google mesure ce temps (le
      LCP) et il compte pour le classement.
      Convertir en WebP ou AVIF, qualite ~80 : viser < 150 Ko par image.
      Servir 3 tailles avec srcset (400, 800, 1400 px) et sizes. »

Mesure du 09/10/2026 : `backend/uploads/images` pese 30 Mo pour 24 fichiers,
dont trois a 2,91 Mo. Une carte de catalogue les affiche en 154 px de large.

POURQUOI A LA DEMANDE, ET NON AU TELEVERSEMENT

Fabriquer les derivees a l'envoi ne soignerait que les images futures. Les
trente mega-octets deja en place resteraient entiers jusqu'a ce que quelqu'un
lance un script de reprise sur le serveur — et tant que ce script n'a pas
tourne, le frontend ne peut pas emettre de `srcset` sans risquer un candidat
en 404, ce qui casse l'image ENTIERE et pas seulement la taille manquante.

Fabriquee au service, la derivee existe pour toute image dont l'original
existe : ancienne ou nouvelle, sans reprise, sans drapeau en base, sans
schema a faire evoluer. La premiere requete d'une taille la cree et la range
dans le stockage ; les suivantes la lisent. Le `srcset` est donc toujours sur.

Le cout est une seule requete lente par image et par taille. Le benefice est
qu'aucun etat ne peut diverger entre ce que la base pretend et ce que le
stockage contient — c'est exactement le genre d'ecart qui produit des defauts
invisibles.

LES LARGEURS SONT UNE LISTE FERMEE

Pas par gout de la contrainte : une largeur libre dans l'URL laisserait
n'importe qui demander mille redimensionnements differents de la meme photo
de 2,9 Mo, et chacun coute du processeur et une ecriture. Trois valeurs, pas
une de plus.
"""

from __future__ import annotations

import io
import logging
import re

from PIL import Image as PILImage

logger = logging.getLogger(__name__)

# 400 pour une carte de catalogue sur telephone (affichee en 154 a 190 px,
# donc nette en densite double), 800 pour une fiche produit, 1400 pour un
# hero sur grand ecran. Au-dela, l'original reste disponible.
LARGEURS = (400, 800, 1400)

QUALITE_WEBP = 80

# Les GIF sont exclus : la conversion perdrait l'animation. Une image animee
# au catalogue est improbable, mais la perdre en silence serait pire que de
# servir l'original tel quel.
FORMATS_SOURCE = {"PNG", "JPEG", "WEBP"}

# Un nom de derivee : <nom de base>_<largeur>.webp, ou le nom de base est
# celui de l'original SANS son extension.
_NOM_DERIVEE = re.compile(r"^(?P<base>[A-Za-z0-9][A-Za-z0-9._-]*?)_(?P<largeur>\d{2,5})\.webp$")

# Garde anti-bombe de decompression, alignee sur celle du televersement.
MAX_PIXELS = 50_000_000


def nom_derivee(nom_original: str, largeur: int) -> str:
    """« a1b2c3.png », 800 -> « a1b2c3_800.webp »."""
    base = nom_original.rsplit(".", 1)[0]
    return f"{base}_{largeur}.webp"


def analyser_nom(nom: str) -> tuple[str, int] | None:
    """L'inverse : « a1b2c3_800.webp » -> (« a1b2c3 », 800).

    Rend None si le nom n'est pas une derivee, ou si la largeur demandee
    n'est pas dans la liste fermee. Le second cas compte autant que le
    premier : c'est lui qui empeche de commander mille tailles."""
    m = _NOM_DERIVEE.match(nom or "")
    if not m:
        return None
    largeur = int(m.group("largeur"))
    if largeur not in LARGEURS:
        return None
    return m.group("base"), largeur


def fabriquer(contenu: bytes, largeur: int) -> bytes | None:
    """Rend l'original en WebP, reduit a `largeur` — jamais agrandi.

    None seulement quand la conversion est impossible : largeur hors liste,
    format non convertible (GIF anime), fichier illisible.

    ON NE GROSSIT JAMAIS, MAIS ON CONVERTIT TOUJOURS. La premiere version
    rendait None des que l'original etait plus etroit que la cible, et
    l'appelant servait alors l'original tel quel. Ca paraissait econome et
    c'etait un piege : la plus grande photo du catalogue fait 1380 px, donc
    un navigateur sur grand ecran demandait la taille 1400, n'obtenait pas de
    derivee, et recevait le PNG DE 2,78 Mo — exactement ce que le point 1 de
    l'audit cherche a supprimer, et seulement sur les ecrans ou l'image
    compte le plus.

    Une image plus etroite que la cible est donc convertie a sa largeur
    native. L'ecart avec le descripteur `w` annonce (1380 contre 1400) ne
    change rien au choix du navigateur, et fait passer cette image de
    2,78 Mo a quelques dizaines de kilo-octets.
    """
    if largeur not in LARGEURS:
        return None

    prev_max = PILImage.MAX_IMAGE_PIXELS
    PILImage.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        with PILImage.open(io.BytesIO(contenu)) as im:
            if (im.format or "").upper() not in FORMATS_SOURCE:
                return None

            cible = min(largeur, im.width)
            hauteur = max(1, round(im.height * cible / im.width))
            # `convert` avant `resize` : une palette indexee (PNG-8) se
            # redimensionne en escalier si on ne la deroule pas d'abord.
            mode = "RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB"
            reduite = im.convert(mode).resize((cible, hauteur), PILImage.LANCZOS)

            sortie = io.BytesIO()
            reduite.save(sortie, format="WEBP", quality=QUALITE_WEBP, method=6)
            return sortie.getvalue()
    except Exception as e:  # pragma: no cover - depend du fichier recu
        logger.warning("Derivee %s px impossible : %s", largeur, e)
        return None
    finally:
        PILImage.MAX_IMAGE_PIXELS = prev_max


def extensions_sources(nom: str) -> list[str]:
    """Les noms d'original a essayer pour une base donnee.

    Le nom de la derivee ne porte pas l'extension de l'original — « a1b2c3 »
    peut etre un .png ou un .jpg. Plutot que d'inscrire l'extension dans
    l'URL (et de la rendre devinable a tort), on essaie les trois qui peuvent
    produire une derivee."""
    return [f"{nom}.png", f"{nom}.jpg", f"{nom}.jpeg", f"{nom}.webp"]
