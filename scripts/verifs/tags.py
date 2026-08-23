"""Verifie l'appariement des balises JSX.

Une <thead> supprimee par erreur laisse les accolades parfaitement
equilibrees : seul un controle de balises l'attrape. La liste de fichiers est
deduite de git, pas ecrite en dur — une liste figee ne couvrait pas le fichier
que je modifiais, et le controle est passe a cote.

Le decoupage des balises ne se fait PAS a l'expression reguliere. Un motif du
genre <(/?)(\\w+)([^<>]*?)/?> interdit le caractere '>' dans les attributs,
donc onClick={() => f()} coupait la balise en deux et produisait une pluie de
faux positifs. On scanne donc a la main, en suivant la profondeur des accolades
et les guillemets : le '>' qui ferme la balise est celui qui apparait hors
chaine et a profondeur zero.

    python tags.py            # fichiers modifies, deduits de git
    python tags.py <chemin>   # un fichier precis
"""
import pathlib
import re
import subprocess
import sys

# Deduit du fichier lui-meme : scripts/verifs/tags.py -> racine du depot.
# Un chemin absolu ecrit en dur rendait la sonde inutilisable ailleurs que sur
# la machine ou elle avait ete ecrite — donc inutilisable sur le serveur.
ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
VOID = {"br", "hr", "img", "input", "meta", "link", "path", "circle", "line",
        "rect", "polyline", "ellipse", "use", "stop", "area", "col", "source"}


def changed_files() -> list[str]:
    """Modifies dans l'arbre de travail ET au dernier commit : une regression
    peut avoir ete commitee sans jamais avoir ete relue."""
    out = set()
    for cmd in (["git", "diff", "--name-only"],
                ["git", "diff", "--name-only", "--cached"],
                ["git", "diff", "--name-only", "HEAD~1", "HEAD"]):
        try:
            r = subprocess.run(cmd, cwd=ROOT, capture_output=True,
                               text=True, timeout=20)
            out.update(l.strip() for l in r.stdout.split("\n")
                       if l.strip().endswith((".jsx", ".js")))
        except Exception:
            pass
    return sorted(out)


def tag_end(src: str, i: int) -> int:
    """Index du '>' fermant la balise ouverte en i, ou -1.

    Suit accolades et guillemets pour ne pas s'arreter sur le '>' d'une
    fonction flechee — c'etait tout le defaut de la version precedente.
    """
    depth, quote, n = 0, "", len(src)
    while i < n:
        c = src[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = ""
        elif c in "\"'`":
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        elif c == ">" and depth == 0:
            return i
        elif c == "<" and depth == 0 and i > 0:
            return -1  # nouvelle balise avant la fermeture : ce n'en etait pas une
        i += 1
    return -1


def vider_chaines(src: str) -> str:
    """Remplace le CONTENU des chaines par des espaces, en gardant leur longueur.

    Sans cela, un message d'erreur comme

        throw new Error("useFormField should be used within <FormField>")

    compte pour une balise ouvrante jamais fermee. C'etait un faux positif
    reel, sur un fichier que personne n'avait touche.

    Seuls les guillemets DOUBLES et les accents graves sont traites. Les
    apostrophes simples sont laissees telles quelles : le texte francais en est
    truffe — « L'affilie », « d'un » — et les prendre pour des delimiteurs de
    chaine effacerait des pans entiers de JSX.
    """
    sortie = list(src)
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c in '"`':
            fin = i + 1
            while fin < n:
                if src[fin] == "\\":
                    fin += 2
                    continue
                if src[fin] == c:
                    break
                fin += 1
            for j in range(i + 1, min(fin, n)):
                if sortie[j] != "\n":      # les numeros de ligne doivent tenir
                    sortie[j] = " "
            i = fin + 1
            continue
        i += 1
    return "".join(sortie)


def check(rel: str) -> list[str]:
    path = ROOT / rel
    if not path.exists():
        return []
    src = path.read_text(encoding="utf-8", errors="ignore")
    # Commentaires JSX seulement. Les // ne sont retires que si la ligne entiere
    # en est un : ce projet s'en sert comme prefixe decoratif dans le texte
    # (« // APERCU »), et les couper avalait la balise fermante qui suivait.
    src = re.sub(r"\{/\*.*?\*/\}", lambda m: " " * len(m.group()), src, flags=re.S)
    src = re.sub(r"^\s*//[^\n]*$", "", src, flags=re.M)
    src = vider_chaines(src)

    stack, bad, i, n = [], [], 0, len(src)
    while i < n:
        if src[i] != "<":
            i += 1
            continue
        m = re.match(r"<(/?)([A-Za-z][\w.]*)", src[i:])
        if not m:
            i += 1
            continue
        end = tag_end(src, i + 1)
        if end < 0:
            i += 1
            continue
        closing, name = m.group(1), m.group(2)
        line = src.count("\n", 0, i) + 1
        selfclose = src[end - 1] == "/"
        i = end + 1

        if selfclose or name.lower() in VOID:
            continue
        if not closing:
            stack.append((name, line))
        elif not stack:
            bad.append(f"L{line}: </{name}> sans ouverture")
        elif stack[-1][0] != name:
            bad.append(f"L{line}: </{name}> ferme <{stack[-1][0]}> "
                       f"ouvert L{stack[-1][1]}")
            stack.pop()
        else:
            stack.pop()
    return bad + [f"L{l}: <{nm}> jamais ferme" for nm, l in stack]


if __name__ == "__main__":
    files = sys.argv[1:] or changed_files()
    if not files:
        print("aucun fichier .jsx modifie")
        sys.exit(0)
    problems = 0
    for rel in files:
        errs = check(rel)
        name = rel.split("/")[-1]
        if errs:
            problems += 1
            print(f"  PROBLEME  {name}")
            for e in errs[:8]:
                print(f"      {e}")
        else:
            print(f"  OK        {name}")
    sys.exit(1 if problems else 0)
