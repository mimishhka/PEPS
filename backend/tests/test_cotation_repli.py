"""La cotation ne doit plus abandonner l'ancienne API quand la nouvelle se tait.

Mireille : « le cout estime fonctionnait AVANT pour l'adresse a la commande ».
C'etait une regression, datee : le commit dff862f du 2026-09-19.

AVANT, _canada_post_get_rates allait droit a l'ancienne API (rate-v4) des que
la cle, le numero de client et le code postal d'origine etaient presents.

APRES, _cp_source_tarifs prefere le nouveau portail des que des cles OAuth
existent, avec une regle ecrite noir sur blanc : « pas de repli silencieux de
l'un vers l'autre ». L'intention etait bonne — une erreur ne doit pas se
cacher. La consequence ne l'etait pas : des cles OAuth presentes mais NON
HABILITEES a la cotation faisaient abandonner l'ancienne API, qui fonctionnait.
Le cout estime de Dispatch tombait a zero, sans un mot.

Le repli est rendu, mais il reste bruyant : il se journalise, et la source qui a
repondu est exposee pour que l'ecran puisse la nommer.
"""
import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

DEVIS = [{"carrier": "Canada Post", "service_code": "DOM.EP",
          "service_name": "Expedited Parcel", "cost_cad": 14.22, "eta_days": 2}]


@pytest.fixture
def cp(monkeypatch):
    """Le module de cotation importe le serveur, qui exige ses reglages des
    l'import. On les pose comme les autres tests unitaires du projet."""
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    # L IMPORT DU SERVEUR D ABORD. services.canada_post importe server, qui
    # reimporte canada_post : importer le second directement laisse le premier
    # a moitie construit et l import echoue sur un repli inutile. On charge le
    # serveur, qui construit la chaine dans le bon ordre, puis on prend le
    # module par lequel on voulait passer.
    import server  # noqa: F401
    from services import canada_post
    return canada_post


class Reglages:
    """Les seuls reglages que la cotation consulte."""
    def __init__(self, oauth=False, legacy=False):
        self.CANADA_POST_ORIGIN_POSTAL_CODE = "H2X1Y4"
        self.CANADA_POST_OAUTH_CLIENT_ID = "id" if oauth else ""
        self.CANADA_POST_OAUTH_CLIENT_SECRET = "secret" if oauth else ""
        self.CANADA_POST_API_KEY = "cle" if legacy else ""
        self.CANADA_POST_CUSTOMER_NUMBER = "0000000000" if legacy else ""


def coter(cp, oauth_rend, legacy_rend, oauth=True, legacy=True):
    """Execute une cotation en controlant ce que chaque API repond."""
    with patch.object(cp, "s", Reglages(oauth=oauth, legacy=legacy)), \
         patch.object(cp, "_canada_post_get_rates_openapi",
                      AsyncMock(return_value=oauth_rend)), \
         patch.object(cp, "_canada_post_get_rates_legacy",
                      AsyncMock(return_value=legacy_rend)):
        devis = asyncio.run(cp._canada_post_get_rates("H2X1Y4", "CA", 0.5))
        return devis, cp._cp_derniere_source_tarifs()


def test_le_nouveau_portail_repond_on_s_arrete_la(cp):
    """Le comportement voulu reste le comportement par defaut."""
    devis, source = coter(cp, oauth_rend=DEVIS, legacy_rend=[])
    assert devis == DEVIS
    assert source == "openapi"


def test_LA_REGRESSION_le_portail_se_tait_l_ancienne_api_prend_le_relais(cp):
    """LE COEUR DU DEFAUT. Des cles OAuth non habilitees a la cotation ne
    doivent plus faire perdre les tarifs : l'ancienne API repond."""
    devis, source = coter(cp, oauth_rend=[], legacy_rend=DEVIS)
    assert devis == DEVIS, "le repli n'a pas eu lieu : c'est la regression"
    assert source == "legacy-repli"


def test_le_repli_se_journalise(cp, caplog):
    """Le repli est rendu, mais il n'est PAS silencieux : sinon une cle OAuth
    cassee resterait cassee pour toujours, masquee par l'ancienne."""
    with caplog.at_level("WARNING"):
        coter(cp, oauth_rend=[], legacy_rend=DEVIS)
    assert any("repli" in m.lower() for m in caplog.messages), caplog.messages


def test_sans_ancienne_api_le_portail_vide_reste_vide(cp):
    """Pas d'invention : si rien ne peut coter, rien ne sort — et l'etat le dit."""
    devis, source = coter(cp, oauth_rend=[], legacy_rend=DEVIS, legacy=False)
    assert devis == []
    assert source == "openapi-vide"


def test_l_ancienne_api_seule_fonctionne_comme_avant(cp):
    """La configuration d'origine de la boutique : cle + numero de client."""
    devis, source = coter(cp, oauth_rend=[], legacy_rend=DEVIS, oauth=False)
    assert devis == DEVIS
    assert source == "legacy"


def test_les_deux_se_taisent_l_etat_le_dit(cp):
    devis, source = coter(cp, oauth_rend=[], legacy_rend=[])
    assert devis == []
    assert source == "aucune"


def test_sans_aucune_configuration_rien_n_est_appele(cp):
    devis, source = coter(cp, oauth_rend=DEVIS, legacy_rend=DEVIS,
                          oauth=False, legacy=False)
    assert devis == []
    assert source is None
