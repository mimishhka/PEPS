# -*- coding: utf-8 -*-
"""Les identifiants chimiques du catalogue doivent tenir l'arithmetique.

MIREILLE, 18/10/2026 : « make sure all information is real verify with this
site ». Verifier vingt-neuf fiches a la main une fois ne protege rien : c'est
la trentieme, ecrite dans six mois, qui portera le chiffre faux.

Alors ce filet ne compare pas le catalogue a une source — il le compare A
LUI-MEME. Trois proprietes qu'une donnee inventee rate presque a coup sur :

1. UNE MASSE MOLECULAIRE EST DEFINIE PAR SA FORMULE BRUTE. On la recalcule et
   on exige l'accord. C'est ce controle qui a fait tomber deux valeurs :
     - cagrilintide, dont la deuxieme source annoncait 4030 Da pour une
       formule qui en pese 4409 — 9,4 % d'ecart. Sa chimie n'est pas publiee
       ici tant que la fiche du fournisseur ne tranche pas.
     - GHK-Cu, deja en base, qui portait C14H22CuN6O4 a cote de 403,93. Avec
       Cu(II) cette formule pese 401,91. C'etait la formule qui etait fausse.

2. UN NUMERO CAS PORTE SON CHIFFRE DE CONTROLE. Le dernier chiffre est la
   somme ponderee des autres, lue de droite a gauche, modulo 10. Vingt-sept
   des numeros du catalogue le valident ; deux de la deuxieme source ont
   echoue (cagrilintide, survodutide) et ne sont pas repris.

3. UNE SEQUENCE EN CODE A UNE LETTRE DIT QUELS ATOMES SONT LA. La cysteine et
   la methionine portent un soufre ; aucun autre residu standard n'en porte.
   Si la sequence en contient, la formule doit montrer un S, et reciproquement.

   CE CONTROLE A ATTRAPE MA PROPRE ERREUR. J'avais ecrit le melanotan-1
   « SYSMEHFRWGKPV », ce qui affirme une methionine en position 4, quand sa
   formule verifiee — C78H111N21O19 — ne contient aucun soufre. Le residu est
   une norleucine, et la position 7 une D-phenylalanine. Les deux faits etaient
   faux et la formule les contredisait deja. La notation complete les nomme.

Une fiche peut rester INCOMPLETE : c'est voulu, et dix le sont. Ce qui est
interdit, c'est d'etre complete et fausse.
"""
from __future__ import annotations

import ast
import os
import re

import pytest


def _lire_seed_products():
    """SEED_PRODUCTS, lu depuis la source plutot qu'importe.

    `import server` exige MONGO_URL et ouvre un client : c'est beaucoup
    demander pour relire une liste litterale, et ca ferait echouer ce filet
    partout ou la variable manque. `ast.literal_eval` ne peut rien executer,
    donc la lecture reste sans effet de bord.
    """
    source = os.path.join(os.path.dirname(__file__), "..", "server.py")
    with open(source, encoding="utf-8") as f:
        arbre = ast.parse(f.read())
    for noeud in arbre.body:
        if isinstance(noeud, ast.Assign) and any(
            getattr(c, "id", None) == "SEED_PRODUCTS" for c in noeud.targets
        ):
            return ast.literal_eval(noeud.value)
    raise AssertionError("SEED_PRODUCTS introuvable dans server.py")

# Masses atomiques standard (IUPAC 2021), pour les seuls elements du catalogue.
MASSES = {
    "C": 12.011, "H": 1.008, "N": 14.007, "O": 15.999,
    "S": 32.06, "P": 30.974, "Cu": 63.546,
}

# Les vingt acides amines standard, en code a une lettre.
STANDARD = set("ACDEFGHIKLMNPQRSTVWY")

# Les deux seuls residus standard qui portent un soufre.
SOUFRES = {"C", "M"}

# Tolerance : les tables de masses atomiques bougent a la quatrieme decimale,
# et les sources arrondissent. 0,15 % laisse passer ce bruit et arrete une
# vraie contradiction — les ecarts reels du catalogue sont sous 0,01 %.
ECART_TOLERE = 0.15

PRODUITS = _lire_seed_products()
IDS = [p["slug"] for p in PRODUITS]


def masse_de(formule: str) -> float:
    """La masse moleculaire moyenne qu'implique une formule brute."""
    reste = re.sub(r"[A-Z][a-z]?\d*", "", formule)
    assert not reste, f"formule illisible, reste « {reste} » : {formule}"
    total = 0.0
    for element, nombre in re.findall(r"([A-Z][a-z]?)(\d*)", formule):
        if not element:
            continue
        assert element in MASSES, f"element inconnu « {element} » dans {formule}"
        total += MASSES[element] * int(nombre or 1)
    return total


def cas_valide(cas: str) -> bool:
    """Le chiffre de controle d'un numero CAS."""
    chiffres = cas.replace("-", "")
    if not chiffres.isdigit() or not 5 <= len(chiffres) <= 10:
        return False
    corps, cle = chiffres[:-1], int(chiffres[-1])
    somme = sum(int(c) * (i + 1) for i, c in enumerate(reversed(corps)))
    return somme % 10 == cle


