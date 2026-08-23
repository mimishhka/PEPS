"""Detecte les crochets React places APRES une sortie anticipee.

React exige que chaque rendu appelle la meme suite de crochets. Un useState ou
un useEffect situe apres un `return` conditionnel n'est pas execute lorsque ce
return se declenche, puis l'est au rendu suivant : React lance alors
« Rendered more hooks than during the previous render » et l'ecran entier est
remplace par la frontiere d'erreur.

Ce defaut ne se voit ni a la compilation ni dans l'appariement des balises. Il
ne se manifeste qu'a l'ecran, et seulement quand le composant passe par son
etat de chargement — donc precisement dans le cas qu'on ne teste pas.

    python hooks.py            # fichiers modifies, deduits de git
    python hooks.py <chemin>   # un fichier precis
"""
import pathlib
import re
import subprocess
import sys

# Deduit du fichier lui-meme : scripts/verifs/<sonde>.py -> racine du depot.
# Un chemin absolu ecrit en dur rendait la sonde inutilisable ailleurs que sur
# la machine ou elle avait ete ecrite — donc inutilisable sur le serveur.
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
CROCHET = re.compile(
    r"^\s{2}(?:const\s+.*?=\s*)?use[A-Z]\w*\s*\(|^\s{2}const\s*[\[{].*=\s*use[A-Z]\w*\s*\("
)
# Une sortie anticipee s'ecrit presque toujours dans un `if` de premier niveau,
# donc son `return` est indente de QUATRE espaces, pas deux. Un motif exigeant
# deux espaces ne trouvait rien et laissait passer le defaut qu'il devait
# attraper — verifie par contre-epreuve.
#
# On repere donc le `if (` de premier niveau, puis un `return` a quatre espaces
# dans les lignes qui suivent. Un `return` a deux espaces sans parenthese
# ouvrante compte aussi : c'est une sortie inconditionnelle placee en cours de
# corps, plus rare mais tout aussi coupante.
SORTIE_IF = re.compile(r"^\s{2}if\s*\(")
SORTIE_DIRECTE = re.compile(r"^\s{2}return\s+(?!\()")
RETOUR_IMBRIQUE = re.compile(r"^\s{4}return\b")


def composants(lignes: list[str]) -> list[tuple[str, int, int]]:
    """(nom, debut, fin) de chaque composant de premier niveau."""
    bornes = [
        (m.group(1), i)
        for i, l in enumerate(lignes)
        if (m := re.match(r"^(?:export default )?function ([A-Z]\w*)", l))
    ]
    out = []
    for k, (nom, debut) in enumerate(bornes):
        fin = bornes[k + 1][1] if k + 1 < len(bornes) else len(lignes)
        out.append((nom, debut, fin))
    return out


def check(rel: str) -> list[str]:
    path = ROOT / rel
    if not path.exists():
        return []
    lignes = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    mauvais = []
    for nom, debut, fin in composants(lignes):
        premiere_sortie = None
        i = debut
        while i < fin:
            l = lignes[i]
            if premiere_sortie is None:
                if SORTIE_DIRECTE.match(l):
                    premiere_sortie = i + 1
                elif SORTIE_IF.match(l):
                    # Le corps du `if` court jusqu'a une accolade fermante de
                    # premier niveau. On y cherche un `return`.
                    for j in range(i + 1, min(i + 40, fin)):
                        if re.match(r"^\s{2}\}", lignes[j]):
                            break
                        if RETOUR_IMBRIQUE.match(lignes[j]):
                            premiere_sortie = j + 1
                            break
            elif CROCHET.match(l):
                mauvais.append(
                    f"{nom} : crochet L{i + 1} apres la sortie L{premiere_sortie}"
                    f"  ->  {l.strip()[:52]}"
                )
            i += 1
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
                vus.update(l.strip() for l in r.stdout.split("\n")
                           if l.strip().endswith(".jsx"))
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
