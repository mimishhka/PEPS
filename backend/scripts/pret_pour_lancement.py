#!/usr/bin/env python
"""Répond à une seule question : peut-on ouvrir la boutique au public ?

    python backend/scripts/pret_pour_lancement.py

C'est le symétrique de `pret_pour_tests.py`. Celui-là dit si on peut commencer
à tester ; celui-ci dit si on peut arrêter.

Il existe parce qu'un réglage de test oublié ne se voit pas. Le 2026-09-22, la
boutique annonçait « paiement requis sous 12 heures » au-dessus d'un compte à
rebours qui disait 1 h 59, alors que les conditions publiées promettent trente
minutes. Trois chiffres, trois sources, et aucun moyen de s'en apercevoir sans
ouvrir le code.

AUCUNE CLÉ N'EST AFFICHÉE. Le script dit si une valeur est présente, jamais
laquelle. Ce fichier contient les identifiants de production.

Le code de sortie vaut 1 si un point BLOQUANT reste ouvert.
"""
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).resolve().parent.parent
ENV = RACINE / ".env"
FRONTEND = RACINE.parent / "frontend" / "src" / "pages"

VERT, ROUGE, JAUNE = "OUI", "NON", "À VOIR"

# Les valeurs normales viennent de mode_test.py : les redéclarer ici les
# ferait diverger le jour où l'une change, et ce script existe précisément
# pour empêcher deux vérités de coexister.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
try:
    from mode_test import NORMALES, REGLAGES
    TEST = {cle: valeur for cle, valeur, _ in REGLAGES}
except Exception:  # pragma: no cover
    NORMALES, TEST = {}, {}


def charger_env():
    """Lit le .env sans dépendre de python-dotenv, et retire les guillemets."""
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


def minutes_promises():
    """Le délai de paiement ANNONCÉ au client, lu dans les pages publiques.

    On ne le recopie pas ici : une quatrième copie du chiffre serait une
    quatrième occasion de diverger. Si les pages changent de formulation, le
    script le dit au lieu d'inventer un accord.

    L'extraction est ANCRÉE SUR LA PHRASE, pas sur la page. Une lecture large
    ramassait aussi les « 24 heures » et « 48 heures » d'autres paragraphes —
    fenêtre de remboursement, délai d'expédition — et un serveur réglé à 24 h
    serait passé pour cohérent parce que le nombre existait quelque part. On
    ne retient donc que les phrases qui parlent VRAIMENT du délai de paiement.
    """
    parle_du_paiement = re.compile(
        r"pay[ée]e?s?\s+dans|doivent\s+être\s+payées|paid\s+within|"
        r"réserve\s+le\s+stock|holds\s+the\s+stock",
        re.IGNORECASE)
    trouvees = {}
    for nom in ("Compliance.jsx", "Faq.jsx"):
        chemin = FRONTEND / nom
        if not chemin.exists():
            continue
        texte = chemin.read_text(encoding="utf-8", errors="replace")
        valeurs = set()
        # Une phrase à la fois : le point final borne la recherche.
        for phrase in re.split(r"(?<=[.!?])\s+", texte):
            if not parle_du_paiement.search(phrase):
                continue
            for m in re.finditer(r"(\d+)\s*minutes?", phrase):
                valeurs.add(int(m.group(1)))
            for m in re.finditer(r"(\d+)\s*(?:heures?|hours?)", phrase):
                valeurs.add(int(m.group(1)) * 60)
        if valeurs:
            trouvees[nom] = valeurs
    return trouvees


def verifier_delai(env, promesses):
    """Le réglage tient-il la promesse faite au client ?"""
    brut = env.get("UNPAID_ORDER_TTL_HOURS")
    if not brut:
        return JAUNE, "UNPAID_ORDER_TTL_HOURS absent : le défaut du code s'applique (30 min)."
    try:
        applique = round(float(brut) * 60)
    except ValueError:
        return ROUGE, f"UNPAID_ORDER_TTL_HOURS illisible : {brut!r}"
    if not promesses:
        return JAUNE, (f"Le serveur applique {applique} min. Je n'ai pas su lire les pages "
                       "publiques — vérifiez Conformité et FAQ à la main.")
    accord = [nom for nom, valeurs in promesses.items() if applique in valeurs]
    if accord:
        return VERT, f"{applique} min appliquées, et annoncées dans {', '.join(accord)}."
    annonces = sorted({v for valeurs in promesses.values() for v in valeurs})
    return ROUGE, (
        f"Le serveur applique {applique} min. Les pages publiques annoncent "
        f"{annonces} min.\n"
        "Un client qui croit la page perd sa commande. Alignez l'un sur l'autre."
    )


