# -*- coding: utf-8 -*-
"""Verifie que l'assouplissement de `chaines.py` n'a rien ouvert.

La sonde accepte desormais une SUITE de chaines separees par des virgules,
forme legitime d'une continuation de tableau. La question est de savoir si la
faute qu'elle existe pour attraper l'est toujours.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import chaines  # noqa: E402


def passe(ligne: str) -> bool:
    """Reproduit exactement la decision de verifier()."""
    if not chaines.LIGNE_CHAINE.match(ligne) or chaines.LIGNE_CLE_VALEUR.match(ligne):
        return True
    if chaines.SUITE_DE_CHAINES.match(ligne):
        return True
    return chaines._guillemets_non_echappes(ligne) == 2


CAS = [
    # (doit passer, etiquette, ligne)
    (False, "LA FAUTE DU BUILD : guillemets au milieu d'un texte",
     '        "In practice: ... They still appear in your "customers you brought in", ...",'),
    (False, "suite avec un guillemet parasite",
     '        "un", "deux" trois", "quatre",'),
    (False, "guillemets surnumeraires dans un texte",
     '        "trois "guillemets" ici",'),
    # HORS PERIMETRE, ET DEJA AVANT L'ASSOUPLISSEMENT. Une ligne a guillemet
    # unique ne correspond pas a LIGNE_CHAINE, qui exige un guillemet de
    # fermeture : la sonde ne la regarde donc pas. Ce n'est pas une regression
    # de l'assouplissement, et la note de chaines.py l'annonce — « ce n'est
    # PAS un analyseur syntaxique [...] le seul juge complet reste yarn lint ».
    # Le cas figure ici pour que personne ne croie cette faute couverte.
    (True, "guillemet non ferme — hors perimetre, documente",
     '        "texte sans fin,'),
    (True, "suite legitime de courtes valeurs",
     '        "intro_fr", "intro_en", "body_fr", "body_en",'),
    (True, "chaine simple, la forme des tableaux FR/EN",
     '        "Bonjour, comment allez-vous ?",'),
    (True, "chaine simple sans virgule finale",
     '        "dernier element"'),
    (True, "guillemets echappes a l'interieur",
     '        "il a dit \\"bonjour\\" hier",'),
    (True, "paire cle/valeur du JSON-LD",
     '        "@context": "https://schema.org",'),
    (True, "ligne de code ordinaire, hors perimetre",
     '        const x = "a" + "b";'),
]


def main() -> int:
    echecs = 0
    for attendu, etiquette, ligne in CAS:
        obtenu = passe(ligne)
        if obtenu != attendu:
            echecs += 1
            print("  ECHEC   %s" % etiquette)
            print("          attendu : %s, obtenu : %s"
                  % ("passe" if attendu else "signale",
                     "passe" if obtenu else "signale"))
        else:
            print("  ok      %s (%s)"
                  % (etiquette, "passe" if attendu else "signale"))
    print()
    if echecs:
        print("%d cas en echec." % echecs)
        return 1
    print("Les %d cas passent. La faute d'origine reste attrapee." % len(CAS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
