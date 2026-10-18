#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Postes Canada repondra-t-il ? La reponse, sur le serveur, sans jeton.

    cd /app && python -I scripts/diagnostic_postes_canada.py

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


def main() -> int:
    try:
        import server  # noqa: F401  (charge backend/.env et toute la config)
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
              f"/app/backend/.env")
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
    print(f"  {'hote des etiquettes':.<30} {r['hote_etiquettes']}")
    print(f"  {'format d etiquette':.<30} {r['format_etiquette']}")
    print(f"  {'synchro livraison':.<30} toutes les "
          f"{r['synchro_livraison_secondes']} s")
    print()
    print("  CE QUI EST REQUIS PAR CE MODE")
    for nom, etat in r["requis"].items():
        marque = "   " if etat == "present" else " <<"
        print(f"  {('  ' + nom):.<32} {etat}{marque}")
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
