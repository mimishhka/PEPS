"""Retire la note « COA pending » affichee sous le prix des fiches produit.

Demande du 2026-09-20 : Mireille ne veut plus voir cette mention sur la
boutique. Elle avait deux origines :

1. le bloc de reparation de BPC-157 dans `server.py`, qui la reinjectait a
   chaque demarrage — corrige dans le code, la note y est desormais vide ;
2. la valeur deja ecrite en base sur les variantes existantes — c'est ce que
   ce script nettoie.

Il ne vide QUE les notes qui repetent l'etat du COA (voir NOTES_COA). Une note
ecrite a la main pour autre chose (« expedie des le 15 novembre », par exemple)
est laissee intacte et signalee a l'ecran, pour que rien ne disparaisse sans
que tu l'aies vu.

Ce qu'il NE touche pas : `coa_status`, `badge_coa_pending`, `preorder_enabled`
ni les prix. L'etat reel du certificat reste ce qu'il est ; seule la phrase
decorative sous le prix s'en va.

Par defaut il n'ECRIT RIEN : il montre ce qu'il changerait. Pour appliquer :

    python3 scripts/retirer_note_coa.py --appliquer

Idempotent : un second passage ne change plus rien.
"""
import asyncio
import os
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient

# Les formulations qui ne font que repeter l'etat du certificat. Comparees
# sans accent, sans casse et sans espaces superflus.
NOTES_COA = {
    "coa pending",
    "coa a venir",
    "coa en attente",
    "certificat d analyse a venir",
    "certificat d analyse en attente",
    "certificate of analysis pending",
}


def _normaliser(texte: str) -> str:
    sans_accent = unicodedata.normalize("NFKD", texte or "")
    sans_accent = "".join(c for c in sans_accent if not unicodedata.combining(c))
    propre = "".join(c if c.isalnum() else " " for c in sans_accent.lower())
    return " ".join(propre.split())


async def main(appliquer: bool) -> None:
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    produits = db.products.find({}, {"_id": 0, "id": 1, "slug": 1, "variants": 1})

    vides = 0
    gardees = []
    touches = 0

    async for p in produits:
        variantes = p.get("variants") or []
        modifie = False
        for v in variantes:
            note = (v.get("preorder_note") or "").strip()
            if not note:
                continue
            etiquette = "%s / %s" % (p.get("slug") or p.get("id"), v.get("name") or v.get("sku") or "?")
            if _normaliser(note) in NOTES_COA:
                print("VIDER   %-34s %r" % (etiquette, note))
                v["preorder_note"] = ""
                vides += 1
                modifie = True
            else:
                gardees.append((etiquette, note))
        if modifie:
            touches += 1
            if appliquer:
                await db.products.update_one({"id": p["id"]}, {"$set": {"variants": variantes}})

    if gardees:
        print()
        for etiquette, note in gardees:
            print("GARDER  %-34s %r" % (etiquette, note))
        print("(notes ecrites a la main : laissees telles quelles)")

    verbe = "videe(s)" if appliquer else "a vider (RIEN n'a ete ecrit)"
    print()
    print("%d note(s) %s sur %d produit(s)." % (vides, verbe, touches))
    if not appliquer and vides:
        print("Relancer avec --appliquer pour ecrire.")
    if not vides:
        print("Rien a faire : aucune note ne repete l'etat du COA.")


if __name__ == "__main__":
    asyncio.run(main("--appliquer" in sys.argv))
