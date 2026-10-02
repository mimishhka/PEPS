# -*- coding: utf-8 -*-
"""Un versement echoue rend ses commissions. LES TROIS CHEMINS.

Trouve en repassant en revue tous les etats d'un compte affilie, comme
Mireille l'a demande le 02/10/2026.

Le webhook NOWPayments liberait les commissions d'un versement echoue, avec un
commentaire qui disait exactement pourquoi :

    « Sans cette remise a zero du `payout_id`, elles restaient rattachees a un
    versement mort : le generateur filtre sur `payout_id: None` et ne les
    aurait jamais reprises. L'argent du etait immobilise sans qu'aucun ecran ne
    le dise. »

La lecon etait ecrite LA, et nulle part ailleurs. Les deux echecs du niveau
requete -- `_np_create_payout` qui leve, et une reponse NOWPayments sans
identifiant de lot -- posaient `status: "failed"` et laissaient les
commissions attachees. Definitivement : le generateur ne selectionne que
`{"status": "approved", "payout_id": None}`, et aucun rattrapage ne balaye ce
cas dans tout le depot.

Resultat : l'affilie reste creancier d'une somme que plus aucun run ne paiera,
et rien ne l'affiche.

Le dernier test de ce fichier est le seul qui empeche un QUATRIEME chemin de
deriver de la meme facon.
"""
import asyncio
import importlib
import io
import os
import re
import sys
from types import SimpleNamespace

import pytest

