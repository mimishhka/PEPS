#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Postes Canada repondra-t-il ? La reponse, sur le serveur, sans jeton.

    cd /app && python -I scripts/diagnostic_postes_canada.py

Et pour savoir si les cles sont LES BONNES, et pas seulement presentes :

    cd /app && python -I scripts/diagnostic_postes_canada.py --essai

MIREILLE, 18/10/2026 : « poste canada needs to go live as i am ready to go
live ». La route `/api/admin/canada-post/diagnostic` rend la meme chose, mais
elle exige une session d'administration — donc un jeton a recuperer et a
promener dans une ligne de commande. Ici il n'y a rien a manipuler : le script
importe `server`, qui charge `backend/.env` lui-meme, et lit donc EXACTEMENT
la configuration que le serveur en marche utilise.

IL N'AFFICHE JAMAIS UNE VALEUR D'IDENTIFIANT, seulement « present » ou
« MANQUANT ». Sa sortie peut etre collee dans une conversation, un courriel ou
un ticket sans rien exposer. C'est la meme garantie que la route, et un test
l'exige : `test_LE_DIAGNOSTIC_NE_FUITE_AUCUN_IDENTIFIANT`.

Aucun appel reseau : c'est une lecture de configuration.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "backend"))

# LE PYTHON DU SYSTEME N'A PAS LES DEPENDANCES DU BACKEND.
#
# Premier essai sur le serveur, 18/10/2026 : « ModuleNotFoundError: No module
# named 'dotenv' ». Le backend tourne dans un environnement virtuel, et
# `python` tout court n'y donne pas acces. Demander a quelqu'un de retrouver
# le bon interpreteur est une etape de trop pour une commande de diagnostic.
#
# On cherche donc soi-meme, et on se relance avec celui qui sait charger
# `dotenv`. Le drapeau en fin d'arguments empeche la boucle : apres un saut,
# on ne saute plus.
_DEJA_RELANCE = "--interpreteur-trouve"

CANDIDATS_FIXES = (
    # L'environnement reel du serveur, releve le 18/10/2026 : l'interpreteur
    # vit HORS de /app, donc chercher sous la racine du depot ne suffit pas.
    Path("/root/.venv/bin/python"),
    RACINE / "backend" / ".venv" / "bin" / "python",
    RACINE / ".venv" / "bin" / "python",
    RACINE / "backend" / "venv" / "bin" / "python",
    RACINE / "venv" / "bin" / "python",
    # Windows, pour un essai en local.
    RACINE / "backend" / ".venv" / "Scripts" / "python.exe",
)


def _candidats_de_supervisor():
    """L'interpreteur que supervisor utilise VRAIMENT, lu dans sa config.

    Deviner des emplacements est fragile : sur ce serveur, le venv du backend
    est `/root/.venv`, hors du depot, et aucune liste raisonnable ne l'aurait
    contenu d'avance. Or la reponse est ecrite noir sur blanc dans la
    configuration de supervisor :

        command=/root/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001

    Le `python` est le voisin de `uvicorn` dans le meme repertoire. On lit
    donc la source de verite au lieu de parier.
    """
    import glob
    import re
    for chemin in sorted(glob.glob("/etc/supervisor/conf.d/*.conf")):
        try:
            with open(chemin, encoding="utf-8", errors="replace") as f:
                contenu = f.read()
        except OSError:
            continue
        for m in re.finditer(r"command\s*=\s*(\S+)", contenu):
            exe = Path(m.group(1))
            if exe.name not in ("uvicorn", "python", "python3", "gunicorn"):
                continue
            voisin = exe.parent / "python"
            if voisin.exists():
                yield voisin


def _candidats():
    """Les candidats, la source de verite d'abord."""
    vus = set()
    for c in list(_candidats_de_supervisor()) + list(CANDIDATS_FIXES):
        resolu = str(c)
        if resolu not in vus:
            vus.add(resolu)
            yield c


def _relancer_avec_le_bon_python() -> None:
    """Se relance avec un interpreteur qui a les dependances du backend."""
    if _DEJA_RELANCE in sys.argv:
        print("CONFIGURATION INCOMPLETE : aucun interpreteur Python trouve ne "
              "sait charger `dotenv`.\n")
        print("  Les dependances du backend ne sont pas installees, ou son")
        print("  environnement virtuel n'est pas a un emplacement connu.")
        print("  Essayez, depuis /app :\n")
        print("    sudo supervisorctl status          # voir ce qui tourne")
        print("    head -1 /etc/supervisor/conf.d/*.conf")
        print("    <le python du backend> -I scripts/diagnostic_postes_canada.py")
        raise SystemExit(2)

    import subprocess
    for candidat in _candidats():
        if not candidat.exists():
            continue
        try:
            # `-I` : la verification doit etre insensible a un PYTHONPATH
            # herite, sinon elle juge l'environnement de l'appelant plutot que
            # celui du candidat.
            subprocess.run([str(candidat), "-I", "-c", "import dotenv"],
                           check=True, capture_output=True, timeout=30)
        except Exception:
            continue
        # `flush` : sans lui, cette ligne sort APRES le rapport de l'enfant,
        # et on lit « relance avec... » au bas d'un rapport deja imprime.
        print(f"  (relance avec {candidat})", flush=True)
        raise SystemExit(subprocess.run(
            [str(candidat), "-I", str(Path(__file__).resolve()), _DEJA_RELANCE]
        ).returncode)

    sys.argv.append(_DEJA_RELANCE)
    _relancer_avec_le_bon_python()


