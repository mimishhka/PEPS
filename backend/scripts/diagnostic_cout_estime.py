"""Pourquoi le coût estimé de Dispatch reste vide.

L'écran Dispatch affiche « Coût estimé étiquettes » en sommant une cotation
Postes Canada par commande à étiqueter. Quand cette cotation échoue, elle
renvoie une liste vide : le total tombe à 0, et l'écran ne montre rien plutôt
que d'expliquer. Ce script dit lequel des maillons casse.

Il est EN LECTURE SEULE. Il ne crée aucun envoi, aucune étiquette, aucune
commande : coter un colis chez Postes Canada ne réserve rien.

    cd /app/backend && python scripts/diagnostic_cout_estime.py

Si l'import échoue sur une dépendance manquante (dotenv, httpx, motor), c'est
que le `python` du shell n'est pas celui du serveur. Le script le détecte et
dit comment trouver le bon.
"""
import os
import sys
from pathlib import Path

# Le dossier du serveur se deduit de l emplacement de ce script, au lieu
# d etre suppose : le meme fichier sert sur le serveur (/app/backend) et sur
# une copie locale.
# Un diagnostic ne doit jamais echouer sur un terminal qui ne fait pas UTF-8 :
# le message compte plus que ses accents.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE))
# server.py a un import de repli en « backend.services… » pour le cas ou il est
# lance depuis la racine du depot. Elle doit donc etre joignable aussi, sinon ce
# repli echoue et l erreur ressemble a une dependance manquante.
sys.path.insert(1, str(RACINE.parent))


def charger_env(chemin=None):
    """Les réglages viennent du .env. python-dotenv quand il est là, sinon une
    lecture directe : ce script doit pouvoir tourner avec n'importe quel
    interpréteur. Le format utile ici est simple — CLE=valeur par ligne."""
    chemin = chemin or str(RACINE / ".env")
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(chemin))
        return "python-dotenv"
    except ImportError:
        pass
    try:
        with open(chemin, encoding="utf-8") as f:
            for ligne in f:
                ligne = ligne.strip()
                if not ligne or ligne.startswith("#") or "=" not in ligne:
                    continue
                cle, _, valeur = ligne.partition("=")
                valeur = valeur.strip()
                for guillemet in ('"', "'"):
                    if len(valeur) >= 2 and valeur[0] == guillemet and valeur[-1] == guillemet:
                        valeur = valeur[1:-1]
                        break
                os.environ.setdefault(cle.strip(), valeur)
        return "lecture directe du .env"
    except FileNotFoundError:
        return None


SOURCE_ENV = charger_env()


def interpreteurs_possibles():
    """Le serveur tourne sous un interpréteur qui a ses dépendances. Le shell
    n'est pas forcément le même. On propose les emplacements habituels qui
    existent vraiment sur cette machine."""
    candidats = [
        "/root/.venv/bin/python",
        "/app/backend/.venv/bin/python",
        "/app/backend/venv/bin/python",
        "/app/.venv/bin/python",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ]
    return [c for c in candidats if os.path.exists(c)]


def expliquer_dependance_manquante(manquant):
    print("=" * 74)
    print("L'INTERPRÉTEUR N'EST PAS CELUI DU SERVEUR")
    print("=" * 74)
    print(f"\n  Module absent : {manquant}")
    print(f"  Interpréteur utilisé : {sys.executable}")
    print("\n  Le serveur FastAPI tourne avec ses propres dépendances. Relancez")
    print("  ce script avec SON interpréteur. Candidats trouvés ici :\n")
    trouves = interpreteurs_possibles()
    if trouves:
        for c in trouves:
            print(f"    {c} scripts/diagnostic_cout_estime.py")
    else:
        print("    (aucun emplacement habituel trouvé)")
    print("\n  Pour lire celui que le serveur emploie vraiment :")
    print("    grep -rhi command /etc/supervisor/conf.d/*.conf 2>/dev/null | head")
    print("    ps -o args= -C uvicorn 2>/dev/null | head -2")
    print("\n" + "=" * 74)


try:
    from services import canada_post as cp
except ModuleNotFoundError as manque:
    expliquer_dependance_manquante(manque.name)
    sys.exit(1)
except (KeyError, RuntimeError) as absent:
    # Le serveur exige certains réglages dès son import, et il les réclame de
    # deux façons : un KeyError sur os.environ pour les uns, un RuntimeError
    # explicite pour les autres. Les deux disent la même chose — le .env n'a
    # pas été trouvé, ou il est incomplet — et ni l'une ni l'autre ne signifie
    # que le code est cassé. Un traceback nu le laisserait croire.
    print("=" * 74)
    print("LES RÉGLAGES DU SERVEUR NE SONT PAS CHARGÉS")
    print("=" * 74)
    print()
    print(f"  Réglage manquant : {absent}")
    print(f"  Fichier .env cherché : {RACINE / '.env'}")
    print(f"  Chargé par : {SOURCE_ENV or 'AUCUNE SOURCE — le fichier est introuvable'}")
    print()
    print("  Vérifiez que le .env existe et contient ce réglage :")
    print(f"    ls -l {RACINE / '.env'}")
    print(f"    grep -c . {RACINE / '.env'}")
    print()
    print("=" * 74)
    sys.exit(1)

import asyncio  # noqa: E402  (après le garde-fou d'import)

s = cp.s


def puce(ok, texte, detail=""):
    print(("  OK      " if ok else "  MANQUE  ") + texte + (f" — {detail}" if detail else ""))
    return ok


async def executer():
    print("=" * 74)
    print("DIAGNOSTIC — le coût estimé de l'écran Dispatch")
    print("=" * 74)
    print(f"\n  Réglages chargés par : {SOURCE_ENV or 'AUCUNE SOURCE (.env introuvable)'}")
    print(f"  Interpréteur : {sys.executable}")

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
        print("       total reste à 0.")
        if not origine:
            print(f"       À corriger : CANADA_POST_ORIGIN_POSTAL_CODE dans {RACINE / '.env'}")
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
            puce(False, code, "aucun tarif, et aucun repli")
            continue
        exact = str(choisi.get("service_code") or "").upper() == code
        detail = f"{choisi.get('cost_cad')} $"
        if not exact:
            detail += f"  (repli sur {choisi.get('service_code')} — affiché « estimé CP » sans le délai)"
        puce(True, code, detail)

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
        from motor.motor_asyncio import AsyncIOMotorClient
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