def principal():
    env = charger_env()
    bloquants = 0

    if not ENV.exists():
        print(f"\nIntrouvable : {ENV}")
        print("Ce script doit tourner sur le serveur, où le .env existe.\n")
        return 1

    print("\n─── RÉGLAGES DE TEST ENCORE ACTIFS ───\n")
    for cle, normale in sorted(NORMALES.items()):
        actuelle = env.get(cle)
        valeur_test = TEST.get(cle)
        if actuelle is None:
            ligne(VERT, f"{cle} : absent, le défaut du code s'applique ({normale})")
        elif actuelle == normale:
            ligne(VERT, f"{cle} = {actuelle}")
        elif actuelle == valeur_test:
            bloquants += 1
            ligne(ROUGE, f"{cle} = {actuelle}",
                  f"Valeur de TEST. Normale : {normale}.\n"
                  "Remettre avec : python3 scripts/mode_test.py --off")
        else:
            ligne(JAUNE, f"{cle} = {actuelle}",
                  f"Ni la valeur de test ni la normale ({normale}). Voulu ?")

    print("\n─── COHÉRENCE AVEC CE QUI EST PROMIS AU CLIENT ───\n")
    etat, detail = verifier_delai(env, minutes_promises())
    if etat == ROUGE:
        bloquants += 1
    ligne(etat, "Délai de paiement annoncé = délai appliqué", detail)

    print("\n─── SECRETS QUI SE DÉSACTIVENT EN SILENCE ───\n")
    # Deux variables dont l'ABSENCE ne provoque aucune erreur : le code se
    # replie sur un comportement degrade, sans rien dire. C'est exactement ce
    # qui ne se voit pas a l'oeil au moment du lancement.
    if (env.get("ADMIN_GATE_CODE") or "").strip():
        ligne(VERT, "ADMIN_GATE_CODE : present")
    else:
        # PAS bloquant : ne pas avoir de porte devant le login admin est un
        # choix defendable. Mais il doit etre CHOISI, pas subi.
        ligne(JAUNE, "ADMIN_GATE_CODE : absent",
              "La porte de l'administration s'ouvre alors SANS code.\n"
              "`admin_gate_verify` renvoie {ok: true} des que la variable est vide.\n"
              "Le login reste exige — c'est la porte d'avant qui disparait.")

    crypto_actif = bool((env.get("NOWPAYMENTS_API_KEY") or "").strip())
    if (env.get("NOWPAYMENTS_IPN_SECRET") or "").strip():
        ligne(VERT, "NOWPAYMENTS_IPN_SECRET : present")
    elif not crypto_actif:
        ligne(VERT, "NOWPAYMENTS_IPN_SECRET : absent, mais le paiement crypto l'est aussi")
    else:
        # Bloquant, lui : aucune lecture valable. Vendre en crypto sans secret
        # IPN, c'est encaisser sans jamais le savoir.
        bloquants += 1
        ligne(ROUGE, "NOWPAYMENTS_IPN_SECRET : absent alors que la crypto est active",
              "Le webhook repond 503 a chaque appel : AUCUN paiement crypto ne\n"
              "sera jamais confirme. Le client paie, la commande reste en attente,\n"
              "puis s'annule au delai.")

    print("\n─── ENVIRONNEMENT ───\n")
    app_env = (env.get("APP_ENV") or "").strip().lower()
    if app_env in ("prod", "production"):
        ligne(VERT, f"APP_ENV = {app_env}")
    else:
        bloquants += 1
        ligne(ROUGE, f"APP_ENV = {app_env or 'absent'}",
              "Hors production, des routines RÉÉCRIVENT des données au démarrage\n"
              "(réparation du seed BPC-157, entre autres).")

    cp = (env.get("CANADA_POST_API_MODE") or "").strip().lower()
    if cp == "prod":
        ligne(VERT, "CANADA_POST_API_MODE = prod")
    else:
        ligne(JAUNE, f"CANADA_POST_API_MODE = {cp or 'absent'}",
              "Les étiquettes partent en mode test : elles ne sont pas livrables.")

    print("\n─── FICHIERS OUBLIÉS ───\n")
    sauvegardes = sorted(RACINE.glob(".env.sauvegarde-*"))
    if sauvegardes:
        ligne(JAUNE, f"{len(sauvegardes)} sauvegarde(s) de .env sur le serveur",
              "Elles contiennent des clés en clair. À supprimer une fois la\n"
              "configuration stabilisée : " + ", ".join(p.name for p in sauvegardes[:3]))
    else:
        ligne(VERT, "Aucune sauvegarde de .env qui traîne")

    print()
    if bloquants:
        print(f"{bloquants} point(s) BLOQUANT(S). La boutique n'est pas prête.\n")
        return 1
    print("Rien ne bloque le lancement.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(principal())
