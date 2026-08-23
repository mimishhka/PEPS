#!/usr/bin/env python
"""Répond à une seule question : peut-on commencer les tests ?

    python backend/scripts/pret_pour_tests.py

Chaque ligne dit OUI, NON ou À VÉRIFIER, et ce qu'il faut faire quand c'est
non. Rien n'est deviné : tout est lu dans le fichier de configuration, dans la
base, ou en interrogeant le serveur.

AUCUNE CLÉ N'EST AFFICHÉE. Le script dit si une valeur est présente, jamais
laquelle. Ce fichier contient les identifiants de production.

Le code de sortie vaut 1 si un point BLOQUANT manque — utilisable tel quel
dans un enchaînement.
"""
import asyncio
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parent.parent
ENV = RACINE / ".env"

VERT, ROUGE, JAUNE, GRIS = "OUI", "NON", "À VOIR", "  —   "


def charger_env():
    """Lit le .env sans dépendre de python-dotenv, et retire les guillemets.

    Les guillemets comptent : une valeur écrite UNPAID_ORDER_TTL_HOURS="24"
    est vue « 24 » par l'application, mais « \"24\" » par une lecture naïve.
    """
    valeurs = {}
    if not ENV.exists():
        return valeurs
    for ligne in ENV.read_text(encoding="utf-8", errors="replace").splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("#") or "=" not in ligne:
            continue
        cle, _, val = ligne.partition("=")
        valeurs[cle.strip()] = val.strip().strip('"').strip("'")
    return valeurs


def ligne(etat, titre, detail=""):
    print(f"  [{etat:^6}]  {titre}")
    if detail:
        for d in detail.splitlines():
            print(f"             {d}")


async def base(env):
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
    except ImportError:
        return None, "le module motor n'est pas installé"
    uri, nom = env.get("MONGO_URL"), env.get("DB_NAME")
    if not uri or not nom:
        return None, "MONGO_URL ou DB_NAME manquant"
    try:
        db = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=4000)[nom]
        await db.command("ping")
        return db, None
    except Exception as e:
        return None, f"{type(e).__name__}"


