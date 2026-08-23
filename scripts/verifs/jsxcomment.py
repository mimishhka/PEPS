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


def check(rel: str) -> list[str]:
    path = ROOT / rel
    if not path.exists():
        return []
    lignes = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    mauvais = []
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
