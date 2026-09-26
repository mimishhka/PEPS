"""La cotation essaie les variantes plausibles, et dit le motif en clair.

Mireille : « mes cles sont bonnes, je ne vois pas pourquoi ca ne fonctionne pas,
il y a surement une erreur quelque part dans le code. »

Deux defauts empechaient meme de le savoir.

1. UNE SEULE FORME DE REQUETE ETAIT TENTEE. Les envois s'adressent a
   .../shipping/v1/{mailedBy}/{mobo}/shipments — les numeros de client sont
   DANS le chemin. La cotation appelait .../rating/v1/prices, sans eux. Et elle
   demandait un devis « commercial » des qu'un numero de client existait, meme
   sans contrat configure : deux inconnues qui s'additionnaient, sans moyen de
   les separer.

2. LE MOTIF DU REFUS ETAIT HACHE. L'erreur passait par _private_ref, qui la
   remplace par une empreinte de douze caracteres. Le corps d'une erreur de
   tarification decrit le refus — ce n'est pas une donnee de cliente. Le taire
   rendait le defaut indiagnosticable, ce qui est le contraire du but d'un
   journal.
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

TARIF = [{"serviceCode": "DOM.EP", "serviceName": "Expedited Parcel",
          "priceDetails": {"due": 14.22},
          "serviceStandard": {"expectedTransitTime": 2}}]


@pytest.fixture
def cp(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    import server  # noqa: F401  (l'ordre compte : voir test_cotation_repli)
    from services import canada_post
    canada_post._CP_VARIANTE_TARIFS = None  # chaque test part sans memoire
    canada_post._CP_ECHEC_TARIFS_JUSQUA = 0.0  # ni memoire d echec
    return canada_post


class Reponse:
    def __init__(self, status=200, corps=None, texte=""):
        self.status_code = status
        self._corps = corps
        self.text = texte

    def json(self):
        if self._corps is None:
            raise ValueError("pas du JSON")
        return self._corps


class Reglages:
    def __init__(self, client="0001306040", contrat="", mailed_by="", mobo=""):
        self.CANADA_POST_ORIGIN_POSTAL_CODE = "H2X1Y4"
        self.CANADA_POST_OPENAPI_RATING_URL = "https://api.test/rating/v1"
        self.CANADA_POST_CUSTOMER_NUMBER = client
        self.CANADA_POST_CONTRACT_ID = contrat
        self.CANADA_POST_MAILED_BY = mailed_by
        self.CANADA_POST_MOBO = mobo


def coter(cp, repondre, **reglages):
    """`repondre` recoit (url, corps) et rend une Reponse. Renvoie les devis
    et la liste des appels tentes, dans l'ordre."""
    appels = []

    # La signature suit celle de _cp_openapi_call, timeout compris : un double
    # qui refuse un argument que le vrai accepte fait echouer le test sur un
    # TypeError, et non sur ce qu il verifie.
    async def appel(methode, url, *, json_body=None, accept="application/json", timeout=45):
        appels.append((url, json_body, timeout))
        return repondre(url, json_body)

    with patch.object(cp, "s", Reglages(**reglages)), \
         patch.object(cp.s, "_cp_openapi_call", AsyncMock(side_effect=appel), create=True):
        devis = asyncio.run(cp._canada_post_get_rates_openapi("H2X1Y4", "CA", 0.5))
    return devis, appels


def test_le_tarif_commercial_est_demande_en_premier(cp):
    """C'est le cout REEL de la boutique : il passe avant tout le reste."""
    devis, appels = coter(cp, lambda url, corps: Reponse(200, TARIF))
    assert len(devis) == 1 and devis[0]["cost_cad"] == 14.22
    assert len(appels) == 1, "une seule tentative devait suffire"
    url, corps, delai = appels[0]
    assert corps["quoteType"] == "commercial"
    assert corps["customerNumber"] == "0001306040"


def test_le_chemin_avec_numeros_de_client_est_essaye(cp):
    """LE DEFAUT PRINCIPAL SOUPCONNE. Les envois mettent les numeros dans le
    chemin ; la cotation ne l'essayait jamais."""
    def repondre(url, corps):
        if "/0001306040/0001306040/prices" in url:
            return Reponse(200, TARIF)
        return Reponse(404, None, "not found")

    devis, appels = coter(cp, repondre, mailed_by="0001306040", mobo="0001306040")
    assert len(devis) == 1, "le chemin avec numeros de client n'a pas ete essaye"
    assert any("/0001306040/0001306040/prices" in u for u, _, _t in appels)