ICI = os.path.dirname(__file__)
sys.path.insert(0, os.path.abspath(os.path.join(ICI, "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("ORDER_CUTOFF_TZ", "America/Toronto")
    import server
    return importlib.reload(server)


class Commissions:
    """Double de collection qui APPLIQUE le filtre et le `$set`.

    Un double qui se contenterait de compter les appels laisserait passer un
    filtre trop large -- par exemple une liberation qui detacherait aussi les
    lignes deja payees, donc payables une seconde fois.
    """

    def __init__(self, lignes):
        self.lignes = [dict(l) for l in lignes]
        self.filtres = []

    def _correspond(self, ligne, filtre):
        for cle, attendu in filtre.items():
            valeur = ligne.get(cle)
            if isinstance(attendu, dict):
                if "$in" in attendu and valeur not in attendu["$in"]:
                    return False
                if "$ne" in attendu and valeur == attendu["$ne"]:
                    return False
            elif valeur != attendu:
                return False
        return True

    async def update_many(self, filtre, maj):
        self.filtres.append(filtre)
        n = 0
        for ligne in self.lignes:
            if self._correspond(ligne, filtre):
                ligne.update(maj.get("$set", {}))
                n += 1
        return SimpleNamespace(modified_count=n)

    def par_id(self, ident):
        return [l for l in self.lignes if l["id"] == ident][0]


LIGNES = [
    # Approuvee, rattachee au versement mort : c'est elle qu'il faut rendre.
    {"id": "r-1", "payout_id": "pay-mort", "status": "approved",
     "commission_amount": 60.0},
    {"id": "r-2", "payout_id": "pay-mort", "status": "approved",
     "commission_amount": 82.5},
    # DEJA PAYEE sur ce meme versement : reglee par ailleurs (reprise d'un
    # versement en double, regularisation manuelle). La detacher la rendrait
    # payable une SECONDE fois.
    {"id": "r-3", "payout_id": "pay-mort", "status": "paid",
     "commission_amount": 20.0},
    # Remboursee : plus rien a verser.
    {"id": "r-4", "payout_id": "pay-mort", "status": "reversed",
     "commission_amount": 15.0},
    # Celle d'un autre versement, bien vivant.
    {"id": "r-5", "payout_id": "pay-vivant", "status": "approved",
     "commission_amount": 30.0},
]


def _brancher(server, lignes=None):
    col = Commissions(lignes if lignes is not None else LIGNES)
    server.db = SimpleNamespace(affiliate_referrals=col)
    return col


# ===========================================================================
# LE GESTE
# ===========================================================================

def test_LES_COMMISSIONS_APPROUVEES_SONT_RENDUES(server_module):
    """Sans cela, le generateur ne les reverra jamais."""
    col = _brancher(server_module)

    n = asyncio.run(
        server_module._liberer_commissions_du_versement("pay-mort"))

    assert n == 2
    assert col.par_id("r-1")["payout_id"] is None
    assert col.par_id("r-2")["payout_id"] is None


def test_une_ligne_DEJA_PAYEE_n_est_PAS_rendue(server_module):
    """Le test qui compte le plus apres le precedent.

    Detacher une ligne `paid` la remettrait dans le pot des commissions
    payables : le prochain run la paierait une SECONDE fois. Une correction
    trop large sur un chemin d'echec couterait plus cher que le defaut.
    """
    col = _brancher(server_module)

    asyncio.run(server_module._liberer_commissions_du_versement("pay-mort"))

    assert col.par_id("r-3")["payout_id"] == "pay-mort"
    assert col.par_id("r-4")["payout_id"] == "pay-mort"


def test_le_versement_d_a_cote_n_est_pas_touche(server_module):
    col = _brancher(server_module)

    asyncio.run(server_module._liberer_commissions_du_versement("pay-mort"))

    assert col.par_id("r-5")["payout_id"] == "pay-vivant"


def test_une_LISTE_d_identifiants_marche_aussi(server_module):
    """Le webhook traite un lot entier d'un coup."""
    col = _brancher(server_module)

    n = asyncio.run(server_module._liberer_commissions_du_versement(
        ["pay-mort", "pay-vivant"]))

    assert n == 3
    assert col.par_id("r-5")["payout_id"] is None


def test_une_liste_vide_ne_touche_a_rien(server_module):
    """Un lot vide ne doit pas produire un `$in: []` qui balaye la
    collection pour rien."""
    col = _brancher(server_module)

    assert asyncio.run(
        server_module._liberer_commissions_du_versement([])) == 0
    assert col.filtres == []


def test_un_versement_sans_commission_rend_zero(server_module):
    col = _brancher(server_module)

    assert asyncio.run(
        server_module._liberer_commissions_du_versement("pay-inconnu")) == 0
    assert all(l["payout_id"] is not None for l in col.lignes)


# ===========================================================================
# LA REGLE, TENUE POUR LES PROCHAINS CHEMINS
#
# Les trois sites sont corriges. Ce test est le seul qui empeche un QUATRIEME
# d'apparaitre sans la liberation -- exactement comme les deux echecs du
# niveau requete sont apparus apres le webhook.
# ===========================================================================

def _sites_d_echec():
    """Chaque endroit qui ecrit `status: "failed"` sur un versement, avec le
    bloc de code qui suit."""
    sites = []
    for nom in ("server.py", "services/nowpayments.py"):
        chemin = os.path.abspath(os.path.join(ICI, "..", nom))
        texte = io.open(chemin, encoding="utf-8", errors="replace").read()
        appels = [m.start() for m in
                  re.finditer(r'affiliate_payouts\.update_(?:one|many)\(', texte)]
        for i, debut in enumerate(appels):
            # LA FENETRE S'ARRETE AU SITE SUIVANT.
            #
            # Premiere version : `texte[debut:debut + 1400]`. Les deux echecs
            # du niveau requete sont a huit lignes l'un de l'autre : la fenetre
            # de l'un contenait l'appel de l'autre, et le test passait avec une
            # liberation retiree. Il ne mesurait rien -- la panne exacte qu'il
            # etait cense detecter.
            fin = appels[i + 1] if i + 1 < len(appels) else len(texte)
            fin = min(fin, debut + 1400)
            bloc = texte[debut:fin]
            if not re.search(r'"status":\s*"failed"', bloc[:500]):
                continue
            ligne = texte[:debut].count("\n") + 1
            sites.append((nom, ligne, bloc))
    return sites


def test_LES_TROIS_SITES_D_ECHEC_SONT_CONNUS():
    """Si ce compte change, un chemin d'echec a ete ajoute ou retire : le test
    suivant doit etre relu, pas seulement rendu vert."""
    sites = _sites_d_echec()
    assert len(sites) == 3, [(n, l) for n, l, _ in sites]


def test_CHAQUE_ECHEC_LIBERE_LES_COMMISSIONS():
    """La regle n'est plus ecrite a un seul endroit.

    Elle l'etait -- dans le webhook, avec le bon commentaire -- et deux autres
    chemins l'ignoraient. Ce test lit le code : tout site qui pose
    `status: "failed"` sur un versement doit appeler la liberation.
    """
    manquants = []
    for nom, ligne, bloc in _sites_d_echec():
        if "_liberer_commissions_du_versement" not in bloc:
            manquants.append("%s:%d" % (nom, ligne))
    assert not manquants, (
        "ces chemins posent `failed` sans rendre les commissions — elles "
        "resteront invisibles pour le generateur : " + ", ".join(manquants))
