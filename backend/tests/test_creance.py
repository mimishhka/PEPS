# -*- coding: utf-8 -*-
"""La creance : ce qui a ete verse en trop, et qui doit revenir.

MIREILLE, 02/10/2026 : « the reversed commission should be an activity of its
own or showed differently [...] the commission to be paid is not updated, that
does not make sense since we have to get back some of what was overpaid in a
previous payout ».

ELLE A RAISON, ET C'ETAIT UNE ERREUR D'ARGENT. `clawback_pending` et
`clawback_amount` etaient ECRITS au moment de la reprise, et lus UNIQUEMENT
pour afficher un compteur dans l'apercu. Ils n'etaient soustraits nulle part :
ni du « a verser », ni du cycle, ni du run de versement. Un affilie surpaye de
82,50 $ voyait « a verser : 200 $ » et etait paye 200 $ — indefiniment, a
chaque cycle, sans que rien ne le signale.

UNE REPRISE RECOUVRE DEUX EVENEMENTS QUE LE CODE CONFONDAIT :

    remboursee AVANT le versement : l'argent n'est jamais parti, il n'y a rien
                                    a recuperer ;
    remboursee APRES le versement : l'argent EST parti, et il y a une dette.

Les deux tombaient dans le meme total `reversed_commission`.
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
    import server
    return importlib.reload(server)


class Curseur:
    def __init__(self, lignes, projection=None):
        self.lignes = lignes
        self.projection = projection or {}

    def sort(self, cle, sens=1):
        self.lignes = sorted(self.lignes,
                             key=lambda d: (d.get(cle) is None, d.get(cle) or ""),
                             reverse=(sens < 0))
        return self

    async def to_list(self, _n):
        gardes = [k for k, v in self.projection.items() if v == 1 and k != "_id"]
        if not gardes:
            return [dict(l) for l in self.lignes]
        return [{k: l[k] for k in gardes if k in l} for l in self.lignes]


class Commissions:
    """Collection qui applique vraiment les `update_one` : c'est le solde
    qu'on teste, pas la capacite d'un double a rendre ce qu'on attend."""

    def __init__(self, lignes):
        self.lignes = [dict(l) for l in lignes]

    def _match(self, d, f):
        for k, v in f.items():
            if isinstance(v, dict) and "$in" in v:
                if d.get(k) not in v["$in"]:
                    return False
            elif d.get(k) != v:
                return False
        return True

    def find(self, filtre, projection=None):
        return Curseur([d for d in self.lignes if self._match(d, filtre)], projection)

    async def update_one(self, filtre, maj):
        for d in self.lignes:
            if self._match(d, filtre):
                for cle, val in (maj.get("$set") or {}).items():
                    d[cle] = val
                for cle, val in (maj.get("$inc") or {}).items():
                    d[cle] = (d.get(cle) or 0) + val
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)

    def aggregate(self, pipeline):
        lignes = [d for d in self.lignes if self._match(d, pipeline[0]["$match"])]
        montant = round(sum(float(d.get("clawback_amount") or 0.0) for d in lignes), 2)
        resultat = [{"_id": None, "montant": montant, "n": len(lignes)}] if lignes else []

        async def to_list(_n):
            return resultat
        return SimpleNamespace(to_list=to_list)


DEUX_DETTES = [
    {"id": "r-1", "affiliate_id": "aff-1", "order_number": "FN-1001",
     "clawback_pending": True, "clawback_amount": 60.0,
     "reversed_at": "2026-09-10T09:00:00+00:00"},
    {"id": "r-2", "affiliate_id": "aff-1", "order_number": "FN-1002",
     "clawback_pending": True, "clawback_amount": 40.0,
     "reversed_at": "2026-10-28T09:00:00+00:00"},
    # Deja soldee : elle ne doit plus jamais compter.
    {"id": "r-3", "affiliate_id": "aff-1", "order_number": "FN-1000",
     "clawback_pending": False, "clawback_amount": 25.0,
     "reversed_at": "2026-08-01T09:00:00+00:00"},
    # Celle d'un AUTRE affilie.
    {"id": "r-9", "affiliate_id": "aff-2", "order_number": "FN-9999",
     "clawback_pending": True, "clawback_amount": 500.0,
     "reversed_at": "2026-09-01T09:00:00+00:00"},
]


