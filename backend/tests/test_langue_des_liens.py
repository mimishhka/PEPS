"""Chaque lien envoye par courriel porte la langue du courriel.

MIREILLE, 01/10/2026 : « si je choisis une langue pour mon affilie, il
recevra le courriel dans la langue demandee, sauf que le lien ne redirige pas
vraiment vers la page dans la bonne langue — pareil lorsque la personne
utilise le lien magique pour se connecter ».

Les liens ne portaient aucune langue, et le frontend ne lisait que la
preference rangee dans le navigateur, avec l'anglais par defaut. Un affilie
francophone qui n'avait jamais visite le site n'avait donc rien en memoire :
courriel en francais, page en anglais. Le defaut touchait TOUS les liens
envoyes par courriel, pas seulement les deux remarques.

Sur telephone c'est plus net encore : un lien ouvert depuis Gmail ou Mail
s'affiche dans un navigateur integre, un contexte de stockage NEUF ou la
preference est forcement vide. Le parametre d'URL est alors la seule chose
qui survive au passage du courriel a la page.
"""
import importlib
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def mod(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://fironova.example")
    import server
    return importlib.reload(server)


BASE = "https://fironova.example"


# ===========================================================================
# LE CAS DE MIREILLE
# ===========================================================================

def test_un_lien_d_invitation_porte_le_francais(mod):
    lien = mod._lien_localise(f"{BASE}/affiliate/join?token=abc", "fr")
    assert lien == f"{BASE}/affiliate/join?token=abc&lang=fr"


def test_un_lien_magique_porte_l_anglais(mod):
    lien = mod._lien_localise(f"{BASE}/auth/callback?token=abc", "en")
    assert lien == f"{BASE}/auth/callback?token=abc&lang=en"


def test_le_jeton_reste_intact(mod):
    """La langue s'ajoute, elle ne remplace rien : un jeton abime rendrait le
    lien inutilisable, ce qui serait bien pire que la mauvaise langue."""
    lien = mod._lien_localise(f"{BASE}/affiliate/join?token=aB3-_x.9", "fr")
    assert "token=aB3-_x.9" in lien


# ===========================================================================
# LA FORME DU LIEN
# ===========================================================================

def test_un_lien_sans_parametre_recoit_un_point_d_interrogation(mod):
    """Tous les liens actuels portent un jeton, donc un « & ». Mais un « & »
    orphelin sur un lien sans parametre produirait une URL que certains
    clients de courriel coupent — le test garde la distinction."""
    assert mod._lien_localise(f"{BASE}/affiliate/programme", "fr") == \
        f"{BASE}/affiliate/programme?lang=fr"


def test_un_seul_point_d_interrogation(mod):
    for langue in ("fr", "en"):
        lien = mod._lien_localise(f"{BASE}/auth/callback?token=abc", langue)
        assert lien.count("?") == 1


def test_le_lien_reste_une_URL_valide(mod):
    lien = mod._lien_localise(f"{BASE}/affiliate/join?token=abc", "fr")
    assert re.fullmatch(r"https://[\w.\-]+/[\w/\-]+\?token=\w+&lang=(fr|en)", lien)


# ===========================================================================
# LES ENTREES QU'ON NE MAITRISE PAS
# ===========================================================================

def test_fr_CA_vaut_fr(mod):
    """La fiche d'un affilie peut porter un code regional."""
    assert mod._lien_localise(f"{BASE}/x?t=1", "fr-CA").endswith("lang=fr")


def test_la_casse_n_a_pas_d_importance(mod):
    assert mod._lien_localise(f"{BASE}/x?t=1", "FR").endswith("lang=fr")
    assert mod._lien_localise(f"{BASE}/x?t=1", "  En  ").endswith("lang=en")


@pytest.mark.parametrize("langue", [None, "", "   ", "de", "espagnol", "x", 0])
def test_une_langue_inconnue_laisse_le_lien_INTACT(mod, langue):
    """On n'invente pas une langue. Un lien sans parametre retombe sur le
    comportement d'avant — la preference du navigateur, puis le repli — ce qui
    est exactement ce qu'on veut quand on ne sait pas."""
    lien = f"{BASE}/affiliate/join?token=abc"
    assert mod._lien_localise(lien, langue) == lien


def test_aucune_exception_sur_une_entree_hostile(mod):
    """Un envoi de courriel ne doit jamais echouer sur ce detail : sans lien,
    l'affilie ne peut pas adherer du tout."""
    for valeur in (None, 0, [], {}, object()):
        assert mod._lien_localise(f"{BASE}/x", valeur) == f"{BASE}/x"


# ===========================================================================
# LES DIX SITES D'ENVOI
# ===========================================================================

def test_plus_aucun_lien_de_courriel_sans_langue(mod):
    """FILET SUR LE CODE SOURCE, et non sur le comportement.

    Les dix liens sont construits dans dix endroits differents de server.py.
    En oublier un ne casse rien de visible : le courriel part, le lien marche,
    et seule la langue est fausse — exactement le defaut qu'on vient de
    corriger, qui a vecu sans que personne le voie.

    Ce test lit donc le fichier. Si un onzieme lien de courriel apparait sans
    passer par _lien_localise, il echoue.
    """
    chemin = os.path.join(os.path.dirname(__file__), "..", "server.py")
    with open(chemin, encoding="utf-8") as f:
        lignes = f.readlines()

    # Les liens de PAGE envoyes par courriel. `share_url` est exclu : c'est le
    # lien d'affiliation que l'affilie copie lui-meme depuis son tableau de
    # bord, pas un lien de courriel — la langue y est celle du visiteur.
    motif = re.compile(
        r'f"\{base\}/(auth/callback|reset-password|staff-accept'
        r'|affiliate/join|affiliate/programme)')
    oublis = []
    for n, ligne in enumerate(lignes, 1):
        if not motif.search(ligne):
            continue
        # L'appel peut etre sur la ligne precedente quand l'expression est
        # coupee pour la longueur.
        contexte = ligne + (lignes[n - 2] if n >= 2 else "")
        if "_lien_localise" not in contexte:
            oublis.append("%d: %s" % (n, ligne.strip()))

    assert not oublis, "lien(s) de courriel sans langue :\n" + "\n".join(oublis)
