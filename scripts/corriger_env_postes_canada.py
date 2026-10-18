#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Nettoie la section Postes Canada de backend/.env.

    cd /app && python scripts/corriger_env_postes_canada.py          # montre
    cd /app && python scripts/corriger_env_postes_canada.py --ecrire # applique

MIREILLE, 18/10/2026 : « donne moi le code pour effacer les donnees qui ne
sont pas bonnes ».

CE SCRIPT NE MONTRE AUCUNE VALEUR. Ni avant, ni apres, ni dans la sauvegarde
qu'il annonce. Il nomme les cles et dit ce qu'il fait : « supprimee »,
« changee », « ajoutee ». Un outil de nettoyage qui imprime ce qu'il nettoie
transforme une correction en fuite.

Par defaut il n'ecrit RIEN : il montre ce qu'il ferait. C'est `--ecrire` qui
applique, apres une sauvegarde horodatee dans le meme repertoire.

Aucune dependance : il n'importe pas `server`, donc le python du systeme
suffit.
"""
from __future__ import annotations

import datetime
import io
import os
import re
import shutil
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ENV = RACINE / "backend" / ".env"

# ---------------------------------------------------------------------------
# A SUPPRIMER, avec la raison — elle s'affiche, pour qu'on ne supprime pas en
# aveugle.
# ---------------------------------------------------------------------------
A_SUPPRIMER = {
    "CANADA_POST_API_KEY":
        "cles de l'ancienne API, declarees mortes le 18/10/2026",
    "CANADA_POST_BASE_URL":
        "JAMAIS LUE : le code la calcule depuis CANADA_POST_ENVIRONMENT",
    "CANADA_POST_SANDBOX_DELIVERY_FALLBACK":
        "la variable n'existe plus (simulation de livraison supprimee)",
    "CANADA_POST_SANDBOX_DELIVER_AFTER_HOURS":
        "la variable n'existe plus (simulation de livraison supprimee)",
}

# ---------------------------------------------------------------------------
# A POSER. Aucune de ces valeurs n'est un secret : elles peuvent s'afficher.
# ---------------------------------------------------------------------------
A_POSER = {
    "CANADA_POST_API_MODE": ("openapi",
        "le mode « legacy » appelle l'ancienne API en XML"),
    "CANADA_POST_ENVIRONMENT": ("prod",
        "« dev » vise l'hote d'essai ct.soa-gw.canadapost.ca"),
    "CANADA_POST_LABEL_FORMAT": ("4x6",
        "etiquette thermique 101,6 x 152,4 mm ; « 8.5x11 » est une feuille lettre"),
    "APP_ENV": ("production",
        "sans elle, AUCUN garde-fou de production n'est actif"),
}

# ---------------------------------------------------------------------------
# A OBTENIR — le script ne peut pas les inventer.
# ---------------------------------------------------------------------------
A_OBTENIR = (
    "CANADA_POST_OAUTH_CLIENT_ID",
    "CANADA_POST_OAUTH_CLIENT_SECRET",
)


def _cle(ligne: str) -> str:
    m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", ligne)
    return m.group(1) if m else ""


def main() -> int:
    ecrire = "--ecrire" in sys.argv

    if not ENV.exists():
        print(f"Introuvable : {ENV}")
        return 2

    with io.open(ENV, encoding="utf-8", newline="") as f:
        lignes = f.read().splitlines(keepends=True)

    presentes = {_cle(l) for l in lignes if _cle(l)}
    sorties, supprimees, changees, ajoutees = [], [], [], []

    for ligne in lignes:
        nom = _cle(ligne)
        if nom in A_SUPPRIMER:
            supprimees.append(nom)
            continue
        if nom in A_POSER:
            valeur, _ = A_POSER[nom]
            fin = "\r\n" if ligne.endswith("\r\n") else "\n"
            nouvelle = f"{nom}={valeur}{fin}"
            if nouvelle != ligne:
                changees.append(nom)
            sorties.append(nouvelle)
            continue
        sorties.append(ligne)

    # Celles qui manquaient entierement.
    manquantes = [n for n in A_POSER if n not in presentes]
    if manquantes:
        if sorties and not sorties[-1].endswith(("\n", "\r\n")):
            sorties.append("\n")
        sorties.append("\n# Ajoute le 18/10/2026 — mise en ligne Postes Canada.\n")
        for nom in manquantes:
            valeur, _ = A_POSER[nom]
            sorties.append(f"{nom}={valeur}\n")
            ajoutees.append(nom)

    # ---------------------------------------------------------------- rapport
    print()
    print("  NETTOYAGE DE LA SECTION POSTES CANADA")
    print("  " + "=" * 52)
    print()

    if supprimees:
        print("  SUPPRIMEES")
        for nom in supprimees:
            print(f"    - {nom}")
            print(f"        {A_SUPPRIMER[nom]}")
        print()
    if changees:
        print("  CHANGEES")
        for nom in changees:
            valeur, raison = A_POSER[nom]
            print(f"    ~ {nom} = {valeur}")
            print(f"        {raison}")
        print()
    if ajoutees:
        print("  AJOUTEES")
        for nom in ajoutees:
            valeur, raison = A_POSER[nom]
            print(f"    + {nom} = {valeur}")
            print(f"        {raison}")
        print()

    absents = [n for n in A_OBTENIR if n not in presentes]
    if absents:
        print("  A OBTENIR SUR LE PORTAIL — le script ne peut pas les inventer")
        for nom in absents:
            print(f"    ? {nom}")
        print("        Creez d'abord une application [Test] : le portail")
        print("        previent que les applications [Production] facturent")
        print("        les envois reellement soumis.")
        print()

    if not (supprimees or changees or ajoutees):
        print("  Rien a changer.")
        print()
        return 0

    if not ecrire:
        print("  " + "-" * 52)
        print("  RIEN N'A ETE ECRIT. Relancez avec --ecrire pour appliquer :")
        print("    python scripts/corriger_env_postes_canada.py --ecrire")
        print()
        return 1

    horodatage = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    sauvegarde = ENV.with_name(f".env.sauvegarde-{horodatage}")
    shutil.copy2(ENV, sauvegarde)
    with io.open(ENV, "w", encoding="utf-8", newline="") as f:
        f.write("".join(sorties))

    try:
        os.chmod(sauvegarde, 0o600)
    except OSError:
        pass

    print("  " + "-" * 52)
    print(f"  Ecrit. Sauvegarde : {sauvegarde.name}")
    print()
    # LA SAUVEGARDE CONTIENT CE QU'ON VIENT DE RETIRER, y compris l'ancienne
    # cle d'API. C'est le but d'une sauvegarde — mais une sauvegarde oubliee
    # a cote d'un .env est un secret de plus sur le disque.
    print("  Cette sauvegarde contient les anciennes valeurs, dont la cle")
    print("  d'API retiree. Permissions restreintes a 600. Supprimez-la une")
    print("  fois que tout repond :")
    print(f"    shred -u backend/{sauvegarde.name}   # ou rm")
    print()
    print("  ATTENTION : APP_ENV=production active le refus de demarrer sur")
    print("  un environnement Postes Canada d'essai. Les deux variables")
    print("  viennent d'etre posees ensemble, donc le demarrage passera.")
    print()
    print("  Ensuite :")
    print("    sudo supervisorctl restart all")
    print("    python -I scripts/diagnostic_postes_canada.py --essai")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
