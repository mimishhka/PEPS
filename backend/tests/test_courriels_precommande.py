"""Le courriel parle enfin des precommandes.

MIREILLE, 30/09/2026 : « il n'y a pas de notification pour le client ». Le mot
« precommande » n'apparaissait dans AUCUN courriel — `services/mail.py` ne le
contenait pas une seule fois.

C'est pourtant la seule trace que le client CONSERVE : il peut y revenir dans
trois semaines pour savoir ce qu'il attend. Un courriel muet rendait la
precommande invisible partout ou elle comptait, et la liberation, quand elle
arrivait enfin, ne prevenait personne.
"""
import asyncio
import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def mail(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://fironova.example")
    import server  # noqa: F401  — construit la chaine d'imports
    from services import mail as module
    return importlib.reload(module)


def ligne(slug, **surcharge):
    doc = {"product_id": f"p-{slug}", "slug": slug, "name_en": slug,
           "name_fr": slug, "qty": 1, "price_cad": 60.0, "line_total": 60.0}
    doc.update(surcharge)
    return doc


def commande(lignes, **surcharge):
    doc = {
        "id": "cmd-1", "order_number": "FN-1", "email": "cliente@example.com",
        "lang": "fr", "items": lignes,
        "subtotal": 140.0, "discount": 0.0, "shipping": 20.0, "total": 160.0,
        "shipping_address": {"full_name": "Lola", "city": "Montréal"},
    }
    doc.update(surcharge)
    return doc


def rendre(mail, cmd, bloc="items"):
    return mail._render_block(bloc, "fr", cmd)


MIXTE = [ligne("creatine"), ligne("bpc157", preorder=True, fulfilled_by_order_id="cmd-2")]


# ===========================================================================
# LE RECAPITULATIF
# ===========================================================================

def test_une_ligne_en_precommande_est_nommee(mail):
    corps = rendre(mail, commande([ligne("creatine"), ligne("bpc157", preorder=True)]))
    assert "précommande" in corps.lower()


def test_une_ligne_partie_ailleurs_le_dit(mail):
    """Distinction utile : cette ligne reste sur la facture, mais elle voyage
    dans l'autre colis. « Precommande » serait moins precis."""
    corps = rendre(mail, commande(MIXTE, suite_order_number="FN-1-P"))
    assert "second envoi" in corps.lower()


def test_LE_CAS_DE_MIREILLE_l_avis_de_deux_envois(mail):
    corps = rendre(mail, commande(MIXTE, suite_order_number="FN-1-P"))
    assert "Deux envois" in corps
    assert "FN-1-P" in corps
    # Les deux craintes a desamorcer : payer encore, et payer le port.
    assert "déjà payé" in corps
    assert "sans frais" in corps


def test_aucun_avis_sur_une_commande_ordinaire(mail):
    """La tres grande majorite des commandes : rien ne doit changer pour
    elles."""
    corps = rendre(mail, commande([ligne("creatine"), ligne("magnesium")]))
    assert "Deux envois" not in corps
    assert "précommande" not in corps.lower()


def test_aucun_avis_si_TOUT_est_en_precommande(mail):
    """Une commande entierement en precommande n'est PAS scindee — il n'y
    aurait rien a expedier maintenant. Annoncer deux envois ferait attendre un
    colis qui ne viendrait jamais."""
    corps = rendre(mail, commande([ligne("bpc157", preorder=True),
                                   ligne("tb500", preorder=True)]))
    assert "Deux envois" not in corps
    # Les lignes restent marquees : ca, c'est vrai.
    assert "précommande" in corps.lower()


def test_l_avis_tient_sans_numero_de_suite(mail):
    """Le courriel de confirmation part AVANT le paiement, donc avant la
    scission : le numero de l'envoi de suite n'existe pas encore. La phrase
    doit rester juste, sans reference vide ni parenthese orpheline."""
    corps = rendre(mail, commande([ligne("creatine"), ligne("bpc157", preorder=True)]))
    assert "Deux envois" in corps
    assert "()" not in corps


# ===========================================================================
# LE GABARIT DE LIBERATION
# ===========================================================================

def test_le_gabarit_de_liberation_existe(mail):
    tpl = mail.EMAIL_TEMPLATE_CATALOG.get("preorder_released")
    assert tpl, "le gabarit preorder_released est absent du catalogue"
    for champ in ("subject_fr", "subject_en", "heading_fr", "heading_en",
                  "body_fr", "body_en"):
        assert tpl["default"].get(champ), champ


def test_le_texte_durable_est_EDITABLE_depuis_OPS(mail):
    """L'ecran OPS n'edite que subject / heading / body / cta. Mettre le
    message important dans `intro` ou `outro` le rendrait intouchable sans
    passer par le code — ce qui est precisement ce qu'on veut eviter pour un
    texte que Mireille voudra retoucher."""
    d = mail.EMAIL_TEMPLATE_CATALOG["preorder_released"]["default"]
    for langue in ("fr", "en"):
        corps = d[f"body_{langue}"].lower()
        assert "paid" in corps or "payé" in corps, langue


def test_le_gabarit_montre_ce_qui_arrive(mail):
    """Bloc « items » : le client a commande il y a des semaines et ne se
    souvient plus forcement de ce qu'il attend."""
    assert mail.EMAIL_TEMPLATE_CATALOG["preorder_released"]["block"] == "items"


def test_une_clef_d_URL_de_commande_existe_enfin(mail):
    """Aucun contexte ne pointait vers une commande : les gabarits ne
    pouvaient offrir que le catalogue ou le panier. Quelqu'un qui attend une
    precommande depuis six semaines veut precisement ce lien-la."""
    _, _, ctx = mail._order_ctx(commande([ligne("creatine")]))
    assert "/order/cmd-1" in ctx["order_url"]


def test_les_liens_du_courriel_portent_SA_langue(mail):
    """MIREILLE, 01/10/2026 : « le lien ne redirige pas vraiment vers la page
    dans la bonne langue ».

    Meme defaut que les liens d'invitation : un courriel en francais dont le
    bouton « Voir ma commande » ouvre une page en anglais. Le lecteur n'a rien
    demande d'autre que de suivre le lien qu'on lui a envoye.
    """
    _, _, ctx = mail._order_ctx(commande([ligne("creatine")], lang="fr"))
    for clef in ("order_url", "catalog_url", "cart_url"):
        assert ctx[clef].endswith("lang=fr"), clef

    _, _, ctx = mail._order_ctx(commande([ligne("creatine")], lang="en"))
    for clef in ("order_url", "catalog_url", "cart_url"):
        assert ctx[clef].endswith("lang=en"), clef


def test_l_envoi_ne_leve_pas_sans_adresse(mail, monkeypatch):
    """La liberation ne doit jamais echouer parce qu'une commande ancienne n'a
    pas de courriel."""
    appels = []
    monkeypatch.setattr(mail.s, "send_template_email",
                        lambda *a, **k: appels.append(a), raising=False)
    asyncio.run(mail.send_preorder_released(commande([ligne("creatine")], email="")))
    assert appels == []
