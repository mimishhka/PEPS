"""Reprise des parrainages exclus sous l'ancienne regle d'auto-parrainage.

CONTEXTE

Jusqu'a la fin aout 2026, une commande passee par un affilie avec son propre
code etait exclue : le referral partait en `status: "excluded"`, motif
`self_order`, commission a zero. La regle a change — l'auto-achat conserve
desormais le rabais ET la commission, c'est une decision commerciale assumee.

Le code a suivi. Les DONNEES, non. Les parrainages deja marques exclus sont
restes exclus, et les commissions correspondantes n'ont jamais ete versees.
C'est de l'argent du a des affilies reels.

CE QUE FAIT CE SCRIPT

Pour chaque referral `status="excluded"` + `excluded_reason="self_order"` :

  - recalcule la commission au taux EFFECTIF ACTUEL de l'affilie ;
  - remet le statut a `approved` ou `pending` selon la meme regle que pour un
    parrainage neuf (delai de maturation, statut de paiement de la commande) ;
  - horodate la reprise (`reprise_auto_parrainage_at`) pour que l'operation
    soit tracable et qu'un second passage soit un no-op.

UNE HYPOTHESE, ASSUMEE ET VISIBLE

Le taux applique est celui d'AUJOURD'HUI, pas celui qui valait au moment de la
commande : ce dernier n'a jamais ete enregistre sur les lignes exclues, dont la
commission etait zero. Si le palier de l'affilie a monte depuis, la reprise lui
est favorable. Le rapport a blanc affiche le taux retenu pour chaque ligne :
lisez-le avant d'appliquer.

USAGE

    python scripts/reprise_auto_parrainage.py              # RAPPORT SEUL, n'ecrit rien
    python scripts/reprise_auto_parrainage.py --appliquer  # ecrit

Le mode par defaut est le rapport. Il faut demander explicitement l'ecriture :
un script qui verse de l'argent ne doit pas pouvoir s'executer par accident.
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402
load_dotenv(Path("/app/backend/.env"))

from datetime import datetime, timezone  # noqa: E402

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


async def main(appliquer: bool) -> int:
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # Le calcul du taux vit dans le service : on le reutilise plutot que de le
    # reecrire. Deux formules du taux de commission, ce serait deux verites.
    import server  # noqa: F401  (initialise la configuration et la base)
    from services.affiliate import _affiliate_compute_metrics

    hold_days = float(os.environ.get("AFFILIATE_APPROVAL_HOLD_DAYS", "0"))
    maintenant = datetime.now(timezone.utc).isoformat()

    lignes = await db.affiliate_referrals.find({
        "status": "excluded",
        "excluded_reason": "self_order",
        "reprise_auto_parrainage_at": {"$exists": False},
    }, {"_id": 0}).to_list(5000)

    if not lignes:
        print("Aucun parrainage a reprendre. (Deja fait, ou rien a faire.)")
        return 0

    taux_par_affilie: dict = {}
    total = 0.0
    rapport = []

    for r in lignes:
        aid = r.get("affiliate_id")
        if aid not in taux_par_affilie:
            try:
                taux_par_affilie[aid] = float(
                    (await _affiliate_compute_metrics(aid))["commission_rate"])
            except Exception as e:
                print(f"  !! taux indisponible pour {aid} : {e} — ligne ignoree")
                taux_par_affilie[aid] = None
        taux = taux_par_affilie[aid]
        if taux is None:
            continue

        base = float(r.get("base_amount") or 0.0)
        commission = round(base * taux, 2)
        if commission <= 0:
            continue

        commande = await db.orders.find_one(
            {"id": r.get("order_id")},
            {"_id": 0, "payment_status": 1, "refund_status": 1},
        ) or {}
        payee = commande.get("payment_status") == "paid"
        rembours = bool((commande.get("refund_status") or "").strip())
        statut = "approved" if (hold_days <= 0 and payee and not rembours) else "pending"

        total += commission
        rapport.append((r.get("order_number"), r.get("affiliate_code"),
                        base, taux, commission, statut))

        if appliquer:
            await db.affiliate_referrals.update_one(
                {"id": r["id"], "status": "excluded"},
                {"$set": {
                    "status": statut,
                    "commission_amount": commission,
                    "excluded_reason": None,
                    "approved_at": maintenant if statut == "approved" else None,
                    "reprise_auto_parrainage_at": maintenant,
                    "reprise_taux_applique": taux,
                }},
            )

    largeur = "{:<16} {:<12} {:>10} {:>7} {:>11}  {}"
    print(largeur.format("COMMANDE", "AFFILIE", "BASE", "TAUX", "COMMISSION", "STATUT"))
    for num, code, base, taux, com, statut in rapport:
        print(largeur.format(str(num), str(code), f"{base:.2f}",
                             f"{taux*100:.0f}%", f"{com:.2f}", statut))

    print()
    print(f"{len(rapport)} parrainage(s), {total:.2f} $ de commission")
    if appliquer:
        print("ECRIT. Les commissions entreront dans le prochain lot de versement.")
    else:
        print("RAPPORT SEUL — rien n'a ete ecrit.")
        print("Pour appliquer : python scripts/reprise_auto_parrainage.py --appliquer")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--appliquer", action="store_true",
                    help="ecrit les corrections (sans ce drapeau : rapport seul)")
    args = ap.parse_args()
    raise SystemExit(asyncio.run(main(args.appliquer)))
