"""Combien d'adresses Google accepte-t-il que Postes Canada refuse ?

C'est la question qui decide si un abonnement AddressComplete se justifie.
Avant ce script, elle n'etait pas repondable : l'echec d'etiquette partait
dans le journal du serveur et n'y laissait aucune trace exploitable.

Il n'ECRIT RIEN. Il lit les commandes payees, regarde ce que la verification
d'adresse avait dit a l'achat, et ce que Postes Canada a repondu ensuite.

    python3 scripts/diagnostic_etiquettes.py
    python3 scripts/diagnostic_etiquettes.py --jours 180

Deux populations sont distinguees, parce qu'elles ne disent pas la meme chose :

  REFUSEES  — l'etiquette a ete demandee et refusee. Le motif est conserve.
  EN PANNE  — payee depuis longtemps, sans etiquette ni motif. Ce sont les
              echecs d'AVANT cette trace : ils comptent dans le volume mais
              on ne saura pas pourquoi.
"""
import asyncio
import os
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from motor.motor_asyncio import AsyncIOMotorClient


def _arg(nom, defaut):
    if nom in sys.argv:
        try:
            return int(sys.argv[sys.argv.index(nom) + 1])
        except (IndexError, ValueError):
            pass
    return defaut


def _motif_court(texte):
    """Regroupe les motifs qui disent la meme chose sous des mots differents."""
    t = (texte or "").lower()
    for cle, libelle in [
        ("postal", "code postal refuse"),
        ("address", "adresse refusee"),
        ("destination", "destination refusee"),
        ("timeout", "delai depasse"),
        ("401", "authentification"),
        ("403", "authentification"),
        ("weight", "poids"),
        ("service", "service indisponible"),
    ]:
        if cle in t:
            return libelle
    return (texte or "sans motif")[:60]


async def main(jours):
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    depuis = (datetime.now(timezone.utc) - timedelta(days=jours)).isoformat()

    payees = refusees = en_panne = expediees = 0
    google_avait_dit_oui = 0
    sans_verification = 0
    motifs = Counter()
    exemples = []

    curseur = db.orders.find(
        {"payment_status": "paid", "created_at": {"$gte": depuis},
         "deleted_at": None},
        {"_id": 0, "order_number": 1, "shipping_info": 1, "shipping": 1,
         "address_verified": 1, "address_verification_provider": 1,
         "created_at": 1},
    )
    async for o in curseur:
        payees += 1
        info = o.get("shipping_info") or {}
        if info.get("tracking_number"):
            expediees += 1
            continue

        motif = info.get("label_error")
        if motif:
            refusees += 1
            motifs[_motif_court(motif)] += 1
        else:
            en_panne += 1
            continue

        fournisseur = o.get("address_verification_provider") or "disabled"
        if fournisseur == "google_maps" and o.get("address_verified"):
            google_avait_dit_oui += 1
            if len(exemples) < 8:
                a = o.get("shipping") or {}
                exemples.append((
                    o.get("order_number", "?"),
                    " ".join(str(a.get(c) or "") for c in
                             ("address1", "city", "province", "postal_code")).strip(),
                    _motif_court(motif),
                ))
        else:
            sans_verification += 1

    print(f"Sur les {jours} derniers jours, {payees} commande(s) payee(s).")
    print(f"  {expediees} avec etiquette")
    print(f"  {refusees} refusee(s) par Postes Canada, motif conserve")
    print(f"  {en_panne} sans etiquette NI motif (echecs d'avant la trace,")
    print(f"           ou etiquette pas encore demandee)")
    print()

    if not refusees:
        print("Aucun refus trace. Soit tout passe, soit la trace vient d'etre")
        print("posee et il faut laisser passer quelques commandes.")
        return

    print(f"LA REPONSE A LA QUESTION : sur {refusees} refus de Postes Canada,")
    print(f"{google_avait_dit_oui} portaient une adresse que Google avait VALIDEE.")
    taux = 100.0 * google_avait_dit_oui / max(1, payees)
    print(f"Soit {taux:.1f} % des commandes payees de la periode.")
    print()
    print("Un abonnement AddressComplete corrige CETTE population, et elle")
    print("seule. Compare son cout a ce que coutent ces commandes-la.")
    print()

    print("Motifs de refus :")
    for motif, n in motifs.most_common():
        print(f"  {n:4d}  {motif}")

    if exemples:
        print()
        print("Exemples (adresse validee par Google, refusee par Postes Canada) :")
        for numero, adresse, motif in exemples:
            print(f"  {numero}  {adresse}")
            print(f"            -> {motif}")


if __name__ == "__main__":
    asyncio.run(main(_arg("--jours", 365)))