async def principal():
    env = charger_env()
    bloquants = 0

    print("\n─── RÉGLAGES DE LA CAMPAGNE ───\n")
    attendus = {"UNPAID_ORDER_TTL_HOURS": "0.05",
                "AFFILIATE_APPROVAL_HOLD_DAYS": "0",
                "REFUND_CLAIM_HOURS_AFTER_DELIVERY": "720"}
    for cle, attendu in attendus.items():
        actuel = env.get(cle)
        if actuel == attendu:
            ligne(VERT, f"{cle} = {actuel}")
        else:
            bloquants += 1
            vu = actuel if actuel is not None else "absent"
            ligne(ROUGE, f"{cle} = {vu}, attendu {attendu}",
                  "python backend/scripts/mode_test.py --on")

    print("\n─── SERVEUR ET BASE ───\n")
    # LOCALHOST D'ABORD, l'adresse publique ensuite.
    #
    # Une première version n'essayait que PUBLIC_BASE_URL et déclarait le
    # serveur mort sur un HTTPError — alors qu'il tournait très bien. Une
    # adresse publique passe par un proxy, une passerelle d'aperçu, parfois une
    # authentification : ce qu'on mesurait n'était pas le serveur.
    candidats = ["http://127.0.0.1:8001"]
    publique = (env.get("PUBLIC_BASE_URL") or "").rstrip("/")
    if publique:
        candidats.append(publique)

    repond = False
    detail = []
    for url in candidats:
        try:
            with urllib.request.urlopen(f"{url}/api/meta", timeout=6) as r:
                if r.status == 200:
                    ligne(VERT, f"le serveur répond ({url})")
                    repond = True
                    break
                detail.append(f"{url} → HTTP {r.status}")
        except urllib.error.HTTPError as e:
            # Un code HTTP signifie que QUELQUE CHOSE a répondu : proxy,
            # passerelle, authentification. Le nommer évite de conclure à tort.
            detail.append(f"{url} → HTTP {e.code} (une passerelle a répondu)")
        except (urllib.error.URLError, OSError) as e:
            detail.append(f"{url} → {type(e).__name__}")
    if not repond:
        bloquants += 1
        ligne(ROUGE, "le serveur ne répond sur aucune adresse",
              "\n".join(detail) + "\nsudo supervisorctl restart backend")

    db, err = await base(env)
    if db is None:
        # Motor absent n'est PAS un défaut de l'installation : c'est le
        # mauvais interpréteur. L'application tourne dans son propre
        # environnement ; le python du système ne voit pas ses modules.
        # Le dire, plutôt que d'annoncer une base en panne qui va très bien.
        if err and "motor" in err:
            venv = pathlib.Path("/root/.venv/bin/python")
            ligne(JAUNE, "base non vérifiée depuis cet interpréteur",
                  "motor appartient à l'environnement de l'application.\n"
                  + (f"Relancer avec : {venv} backend/scripts/pret_pour_tests.py"
                     if venv.exists() else
                     "Relancer avec le python de l'application (celui du venv)."))
        else:
            bloquants += 1
            ligne(ROUGE, "base de données inaccessible", err or "")
    else:
        ligne(VERT, "base de données accessible")

    print("\n─── DE QUOI TESTER ───\n")
    if db is not None:
        n_prod = await db.products.count_documents({"active": True})
        if n_prod:
            ligne(VERT, f"{n_prod} produit(s) en vente")
        else:
            bloquants += 1
            ligne(ROUGE, "aucun produit actif",
                  "sans produit, aucun achat n'est possible")

        # Le plan exige un produit ÉPUISÉ (test « prévenez-moi ») et un produit
        # EN STOCK. Les deux, sinon deux tests deviennent infaisables.
        epuise = await db.products.count_documents({"active": True, "stock": {"$lte": 0}})
        ligne(VERT if epuise else JAUNE,
              f"{epuise} produit(s) épuisé(s)",
              "" if epuise else "mettre le stock d'un produit à 0 pour le test « prévenez-moi »")

        n_admin = await db.users.count_documents({"role": "admin"})
        if n_admin:
            ligne(VERT, f"{n_admin} compte(s) administrateur")
        else:
            bloquants += 1
            ligne(ROUGE, "aucun compte administrateur")

        # Les codes d'affiliés vivent dans la MÊME collection que les coupons.
        # Les compter ensemble annonçait « 15 coupons actifs » là où il n'y
        # avait peut-être aucun coupon promotionnel — et le test C-27 en
        # demande deux, un valide et un expiré.
        promo = {"active": True, "affiliate_id": None, "source": {"$ne": "affiliate"}}
        n_promo = await db.coupons.count_documents(promo)
        n_aff = await db.coupons.count_documents(
            {"$or": [{"affiliate_id": {"$ne": None}}, {"source": "affiliate"}]})
        ligne(VERT if n_promo else JAUNE,
              f"{n_promo} coupon(s) promotionnel(s) actif(s)",
              "" if n_promo else "en créer un valide et un expiré pour C-27")
        if n_aff:
            ligne(GRIS, f"{n_aff} code(s) d'affilié — comptés à part",
                  "ils partagent la table des coupons mais n'en sont pas")

    print("\n─── COURRIELS ───\n")
    # Sans envoi de courriel, 16 tests sur 138 sont infaisables, et tout le
    # parcours affilié est bloqué : l'invitation ne peut pas arriver.
    if env.get("RESEND_API_KEY"):
        ligne(VERT, "clé d'envoi présente")
    else:
        bloquants += 1
        ligne(ROUGE, "RESEND_API_KEY absente",
              "aucun courriel ne partira — l'invitation affiliée est impossible")
    for cle, quoi in (("SENDER_EMAIL", "expéditeur des commandes"),
                      ("AFFILIATE_SENDER_EMAIL", "expéditeur des invitations")):
        v = env.get(cle)
        ligne(VERT if v else JAUNE, f"{quoi} : {v or 'non défini'}",
              "" if v else "le repli est utilisé")

    print("\n─── PAIEMENTS ───\n")
    graph = all(env.get(k) for k in ("INTERAC_GRAPH_CLIENT_ID",
                                     "INTERAC_GRAPH_CLIENT_SECRET",
                                     "INTERAC_GRAPH_TENANT_ID"))
    ligne(VERT if graph else JAUNE, "Interac — relevé automatique configuré",
          "" if graph else "les paiements Interac devront être confirmés à la main")
    ligne(VERT if env.get("INTERAC_TRUSTED_SENDER") else JAUNE,
          "Interac — expéditeur de confiance défini",
          "" if env.get("INTERAC_TRUSTED_SENDER") else "sans lui, l'auto-confirmation est désactivée")
    ligne(VERT if env.get("NOWPAYMENTS_API_KEY") else JAUNE,
          "crypto configurée",
          "" if env.get("NOWPAYMENTS_API_KEY") else "les tests de paiement crypto seront à sauter")

    print("\n─── EXPÉDITION ───\n")
    cp = all(env.get(k) for k in ("CANADA_POST_API_KEY", "CANADA_POST_CUSTOMER_NUMBER"))
    ligne(VERT if cp else JAUNE, "Postes Canada configuré",
          "" if cp else "étiquettes, manifeste et suivi seront à sauter")
    mode = env.get("CANADA_POST_ENVIRONMENT", "")
    if cp:
        ligne(JAUNE if mode.lower().startswith("prod") else VERT,
              f"environnement Postes Canada : {mode or 'non défini'}",
              "ATTENTION : en production, les étiquettes sont FACTURÉES"
              if mode.lower().startswith("prod") else "")

    print("\n─── PRUDENCE ───\n")
    prelaunch = env.get("PRELAUNCH_ENABLED", "").lower() in ("1", "true", "yes")
    ligne(JAUNE if prelaunch else VERT,
          f"page d'attente : {'ACTIVE' if prelaunch else 'inactive'}",
          "la boutique est masquée — les tests client sont impossibles" if prelaunch else "")
    appenv = env.get("APP_ENV", "")
    ligne(JAUNE if appenv.lower() == "production" else VERT,
          f"APP_ENV = {appenv or 'non défini'}",
          "vous testez sur la PRODUCTION — les commandes seront réelles"
          if appenv.lower() == "production" else "")

    print()
    if bloquants:
        print(f"  {bloquants} point(s) BLOQUANT(S). Les tests ne peuvent pas commencer.\n")
        return 1
    print("  Rien ne bloque. Les points « À VOIR » désignent des tests\n"
          "  à sauter, pas des empêchements.\n")
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(RACINE))
    raise SystemExit(asyncio.run(principal()))
