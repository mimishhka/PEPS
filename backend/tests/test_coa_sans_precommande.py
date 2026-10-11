# -*- coding: utf-8 -*-
"""Un certificat manquant n'est pas une rupture de stock.

MIREILLE, 11/10/2026 : « j'ai rajoute du BPC-157 mais pour lequel je n'ai pas
encore de COA. Il sort en precommande comme s'il n'etait pas en stock [...]
on veut permettre a ceux qui ne se soucient pas du COA de commander, mais il
faut un avertissement, et il ne faut pas que la commande soit traitee comme
une precommande. »

CE QUE « TRAITEE COMME UNE PRECOMMANDE » COUTAIT VRAIMENT :

  - le prix de precommande remplacait le prix normal ;
  - la commande etait SCINDEE en deux, ce qui fabrique la sous-commande
    « -P » a 0,00 $ que la cliente prend pour une erreur de facturation ;
  - le stock n'etait pas debite ;
  - et surtout la verification de liberation refusait de laisser partir
    l'envoi TANT QUE LE CERTIFICAT N'ETAIT PAS TELEVERSE, stock en main.
    Le colis ne serait jamais parti.

Le dernier point est le plus grave et le plus silencieux : rien ne l'aurait
signale. La commande serait restee « en attente » sans raison visible.

La regle vivait a SEPT endroits — trois ici, quatre cote client. Elle n'en a
plus qu'un de chaque cote, et ces tests tiennent celui du serveur.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import server  # noqa: E402


def variante(**champs):
    base = {
        "id": "v1", "name": "5mg", "price": 64.99, "preorder_price": 54.99,
        "stock": 12, "preorder_enabled": True,
        "badge_coming_soon": False, "badge_coa_pending": False,
        "coa_status": "none",
    }
    base.update(champs)
    return base


class TestLeCertificatNeDecidePlus:
    def test_le_cas_de_mireille_du_stock_et_pas_de_certificat(self):
        """Du BPC-157 en tablette, dont le certificat n'est pas encore la."""
        v = variante(stock=12, badge_coa_pending=True, coa_status="pending")
        assert server.precommande_requise(v, 1) is False
        assert server.coa_en_attente(v) is True

    def test_elle_se_vend_au_prix_NORMAL_et_non_au_prix_de_precommande(self):
        # 64,99 $ et non 54,99 $. Le lot est en stock : il n'y a aucune
        # raison de le brader comme une commande a l'avance.
        v = variante(stock=12, badge_coa_pending=True, coa_status="pending")
        prix = server._variant_effective_price(v, server.precommande_requise(v, 1))
        assert prix == 64.99

    def test_le_certificat_seul_ne_force_rien_meme_a_grande_quantite(self):
        v = variante(stock=50, badge_coa_pending=True)
        assert server.precommande_requise(v, 30) is False

    def test_coa_status_pending_compte_autant_que_le_vieux_drapeau(self):
        # Deux champs disent la meme chose depuis la migration. L'un comme
        # l'autre doit declencher l'avertissement, et aucun la precommande.
        for v in [variante(badge_coa_pending=True, coa_status="none"),
                  variante(badge_coa_pending=False, coa_status="pending")]:
            assert server.coa_en_attente(v) is True
            assert server.precommande_requise(v, 1) is False


class TestCeQuiResteUneVraiePrecommande:
    def test_LE_STOCK_INSUFFISANT_oui(self):
        v = variante(stock=2)
        assert server.precommande_requise(v, 5) is True

    def test_stock_a_zero_oui(self):
        assert server.precommande_requise(variante(stock=0), 1) is True

    def test_BIENTOT_DISPONIBLE_oui_meme_avec_du_stock(self):
        # Le produit n'existe pas encore en tablette : la precommande garde
        # tout son sens, contrairement au certificat.
        v = variante(stock=30, badge_coming_soon=True)
        assert server.precommande_requise(v, 1) is True

    def test_les_deux_ensemble_restent_une_precommande(self):
        v = variante(stock=0, badge_coa_pending=True)
        assert server.precommande_requise(v, 1) is True

    def test_sans_precommande_activee_jamais(self):
        # Une variante qui n'autorise pas la precommande ne doit jamais y
        # basculer : c'est la caisse qui refusera, faute de stock.
        for v in [variante(preorder_enabled=False, stock=0),
                  variante(preorder_enabled=False, badge_coming_soon=True),
                  variante(preorder_enabled=False, badge_coa_pending=True)]:
            assert server.precommande_requise(v, 1) is False


class TestLesBordsNeFontPasTomber:
    def test_une_variante_vide_ou_absente(self):
        for v in [None, {}, {"preorder_enabled": True}]:
            assert server.precommande_requise(v, 1) in (True, False)
            assert server.coa_en_attente(v) is False

    def test_une_quantite_absurde_vaut_au_moins_un(self):
        v = variante(stock=1)
        for qte in [0, -3, None]:
            assert server.precommande_requise(v, qte) is False

    def test_un_stock_en_texte_ne_fait_pas_tomber(self):
        assert server.precommande_requise(variante(stock="0"), 1) is True
