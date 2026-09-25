"""Pourquoi le coût estimé de Dispatch reste vide.

L'écran Dispatch affiche « Coût estimé étiquettes » en sommant une cotation
Postes Canada par commande à étiqueter. Quand cette cotation échoue, elle
renvoie une liste vide : le total tombe à 0, et le bandeau financier ne
s'affiche même pas — l'écran ne montre rien plutôt que d'expliquer. Ce script
dit lequel des maillons casse.

Il est EN LECTURE SEULE. Il ne crée aucun envoi, aucune étiquette, aucune
commande : coter un colis chez Postes Canada ne réserve rien.

    cd /app/backend && python scripts/diagnostic_cout_estime.py
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv(Path("/app/backend/.env"))

from services import canada_post as cp
from motor.motor_asyncio import AsyncIOMotorClient

s = cp.s


def puce(ok, texte, detail=""):
    print(("  OK     " if ok else "  MANQUE ") + texte + (f" — {detail}" if detail else ""))
    return ok


async def executer():
    print("=" * 74)
    print("DIAGNOSTIC — le coût estimé de l'écran Dispatch")
    print("=" * 74)

    # ------------------------------------------------------------------ 1
    print("\n1. CE QUE LA COTATION EXIGE")
    origine = getattr(s, "CANADA_POST_ORIGIN_POSTAL_CODE", "") or ""
    cle = getattr(s, "CANADA_POST_API_KEY", "") or ""
    client_no = getattr(s, "CANADA_POST_CUSTOMER_NUMBER", "") or ""
    oauth_id = getattr(s, "CANADA_POST_OAUTH_CLIENT_ID", "") or ""
    oauth_secret = getattr(s, "CANADA_POST_OAUTH_CLIENT_SECRET", "") or ""
    mode = getattr(s, "CANADA_POST_API_MODE", "") or "(vide)"

    puce(bool(origine), "code postal d'origine",
         origine if origine else "absent — la cotation s'arrête ici")
    print("\n   Deux chemins possibles, il en suffit d'UN :")
    voie_oauth = puce(bool(oauth_id and oauth_secret), "nouveau portail (OAuth)",
                      "client id + secret présents" if (oauth_id and oauth_secret)
                      else "client id ou secret absent")
    voie_legacy = puce(bool(cle and client_no), "ancienne API",
                       "clé + numéro de client présents" if (cle and client_no)
                       else "clé ou numéro absent")

    source = cp._cp_source_tarifs()
    print(f"\n   Source retenue pour la cotation : {source or 'AUCUNE'}")
    print(f"   CANADA_POST_API_MODE = {mode}")
    print("   (ce mode ne régit QUE les étiquettes, jamais la cotation)")

    if not cp._cp_tarifs_disponibles():
        print("\n   >>> VOILÀ LA CAUSE : aucune source de cotation n'est disponible.")
        print("       Sans elle, le programme n'appelle même pas Postes Canada : le")
        print("       total reste à 0 et le bandeau financier ne s'affiche pas.")
        if not origine:
            print("       À corriger : CANADA_POST_ORIGIN_POSTAL_CODE dans /app/backend/.env")
        elif not (voie_oauth or voie_legacy):
            print("       À corriger : les identifiants OAuth, OU la clé + le numéro client")
        return

    # ------------------------------------------------------------------ 2
    print("\n2. UNE VRAIE COTATION, SUR UNE ADRESSE DE TEST")
    print("   (Montréal H2X 1Y4, 0,5 kg — aucun envoi n'est créé)")
    devis = await cp._canada_post_get_rates("H2X1Y4", "CA", 0.5)
    if not devis:
        print("\n   >>> VOILÀ LA CAUSE : Postes Canada n'a renvoyé aucun tarif.")
        print("       Le code renvoie une liste vide sur TOUTE erreur, et l'erreur")
        print("       elle-même part dans le journal du serveur. Pour la lire :")
        print("         tail -n 300 /var/log/supervisor/backend.err.log | grep -i canada")
        print("       Causes habituelles : identifiants refusés (401/403), numéro de")
        print("       client non habilité à la cotation, ou environnement d'essai qui")
        print("       ne sert pas de tarifs.")
        return
    print(f"\n   {len(devis)} tarif(s) reçu(s) :")
    for d in devis[:6]:
        print(f"     {str(d.get('service_code') or '?'):10}"
              f" {str(d.get('service_name') or ''):32}"
              f" {d.get('cost_cad')} $   {d.get('eta_days') or '?'} j")

    # ------------------------------------------------------------------ 3
    print("\n3. LE SERVICE CHOISI DANS L'ÉCRAN")
    for code in ("DOM.XP", "DOM.EP", "DOM.RP"):
        choisi = cp._cp_choisir_tarif(devis, code)
        if choisi is None:
            puce(False, f"{code}", "aucun tarif, et aucun repli")
            continue
        exact = str(choisi.get("service_code") or "").upper() == code
        detail = f"{choisi.get('cost_cad')} $"
        if not exact:
            detail += f"  (repli sur {choisi.get('service_code')} — affiché « estimé CP » sans le délai)"
        puce(True, f"{code}", detail)

    # ------------------------------------------------------------------ 4
    print("\n4. LES COMMANDES QUE DISPATCH ESTIME")
    print("   L'estimation ne porte QUE sur les commandes à l'état « packed ».")
    print("   Une commande payée mais pas encore emballée n'apparaît pas dans")
    print("   « À étiqueter », donc elle ne compte pas dans le coût estimé.")
    url = os.environ.get("MONGO_URL") or getattr(s, "MONGO_URL", None)
    nom = os.environ.get("DB_NAME") or getattr(s, "DB_NAME", None)
    if not url or not nom:
        print("   (base non joignable : MONGO_URL ou DB_NAME absent de l'environnement)")
        return
    try:
        db = AsyncIOMotorClient(url)[nom]
        total_packed = 0
        for etat in ("packed", "processing", "pending"):
            n = await db.orders.count_documents(
                {"payment_status": "paid", "fulfillment_status": etat})
            if etat == "packed":
                total_packed = n
            print(f"     {etat:12} {n:4}" + ("   <-- celles-ci sont estimées" if etat == "packed" else ""))
        sans_cp = await db.orders.count_documents({
            "payment_status": "paid", "fulfillment_status": "packed",
            "$or": [{"shipping_address.postal_code": {"$in": [None, ""]}},
                    {"shipping_address": {"$exists": False}}],
        })
        if sans_cp:
            print(f"\n  MANQUE  {sans_cp} commande(s) emballée(s) SANS code postal :")
            print("          un code postal mal formé est refusé avant l'appel, sans erreur.")
        if total_packed == 0:
            print("\n   >>> VOILÀ LA CAUSE : aucune commande n'est à l'état « packed ».")
            print("       La cotation fonctionne, mais elle n'a rien à estimer. Passez")
            print("       une commande par le flux Journée jusqu'à l'emballage, puis")
            print("       rouvrez Dispatch.")
    except Exception as e:
        print(f"   (base non interrogée : {type(e).__name__} — {e})")

    print("\n" + "=" * 74)


if __name__ == "__main__":
    asyncio.run(executer())
