#!/usr/bin/env python
"""Examine la collection des coupons, et répare ce qui peut l'être.

    /root/.venv/bin/python backend/scripts/diagnostic_coupons.py
    /root/.venv/bin/python backend/scripts/diagnostic_coupons.py --reparer

Sans --reparer, RIEN n'est modifié : le script se contente de compter et de
nommer. C'est volontaire — on regarde avant de toucher.

Ce qu'il cherche, et pourquoi chaque point compte :

  ID MANQUANT. La clé unique de la collection est `code`, pas `id`. Un document
  sans `id` fait envoyer « undefined » par l'écran d'administration, et le
  serveur répond « Coupon not found » sur un coupon pourtant visible dans la
  liste. C'est l'explication du bogue signalé ; ce script la confirme ou
  l'infirme.

  EXPIRATION DÉJÀ PASSÉE. Rien ne l'interdisait jusqu'ici. Un coupon expiré
  mais marqué actif s'affiche comme utilisable et refuse toute commande — le
  défaut se découvre au client, à la caisse.

  CODE ORPHELIN. Un code marqué « affilié » dont l'affilié n'existe plus. Il
  continue d'accorder un rabais que plus personne ne suit.
"""
import argparse
import asyncio
import os
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


def _date(v):
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return "illisible"


async def principal():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reparer", action="store_true",
                    help="attribuer un id aux documents qui n'en ont pas")
    args = ap.parse_args()

    uri, base = os.environ.get("MONGO_URL"), os.environ.get("DB_NAME")
    if not uri or not base:
        print("MONGO_URL et DB_NAME doivent être définis. Depuis /app :")
        print("  set -a && . backend/.env && set +a")
        return 1
    db = AsyncIOMotorClient(uri)[base]

    tous = await db.coupons.find({}, {"_id": 0}).to_list(5000)
    if not tous:
        print("Aucun coupon dans la base.")
        return 0

    vivants = [c for c in tous if not c.get("deleted_at")]
    affilies = [c for c in vivants
                if c.get("affiliate_id") or c.get("source") == "affiliate"]
    promo = [c for c in vivants if c not in affilies]

    print(f"\n  {len(tous)} coupon(s) au total, dont {len(vivants)} non supprimé(s)")
    print(f"    promotionnels : {len(promo)}")
    print(f"    codes affiliés : {len(affilies)}")

    print("\n─── 1. Documents SANS champ « id » ───\n")
    sans_id = [c for c in vivants if not c.get("id")]
    if sans_id:
        print(f"  {len(sans_id)} document(s) — c'est la cause du « Coupon not found ».")
        for c in sans_id[:15]:
            famille = "affilié" if c in affilies else "promo"
            print(f"     {c.get('code', '?'):20} ({famille})")
        if len(sans_id) > 15:
            print(f"     … et {len(sans_id) - 15} autre(s)")
        if args.reparer:
            import uuid
            for c in sans_id:
                await db.coupons.update_one({"code": c["code"]},
                                            {"$set": {"id": str(uuid.uuid4())}})
            print(f"\n  RÉPARÉ : {len(sans_id)} identifiant(s) attribué(s).")
        else:
            print("\n  Pour corriger : relancer avec --reparer")
    else:
        print("  Aucun. L'hypothèse du « Coupon not found » est donc à chercher ailleurs :")
        print("  notez le code exact du coupon qui échoue et son message complet.")

    print("\n─── 2. Expiration déjà passée ───\n")
    maintenant = datetime.now(timezone.utc)
    perimes = []
    illisibles = []
    for c in vivants:
        d = _date(c.get("expires_at"))
        if d == "illisible":
            illisibles.append(c)
        elif d and d <= maintenant and c.get("active", True):
            perimes.append((c, d))
    if perimes:
        print(f"  {len(perimes)} coupon(s) marqué(s) actif(s) mais expiré(s) :")
        for c, d in perimes[:15]:
            print(f"     {c.get('code', '?'):20} expiré le {d.date()}")
        print("\n  Ils s'affichent comme utilisables et refusent toute commande.")
        print("  À désactiver depuis l'écran des coupons.")
    else:
        print("  Aucun.")
    if illisibles:
        print(f"\n  {len(illisibles)} date(s) d'expiration illisible(s) :")
        for c in illisibles[:10]:
            print(f"     {c.get('code', '?'):20} {c.get('expires_at')!r}")

    print("\n─── 3. Codes d'affiliés orphelins ───\n")
    ids_aff = [c["affiliate_id"] for c in affilies if c.get("affiliate_id")]
    existants = set()
    if ids_aff:
        async for a in db.affiliates.find({"id": {"$in": ids_aff}}, {"_id": 0, "id": 1}):
            existants.add(a["id"])
    orphelins = [c for c in affilies
                 if c.get("affiliate_id") and c["affiliate_id"] not in existants]
    sans_lien = [c for c in affilies if not c.get("affiliate_id")]
    if orphelins:
        print(f"  {len(orphelins)} code(s) dont l'affilié n'existe plus :")
        for c in orphelins[:15]:
            print(f"     {c.get('code', '?')}")
    else:
        print("  Aucun code sans affilié correspondant.")
    if sans_lien:
        print(f"\n  {len(sans_lien)} code(s) marqué(s) « affilié » sans affiliate_id :")
        for c in sans_lien[:10]:
            print(f"     {c.get('code', '?')}")

    print("\n─── 4. Doublons de code ───\n")
    # L'index est unique, mais il a pu être créé APRÈS des doublons existants.
    compte = Counter(c.get("code") for c in tous)
    doubles = [(k, n) for k, n in compte.items() if n > 1]
    if doubles:
        print(f"  {len(doubles)} code(s) en double :")
        for k, n in doubles[:10]:
            print(f"     {k} × {n}")
    else:
        print("  Aucun.")

    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(principal()))
