# -*- coding: utf-8 -*-
"""Prepare les deux certificats d'exemple publies sur /certificats.

POURQUOI CE SCRIPT EXISTE
-------------------------
MIREILLE, 11/10/2026 :

    « la page qui explique le COA, pourquoi il n'y a pas d'impression d'ecran
      des deux COA, et pourquoi ne sont-ils pas disponibles »

La page explique comment lire un certificat en citant deux lots reels. Elle
les CITE, elle ne les MONTRE pas, et on ne peut pas les telecharger. Une page
qui dit « verifiez le document » sans donner le document demande un acte de
foi -- exactement ce qu'elle refuse de demander a ses clients.

CE QUE LE SCRIPT FAIT, ET RIEN D'AUTRE
--------------------------------------
1. Il MASQUE l'adresse du client final. C'est l'identifiant de connexion au
   portail d'administration, et une page publique n'est pas l'endroit ou le
   distribuer. Le masquage est une vraie redaction PDF (le texte est retire,
   pas recouvert d'un rectangle qu'un copier-coller traverse).
2. Il rend la premiere page de chaque document en WebP, pour que la page
   puisse montrer le certificat au lieu de le decrire.

TOUT LE RESTE EST LAISSE TEL QUE LE LABORATOIRE L'A EMIS. Le code de
verification, le numero de rapport, le numero de lot : c'est ce qui fait
qu'un certificat se verifie. Un document caviarde n'est plus un certificat,
c'est une illustration.

USAGE
-----
    python scripts/certificats_exemples.py <dossier-des-pdf>

Le dossier par defaut est le dossier des telechargements.
"""
import pathlib
import sys

try:
    import pymupdf
    from PIL import Image
except ImportError:  # pragma: no cover - dependance d'outillage, pas du site
    print("Il manque pymupdf ou Pillow :  pip install pymupdf pillow")
    raise SystemExit(1)

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / "frontend" / "public" / "certificats"

# Les deux lots cites par la page, et le nom du fichier tel que le laboratoire
# le livre. Le nom de sortie, lui, est stable : la page y renvoie en dur.
DOCUMENTS = {
    "ghk-078": "PTC-V6TZ79RC - GHK-078_CoA_20260827_051107.pdf",
    "ret-394": "PTC-6YUZQQ3W - RET-394_CoA_20260827_164147.pdf",
}

A_MASQUER = ("admin@fironova.com",)

LARGEUR = 1400   # assez pour lire les tableaux en plein ecran
QUALITE = 82


def preparer(source: pathlib.Path) -> int:
    SORTIE.mkdir(parents=True, exist_ok=True)
    manquants = [n for n in DOCUMENTS.values() if not (source / n).exists()]
    if manquants:
        print(f"Introuvable dans {source} :")
        for n in manquants:
            print(f"  - {n}")
        return 1

    for cle, nom in DOCUMENTS.items():
        doc = pymupdf.open(source / nom)
        masques = 0
        for page in doc:
            for motif in A_MASQUER:
                for rect in page.search_for(motif):
                    page.add_redact_annot(rect, fill=(1, 1, 1))
                    masques += 1
            page.apply_redactions()

        doc.save(SORTIE / f"{cle}.pdf", garbage=4, deflate=True)

        page = doc[0]
        zoom = LARGEUR / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        Image.frombytes("RGB", (pix.width, pix.height), pix.samples).save(
            SORTIE / f"{cle}.webp", "WEBP", quality=QUALITE, method=6,
        )

        poids = (SORTIE / f"{cle}.pdf").stat().st_size / 1024
        print(f"{cle} : {doc.page_count} page(s), {masques} masquage(s), "
              f"image {pix.width}x{pix.height}, pdf {poids:.0f} ko")
        doc.close()

    print(f"\nEcrit dans {SORTIE}")
    return 0


if __name__ == "__main__":
    dossier = (pathlib.Path(sys.argv[1]) if len(sys.argv) > 1
               else pathlib.Path.home() / "Downloads")
    raise SystemExit(preparer(dossier))
