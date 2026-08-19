"""Diagnostic complet de la chaîne d'envoi de courriels.

La chaîne comporte trois points d'échec SILENCIEUX — l'interface répond
« ok » alors qu'aucun courriel ne part. Ce script les rend tous visibles d'un
coup, plutôt que de les chercher un par un.

    python3 backend/scripts/diagnose_email.py                      # lecture seule
    python3 backend/scripts/diagnose_email.py --email a@b.com      # cible une adresse
    python3 backend/scripts/diagnose_email.py --email a@b.com --fix

--fix ne fait que deux choses, toutes deux réversibles :
  - efface le compteur de limite de débit pour l'adresse visée ;
  - remet en file les courriels bloqués par un ANCIEN expéditeur, en
    réécrivant leur champ « from » avec la valeur actuelle de la configuration.

Il ne supprime jamais rien.
"""
import argparse
import asyncio
import os
import pathlib
import sys

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ENV_PATH = pathlib.Path(__file__).resolve().parents[1] / ".env"


def line(char: str = "-") -> None:
    print("  " + char * 74)


def verdict(ok: bool, texte: str) -> str:
    return f"  [{'OK ' if ok else '!! '}] {texte}"


async def main(target_email: str | None, do_fix: bool) -> int:
    load_dotenv(ENV_PATH)
    mongo, dbname = os.environ.get("MONGO_URL"), os.environ.get("DB_NAME")
    if not mongo or not dbname:
        print("MONGO_URL ou DB_NAME absent de", ENV_PATH)
        return 2
    db = AsyncIOMotorClient(mongo)[dbname]
    print(f"\n  Base : {dbname}\n")

    # --- 1. Configuration -------------------------------------------------
    print("  1. CONFIGURATION")
    line()
    api_key = os.environ.get("RESEND_API_KEY", "")
    sender = os.environ.get("SENDER_EMAIL", "orders@fironova.com")
    magic = os.environ.get("MAGIC_SENDER_EMAIL", "")
    aff = os.environ.get("AFFILIATE_SENDER_EMAIL", "")
    base_url = os.environ.get("PUBLIC_BASE_URL", "")

    print(verdict(bool(api_key), f"RESEND_API_KEY {'présente' if api_key else 'ABSENTE — aucun courriel ne part, sans erreur visible'}"))
    print(f"       SENDER_EMAIL           {sender or '(vide)'}")
    print(f"       MAGIC_SENDER_EMAIL     {magic or '(vide → retombe sur SENDER_EMAIL)'}")
    print(f"       AFFILIATE_SENDER_EMAIL {aff or '(vide → retombe sur MAGIC puis SENDER)'}")
    print(f"       PUBLIC_BASE_URL        {base_url or '(vide)'}")

    # Doublons dans le .env : dotenv garde la DERNIÈRE occurrence, donc une
    # ligne dupliquée fait silencieusement disparaître la première.
    if ENV_PATH.exists():
        vus: dict[str, int] = {}
        for brut in ENV_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
            if "=" in brut and not brut.strip().startswith("#"):
                vus[brut.split("=", 1)[0].strip()] = vus.get(brut.split("=", 1)[0].strip(), 0) + 1
        doublons = {k: n for k, n in vus.items() if n > 1}
        if doublons:
            print()
            for k, n in doublons.items():
                print(verdict(False, f"{k} défini {n} fois — seule la DERNIÈRE ligne compte"))

    effectif = magic or sender
    domaine = effectif.split("@")[-1] if "@" in effectif else "?"
    print()
    print(f"       Expéditeur effectif des liens magiques : {effectif}")
    print(f"       Domaine à vérifier chez Resend         : {domaine}")

    # --- 2. File d'attente ------------------------------------------------
    print("\n  2. FILE D'ATTENTE")
    line()
    total = await db.email_outbox.count_documents({})
    if not total:
        print("       Aucun courriel en file.")
    else:
        par_statut = {}
        async for g in db.email_outbox.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}]):
            par_statut[g["_id"]] = g["n"]
        print(f"       {total} courriel(s) — " + ", ".join(f"{k}: {v}" for k, v in sorted(par_statut.items())))
        print()
        print(f"       {'EXPÉDITEUR STOCKÉ':38} {'NB':>4}  STATUTS")
        async for g in db.email_outbox.aggregate([
            {"$group": {"_id": "$from", "n": {"$sum": 1}, "st": {"$addToSet": "$status"}}},
            {"$sort": {"n": -1}},
        ]):
            exp = g["_id"] or "(vide)"
            marque = "  <-- PÉRIMÉ" if exp != effectif else ""
            print(f"       {exp[:38]:38} {g['n']:>4}  {','.join(sorted(g['st']))}{marque}")

        # Dernières erreurs distinctes : le message du fournisseur dit
        # exactement quoi corriger, contrairement au type d'exception.
        erreurs = {}
        async for j in db.email_outbox.find(
            {"error_message": {"$exists": True, "$ne": None}},
            {"_id": 0, "error_message": 1, "status": 1},
        ).limit(400):
            erreurs.setdefault(j["error_message"][:110], 0)
            erreurs[j["error_message"][:110]] += 1
        if erreurs:
            print("\n       Erreurs rapportées par le fournisseur :")
            for msg, n in sorted(erreurs.items(), key=lambda x: -x[1])[:6]:
                print(f"         {n:>4}x  {msg}")

    # --- 3. Adresse ciblée ------------------------------------------------
    if target_email:
        cible = target_email.lower().strip()
        print(f"\n  3. ADRESSE CIBLÉE — {cible}")
        line()
        user = await db.users.find_one({"email": cible}, {"_id": 0, "email": 1, "role": 1})
        print(verdict(bool(user),
                      "Compte existant" if user else
                      "AUCUN compte — une demande de connexion (create=false) répond « ok » SANS rien envoyer"))

        # Limite de débit : fenêtre FIXE, réinitialisée à l'heure ronde.
        cpts = await db.rate_limit_counters.find(
            {"bucket": "magic_request", "key": f"email:{cible}"}, {"_id": 0, "count": 1},
        ).to_list(20)
        utilise = sum(c.get("count", 0) for c in cpts)
        maxi = 5
        print(verdict(utilise < maxi,
                      f"Limite de débit : {utilise}/{maxi} demandes dans l'heure courante"
                      + ("" if utilise < maxi else " — BLOQUÉ jusqu'à la prochaine heure ronde")))

        jobs = await db.email_outbox.find(
            {"to": cible}, {"_id": 0, "status": 1, "from": 1, "attempts": 1, "error_message": 1},
        ).sort("created_at", -1).to_list(5)
        if jobs:
            print(f"\n       {len(jobs)} dernier(s) courriel(s) vers cette adresse :")
            for j in jobs:
                err = (j.get("error_message") or "")[:60]
                print(f"         {j.get('status',''):9} de {j.get('from','?'):32} "
                      f"essais={j.get('attempts',0)} {err}")
        else:
            print("\n       Aucun courriel n'a JAMAIS été mis en file pour cette adresse.")
            print("       → la demande n'a pas atteint _send_email() : compte inexistant,")
            print("         limite de débit atteinte, ou RESEND_API_KEY absente.")

    # --- 4. Réparation ----------------------------------------------------
    print("\n  4. RÉPARATION")
    line()
    perimes = await db.email_outbox.count_documents(
        {"from": {"$ne": effectif}, "status": {"$in": ["failed", "retry", "pending"]}})
    if not do_fix:
        print(f"       {perimes} courriel(s) en attente portent un expéditeur périmé.")
        if target_email:
            print("       Relancez avec --fix pour réécrire leur expéditeur et")
            print("       effacer la limite de débit de l'adresse ciblée.")
        print("\n       LECTURE SEULE — rien n'a été modifié.")
        return 0

    if target_email:
        r = await db.rate_limit_counters.delete_many(
            {"bucket": "magic_request", "key": f"email:{target_email.lower().strip()}"})
        print(f"       limite de débit effacée ({r.deleted_count} compteur(s))")

    if perimes:
        r = await db.email_outbox.update_many(
            {"from": {"$ne": effectif}, "status": {"$in": ["failed", "retry", "pending"]}},
            {"$set": {"from": effectif, "status": "retry", "attempts": 0,
                      "janitor_requeues": 0}},
        )
        print(f"       {r.modified_count} courriel(s) réécrits avec {effectif} et remis en file")
    else:
        print("       aucun courriel périmé à réécrire")
    print("\n       Terminé.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--email", default=None, help="adresse à diagnostiquer")
    ap.add_argument("--fix", action="store_true", help="applique les réparations")
    a = ap.parse_args()
    sys.exit(asyncio.run(main(a.email, a.fix)))
