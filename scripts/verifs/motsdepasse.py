# -*- coding: utf-8 -*-
"""Un champ de mot de passe sans `autoComplete`.

POURQUOI CE CONTROLE EXISTE
---------------------------
MIREILLE, 01/10/2026 : « current password in password setting does not
autofill ».

AUCUN des quatorze champs `type="password"` de l'application ne portait
d'attribut `autoComplete`. Un gestionnaire de mots de passe n'a alors aucun
moyen de savoir lequel est l'ancien et lequel est le nouveau.

LES DEUX VALEURS SONT DES INSTRUCTIONS, pas de la decoration :

    current-password : remplis-le avec le mot de passe enregistre.
    new-password     : NE le remplis PAS, et propose-en un genere.

Le second compte autant que le premier. Sans lui, le navigateur recopie
l'ancien mot de passe dans le champ « nouveau mot de passe » : la personne
enregistre son propre mot de passe actuel en croyant en changer, et ne
comprend pas pourquoi l'ancien fonctionne encore.

CE DEFAUT NE SE VOIT PAS EN LISANT LE CODE. Le formulaire est correct, le
style est correct, les tests passent : il ne se manifeste que dans un vrai
navigateur, avec un vrai gestionnaire. C'est exactement le genre de chose
qu'une sonde doit tenir, parce que le prochain formulaire l'oubliera aussi.

CE QU'IL COUVRE, ET CE QU'IL NE COUVRE PAS
------------------------------------------
Il verifie la PRESENCE de l'attribut sur chaque `type="password"`, et que sa
valeur fait partie des valeurs admises. Il ne peut pas juger si
`current-password` etait le bon choix plutot que `new-password` : cela demande
de savoir ce que le formulaire fait, et c'est a l'auteur de le decider.

Il tolere `autoComplete="off"` : c'est un choix deliberat (un pot de miel, par
exemple) et non un oubli.
"""
import pathlib
import re
import sys

VALEURS = {"current-password", "new-password", "off", "one-time-code"}

# L'attribut peut preceder ou suivre `type="password"` dans la balise. On
# isole donc la balise entiere, du `<input` jusqu'au `>` qui la ferme.
BALISE = re.compile(r"<input\b[^>]*?>", re.S)
EST_MDP = re.compile(r'type\s*=\s*"password"')
AUTO = re.compile(r'autoComplete\s*=\s*"([a-z-]+)"')


def verifier(fichiers):
    soucis = []
    for f in fichiers:
        try:
            texte = f.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for balise in BALISE.finditer(texte):
            brut = balise.group(0)
            if not EST_MDP.search(brut):
                continue
            ligne = texte.count("\n", 0, balise.start()) + 1
            trouve = AUTO.search(brut)
            if not trouve:
                soucis.append((f, ligne, "aucun autoComplete"))
            elif trouve.group(1) not in VALEURS:
                soucis.append((f, ligne,
                               'autoComplete="%s" inattendu' % trouve.group(1)))
    return soucis


def _cibles(args):
    if not args:
        racine = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src"
        return sorted(racine.rglob("*.jsx")) + sorted(racine.rglob("*.js"))
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
    for f, n, quoi in soucis:
        print(f"  !! {f}:{n} — champ de mot de passe : {quoi}")
    if soucis:
        print(f"\n  {len(soucis)} champ(s) a corriger")
        print("  valeurs admises : " + ", ".join(sorted(VALEURS)))
        return 1
    print(f"  motsdepasse   ok  ({len(fichiers)} fichiers)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
