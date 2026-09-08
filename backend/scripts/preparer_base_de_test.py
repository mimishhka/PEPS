"""Donne du stock au catalogue d'une base de TEST.

POURQUOI

Les cinq produits actifs du jeu d'amorcage sortent avec `stock: 0` — ce qui est
juste : le stock reel s'ajoute depuis l'administration a la reception de la
marchandise, il n'a rien a faire dans un jeu d'amorcage.

Mais en integration continue, la base est fraiche a chaque execution. Le
catalogue existe, il est simplement vide de marchandise, et TOUS les tests qui
passent en caisse echouent :

    {"detail": "Insufficient stock for BPC-157 (5.0mg)"}
    AssertionError: Need an in-stock non-preorder variant priced >50

Ce script comble cet ecart, et lui seul.

GARDE-FOU

Il REFUSE de s'executer si le nom de la base ne ressemble pas a une base de
test, et exige en plus un drapeau explicite. Un script qui ecrase des stocks n'a
aucune raison de pouvoir toucher la production, meme par accident, meme si
quelqu'un se trompe de terminal.

USAGE

    python scripts/preparer_base_de_test.py --je-confirme-base-de-test
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

STOCK_DE_TEST = 500
INDICES_DE_TEST = ("test", "ci", "dev", "local")


async def main(confirme: bool) -> int:
    nom = os.environ.get("DB_NAME", "")
    if not confirme:
        print("Refus : passez --je-confirme-base-de-test.")
        return 2
    if not any(i in nom.lower() for i in INDICES_DE_TEST):
        print(f"Refus : DB_NAME='{nom}' ne ressemble pas a une base de test.")
        print(f"Le nom doit contenir l'un de : {', '.join(INDICES_DE_TEST)}.")
        return 2

    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[nom]

    produits = await db.products.find({"active": True}, {"_id": 0, "id": 1, "slug": 1,
                                                        "variants": 1}).to_list(500)
    if not produits:
        print("Aucun produit actif — le serveur a-t-il seme la base ?")
        return 1

    touches = 0
    for p in produits:
        variantes = p.get("variants") or []
        for v in variantes:
            v["stock"] = STOCK_DE_TEST
            # Une variante en precommande ne peut pas servir aux tests de
            # caisse ordinaires : le test cherche explicitement une variante
            # « non-preorder ».
            v["preorder_enabled"] = False
        await db.products.update_one(
            {"id": p["id"]},
            {"$set": {"stock": STOCK_DE_TEST, "variants": variantes}},
        )
        touches += 1
        print(f"  {p['slug']:<24} {len(variantes)} variante(s) a {STOCK_DE_TEST}")

    print(f"\n{touches} produit(s) actif(s) approvisionne(s) dans '{nom}'.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--je-confirme-base-de-test", dest="confirme", action="store_true",
                    help="obligatoire — atteste que DB_NAME designe une base jetable")
    args = ap.parse_args()
    raise SystemExit(asyncio.run(main(args.confirme)))
