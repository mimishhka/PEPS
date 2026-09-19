"""Met le poids de TOUTES les variantes de produits a la valeur par defaut.

Demande du 2026-09-19 : les flacons sont quasi impalpables, c'est l'emballage
qui pese. Le defaut du code (`POIDS_PRODUIT_DEFAUT_G`, 0,3 g) ne s'applique
qu'aux produits crees ensuite : les fiches deja enregistrees gardent leur
ancienne valeur, d'ou ce script.

Ce qu'il NE touche pas : les commandes. Leur poids est fige a l'achat, il doit
continuer de refleter ce qui a ete vendu.

Par defaut il n'ECRIT RIEN : il montre ce qu'il changerait. Pour appliquer :

    python3 scripts/poids_produits_defaut.py --appliquer

Idempotent : un second passage ne change plus rien.
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient

try:
    from server import POIDS_PRODUIT_DEFAUT_G
except Exception:  # base seule, sans l'application (diagnostic)
    POIDS_PRODUIT_DEFAUT_G = 0.3


async def main(appliquer: bool) -> None:
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    produits = db.products.find({}, {"_id": 0, "id": 1, "slug": 1, "variants": 1})

    a_changer = inchanges = 0
    async for p in produits:
        variantes = p.get("variants") or []
        anciens = [v.get("weight_grams") for v in variantes]
        if all(float(a or 0) == POIDS_PRODUIT_DEFAUT_G for a in anciens):
            inchanges += 1
            continue
        a_changer += 1
        print(f"{p.get('slug') or p.get('id')} : {anciens} -> {POIDS_PRODUIT_DEFAUT_G} g")
        if appliquer:
            for v in variantes:
                v["weight_grams"] = POIDS_PRODUIT_DEFAUT_G
            await db.products.update_one({"id": p["id"]}, {"$set": {"variants": variantes}})

    verbe = "modifies" if appliquer else "a modifier (RIEN n'a ete ecrit)"
    print(f"\n{a_changer} produit(s) {verbe}, {inchanges} deja a {POIDS_PRODUIT_DEFAUT_G} g.")
    if not appliquer and a_changer:
        print("Relancer avec --appliquer pour ecrire.")


if __name__ == "__main__":
    asyncio.run(main("--appliquer" in sys.argv))
