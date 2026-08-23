#!/usr/bin/env python
"""Active le hook de pre-commit.

    python scripts/verifs/installer.py

Git ne versionne pas .git/hooks : un hook depose la ne suit pas le depot et
n'existe que sur la machine ou il a ete cree. On utilise donc core.hooksPath,
qui pointe git vers un dossier versionne — .githooks/ — de sorte que chaque
personne clonant le projet obtienne le hook en une seule commande.

Le script pose aussi le bit d'execution, que Git ne restaure pas toujours au
clonage sous Windows, et verifie que le hook fonctionne reellement plutot que
d'annoncer un succes sur la foi d'un fichier copie.
"""
import os
import stat
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
HOOK = RACINE / ".githooks" / "pre-commit"


def main():
    if not HOOK.exists():
        print(f"Introuvable : {HOOK}")
        return 1

    try:
        subprocess.run(["git", "config", "core.hooksPath", ".githooks"],
                       cwd=RACINE, check=True, capture_output=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"Impossible de configurer git : {e}")
        return 1

    # Sous Windows le bit d'execution ne survit pas toujours au clonage ; sous
    # Unix, un hook non executable est ignore EN SILENCE — le pire des cas,
    # puisque rien ne signale que la verification ne tourne plus.
    if os.name != "nt":
        mode = HOOK.stat().st_mode
        HOOK.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    lu = subprocess.run(["git", "config", "--get", "core.hooksPath"],
                        cwd=RACINE, capture_output=True, text=True).stdout.strip()
    if lu != ".githooks":
        print(f"La configuration n'a pas pris : core.hooksPath = {lu!r}")
        return 1

    print("Hook de pre-commit actif.")
    print()
    print("  Il ne se declenche que si un .jsx ou .js du frontend est mis en")
    print("  scene, et laisse passer si aucun Python n'est disponible.")
    print()
    print("  Contourner ponctuellement :  git commit --no-verify")
    print("  Desactiver :                 git config --unset core.hooksPath")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
