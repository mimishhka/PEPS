# -*- coding: utf-8 -*-
"""La regle du prefixe, sur TOUT le backend.

Mongo sert toute requete portant sur le prefixe d'un index compose :
`{a:1, b:-1}` couvre `{a}`, tri compris. Un index simple sur `a` ne repond
alors plus a aucune lecture, mais continue d'etre reecrit a chaque insertion.

Quatre de ces doublons vivaient dans l'affiliation, dont deux sur des
collections du chemin chaud. L'audit du 2026-09-21 n'en a plus trouve ailleurs
— mais rien ne maintiendra cet etat sans ce test. Il lit le CODE, pas une base
: il n'a besoin ni de Mongo, ni de demarrer l'application.

Il ne fige aucune liste. Il derive la regle : si quelqu'un ajoute un jour un
index deja couvert, la suite le dit, en nommant le fichier et la ligne.
"""
import ast
import io
import os
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
IGNORES = {"tests", ".venv", "__pycache__", "node_modules", "scripts"}


def _fichiers_du_backend():
    for chemin in RACINE.rglob("*.py"):
        if IGNORES & set(chemin.relative_to(RACINE).parts):
            continue
        yield chemin


def _cles_de_l_appel(noeud):
    """Les champs indexes par un `create_index`, dans l'ordre.

    Renvoie None si le premier argument n'est pas lisible statiquement — un
    index construit a l'execution ne peut pas etre juge ici, et l'inventer
    serait pire que de l'ignorer.
    """
    if not noeud.args:
        return None
    arg = noeud.args[0]
    if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
        return [arg.value]
    if isinstance(arg, (ast.List, ast.Tuple)):
        cles = []
        for element in arg.elts:
            if not isinstance(element, (ast.Tuple, ast.List)) or not element.elts:
                return None
            premier = element.elts[0]
            if not (isinstance(premier, ast.Constant) and isinstance(premier.value, str)):
                return None
            cles.append(premier.value)
        return cles or None
    return None


def _collection_de_l_appel(noeud):
    """`s.db.affiliate_referrals.create_index(...)` -> `affiliate_referrals`."""
    cible = noeud.func
    if not isinstance(cible, ast.Attribute) or cible.attr != "create_index":
        return None
    porteur = cible.value
    if not isinstance(porteur, ast.Attribute):
        return None
    return porteur.attr


def _relever_les_index():
    """{collection: [(cles, unique, "fichier:ligne")]} pour tout le backend."""
    releve = {}
    for chemin in _fichiers_du_backend():
        source = io.open(chemin, encoding="utf-8", errors="replace").read()
        try:
            arbre = ast.parse(source)
        except SyntaxError:  # pragma: no cover
            continue
        for noeud in ast.walk(arbre):
            if not isinstance(noeud, ast.Call):
                continue
            collection = _collection_de_l_appel(noeud)
            if not collection:
                continue
            cles = _cles_de_l_appel(noeud)
            if not cles:
                continue
            unique = any(
                mot.arg == "unique" and getattr(mot.value, "value", False) is True
                for mot in noeud.keywords
            )
            # Mongo identifie un index par son NOM, pas par ses cles. Deux
            # index sur `user_id` — un sparse pour la lecture, un unique
            # partiel pour la contrainte — coexistent legitimement sous deux
            # noms. C'est le nom EFFECTIF qui dit s'il y a doublon.
            nom = next(
                (mot.value.value for mot in noeud.keywords
                 if mot.arg == "name" and isinstance(mot.value, ast.Constant)),
                None,
            ) or "_".join(f"{c}_1" for c in cles)
            ou = "%s:%d" % (os.path.relpath(chemin, RACINE).replace("\\", "/"), noeud.lineno)
            releve.setdefault(collection, []).append((tuple(cles), unique, nom, ou))
    return releve


def test_le_releve_trouve_bien_des_index():
    # Un test qui ne lit rien passe toujours. On verifie d'abord qu'il lit.
    releve = _relever_les_index()
    total = sum(len(v) for v in releve.values())
    assert total > 40, f"seulement {total} index releves : le lecteur est casse"
    assert "affiliate_referrals" in releve
    assert "orders" in releve


def test_aucun_index_n_est_couvert_par_le_prefixe_d_un_autre():
    releve = _relever_les_index()

    fautes = []
    for collection, index in sorted(releve.items()):
        for cles, unique, _nom, ou in index:
            if unique:
                # Une contrainte d'unicite n'est couverte par aucun prefixe :
                # elle contraint, elle ne sert pas qu'a lire.
                continue
            for autres, _u, _n, autre_ou in index:
                if autres == cles and autre_ou == ou:
                    continue
                if len(autres) > len(cles) and autres[:len(cles)] == cles:
                    fautes.append(
                        f"{collection} {list(cles)} ({ou}) est deja servi par "
                        f"{list(autres)} ({autre_ou})"
                    )
                    break

    assert fautes == [], (
        "index reecrit(s) a chaque insertion sans servir aucune lecture :\n  "
        + "\n  ".join(fautes)
    )


def test_aucun_index_n_est_declare_deux_fois():
    releve = _relever_les_index()

    doublons = []
    for collection, index in sorted(releve.items()):
        vus = {}
        for cles, _unique, nom, ou in index:
            if nom in vus:
                doublons.append(f"{collection} {nom} {list(cles)} : {vus[nom]} et {ou}")
            else:
                vus[nom] = ou

    assert doublons == [], (
        "meme index (meme NOM) cree a deux endroits. Le second est au mieux "
        "sans effet, au pire un IndexOptionsConflict qui fait tomber toute la "
        "suite des creations :" + os.linesep + os.linesep.join(doublons)
    )


def test_deux_index_de_meme_cle_mais_de_noms_differents_sont_permis():
    # `affiliates.user_id` en porte deux, a dessein : un sparse qui sert la
    # lecture de get_current_affiliate, et un unique partiel qui empeche un
    # meme compte d'etre lie a deux affilies. Les confondre ferait supprimer
    # l'un des deux, et on ne saurait lequel avant de l'avoir casse.
    releve = _relever_les_index()
    sur_user_id = [e for e in releve.get("affiliates", []) if e[0] == ("user_id",)]

    assert len(sur_user_id) == 2
    assert len({nom for _c, _u, nom, _o in sur_user_id}) == 2