def _brancher(server, lignes=None):
    col = Commissions(DEUX_DETTES if lignes is None else lignes)
    server.db = SimpleNamespace(affiliate_referrals=col)
    return col


# ===========================================================================
# CE QUI EST DU
# ===========================================================================

def test_la_creance_ne_compte_que_les_dettes_NON_soldees(server_module):
    _brancher(server_module)
    montant, lignes = asyncio.run(server_module._creance_en_cours("aff-1"))

    assert montant == 100.0                      # 60 + 40, pas les 25 soldes
    assert {l["id"] for l in lignes} == {"r-1", "r-2"}


def test_la_creance_d_un_autre_affilie_ne_deborde_jamais(server_module):
    _brancher(server_module)
    montant, _ = asyncio.run(server_module._creance_en_cours("aff-1"))

    assert montant == 100.0                      # et non 600
    assert asyncio.run(server_module._creance_en_cours("aff-2"))[0] == 500.0


def test_les_dettes_sortent_des_PLUS_ANCIENNES_d_abord(server_module):
    """Une dette se rembourse dans l'ordre ou elle est nee — c'est aussi
    l'ordre qui se raconte dans un audit."""
    _brancher(server_module)
    _, lignes = asyncio.run(server_module._creance_en_cours("aff-1"))

    assert [l["id"] for l in lignes] == ["r-1", "r-2"]


def test_sans_dette_la_creance_vaut_zero(server_module):
    _brancher(server_module, lignes=[])
    assert asyncio.run(server_module._creance_en_cours("aff-1")) == (0.0, [])


# ===========================================================================
# LE SOLDE — C'EST ICI QUE L'ARGENT SE JOUE
# ===========================================================================

def test_un_budget_qui_couvre_tout_solde_tout(server_module):
    col = _brancher(server_module)
    _, lignes = asyncio.run(server_module._creance_en_cours("aff-1"))

    solde = asyncio.run(server_module._solder_creance(lignes, 100.0, "pay-1"))

    assert solde == 100.0
    assert asyncio.run(server_module._creance_en_cours("aff-1"))[0] == 0.0
    # Et chaque ligne porte la trace de son reglement.
    for d in col.lignes:
        if d["id"] in ("r-1", "r-2"):
            assert d["clawback_pending"] is False
            assert d["clawback_settled_by"] == "pay-1"
            assert d["clawback_settled_at"]


def test_LE_SOLDE_PARTIEL_laisse_exactement_le_reste(server_module):
    """LE CAS QUI SE TROMPE LE PLUS FACILEMENT.

    Budget de 70 $ sur deux dettes de 60 $ et 40 $. La premiere est eteinte,
    la seconde n'est couverte qu'a hauteur de 10 $ : il doit rester 30 $.

    Marquer la seconde ligne entiere comme soldee effacerait 30 $ qu'on n'a pas
    recuperes. La laisser intacte les deduirait une deuxieme fois au cycle
    suivant. Les deux erreurs sont silencieuses.
    """
    col = _brancher(server_module)
    _, lignes = asyncio.run(server_module._creance_en_cours("aff-1"))

    solde = asyncio.run(server_module._solder_creance(lignes, 70.0, "pay-1"))

    assert solde == 70.0
    assert asyncio.run(server_module._creance_en_cours("aff-1"))[0] == 30.0

    par_id = {d["id"]: d for d in col.lignes}
    assert par_id["r-1"]["clawback_pending"] is False      # eteinte
    assert par_id["r-2"]["clawback_pending"] is True       # encore due
    assert par_id["r-2"]["clawback_amount"] == 30.0        # ce qui reste
    assert par_id["r-2"]["clawback_settled_amount"] == 10.0  # ce qui est parti


def test_une_dette_soldee_ne_se_deduit_JAMAIS_deux_fois(server_module):
    """Le defaut qui viderait le compte d'un affilie cycle apres cycle."""
    _brancher(server_module)
    _, lignes = asyncio.run(server_module._creance_en_cours("aff-1"))
    asyncio.run(server_module._solder_creance(lignes, 100.0, "pay-1"))

    # Cycle suivant : plus rien a deduire.
    montant, restantes = asyncio.run(server_module._creance_en_cours("aff-1"))
    assert montant == 0.0
    assert restantes == []


