# -*- coding: utf-8 -*-
"""Le controle d'avant-lancement.

Le 2026-09-22, la boutique annoncait « paiement requis sous 12 heures »
au-dessus d'un compte a rebours qui disait 1 h 59, alors que les conditions
publiees promettent trente minutes. Trois chiffres, trois sources, et aucun
moyen de s'en apercevoir sans ouvrir le code.

Ce script existe pour que l'ecart entre CE QU'ON PROMET et CE QU'ON APPLIQUE
ne puisse plus passer inapercu.
"""
import importlib
import os
import pathlib
import sys

import pytest

SCRIPTS = pathlib.Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))


@pytest.fixture
def controle():
    import pret_pour_lancement as module
    return importlib.reload(module)


# ---------------------------------------- ce que les pages promettent -------

def test_les_pages_publiques_promettent_trente_minutes(controle):
    # Lu dans le code des pages, pas recopie : une quatrieme copie du chiffre
    # serait une quatrieme occasion de diverger.
    promesses = controle.minutes_promises()

    assert promesses, "aucune page publique lue"
    for nom, valeurs in promesses.items():
        assert valeurs == {30}, f"{nom} annonce {valeurs}"


def test_les_autres_durees_des_pages_ne_sont_pas_ramassees(controle):
    # Les memes pages parlent de 24 h (expedition) et 48 h (remboursement).
    # Une lecture large les ramassait, et un serveur regle a 24 h serait passe
    # pour coherent parce que le nombre existait quelque part.
    promesses = controle.minutes_promises()
    toutes = {v for valeurs in promesses.values() for v in valeurs}

    assert 1440 not in toutes
    assert 2880 not in toutes


# ------------------------------------------- l'accord, et le desaccord ------

def test_un_reglage_conforme_passe(controle):
    etat, _ = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "0.5"},
                                      {"Compliance.jsx": {30}})
    assert etat == controle.VERT


def test_le_mode_test_bloque_le_lancement(controle):
    # Deux heures, c'est la valeur de travail de mode_test.py.
    etat, detail = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "2"},
                                           {"Compliance.jsx": {30}})
    assert etat == controle.ROUGE
    assert "120" in detail and "30" in detail


def test_un_nombre_present_ailleurs_ne_fait_pas_accord(controle):
    # Le piege exact : 24 h apparait dans la page, mais pas dans la phrase du
    # paiement. Il ne doit pas valider un serveur regle a 24 h.
    etat, _ = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "24"},
                                      {"Compliance.jsx": {30}})
    assert etat == controle.ROUGE


def test_une_valeur_illisible_est_refusee(controle):
    etat, detail = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "bientot"}, {})
    assert etat == controle.ROUGE
    assert "illisible" in detail


def test_un_reglage_absent_renvoie_au_defaut_du_code(controle):
    etat, detail = controle.verifier_delai({}, {"Compliance.jsx": {30}})
    assert etat == controle.JAUNE
    assert "30" in detail


def test_des_pages_illisibles_ne_fabriquent_pas_un_accord(controle):
    # Si la formulation change, on le DIT, au lieu d'inventer un accord.
    etat, detail = controle.verifier_delai({"UNPAID_ORDER_TTL_HOURS": "2"}, {})
    assert etat == controle.JAUNE
    assert "la main" in detail


# ------------------------------------------- les valeurs de reference -------

def test_les_valeurs_normales_viennent_de_mode_test(controle):
    # Les redeclarer ici les ferait diverger le jour ou l'une change, et ce
    # script existe precisement pour empecher deux verites de coexister.
    assert controle.NORMALES["UNPAID_ORDER_TTL_HOURS"] == "0.5"
    assert controle.NORMALES["AFFILIATE_APPROVAL_HOLD_DAYS"] == "7"
    assert controle.TEST["UNPAID_ORDER_TTL_HOURS"] == "2"


