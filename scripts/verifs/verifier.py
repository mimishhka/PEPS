#!/usr/bin/env python
"""Lance les quatre sondes sur le frontend. Aucune dépendance à installer.

    python scripts/verifs/verifier.py            # tout le frontend
    python scripts/verifs/verifier.py --modifies # seulement les fichiers modifiés

Ces sondes existent parce que `yarn build` n'est pas toujours à portée de main,
et surtout parce qu'elles nomment le problème là où le compilateur ne donne
qu'une position. Chacune correspond à une panne réellement survenue sur ce
projet :

    tags        une balise fermante supprimée par erreur
    hooks       un hook placé après un `return` anticipé — « Rendered more
                hooks than during the previous render »
    jsxcomment  un commentaire {/* */} glissé entre `&& (` et l'élément,
                ce qui fait deux expressions là où JSX en attend une
    imports     un composant rendu sans être importé — le fichier reste
                valide, le build casse

Sortie : code 0 si tout passe, 1 sinon. Utilisable tel quel dans un hook de
pre-commit ou une intégration continue.
"""
import subprocess
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent.parent
SONDES = [
    ("balises",     "tags.py",       True),   # True = reçoit les fichiers un à un
    ("hooks",       "hooks.py",      True),
    ("commentaires", "jsxcomment.py", True),
    ("imports",     "imports.py",    False),  # analyse le projet d'un bloc
]


def fichiers_cibles(mode):
    """mode : "tout" | "modifies" | "cached".

    « cached » lit ce qui est MIS EN SCENE, et c'est ce que le hook de
    pre-commit doit examiner : un fichier corrige mais non ajoute ne doit pas
    faire passer un commit casse.
    """
    if mode in ("modifies", "cached"):
        cmd = (["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"]
               if mode == "cached"
               else ["git", "diff", "--name-only", "HEAD"])
        try:
            sortie = subprocess.run(cmd, cwd=RACINE, capture_output=True,
                                    text=True, check=True).stdout
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("git indisponible - analyse de tout le frontend")
            return fichiers_cibles("tout")
        return [RACINE / l for l in sortie.split()
                if l.endswith((".jsx", ".js")) and l.startswith("frontend/")
                and (RACINE / l).exists()]
    src = RACINE / "frontend" / "src"
    return sorted(src.rglob("*.jsx")) + sorted(src.rglob("*.js"))


def main():
    mode = ("cached" if "--cached" in sys.argv
            else "modifies" if "--modifies" in sys.argv
            else "tout")
    cibles = fichiers_cibles(mode)
    if not cibles:
        print("Aucun fichier a verifier.")
        return 0

    ETIQUETTE = {"cached": "mis en scene", "modifies": "modifies",
                 "tout": "tout le frontend"}
    # Sortie volontairement en ASCII : la console de Git Bash sous Windows
    # rend les accents et les tirets cadratins en caracteres brouilles, et un
    # outil dont le rapport est illisible finit par ne plus etre lu.
    print(f"{len(cibles)} fichier(s) - {ETIQUETTE[mode]}\n")
    echecs = 0
    for etiquette, script, par_fichier in SONDES:
        chemin = ICI / script
        if not chemin.exists():
            print(f"  {etiquette:14} sonde absente ({script})")
            echecs += 1
            continue

        problemes = []
        if par_fichier:
            for f in cibles:
                r = subprocess.run([sys.executable, str(chemin), str(f)],
                                   cwd=RACINE, capture_output=True, text=True)
                texte = (r.stdout + r.stderr).strip()
                if r.returncode != 0 or "OK" not in texte:
                    problemes.append(texte or f"echec sur {f}")
        else:
            r = subprocess.run([sys.executable, str(chemin)],
                               cwd=RACINE, capture_output=True, text=True)
            if r.returncode != 0:
                problemes.append((r.stdout + r.stderr).strip())

        if problemes:
            echecs += len(problemes)
            print(f"  {etiquette:14} {len(problemes)} PROBLEME(S)")
            for p in problemes[:10]:
                for ligne in p.splitlines():
                    print(f"      {ligne}")
        else:
            print(f"  {etiquette:14} ok")

    print()
    if echecs:
        print(f"{echecs} probleme(s). Corrigez avant de committer.")
        return 1
    print("Tout passe.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
