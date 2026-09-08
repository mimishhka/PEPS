# -*- coding: utf-8 -*-
"""La frontiere de l'espace affilie est-elle gardee partout ?

POURQUOI CE TEST EXISTE

L'authentification s'exprime de deux facons dans ce projet. Les routes
d'administration declarent leur garde dans la signature —
`Depends(require_area(...))` — donc elle est visible, documentee dans OpenAPI et
verifiable. Les routes affiliees, elles, appellent `get_current_affiliate` DANS
LE CORPS de la fonction.

Consequence : une nouvelle route affiliee qui oublie cet appel est PUBLIQUE, et
rien ne le signale. Ni le lint, ni le build, ni les autres tests. Il a fallu
ecrire un script d'analyse syntaxique pour etablir que les routes existantes
l'appelaient bien.

Ce test remplace ce script. Il lit l'arbre syntaxique, retrouve chaque route
`/api/affiliate/*`, remonte au handler correspondant dans server.py, et exige
une garde — sauf pour les quatre routes publiques par conception, nommees ici
une par une.

Ajouter une route affiliee sans garde fait echouer ce test avec le nom de la
route. Ajouter une route DELIBEREMENT publique demande de l'inscrire ci-dessous,
ce qui est exactement la decision qu'on veut rendre explicite.
"""
import ast
import os
import re
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Routes publiques par conception, avec la raison. Toute autre route affiliee
# doit etre gardee.
PUBLIQUES = {
    "/api/affiliate/join":            "activation par jeton d'invitation",
    "/api/affiliate/invite/program":  "lecture du programme avant activation",
    "/api/affiliate/ref/{code}":      "suivi de clic, appele par un visiteur",
    "/api/affiliate/dashboard":       "garde en tete de fonction, hors du filet",
}


def _routes_affiliees():
    chemin = os.path.join(RACINE, "routers", "affiliate.py")
    src = open(chemin, encoding="utf-8").read()
    prefixe = ""
    m = re.search(r'APIRouter\(([^)]*)\)', src, re.S)
    if m:
        p = re.search(r'prefix\s*=\s*["\']([^"\']+)', m.group(1))
        if p:
            prefixe = p.group(1)
    routes = []
    for n in ast.walk(ast.parse(src)):
        if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for d in n.decorator_list:
            if not isinstance(d, ast.Call) or not isinstance(d.func, ast.Attribute):
                continue
            if d.func.attr not in ("get", "post", "put", "patch", "delete"):
                continue
            if not d.args or not isinstance(d.args[0], ast.Constant):
                continue
            chemin_route = prefixe + d.args[0].value
            if chemin_route.startswith("/api/affiliate"):
                routes.append((d.func.attr.upper(), chemin_route, n.name))
    return routes


def _corps_des_handlers():
    src = open(os.path.join(RACINE, "server.py"), encoding="utf-8").read()
    arbre = ast.parse(src)
    return {n.name: (ast.get_source_segment(src, n) or "")
            for n in ast.walk(arbre)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}


def test_chaque_route_affiliee_est_gardee_ou_declaree_publique():
    routes = _routes_affiliees()
    assert len(routes) >= 20, f"seulement {len(routes)} routes trouvees — lecture cassee ?"

    corps = _corps_des_handlers()
    sans_garde = []
    for methode, chemin, handler in routes:
        if chemin in PUBLIQUES:
            continue
        source = corps.get(handler, "")
        if not source:
            # Le routeur delegue a s.<handler> ; si on ne le retrouve pas, on ne
            # peut pas conclure — mieux vaut le dire que de laisser passer.
            sans_garde.append(f"{methode} {chemin} (handler {handler} introuvable)")
            continue
        if "get_current_affiliate" not in source:
            sans_garde.append(f"{methode} {chemin} -> {handler}")

    assert not sans_garde, (
        "Routes affiliees sans garde d'authentification :\n  "
        + "\n  ".join(sans_garde)
        + "\n\nAjoutez get_current_affiliate au handler, ou inscrivez la route "
          "dans PUBLIQUES avec sa raison."
    )


def test_la_liste_des_routes_publiques_ne_contient_pas_de_route_disparue():
    """Une entree obsolete dans PUBLIQUES est une exemption qui ne protege plus
    rien, et qui masquera la prochaine route portant le meme chemin."""
    chemins = {chemin for _, chemin, _ in _routes_affiliees()}
    fantomes = sorted(set(PUBLIQUES) - chemins)
    assert not fantomes, f"routes listees publiques mais disparues : {fantomes}"