def test_sans_env_le_script_ne_pretend_rien(controle, tmp_path, monkeypatch):
    # Lance sur une machine de developpement, il doit dire qu'il n'est pas a
    # sa place, pas conclure que tout va bien.
    monkeypatch.setattr(controle, "ENV", tmp_path / "absent")

    assert controle.principal() == 1


# --------------------------------- les secrets qui se desactivent en silence -

def _rapport(controle, env_texte, tmp_path, monkeypatch):
    """Lance le controle sur un .env fabrique et renvoie sa sortie."""
    import contextlib
    import io
    fichier = tmp_path / ".env"
    fichier.write_text(env_texte, encoding="utf-8")
    monkeypatch.setattr(controle, "ENV", fichier)
    tampon = io.StringIO()
    with contextlib.redirect_stdout(tampon):
        code = controle.principal()
    return tampon.getvalue(), code


def _etat(rapport, motif):
    """L'etat affiche sur la ligne qui contient `motif`."""
    for ligne in rapport.splitlines():
        if motif in ligne:
            return ligne.split("]")[0].strip("[ ").strip()
    return None


COMPLET = "ADMIN_GATE_CODE=1234\nNOWPAYMENTS_API_KEY=cle\nNOWPAYMENTS_IPN_SECRET=secret\n"


def test_les_deux_secrets_presents_passent(controle, tmp_path, monkeypatch):
    rapport, _ = _rapport(controle, COMPLET, tmp_path, monkeypatch)

    assert _etat(rapport, "ADMIN_GATE_CODE") == controle.VERT
    assert _etat(rapport, "NOWPAYMENTS_IPN_SECRET") == controle.VERT


def test_la_porte_admin_absente_se_signale_sans_bloquer(controle, tmp_path, monkeypatch):
    # `admin_gate_verify` renvoie {ok: true} des que la variable est vide :
    # la porte s'ouvre alors SANS code, en silence. Mais ne pas avoir de porte
    # est un choix defendable — il doit etre CHOISI, pas subi.
    sans_porte = "NOWPAYMENTS_API_KEY=cle\nNOWPAYMENTS_IPN_SECRET=secret\n"
    rapport, _ = _rapport(controle, sans_porte, tmp_path, monkeypatch)

    assert _etat(rapport, "ADMIN_GATE_CODE") == controle.JAUNE
    assert "SANS code" in rapport


def test_la_crypto_sans_secret_IPN_bloque(controle, tmp_path, monkeypatch):
    # Aucune lecture valable : le webhook repond 503 a chaque appel, donc
    # AUCUN paiement crypto n'est jamais confirme. Le client paie, la commande
    # reste en attente, puis s'annule au delai.
    sans_secret = "ADMIN_GATE_CODE=1234\nNOWPAYMENTS_API_KEY=cle\n"
    rapport, _ = _rapport(controle, sans_secret, tmp_path, monkeypatch)

    assert _etat(rapport, "NOWPAYMENTS_IPN_SECRET") == controle.ROUGE
    assert "503" in rapport


def test_sans_crypto_le_secret_IPN_ne_manque_a_personne(controle, tmp_path, monkeypatch):
    # Exiger un secret pour un moyen de paiement qu'on n'offre pas ferait
    # echouer le controle sur une absence sans consequence — et un controle
    # qui crie pour rien s'apprend a etre ignore.
    sans_crypto = "ADMIN_GATE_CODE=1234\n"
    rapport, _ = _rapport(controle, sans_crypto, tmp_path, monkeypatch)

    assert _etat(rapport, "NOWPAYMENTS_IPN_SECRET") == controle.VERT
    assert "le paiement crypto l'est aussi" in rapport


def test_aucun_secret_n_est_affiche(controle, tmp_path, monkeypatch):
    # Le script dit si une valeur est presente, JAMAIS laquelle : ce fichier
    # contient les identifiants de production.
    rapport, _ = _rapport(controle, COMPLET, tmp_path, monkeypatch)

    assert "1234" not in rapport
    assert "secret" not in rapport.replace("IPN_SECRET", "").replace("SECRETS", "")