def test_le_contrat_est_retire_quand_il_fait_echouer(cp):
    """Un contrat mal configure ne doit pas couter tous les tarifs."""
    def repondre(url, corps):
        if "contractId" in (corps or {}):
            return Reponse(400, {"title": "Invalid contract"}, "")
        return Reponse(200, TARIF)

    devis, appels = coter(cp, repondre, contrat="CT-INEXISTANT")
    assert len(devis) == 1
    assert any("contractId" not in (c or {}) for _, c, _t in appels)


def test_le_comptoir_sert_de_dernier_recours_et_previent(cp, caplog):
    """A defaut de commercial, un tarif transporteur vaut mieux que rien — mais
    il n'est PAS le cout de la boutique, et le journal doit le crier."""
    def repondre(url, corps):
        if corps.get("quoteType") == "commercial":
            return Reponse(403, {"title": "Not entitled", "detail": "commercial rating not enabled"}, "")
        return Reponse(200, TARIF)

    with caplog.at_level("WARNING"):
        devis, _ = coter(cp, repondre)
    assert len(devis) == 1
    assert any("COMPTOIR" in m for m in caplog.messages), caplog.messages


def test_le_motif_du_refus_sort_EN_CLAIR(cp, caplog):
    """LE SECOND DEFAUT. L'erreur etait hachee : impossible de savoir ce que
    Postes Canada repondait. Le motif doit etre lisible."""
    def repondre(url, corps):
        return Reponse(403, {"title": "Not entitled",
                             "detail": "customer number not enabled for rating"}, "")

    with caplog.at_level("ERROR"):
        devis, _ = coter(cp, repondre)
    assert devis == []
    journal = " ".join(caplog.messages)
    assert "not enabled for rating" in journal, journal
    assert "403" in journal


def test_chaque_variante_est_tentee_avant_d_abandonner(cp):
    devis, appels = coter(cp, lambda url, corps: Reponse(500, None, "boom"),
                          contrat="CT-1", mailed_by="0001306040", mobo="0001306040")
    assert devis == []
    # commercial simple, commercial avec chemin, commercial sans contrat,
    # comptoir simple, comptoir avec chemin.
    assert len(appels) == 5, [u for u, _, _t in appels]


def test_la_variante_qui_marche_est_memorisee(cp):
    """Apres la premiere reussite, les appels suivants vont droit au but."""
    def repondre(url, corps):
        if corps.get("quoteType") == "commercial":
            return Reponse(403, {"title": "Not entitled"}, "")
        return Reponse(200, TARIF)

    devis, premiers = coter(cp, repondre)
    assert len(devis) == 1
    assert len(premiers) > 1, "la premiere fois, il faut chercher"
    devis, suivants = coter(cp, repondre)
    assert len(devis) == 1
    assert len(suivants) == 1, "la variante retenue doit passer d'abord"

def test_la_cotation_n_attend_pas_45_secondes(cp):
    """UN DEFAUT QUE J AI INTRODUIT. Les cinq variantes tournaient avec le delai
    des etiquettes — 45 secondes chacune — et ce balayage se refaisait PAR
    COMMANDE. Dix commandes qui echouent = des minutes d attente, et un ecran
    Dispatch inutilisable. Un devis n est pas une etiquette : 12 secondes."""
    _, appels = coter(cp, lambda url, corps: Reponse(200, TARIF))
    assert appels[0][2] == 12, f"delai de {appels[0][2]} s : trop long pour un devis"


def test_un_echec_recent_ne_relance_pas_le_balayage(cp):
    """L autre moitie du defaut : sans memoire de l echec, chaque commande du
    meme ecran relancait les cinq tentatives reseau."""
    appels_total = []

    def repondre(url, corps):
        appels_total.append(url)
        return Reponse(503, None, "indisponible")

    devis, premiers = coter(cp, repondre)
    assert devis == [] and len(premiers) >= 2, "le premier balayage doit tout essayer"
    compte = len(appels_total)

    # Deuxieme commande du meme ecran : aucune tentative reseau de plus.
    devis, suivants = coter(cp, repondre)
    assert devis == []
    assert suivants == [], "l echec memorise devait court-circuiter le balayage"
    assert len(appels_total) == compte
