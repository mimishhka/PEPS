# Detecte les composants JSX utilises sans etre disponibles.
#
# C'est la panne de compilation la plus frequente de ce projet : ajouter
# <TierMark /> sans ajouter l'import. Le fichier reste syntaxiquement valide,
# les controles de balises passent, et le build casse.
import re, sys, pathlib

racine = pathlib.Path("frontend/src")
problemes = []

# Elements intrinseques du DOM : minuscules, jamais importes.
# On ne verifie donc QUE les noms commencant par une majuscule.
BUILTINS = {"Fragment", "React", "Suspense", "StrictMode"}

for f in sorted(racine.rglob("*.jsx")) + sorted(racine.rglob("*.js")):
    src = f.read_text(encoding="utf-8", errors="replace")

    # Noms rendus disponibles par un import.
    dispo = set(BUILTINS)
    # re.S est indispensable : la moitie des imports de ce projet s'etalent sur
    # plusieurs lignes (les icones lucide, les primitives shadcn). Sans lui, la
    # sonde signalait 108 composants parfaitement importes.
    for m in re.finditer(r'^\s*import\s+(.+?)\s+from\s+["\']', src, re.M | re.S):
        clause = m.group(1)
        # import Defaut, { A, B as C } from "..."
        defaut = re.match(r'^([A-Za-z_$][\w$]*)', clause.strip())
        if defaut and not clause.strip().startswith("{"):
            dispo.add(defaut.group(1))
        for nom in re.findall(r'([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?', clause):
            dispo.add(nom[1] or nom[0])
    for m in re.finditer(r'^\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)', src, re.M):
        dispo.add(m.group(1))

    # Noms definis dans le fichier lui-meme.
    for motif in (r'^\s*(?:export\s+)?(?:default\s+)?function\s+([A-Z][\w$]*)',
                  r'^\s*(?:export\s+)?const\s+([A-Z][\w$]*)\s*=',
                  r'^\s*(?:export\s+)?class\s+([A-Z][\w$]*)',
                  r'^\s*const\s+\{([^}]+)\}\s*=',
                  # Parametre destructure d'une fonction — c'est ainsi que
                  # `Icon` arrive dans .map(({ v, Icon, t }) => …). Sans cette
                  # ligne, la sonde signalait 7 composants parfaitement valides.
                  r'\(\s*\{([^}]*)\}\s*\)\s*=>',
                  r'function\s*\w*\s*\(\s*\{([^}]*)\}\s*\)'):
        for m in re.finditer(motif, src, re.M):
            for nom in re.split(r'[,\s:]+', m.group(1)):
                nom = nom.strip()
                if nom and nom[0].isupper():
                    dispo.add(nom)

    # Composants effectivement rendus.
    for m in re.finditer(r'<([A-Z][\w$]*)', src):
        nom = m.group(1)
        racine_nom = nom.split(".")[0]
        if racine_nom in dispo:
            continue
        ligne = src[:m.start()].count("\n") + 1
        problemes.append((str(f.relative_to(racine)), ligne, nom))

    # Membres d'objet : <Dialog.Trigger> -> on verifie « Dialog ».
    for m in re.finditer(r'<([A-Z][\w$]*)\.', src):
        base = m.group(1)
        if base not in dispo:
            ligne = src[:m.start()].count("\n") + 1
            problemes.append((str(f.relative_to(racine)), ligne, base + ".*"))

vus = set()
uniques = []
for p in problemes:
    if p not in vus:
        vus.add(p)
        uniques.append(p)

if uniques:
    print(f"  !! {len(uniques)} composant(s) utilise(s) sans etre disponible(s) :")
    for nom, ligne, comp in uniques:
        print(f"     {nom}:{ligne}  <{comp}>")
    sys.exit(1)
print("  OK — tout composant rendu est importe ou defini sur place")