@pytest.mark.parametrize("produit", PRODUITS, ids=IDS)
def test_la_masse_correspond_a_la_formule(produit):
    formule = produit.get("molecular_formula") or ""
    masse = produit.get("molecular_weight")
    if not formule or not masse:
        pytest.skip("fiche incomplete, c'est permis")
    calculee = masse_de(formule)
    ecart = abs(calculee - masse) / masse * 100
    assert ecart <= ECART_TOLERE, (
        f"{produit['slug']} : {formule} pese {calculee:.2f}, "
        f"la fiche annonce {masse}, soit {ecart:.2f} % d'ecart"
    )


@pytest.mark.parametrize("produit", PRODUITS, ids=IDS)
def test_le_numero_cas_valide_son_chiffre_de_controle(produit):
    cas = (produit.get("cas_number") or "").strip()
    if not cas:
        pytest.skip("pas de CAS publie, c'est permis")
    assert cas_valide(cas), f"{produit['slug']} : CAS {cas} invalide"


@pytest.mark.parametrize("produit", PRODUITS, ids=IDS)
def test_le_soufre_de_la_sequence_est_dans_la_formule(produit):
    sequence = (produit.get("sequence") or "").strip()
    formule = produit.get("molecular_formula") or ""
    if not sequence or not formule or not set(sequence) <= STANDARD:
        # Notation detaillee (Ac-, D-Phe, Nle, chaines acylees) : la lecture
        # residu par residu ne s'applique pas.
        pytest.skip("pas une sequence en code a une lettre")
    porte_du_soufre = bool(set(sequence) & SOUFRES)
    formule_a_du_soufre = "S" in re.findall(r"[A-Z][a-z]?", formule)
    assert porte_du_soufre == formule_a_du_soufre, (
        f"{produit['slug']} : la sequence {sequence} "
        f"{'porte' if porte_du_soufre else 'ne porte pas'} de cysteine ou de "
        f"methionine, mais {formule} "
        f"{'en montre' if formule_a_du_soufre else 'ne montre pas'} de soufre"
    )


@pytest.mark.parametrize("produit", PRODUITS, ids=IDS)
def test_la_longueur_annoncee_compte_les_residus(produit):
    sequence = (produit.get("sequence") or "").strip()
    longueur = produit.get("sequence_length")
    if not sequence or not longueur or not set(sequence) <= STANDARD:
        pytest.skip("pas une sequence en code a une lettre")
    assert longueur == len(sequence), (
        f"{produit['slug']} : {longueur} residus annonces, "
        f"{len(sequence)} ecrits dans {sequence}"
    )


def test_aucun_produit_actif_ne_porte_un_prix_a_zero():
    """La garde qui protege sa decision du 18/10/2026.

    Les dix fiches ajoutees ce jour-la sont a 0, stock 0, masquees : « vides,
    a 0, desactives ». Un prix se renseigne a la main puis le produit
    s'active — dans cet ordre. Ce test ne l'empeche pas de travailler, il
    empeche l'ordre inverse, celui ou un composant part en vitrine a 0,00 $.
    """
    fautifs = [p["slug"] for p in PRODUITS if p["active"] and not p.get("price_cad")]
    assert fautifs == [], f"actifs sans prix : {fautifs}"


def test_tout_slug_mis_en_vedette_existe_au_catalogue():
    """La garde qui aurait attrape la moitie du defaut du 18/10/2026.

    `featured_slugs` contenait `epithalon-10mg` quand le catalogue — et la base
    en ligne — portent `epitalon-10mg`. Un slug en vedette qui ne correspond a
    aucun produit ne provoque aucune erreur : il ne met simplement rien en
    vedette, silencieusement. Son vrai Epitalon n'etait donc jamais mis en
    avant, et rien ne le signalait.
    """
    source = os.path.join(os.path.dirname(__file__), "..", "server.py")
    with open(source, encoding="utf-8") as f:
        texte = f.read()
    ligne = re.search(r"featured_slugs = \{([^}]*)\}", texte)
    assert ligne, "featured_slugs introuvable"
    vedettes = set(re.findall(r'"([^"]+)"', ligne.group(1)))
    connus = {p["slug"] for p in PRODUITS}
    orphelins = sorted(vedettes - connus)
    assert orphelins == [], f"mis en vedette mais absents du catalogue : {orphelins}"


def test_les_slugs_sont_uniques_et_les_fiches_ont_les_memes_champs():
    slugs = [p["slug"] for p in PRODUITS]
    doublons = sorted({s for s in slugs if slugs.count(s) > 1})
    assert doublons == [], f"slugs en double : {doublons}"

    champs = set(PRODUITS[0])
    for p in PRODUITS:
        assert set(p) == champs, (
            f"{p['slug']} n'a pas les memes champs : {set(p) ^ champs}"
        )
