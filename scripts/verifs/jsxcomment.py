"""Detecte un commentaire JSX place la ou il devient une seconde expression.

Dans `cond && ( ... )` ou `cond ? ( ... ) : ...`, la parenthese n'accepte QU'UNE
expression. Un `{/* ... */}` place juste apres la parenthese ouvrante, suivi
d'un element, en fait deux — et Babel echoue sur « Unexpected token, expected
"," » en pointant l'element, pas le commentaire.

Le commentaire doit vivre AVANT la condition, ou DANS les enfants d'un element,
jamais entre la parenthese et le premier element.

Cette faute ne se voit ni a l'appariement des balises ni a l'equilibre des
accolades : le fichier est parfaitement equilibre, il est seulement invalide.

    python jsxcomment.py            # fichiers modifies, deduits de git
    python jsxcomment.py <chemin>   # un fichier precis
"""
import pathlib
import re
import subprocess
import sys

# Deduit du fichier lui-meme : scripts/verifs/<sonde>.py -> racine du depot.
# Un chemin absolu ecrit en dur rendait la sonde inutilisable ailleurs que sur
# la machine ou elle avait ete ecrite — donc inutilisable sur le serveur.
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent

# Ligne qui ouvre une parenthese d'expression unique : `&& (`, `? (`, `=> (`,
# `return (`. La parenthese doit terminer la ligne.
OUVRE = re.compile(r"(?:&&|\?|=>|return|:)\s*\(\s*$")
COMMENTAIRE = re.compile(r"^\s*\{\s*/\*")

# SECOND CAS, ajoute apres avoir laisse passer une vraie panne.
#
# Cette sonde ne connaissait qu'une forme : le commentaire juste apres une
# parenthese OUVRANTE. Un commentaire glisse ENTRE LES DEUX BRANCHES d'un
# ternaire lui echappait entierement — la ligne precedente se termine alors par
# une parenthese FERMANTE, pas ouvrante :
#
#     {personalTop
#       ? L("a", "b")
#       {/* commentaire */}          <- invalide, Babel echoue ici
#       : L("c", "d")}
#
# La regle qui l'attrape est simple et sans faux positif : un commentaire JSX
# ne peut jamais preceder legalement une ligne qui COMMENCE par `:` ou `?`.
# Ces deux caracteres signifient qu'on est au milieu d'une expression, et un
# `{/* */}` n'y a pas sa place — il n'est valide que la ou JSX attend des
# enfants.
SUITE_TERNAIRE = re.compile(r"^\s*[:?](?!\?)")


def check(rel: str) -> list[str]:
    path = ROOT / rel
    if not path.exists():
        return []
    lignes = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    mauvais = []

    # Cas 2 : commentaire coince entre les deux branches d'un ternaire. On part
    # du COMMENTAIRE et on regarde ce qui suit, alors que le cas 1 part de la
    # parenthese — les deux fautes n'ont pas la meme forme, il faut les deux
    # lectures.
    i = 0
    while i < len(lignes):
        if not COMMENTAIRE.match(lignes[i]):
            i += 1
            continue
        # Fin du commentaire : la ligne qui porte `*/` (la meme si tout tient
        # sur une ligne).
        fin = i
        while fin < len(lignes) and "*/" not in lignes[fin]:
            fin += 1
        for j in range(fin + 1, min(fin + 4, len(lignes))):
            if not lignes[j].strip():
                continue
            if SUITE_TERNAIRE.match(lignes[j]):
                mauvais.append(
                    f"L{i + 1}: commentaire JSX au milieu d'un ternaire, "
                    f"juste avant L{j + 1}  ->  {lignes[j].strip()[:40]}"
                )
            break
        i = fin + 1

    for i, l in enumerate(lignes):
        if not OUVRE.search(l):
            continue
        # Première ligne non vide qui suit
        for j in range(i + 1, min(i + 4, len(lignes))):
            suivante = lignes[j]
            if not suivante.strip():
                continue
            if COMMENTAIRE.match(suivante):
                mauvais.append(
                    f"L{j + 1}: commentaire JSX juste apres la parenthese "
                    f"ouverte L{i + 1}  ->  {l.strip()[-40:]}"
                )
            break
    return mauvais


if __name__ == "__main__":
    files = sys.argv[1:]
    if not files:
        vus = set()
        for cmd in (["git", "diff", "--name-only"],
                    ["git", "diff", "--name-only", "--cached"],
                    ["git", "diff", "--name-only", "HEAD~1", "HEAD"]):
            try:
                r = subprocess.run(cmd, cwd=ROOT, capture_output=True,
                                   text=True, timeout=20)
                vus.update(x.strip() for x in r.stdout.split("\n")
                           if x.strip().endswith(".jsx"))
            except Exception:
                pass
        files = sorted(vus)
    if not files:
        print("aucun fichier .jsx modifie")
        sys.exit(0)
    problemes = 0
    for rel in files:
        errs = check(rel)
        nom = rel.split("/")[-1]
        if errs:
            problemes += 1
            print(f"  PROBLEME  {nom}")
            for e in errs:
                print(f"      {e}")
        else:
            print(f"  OK        {nom}")
    sys.exit(1 if problemes else 0)