def test_un_budget_nul_ne_touche_a_rien(server_module):
    col = _brancher(server_module)
    _, lignes = asyncio.run(server_module._creance_en_cours("aff-1"))

    assert asyncio.run(server_module._solder_creance(lignes, 0.0, "pay-1")) == 0.0
    assert all(d["clawback_pending"] for d in col.lignes
               if d["id"] in ("r-1", "r-2"))


def test_un_budget_SUPERIEUR_a_la_dette_ne_solde_que_la_dette(server_module):
    _brancher(server_module)
    _, lignes = asyncio.run(server_module._creance_en_cours("aff-1"))

    # On n'invente pas du credit : seulement 100 $ etaient dus.
    assert asyncio.run(server_module._solder_creance(lignes, 500.0, "pay-1")) == 100.0


def test_les_centimes_ne_derivent_pas(server_module):
    """Trois dettes a un tiers de dollar : la somme soldee doit valoir
    exactement la dette, sans residu flottant."""
    col = _brancher(server_module, lignes=[
        {"id": f"r-{i}", "affiliate_id": "aff-1", "clawback_pending": True,
         "clawback_amount": 33.33, "reversed_at": f"2026-0{i}-01T09:00:00+00:00"}
        for i in (1, 2, 3)
    ])
    _, lignes = asyncio.run(server_module._creance_en_cours("aff-1"))

    assert asyncio.run(server_module._solder_creance(lignes, 99.99, "pay-1")) == 99.99
    assert asyncio.run(server_module._creance_en_cours("aff-1"))[0] == 0.0
    assert all(d["clawback_pending"] is False for d in col.lignes)


# ===========================================================================
# CE QUE L'ECRAN ANNONCE
# ===========================================================================

def test_le_cycle_annonce_le_NET_et_non_l_acquis(server_module):
    """Deux ecrans qui annoncent deux montants pour le meme versement, c'est un
    appel au service a la clientele. Le run deduit : le cycle doit deduire."""
    col = Commissions(DEUX_DETTES)

    # Le cycle lit l'acquis par agregation, et la creance par une autre.
    class Double(Commissions):
        def aggregate(self, pipeline):
            if pipeline[0]["$match"].get("clawback_pending"):
                return Commissions.aggregate(self, pipeline)
            resultat = [{"_id": None, "due_now": 250.0, "due_count": 3,
                         "current_cycle": 0.0, "current_count": 0}]

            async def to_list(_n):
                return resultat
            return SimpleNamespace(to_list=to_list)

    server_module.db = SimpleNamespace(affiliate_referrals=Double(col.lignes))
    cycle = asyncio.run(server_module._commissions_par_cycle("aff-1"))

    assert cycle["acquis"] == 250.0        # ce qui est valide
    assert cycle["creance"] == 100.0       # ce qui est du en sens inverse
    assert cycle["due_now"] == 150.0       # ce qui partira vraiment
    assert cycle["creance_reportee"] == 0.0


def test_une_creance_PLUS_GRANDE_que_l_acquis_ne_rend_jamais_un_negatif(server_module):
    """Un versement negatif n'existe pas. Le solde du suit au cycle suivant —
    sans ce report, la dette s'effacerait au premier cycle trop maigre."""
    class Double(Commissions):
        def aggregate(self, pipeline):
            if pipeline[0]["$match"].get("clawback_pending"):
                return Commissions.aggregate(self, pipeline)
            resultat = [{"_id": None, "due_now": 30.0, "due_count": 1,
                         "current_cycle": 0.0, "current_count": 0}]

            async def to_list(_n):
                return resultat
            return SimpleNamespace(to_list=to_list)

    server_module.db = SimpleNamespace(affiliate_referrals=Double(DEUX_DETTES))
    cycle = asyncio.run(server_module._commissions_par_cycle("aff-1"))

    assert cycle["due_now"] == 0.0
    assert cycle["creance_reportee"] == 70.0    # 100 dus, 30 absorbes
