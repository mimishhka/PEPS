#!/usr/bin/env python
"""Combien de temps vos clients mettent-ils VRAIMENT à payer ?

Raccourcir le délai de paiement est un arbitrage : trop long, le stock reste
immobilisé ; trop court, on annule des commandes que le client était en train
de payer. Le point d'équilibre ne se devine pas — il dépend de vos clients et
de leurs banques.

Ce script lit vos commandes payées et rapporte la distribution réelle du délai
entre la commande et le paiement, séparément pour l'Interac et la crypto, car
les deux n'ont rien à voir : la crypto se confirme sur un réseau, le virement
Interac dépend d'une banque qui traite par lots.

Il ne modifie RIEN. Lecture seule.

    /root/.venv/bin/python backend/scripts/delais_paiement.py
    /root/.venv/bin/python backend/scripts/delais_paiement.py --jours 180
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


def _dt(valeur):
    """Accepte une chaîne ISO ou un datetime déjà décodé par le pilote."""
    if isinstance(valeur, datetime):
        return valeur if valeur.tzinfo else valeur.replace(tzinfo=timezone.utc)
    if not valeur:
        return None
    try:
        d = datetime.fromisoformat(str(valeur).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _centile(valeurs_triees, p):
    if not valeurs_triees:
        return None
    if len(valeurs_triees) == 1:
        return valeurs_triees[0]
    rang = (len(valeurs_triees) - 1) * p / 100
    bas, haut = int(rang), min(int(rang) + 1, len(valeurs_triees) - 1)
    return valeurs_triees[bas] + (valeurs_triees[haut] - valeurs_triees[bas]) * (rang - bas)


def _duree(minutes):
    if minutes is None:
        return "—"
    if minutes < 60:
        return f"{minutes:.0f} min"
    if minutes < 60 * 24:
        return f"{minutes / 60:.1f} h"
    return f"{minutes / 1440:.1f} j"


async def principal():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jours", type=int, default=365,
                    help="fenêtre d'observation (défaut : 365)")
    args = ap.parse_args()

    uri = os.environ.get("MONGO_URL")
    base = os.environ.get("DB_NAME")
    if not uri or not base:
        print("MONGO_URL et DB_NAME doivent être définis. Depuis /app :")
        print("  set -a && . backend/.env && set +a")
        return 1

    db = AsyncIOMotorClient(uri)[base]
    depuis = (datetime.now(timezone.utc) - timedelta(days=args.jours)).isoformat()

    curseur = db.orders.find(
        {"payment_status": "paid", "created_at": {"$gte": depuis}},
        {"_id": 0, "created_at": 1, "paid_at": 1, "payment_method": 1,
         "order_number": 1, "total": 1},
    )

    par_methode = {}
    sans_date = 0
    negatifs = 0
    async for o in curseur:
        cree, paye = _dt(o.get("created_at")), _dt(o.get("paid_at"))
        if not cree or not paye:
            sans_date += 1
            continue
        minutes = (paye - cree).total_seconds() / 60
        if minutes < 0:
            # Horloges désaccordées ou paiement rapproché manuellement : on
            # compte le cas plutôt que de le faire disparaître dans la moyenne.
            negatifs += 1
            continue
        methode = (o.get("payment_method") or "inconnu").lower()
        par_methode.setdefault(methode, []).append(minutes)

    if not par_methode:
        print(f"Aucune commande payée sur {args.jours} jours.")
        if sans_date:
            print(f"({sans_date} commande(s) sans date exploitable)")
        return 0

    ETIQUETTE = {"interac": "Interac (virement)", "nowpayments": "Crypto"}
    SEUILS = [30, 60, 120, 180, 360, 720, 1440]

    print(f"\nDélai entre la commande et le paiement — {args.jours} derniers jours\n")
    for methode, valeurs in sorted(par_methode.items(), key=lambda x: -len(x[1])):
        valeurs.sort()
        n = len(valeurs)
        print(f"  {ETIQUETTE.get(methode, methode)}  ({n} commande(s) payée(s))")
        print(f"    médiane {_duree(_centile(valeurs, 50)):>9}"
              f"   90e {_duree(_centile(valeurs, 90)):>9}"
              f"   95e {_duree(_centile(valeurs, 95)):>9}"
              f"   max {_duree(valeurs[-1]):>9}")
        print("    Si le délai avait été de… combien de ces paiements auraient été annulés :")
        for seuil in SEUILS:
            perdus = sum(1 for v in valeurs if v > seuil)
            part = 100 * perdus / n
            barre = "#" * int(round(part / 4))
            marque = "  <-- reglage actuel" if abs(seuil - _ttl_actuel()) < 1 else ""
            print(f"      {_duree(seuil):>7} : {perdus:3} perdu(s)  {part:5.1f} %  {barre}{marque}")
        print()

    if sans_date:
        print(f"  {sans_date} commande(s) ignorée(s) : date manquante.")
    if negatifs:
        print(f"  {negatifs} commande(s) ignorée(s) : paiement antérieur à la commande "
              f"(rapprochement manuel ou horloge désaccordée).")
    print("\n  Lecture : un seuil qui annule plus de quelques pour cent de vos")
    print("  paiements réels vous coûtera des ventes et du travail manuel —")
    print("  chaque paiement tardif doit être rapproché à la main.\n")
    return 0


def _ttl_actuel():
    try:
        return float(os.environ.get("UNPAID_ORDER_TTL_HOURS", "24")) * 60
    except ValueError:
        return 1440


if __name__ == "__main__":
    raise SystemExit(asyncio.run(principal()))