def main() -> int:
    try:
        import server  # noqa: F401  (charge backend/.env et toute la config)
    except ModuleNotFoundError:
        _relancer_avec_le_bon_python()
        return 2
    except RuntimeError as ex:
        # LA GARDE DE PRODUCTION PARLE ICI AUSSI. Si l'environnement d'essai
        # est configure en production, `server` refuse de se charger — et c'est
        # voulu. Mieux vaut le lire dans ce rapport qu'au milieu d'un journal.
        print("LE SERVEUR REFUSE DE DEMARRER\n")
        print(f"  {ex}\n")
        print("  A corriger dans /app/backend/.env, puis :")
        print("  sudo supervisorctl restart all")
        return 2
    except KeyError as ex:
        print(f"CONFIGURATION INCOMPLETE : la variable {ex} manque dans "
              f"{RACINE / 'backend' / '.env'}")
        return 2

    try:
        from services import canada_post
    except ImportError:
        from backend.services import canada_post

    r = canada_post.diagnostic_configuration()

    largeur = 58
    print()
    print("  POSTES CANADA — ETAT DE LA CONFIGURATION".center(largeur))
    print("  " + "=" * (largeur - 4))
    print()
    print(f"  {'mode retenu':.<30} {r['mode_retenu']}")
    print(f"  {'mode configure':.<30} {r['mode_configure']}")
    print(f"  {'environnement':.<30} {r['environnement']}")
    print(f"  {'APP_ENV':.<30} {r['app_env']}")
    print(f"  {'garde-fous production':.<30} "
          f"{'actifs' if r['garde_fous_production'] else 'INACTIFS'}")
    print(f"  {'hote des etiquettes':.<30} {r['hote_etiquettes']}")
    print(f"  {'format d etiquette':.<30} {r['format_etiquette']}")
    print(f"  {'synchro livraison':.<30} toutes les "
          f"{r['synchro_livraison_secondes']} s")
    print()
    print("  TOUTES LES VARIABLES   (* = exigee par le mode retenu)")
    for nom, etat in r["requis"].items():
        exigee = r["exige_par_le_mode"].get(nom, False)
        etoile = "*" if exigee else " "
        if exigee and etat != "present":
            marque = "  <<< MANQUE"
        elif not exigee and etat == "present":
            marque = "  (ignoree par ce mode)"
        else:
            marque = ""
        print(f"  {etoile} {(nom):.<30} {etat}{marque}")
    print()
    print(f"  {'configure':.<30} {'oui' if r['configure'] else 'NON'}")
    print(f"  {'reperage interrogeable':.<30} "
          f"{'oui' if r['reperage_interrogeable'] else 'NON'}")
    print()

    if r["avertissements"]:
        print("  AVERTISSEMENTS")
        for a in r["avertissements"]:
            # Replie proprement, sans couper les mots.
            mots, ligne = a.split(), "   "
            for mot in mots:
                if len(ligne) + len(mot) + 1 > largeur:
                    print(ligne)
                    ligne = "   " + mot
                else:
                    ligne += (" " if ligne.strip() else "") + mot
            if ligne.strip():
                print(ligne)
            print()

    # L'ESSAI EN DIRECT : la seule facon de savoir si les cles sont les bonnes.
    #
    # « present » dit qu'une ligne existe dans le fichier. Une cle expiree, une
    # cle d'une autre application, un secret tronque au copier-coller : tout
    # cela est « present ». Seul Postes Canada peut trancher.
    #
    # Un appel reseau, un seul, et il ne cree RIEN : obtenir un jeton ne
    # produit aucune etiquette et n'est pas facture. C'est pour ca qu'il est
    # sur de le lancer sans prevenir qui que ce soit.
    if "--essai" in sys.argv:
        import asyncio
        print("  " + "-" * (largeur - 4))
        print("  ESSAI EN DIRECT — demande d un vrai jeton a Postes Canada")
        print()
        e = asyncio.run(canada_post.essai_identifiants())
        if not e.get("essaye"):
            print(f"  {'jeton OAuth':.<30} non essaye")
            print(f"    {e['verdict']}")
            print(f"    {e['detail']}")
        elif e.get("accepte"):
            print(f"  {'jeton OAuth':.<30} ACCEPTE")
            print(f"    Postes Canada accepte vos identifiants.")
            if e.get("duree_du_jeton_s"):
                print(f"    Jeton valide {e['duree_du_jeton_s']} s.")
            if e.get("variante"):
                print(f"    Forme retenue : {e['variante']}")
        else:
            print(f"  {'jeton OAuth':.<30} {e['verdict']}")
            print(f"    {e.get('detail', '')}")
            if e.get("piste"):
                print()
                mots, ligne = e["piste"].split(), "    "
                for mot in mots:
                    if len(ligne) + len(mot) + 1 > largeur:
                        print(ligne)
                        ligne = "    " + mot
                    else:
                        ligne += (" " if ligne.strip() else "") + mot
                if ligne.strip():
                    print(ligne)
        print()
        print("  Ni le jeton ni les identifiants n apparaissent ci-dessus.")
        print()

    print("  " + "-" * (largeur - 4))
    print(f"  VERDICT : {r['verdict'].upper()}")
    if r["manquants"]:
        print(f"  Il manque : {', '.join(r['manquants'])}")
    print()
    print("  Aucune valeur d'identifiant n'apparait ci-dessus :")
    print("  cette sortie peut etre partagee telle quelle.")
    print()

    return 0 if r["verdict"] == "pret" else 1


if __name__ == "__main__":
    raise SystemExit(main())
