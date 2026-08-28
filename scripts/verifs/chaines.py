# -*- coding: utf-8 -*-
"""Guillemets non echappes a l'interieur d'une chaine litterale.

POURQUOI CE CONTROLE EXISTE
---------------------------
AffiliateFaq.jsx a contenu ceci, et le build a casse :

    "In practice: ... They still appear in your "customers you brought in", ..."

Un guillemet droit ouvre la chaine, deux autres se promenent au milieu. ESLint
repond « Parsing error: Unexpected token customers ». Les quatre autres
verificateurs (balises, hooks, commentaires, imports) sont STRUCTURELS : ils
n'ouvrent jamais la question de savoir si le fichier se PARSE. Ils ont tous
repondu « ok » sur un fichier que le build refusait.

CE QU'IL COUVRE, ET CE QU'IL NE COUVRE PAS
------------------------------------------
Uniquement les lignes qui sont ENTIEREMENT une chaine litterale — la forme des
tableaux de textes FR/EN, ou le bug s'est produit :

    "texte",
    "texte"

Pour ces lignes, le compte de guillemets droits non echappes doit valoir 2.
Toute autre valeur signale une chaine ouverte ou refermee de travers.

Ce n'est PAS un analyseur syntaxique. Une expression melant appels et chaines
sur une meme ligne lui echappe. Le seul juge complet reste `yarn lint`, qui a
besoin de Node — absent de la machine Windows. Ce controle attrape la faute
precise deja commise, pas toutes les fautes possibles.
"""
import pathlib
import re
import sys

# Ligne faite d'une seule chaine, avec virgule finale facultative.
LIGNE_CHAINE = re.compile(r'^\s*".*",?\s*$')

# Paire cle/valeur d'un objet : `"@context": "https://schema.org",`. Quatre
# guillemets, tous legitimes. Sans cette exception le controle criait sur le
# JSON-LD de ProductDetail.jsx — et un controle qui crie a tort finit ignore,
# ce qui le rend pire qu'absent.
LIGNE_CLE_VALEUR = re.compile(r'^\s*"[^"\\]*"\s*:')


def _guillemets_non_echappes(ligne: str) -> int:
    # On retire les \" avant de compter : ceux-la sont legitimes.
    return len(re.sub(r'\\"', "", ligne).split('"')) - 1


def verifier(fichiers) -> list:
    soucis = []
    for f in fichiers:
        try:
            lignes = pathlib.Path(f).read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for n, ligne in enumerate(lignes, 1):
            if not LIGNE_CHAINE.match(ligne) or LIGNE_CLE_VALEUR.match(ligne):
                continue
            compte = _guillemets_non_echappes(ligne)
            if compte != 2:
                extrait = ligne.strip()
                if len(extrait) > 90:
                    extrait = extrait[:87] + "..."
                soucis.append((str(f), n, compte, extrait))
    return soucis


def _cibles(args):
    """Accepte des dossiers comme des fichiers.

    Le lanceur commun n'envoie aucun argument ; un appel manuel vise parfois un
    seul fichier. Un rglob sur un fichier ne renvoie rien — le controle serait
    passe « ok » sans rien lire, ce qui est la pire des reponses.
    """
    if not args:
        args = ["frontend/src"]
    fichiers = []
    for a in args:
        p = pathlib.Path(a)
        if p.is_dir():
            fichiers += [q for q in p.rglob("*") if q.suffix in {".js", ".jsx"}]
        elif p.suffix in {".js", ".jsx"} and p.is_file():
            fichiers.append(p)
    return fichiers


def main(argv):
    fichiers = _cibles(argv[1:])
    soucis = verifier(fichiers)
    for f, n, compte, extrait in soucis:
        print(f"  !! {f}:{n} — {compte} guillemets : {extrait}")
    if soucis:
        print(f"\n  {len(soucis)} ligne(s) a corriger")
        return 1
    print(f"  chaines       ok  ({len(fichiers)} fichiers)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
