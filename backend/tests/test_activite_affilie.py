# -*- coding: utf-8 -*-
"""Le flux d'activite de l'affilie, et le montant faux qu'il affichait.

VU A L'ECRAN le 02/10/2026, sur le compte LOLA10, en parcourant tous les
onglets comme Mireille l'a demande.

La ligne du versement affichait :

    Payout 2026-10        PAID_MANUAL        $352.77

Trois erreurs, sur de l'argent, sur une seule ligne :

  - 352,77 est la quantite d'USDT. Le versement vaut 500,40 $ CAD. Le signe
    dollar, au milieu de commandes chiffrees en CAD, faisait lire un montant
    FAUX et plus bas que ce qui avait ete recu.
  - « 2026-10 » est l'etiquette du lot — le mois ou NOUS avons paye. Les
    commissions couvertes etaient celles de SEPTEMBRE. C'est la plainte
    d'origine de Mireille, corrigee dans l'historique des versements et
    oubliee ici.
  - « PAID_MANUAL » est le jeton brut de la base.

La projection ne demandait que `amount` et `period`. Elle demande maintenant
ce qu'il faut pour dire la verite.
"""
import asyncio
import importlib
import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def server_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("ORDER_CUTOFF_TZ", "America/Toronto")
    import server
    return importlib.reload(server)


AFF = {"id": "aff-1", "code": "LOLA10"}

# Le versement reel de LOLA10, chiffres compris.
VERSEMENT = {
    "id": "pay-1", "affiliate_id": "aff-1",
    "period": "2026-10",              # l'etiquette du LOT
    "amount_cad": 500.40,             # ce qu'elle a gagne
    "amount": 352.767398,             # ce qui est parti, en jetons
    "currency": "usdt",
    "status": "paid_manual",
    "created_at": "2026-10-01T14:39:00+00:00",
}

# Les commissions couvertes : SEPTEMBRE.
LIGNES = [
    {"id": "r-1", "payout_id": "pay-1", "affiliate_id": "aff-1",
     "order_number": "FN-260930-3951A21A", "commission_amount": 306.0,
     "base_amount": 3060.0, "status": "paid",
     "approved_at": "2026-09-29T20:38:00+00:00",
     "created_at": "2026-09-29T20:38:00+00:00"},
    # LA LIGNE QUI COMPTE : commandee le 29 septembre, remboursee le 18
    # octobre, apres que l'argent soit parti. Deux faits, deux dates.
    {"id": "r-2", "payout_id": "pay-1", "affiliate_id": "aff-1",
     "order_number": "FN-260930-53AC39A3", "commission_amount": 194.40,
     "base_amount": 1620.0, "status": "reversed",
     "approved_at": "2026-09-29T20:43:00+00:00",
     "created_at": "2026-09-29T20:43:00+00:00",
     "reversed_at": "2026-10-18T09:00:00+00:00",
     "reversed_after_payout": True},
]


class Curseur:
    def __init__(self, docs, projection=None):
        self.docs = docs
        self.projection = projection or {}

    def sort(self, *_a):
        return self

    async def to_list(self, n):
        garder = [k for k, v in self.projection.items() if v == 1 and k != "_id"]
        docs = self.docs[:n]
        if not garder:
            return [dict(d) for d in docs]
        # On APPLIQUE la projection : sans cela, le test ne verrait pas qu'un
        # champ n'a pas ete demande — exactement le defaut d'origine.
        return [{k: d[k] for k in garder if k in d} for d in docs]


class Collection:
    def __init__(self, docs):
        self.docs = docs
        self.projections = []

    def find(self, filtre, projection=None):
        self.projections.append(projection or {})
        trouves = [d for d in self.docs
                   if all(d.get(k) == v for k, v in filtre.items()
                          if not isinstance(v, dict))]
        return Curseur(trouves, projection)

    def aggregate(self, pipeline):
        """Sert `_periodes_couvertes` : groupe sur le mois d'approbation."""
        ids = pipeline[0]["$match"]["payout_id"]["$in"]
        groupes = {}
        for d in self.docs:
            if d.get("payout_id") not in ids:
                continue
            mois = str(d.get("approved_at") or d.get("created_at") or "")[:7]
            if len(mois) == 7:
                groupes.setdefault(d["payout_id"], set()).add(mois)
        lignes = [{"_id": p, "mois": sorted(m)} for p, m in groupes.items()]

        async def to_list(_n):
            return lignes
        return SimpleNamespace(to_list=to_list)


def _brancher(server, versements=None, lignes=None, clics=None):
    server.db = SimpleNamespace(
        affiliate_clicks=Collection(clics if clics is not None else []),
        affiliate_referrals=Collection(lignes if lignes is not None else LIGNES),
        affiliate_payouts=Collection(versements if versements is not None
                                     else [VERSEMENT]),
    )
    return server.db


def _versement(server, **kw):
    _brancher(server, **kw)
    flux = asyncio.run(server.affiliate_activity(None, aff=AFF))
    return [e for e in flux if e["type"] == "versement"][0]


