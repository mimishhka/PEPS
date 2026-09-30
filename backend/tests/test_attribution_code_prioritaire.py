"""Le code saisi a la caisse l'emporte sur le cookie de parrainage.

MIREILLE, 29/09/2026 : « j'ai passe une commande avec le code lola10 et un
autre affilie a recu la vente et la commission ».

Le defaut : `affiliate_attach_to_order` lisait le cookie EN PREMIER et ne
regardait le code saisi que si le cookie etait absent. Un clic sur un lien
de parrainage — parfois des semaines plus tot, parfois par simple curiosite —
laissait un cookie qui ecrasait ensuite tout code tape a la caisse.

Pourquoi c'est indefendable, et pas seulement « discutable » : le code saisi
porte la REMISE. Le client tape « lola10 », obtient le rabais de Lola, et
Lola renonce a sa marge. Payer un autre affilie sur cette vente lui verse une
commission sur un rabais qu'il n'a pas consenti, pendant que celle qui a fait
la vente ne recoit rien.

Le cookie reste le repli : il sert quand le client arrive par un lien et ne
tape rien, ce qui est le cas le plus frequent.
"""
import asyncio
import os
import sys
import types

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


COOKIE = "fn_ref"


class FausseRequete:
    """Juste ce que la fonction lit : des cookies."""
    def __init__(self, cookies=None):
        self.cookies = cookies or {}


class FausseCollection:
    """Les affilies, cherches par code ou par alias actif."""
    def __init__(self, documents):
        self.documents = documents

    async def find_one(self, filtre, projection=None):
        codes = set()
        for clause in filtre.get("$or", []):
            if "code" in clause:
                codes.add(clause["code"])
            elif "aliases" in clause:
                codes.add(clause["aliases"]["$elemMatch"]["code"])
        for doc in self.documents:
            if doc.get("status") != filtre.get("status"):
                continue
            if doc.get("code") in codes:
                return dict(doc)
            for alias in doc.get("aliases", []):
                if alias.get("code") in codes and alias.get("active"):
                    return dict(doc)
        return None

    async def update_one(self, *a, **k):
        return types.SimpleNamespace(modified_count=1)


class FausseBase:
    def __init__(self, affilies):
        self.affiliates = FausseCollection(affilies)
        self.affiliate_bindings = FausseCollection([])
        self.users = FausseCollection([])


AFFILIES = [
    {"id": "aff-lola", "code": "LOLA10", "status": "active", "aliases": []},
    {"id": "aff-autre", "code": "AUTRE50", "status": "active", "aliases": []},
    {"id": "aff-alias", "code": "FITNES70", "status": "active",
     "aliases": [{"code": "FITNES100", "active": True}]},
]


@pytest.fixture
def attacher(monkeypatch):
    """La fonction d'attribution, branchee sur une base en memoire."""
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server  # noqa: F401  — construit la chaine d'imports
    from services import affiliate as mod

    monkeypatch.setattr(mod.s, "db", FausseBase(AFFILIES), raising=False)
    monkeypatch.setattr(mod.s, "AFFILIATE_COOKIE_NAME", COOKIE, raising=False)
    return mod.affiliate_attach_to_order


def _commande(code_coupon=None, email="cliente@example.com"):
    doc = {"email": email, "id": "cmd-1"}
    if code_coupon:
        doc["coupon"] = {"code": code_coupon}
    return doc


# ===========================================================================
# LE DEFAUT DE MIREILLE
# ===========================================================================

def test_le_code_saisi_gagne_contre_un_cookie_etranger(attacher):
    """LE CAS EXACT : cookie d'un autre affilie, code « lola10 » a la caisse.

    C'est Lola qui doit etre payee : c'est sa remise que la cliente a obtenue.
    """
    commande = _commande(code_coupon="lola10")
    requete = FausseRequete({COOKIE: "AUTRE50"})

    asyncio.run(attacher(commande, requete))

    assert commande["affiliate_id"] == "aff-lola"
    assert commande["affiliate_code"] == "LOLA10"
    assert commande["affiliate_source"] == "code"


def test_le_cookie_ne_touche_rien_quand_un_code_est_saisi(attacher):
    """Meme avec un cookie tres ancien, le code du jour fait foi."""
    commande = _commande(code_coupon="LOLA10")
    asyncio.run(attacher(commande, FausseRequete({COOKIE: "FITNES70"})))
    assert commande["affiliate_id"] == "aff-lola"


# ===========================================================================
# CE QUI NE DOIT PAS AVOIR CHANGE
# ===========================================================================

def test_le_cookie_reste_le_repli_sans_code(attacher):
    """Le cas le plus frequent : on arrive par un lien et on ne tape rien."""
    commande = _commande(code_coupon=None)
    asyncio.run(attacher(commande, FausseRequete({COOKIE: "AUTRE50"})))
    assert commande["affiliate_id"] == "aff-autre"
    assert commande["affiliate_source"] == "click"


def test_un_alias_actif_attribue_au_titulaire(attacher):
    """L'alias paie l'affilie parent, sinon le rabais part sans contrepartie."""
    commande = _commande(code_coupon="FITNES100")
    asyncio.run(attacher(commande, FausseRequete()))
    assert commande["affiliate_id"] == "aff-alias"


def test_la_casse_n_a_aucune_importance(attacher):
    """On tape « lola10 » en minuscules ; le code est stocke en majuscules."""
    for saisie in ("lola10", "LOLA10", "Lola10", "  lola10  "):
        commande = _commande(code_coupon=saisie)
        asyncio.run(attacher(commande, FausseRequete()))
        assert commande["affiliate_id"] == "aff-lola", saisie


def test_sans_code_ni_cookie_personne_n_est_paye(attacher):
    """Pas d'acte d'apport sur la commande, pas de commission."""
    commande = _commande(code_coupon=None)
    asyncio.run(attacher(commande, FausseRequete()))
    assert "affiliate_id" not in commande


def test_un_code_inconnu_ne_retombe_pas_sur_le_cookie(attacher):
    """LA REGLE LA PLUS SUBTILE, et celle qui protege du defaut d'origine.

    Une cliente tape un code qui n'existe pas (faute de frappe, code
    desactive). Retomber sur le cookie paierait un affilie que personne n'a
    invoque, sur une commande ou le client a explicitement nomme quelqu'un
    d'autre. On n'attribue rien : mieux vaut une commission manquante,
    qu'on peut corriger, qu'une commission versee a tort.
    """
    commande = _commande(code_coupon="CODEQUINEXISTEPAS")
    asyncio.run(attacher(commande, FausseRequete({COOKIE: "AUTRE50"})))
    assert "affiliate_id" not in commande


def test_un_affilie_suspendu_n_est_jamais_paye(attacher, monkeypatch):
    """Le filtre status=active tient, quelle que soit la source."""
    from services import affiliate as mod
    monkeypatch.setattr(
        mod.s, "db",
        FausseBase([{"id": "aff-off", "code": "OFF10",
                     "status": "suspended", "aliases": []}]),
        raising=False,
    )
    commande = _commande(code_coupon="OFF10")
    asyncio.run(mod.affiliate_attach_to_order(commande, FausseRequete()))
    assert "affiliate_id" not in commande