# ===========================================================================
# LES TROIS DEFAUTS
# ===========================================================================

def test_LE_MONTANT_EST_EN_DOLLARS_CANADIENS(server_module):
    """Le defaut le plus grave : un chiffre d'argent FAUX sur sa page.

    352,77 etait affiche « $352.77 » a cote de commandes en CAD. Elle a recu
    500,40 $ CAD, verses sous forme de 352,77 USDT.
    """
    e = _versement(server_module)

    assert e["amount"] == 500.40


def test_la_quantite_de_jetons_reste_disponible_AVEC_sa_devise(server_module):
    """Un nombre nu, sur un ecran ou tout est en dollars, se lit comme un
    second montant canadien. C'est la devise qui le sauve."""
    e = _versement(server_module)

    assert e["jetons"] == 352.77
    assert e["devise"] == "usdt"


def test_LA_PERIODE_COUVERTE_remplace_l_etiquette_de_lot(server_module):
    """« 2026-10 » est le mois du VIREMENT. Les commissions sont de septembre.

    C'est la plainte d'origine : « le payout indique le mois d'octobre alors
    que c'est pour les commissions du mois de septembre ». Corrigee dans
    l'historique le 01/10, et oubliee dans ce flux.
    """
    e = _versement(server_module)

    assert e["periode_couverte"] is not None
    assert e["periode_couverte"]["debut"] == "2026-09"
    assert e["periode_couverte"]["fin"] == "2026-09"
    # L'etiquette de lot reste, en dernier recours : mieux vaut un mois
    # approximatif qu'une case vide sur un releve d'argent.
    assert e["label"] == "2026-10"


def test_le_statut_part_tel_quel_c_est_l_ecran_qui_traduit(server_module):
    """La donnee reste de la donnee. Ce qui a change, c'est que l'ecran ne
    l'affiche plus brute."""
    e = _versement(server_module)

    assert e["status"] == "paid_manual"


# ===========================================================================
# LES GARDES
# ===========================================================================

def test_un_versement_SANS_amount_cad_retombe_sur_amount(server_module):
    """Les versements anciens n'ont pas le champ. Mieux vaut un montant
    approximatif qu'une case vide sur un releve d'argent."""
    vieux = {k: v for k, v in VERSEMENT.items() if k != "amount_cad"}
    e = _versement(server_module, versements=[vieux])

    assert e["amount"] == 352.77


def test_un_versement_sans_commission_n_invente_pas_de_periode(server_module):
    """`periode_couverte` vaut None quand rien n'est rattache : l'ecran dira
    l'etiquette de lot plutot qu'un mois invente."""
    e = _versement(server_module, lignes=[])

    assert e["periode_couverte"] is None
    assert e["label"] == "2026-10"


def test_les_commandes_gardent_leur_montant_de_COMMISSION(server_module):
    """La correction ne doit pas deborder : une ligne de commande porte bien
    la commission, pas la base."""
    _brancher(server_module)
    flux = asyncio.run(server_module.affiliate_activity(None, aff=AFF))
    commandes = [e for e in flux if e["type"] == "commande"]

    assert {c["label"]: c["amount"] for c in commandes} == {
        "FN-260930-3951A21A": 306.0, "FN-260930-53AC39A3": 194.40}
    assert {c["label"]: c["base"] for c in commandes} == {
        "FN-260930-3951A21A": 3060.0, "FN-260930-53AC39A3": 1620.0}


def test_UNE_SEULE_requete_pour_les_periodes_de_toute_la_liste(server_module):
    """`_attacher_periode_couverte` groupe par `payout_id`. Une boucle par
    ligne ferait un N+1 sur un flux qui s'ouvre a chaque visite."""
    autre = {**VERSEMENT, "id": "pay-2", "period": "2026-09",
             "created_at": "2026-09-01T14:00:00+00:00"}
    base = _brancher(server_module, versements=[VERSEMENT, autre])
    appels = []
    vrai = base.affiliate_referrals.aggregate

    def compter(pipeline):
        appels.append(pipeline)
        return vrai(pipeline)

    base.affiliate_referrals.aggregate = compter
    asyncio.run(server_module.affiliate_activity(None, aff=AFF))

    assert len(appels) == 1


# ===========================================================================
# UN FAIT, UNE LIGNE, UNE DATE
#
# MIREILLE, 02/10/2026 : « chaque activite doit avoir sa propre ligne [...] le
# remboursement et la commande doivent etre deux lignes distinctes avec leurs
# propres dates ».
#
# Une commission remboursee ne produisait QU'UN evenement, date de
# `created_at` — le jour de la commande — avec le statut « reversed » colle
# dessus. Sur LOLA10 : la commande du 29 septembre s'affichait « Reversed », et
# le remboursement du 2 octobre n'apparaissait nulle part. Deux faits, une
# seule date, et le plus recent invisible.
# ===========================================================================

def _flux(server, **kw):
    _brancher(server, **kw)
    return asyncio.run(server.affiliate_activity(None, aff=AFF))


def test_UNE_COMMISSION_REMBOURSEE_DONNE_DEUX_LIGNES(server_module):
    flux = _flux(server_module)
    lignes = [e for e in flux if e["label"] == "FN-260930-53AC39A3"]

    assert len(lignes) == 2
    assert sorted(e["type"] for e in lignes) == ["commande", "remboursement"]


def test_et_CHACUNE_PORTE_SA_PROPRE_DATE(server_module):
    """Le coeur de sa demande. La commande est du 29 septembre, le
    remboursement du 18 octobre : deux faits, deux dates."""
    flux = _flux(server_module)
    par_type = {e["type"]: e for e in flux if e["label"] == "FN-260930-53AC39A3"}

    assert par_type["commande"]["at"].startswith("2026-09-29")
    assert par_type["remboursement"]["at"].startswith("2026-10-18")


def test_le_remboursement_porte_un_montant_NEGATIF(server_module):
    """Sans le signe, deux lignes au meme montant se lisent comme deux
    commissions gagnees."""
    flux = _flux(server_module)
    par_type = {e["type"]: e for e in flux if e["label"] == "FN-260930-53AC39A3"}

    assert par_type["commande"]["amount"] == 194.40
    assert par_type["remboursement"]["amount"] == -194.40


def test_et_il_dit_si_l_argent_etait_DEJA_PARTI(server_module):
    """Rembourse APRES versement, l'argent doit etre repris : ce n'est pas le
    meme fait qu'un remboursement avant versement."""
    flux = _flux(server_module)
    remb = [e for e in flux if e["type"] == "remboursement"][0]

    assert remb["apres_versement"] is True


def test_une_commande_NON_remboursee_ne_donne_qu_une_ligne(server_module):
    flux = _flux(server_module)
    lignes = [e for e in flux if e["label"] == "FN-260930-3951A21A"]

    assert len(lignes) == 1
    assert lignes[0]["type"] == "commande"


def test_un_statut_reversed_SANS_date_ne_fabrique_pas_de_ligne(server_module):
    """Une donnee heritee peut porter le statut sans la date. Mieux vaut une
    ligne de moins qu'une ligne datee de rien, qui se trierait n'importe ou."""
    sans_date = [{k: v for k, v in LIGNES[1].items() if k != "reversed_at"}]
    flux = _flux(server_module, lignes=[LIGNES[0]] + sans_date)

    assert [e["type"] for e in flux if e["type"] == "remboursement"] == []


# ===========================================================================
# LES QUATRE AXES DE FILTRE
# ===========================================================================

def test_chaque_evenement_porte_son_type_de_filtre(server_module):
    flux = _flux(server_module, clics=[{"affiliate_id": "aff-1",
                                        "created_at": "2026-10-01T09:00:00+00:00",
                                        "page": "/catalog", "device": "mobile"}])
    types = {e["type"] for e in flux}

    assert types == {"commande", "remboursement", "versement", "clic"}


def test_et_l_ancien_nom_reste_le_temps_d_une_version(server_module):
    """Rien ne doit casser chez un appelant qui filtrerait sur l'ancien type."""
    flux = _flux(server_module, clics=[{"affiliate_id": "aff-1",
                                        "created_at": "2026-10-01T09:00:00+00:00",
                                        "page": "/catalog", "device": "mobile"}])
    anciens = {e["type"]: e.get("legacy_type") for e in flux}

    assert anciens == {"commande": "referral", "remboursement": "referral",
                       "versement": "payout", "clic": "click"}


# ===========================================================================
# LA COUPE NE DOIT AFFAMER PERSONNE
# ===========================================================================

def test_LES_CLICS_NE_CHASSENT_PLUS_L_ARGENT_DU_FLUX(server_module):
    """Chaque source rend jusqu'a `limit` lignes. Un affilie avec beaucoup de
    clics RECENTS voyait donc ses commandes et ses versements chasses du flux :
    l'ecran qui doit raconter son argent ne montrait que des visites. Et un
    filtre cote ecran ne peut rien pour ce qui n'a jamais ete envoye."""
    clics = [{"affiliate_id": "aff-1",
              "created_at": "2026-11-%02dT09:00:00+00:00" % (j + 1),
              "page": "/catalog", "device": "mobile"} for j in range(30)]
    _brancher(server_module, clics=clics)

    flux = asyncio.run(server_module.affiliate_activity(None, limit=5, aff=AFF))

    assert len(flux) == 5
    # Les clics sont tous PLUS RECENTS que l'argent, et pourtant l'argent est la.
    assert {e["type"] for e in flux} & {"commande", "remboursement", "versement"}


def test_le_flux_reste_trie_du_plus_recent_au_plus_ancien(server_module):
    flux = _flux(server_module, clics=[{"affiliate_id": "aff-1",
                                        "created_at": "2026-10-20T09:00:00+00:00",
                                        "page": "/catalog", "device": "mobile"}])
    dates = [str(e["at"]) for e in flux]

    assert dates == sorted(dates, reverse=True)
