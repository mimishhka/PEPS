"""Une commande mixte se scinde : le disponible part, la precommande suit.

MIREILLE, 30/09/2026 : « je crois que retenir la commande complete n'est pas
une bonne idee ».

Elle avait raison sur trois plans a la fois. Le stock etait GELE — les lignes
en stock sont decrementees des la caisse, donc la marchandise restait sur la
tablette, reservee, invendable, le temps que la precommande arrive. RIEN NE
PARTAIT — « preorder » ne figure dans aucune file de dispatch et il n'existe
pas d'expedition partielle. Et la COMMISSION de l'affilie etait versee sept
jours apres la commande, donc avant la livraison : argent sorti, marchandise
en entrepot.

Ces tests portent sur `_scinder_precommande` et sur le filtre de
`_order_items`. Ils tournent SANS serveur : la base est un double en memoire,
comme dans test_preorder_stock_h6.py.
"""
import asyncio
import importlib
import os
import sys
import types

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def mod(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://example.com")
    import server
    return importlib.reload(server)


class Resultat:
    def __init__(self, modified_count):
        self.modified_count = modified_count


class Commandes:
    """Les commandes, avec un `$set`/`$push` qui agit vraiment.

    Sans application reelle des mises a jour, le test ne verrait pas la
    difference entre « la mere a ete corrigee » et « la fonction a appele
    update_one avec quelque chose ».
    """

    def __init__(self, documents=None):
        self.documents = {d["id"]: dict(d) for d in (documents or [])}
        self.inserees = []

    async def insert_one(self, document):
        self.documents[document["id"]] = dict(document)
        self.inserees.append(dict(document))
        return types.SimpleNamespace(inserted_id=document["id"])

    async def find_one(self, filtre, projection=None):
        doc = self.documents.get(filtre.get("id"))
        return dict(doc) if doc else None

    async def update_one(self, filtre, update, **kwargs):
        doc = self.documents.get(filtre.get("id"))
        if not doc:
            return Resultat(0)
        # Le filtre porte parfois un garde de statut : on l'honore, sinon le
        # test « un envoi deja expedie n'est pas annule » ne prouverait rien.
        for champ, attendu in filtre.items():
            if champ == "id":
                continue
            if isinstance(attendu, dict) and "$nin" in attendu:
                if doc.get(champ) in attendu["$nin"]:
                    return Resultat(0)
            elif doc.get(champ) != attendu:
                return Resultat(0)
        doc.update(update.get("$set") or {})
        pousse = update.get("$push") or {}
        for champ, valeur in pousse.items():
            liste = list(doc.get(champ) or [])
            if isinstance(valeur, dict) and "$each" in valeur:
                liste.extend(valeur["$each"])
            else:
                liste.append(valeur)
            doc[champ] = liste
        return Resultat(1)


def ligne(nom, precommande, total=50.0):
    return {"product_id": f"p-{nom}", "variant_id": "v1", "slug": nom,
            "sku": nom.upper(), "name_fr": nom, "name_en": nom,
            "price_cad": total, "qty": 1, "line_total": total,
            "preorder": precommande, "weight_grams": 100.0}


def commande(lignes, **surcharge):
    doc = {
        "id": "cmd-1",
        "order_number": "FN-260930-ABCD1234",
        "user_id": "u-1",
        "email": "cliente@example.com",
        "items": lignes,
        "subtotal": round(sum(l["line_total"] for l in lignes), 2),
        "discount": 10.0,
        "tax": 0.0,
        "shipping": 20.0,
        "total": round(sum(l["line_total"] for l in lignes) - 10.0 + 20.0, 2),
        "currency": "CAD",
        "shipping_address": {"line1": "12 rue des Lilas", "city": "Montréal"},
        "payment_method": "interac",
        "payment_status": "paid",
        "payment_info": {"type": "interac", "instructions": {"reference": "FN-260930-ABCD1234"}},
        "fulfillment_status": "preorder",
        "has_preorder": True,
        "coupon": {"code": "LOLA10"},
        "affiliate_id": "aff-lola",
        "affiliate_code": "LOLA10",
        "affiliate_source": "code",
        "notes": [],
        "created_at": "2026-09-30T12:00:00+00:00",
        "paid_at": "2026-09-30T12:05:00+00:00",
        "compliance": {"confirm_age": True},
    }
    doc.update(surcharge)
    return doc


def brancher(mod, monkeypatch, cmd):
    base = types.SimpleNamespace(orders=Commandes([cmd]))
    monkeypatch.setattr(mod, "db", base, raising=False)
    return base


def scinder(mod, cmd):
    return asyncio.run(mod._scinder_precommande(cmd))


MIXTE = [ligne("creatine", False, 60.0), ligne("bpc157", True, 80.0)]


# ===========================================================================
# LE CAS DE MIREILLE
# ===========================================================================

def test_une_commande_mixte_produit_un_envoi_de_suite(mod, monkeypatch):
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)

    scinder(mod, cmd)

    assert len(base.orders.inserees) == 1
    enfant = base.orders.inserees[0]
    assert enfant["order_number"] == "FN-260930-ABCD1234-P"
    assert [it["slug"] for it in enfant["items"]] == ["bpc157"]
    assert enfant["fulfillment_status"] == "preorder"
    assert enfant["has_preorder"] is True
    assert enfant["payment_status"] == "paid"


def test_la_mere_part_maintenant(mod, monkeypatch):
    """Tout l'objet de la manoeuvre : elle entre dans le dispatch.

    Sans `has_preorder: False` et `processing`, elle resterait hors de toutes
    les files d'emballage — _mark_order_paid venait de la mettre en
    « preorder ».
    """
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)

    scinder(mod, cmd)

    mere = base.orders.documents["cmd-1"]
    assert mere["has_preorder"] is False
    assert mere["fulfillment_status"] == "processing"
    assert mere["dispatch_batch"]


def test_le_colis_de_la_mere_ne_contient_plus_la_precommande(mod, monkeypatch):
    """C'est _order_items qui ecarte la ligne — poids, boite, bordereau.

    Sans cela on facturerait un colis au poids d'un article absent, on
    choisirait une boite trop grande, et le bordereau enverrait chercher sur
    la tablette quelque chose qui n'y est plus.
    """
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)

    scinder(mod, cmd)
    mere = base.orders.documents["cmd-1"]

    assert [it["slug"] for it in mod._order_items(mere)] == ["creatine"]


def test_la_facture_de_la_mere_reste_complete(mod, monkeypatch):
    """La mere garde ses deux lignes ET ses totaux : c'est la facture.

    Recalculer ferait soit passer sous le seuil de livraison gratuite et
    ajouter vingt dollars non consentis, soit exiger un remboursement partiel.
    """
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    total_avant = cmd["total"]
    sous_total_avant = cmd["subtotal"]

    scinder(mod, cmd)
    mere = base.orders.documents["cmd-1"]

    assert len(mod._order_items_factures(mere)) == 2
    assert mere["total"] == total_avant
    assert mere["subtotal"] == sous_total_avant
    assert mere["shipping"] == 20.0
    assert mere["discount"] == 10.0


# ===========================================================================
# L'ENFANT N'EST PAS UN DOCUMENT FINANCIER
# ===========================================================================

def test_l_enfant_ne_porte_aucun_argent(mod, monkeypatch):
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    scinder(mod, cmd)
    enfant = base.orders.inserees[0]

    assert enfant["total"] == 0.0
    assert enfant["shipping"] == 0.0
    assert enfant["discount"] == 0.0
    # Le sous-total reste indicatif : un envoi a valeur nulle compliquerait une
    # declaration douaniere ou une reclamation a Postes Canada.
    assert enfant["subtotal"] == 80.0


def test_l_enfant_n_a_ni_coupon_ni_affilie(mod, monkeypatch):
    """Sinon le coupon serait compte deux fois et l'affilie paye deux fois.

    Une seule vente, un seul rabais, une seule commission.
    """
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    scinder(mod, cmd)
    enfant = base.orders.inserees[0]

    for champ in ("coupon", "affiliate_id", "affiliate_code", "affiliate_source"):
        assert champ not in enfant, champ


def test_l_enfant_ne_reclame_aucun_paiement(mod, monkeypatch):
    """Les instructions Interac de la mere ne se copient JAMAIS.

    Le client recevrait un ordre de paiement pour une commande deja reglee —
    et paierait peut-etre deux fois.
    """
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    scinder(mod, cmd)
    enfant = base.orders.inserees[0]

    assert enfant["payment_info"]["type"] == "preorder_suite"
    assert "instructions" not in enfant["payment_info"]
    assert enfant["payment_info"]["suite_of_order_id"] == "cmd-1"


def test_l_enfant_a_sa_propre_etiquette(mod, monkeypatch):
    """Deux colis, deux numeros de suivi. Copier celui de la mere ferait
    croire au client que son second envoi est arrive."""
    cmd = commande(list(MIXTE),
                   shipping_info={"carrier": "CPC", "tracking_number": "123",
                                  "shipped_at": "2026-09-30T13:00:00+00:00"})
    base = brancher(mod, monkeypatch, cmd)
    scinder(mod, cmd)
    enfant = base.orders.inserees[0]

    assert enfant["shipping_info"] == {"carrier": "", "tracking_number": "",
                                       "shipped_at": None}


def test_les_deux_commandes_se_retrouvent(mod, monkeypatch):
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    scinder(mod, cmd)

    mere = base.orders.documents["cmd-1"]
    enfant = base.orders.inserees[0]
    assert mere["suite_order_id"] == enfant["id"]
    assert mere["suite_order_number"] == enfant["order_number"]
    assert enfant["suite_of_order_id"] == "cmd-1"


def test_le_client_est_prevenu_sur_les_deux_commandes(mod, monkeypatch):
    """Une note visible de chaque cote : c'est la seule trace qu'il consulte.

    Deux commandes pour un paiement ressemblent sinon a un doublon ou a une
    erreur de facturation.
    """
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    scinder(mod, cmd)

    mere = base.orders.documents["cmd-1"]
    enfant = base.orders.inserees[0]
    visibles_mere = [n for n in mere["notes"] if n.get("visible_to_customer")]
    visibles_enfant = [n for n in enfant["notes"] if n.get("visible_to_customer")]
    assert len(visibles_mere) == 1
    assert len(visibles_enfant) == 1
    assert "déjà payé" in visibles_enfant[0]["text"].lower()


# ===========================================================================
# QUAND IL NE FAUT PAS SCINDER
# ===========================================================================

def test_une_commande_sans_precommande_n_est_pas_scindee(mod, monkeypatch):
    cmd = commande([ligne("creatine", False), ligne("magnesium", False)],
                   has_preorder=False, fulfillment_status="processing")
    base = brancher(mod, monkeypatch, cmd)

    scinder(mod, cmd)

    assert base.orders.inserees == []


def test_une_commande_TOUT_en_precommande_n_est_pas_scindee(mod, monkeypatch):
    """Il n'y aurait rien a expedier maintenant : scinder creerait une
    commande vide et un colis fantome."""
    cmd = commande([ligne("bpc157", True), ligne("tb500", True)])
    base = brancher(mod, monkeypatch, cmd)

    scinder(mod, cmd)

    assert base.orders.inserees == []


def test_une_commande_deja_scindee_ne_l_est_pas_deux_fois(mod, monkeypatch):
    cmd = commande(list(MIXTE), suite_order_id="deja-la")
    base = brancher(mod, monkeypatch, cmd)

    scinder(mod, cmd)

    assert base.orders.inserees == []


def test_deux_appels_ne_creent_qu_un_enfant(mod, monkeypatch):
    """_mark_order_paid est protege par un filtre atomique, mais la garde
    explicite ferme le sujet — et c'est de l'argent."""
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)

    rafraichie = scinder(mod, cmd)
    scinder(mod, rafraichie)

    assert len(base.orders.inserees) == 1


# ===========================================================================
# CE QUE LES APPELANTS RECOIVENT
# ===========================================================================

def test_la_commande_rendue_est_a_jour(mod, monkeypatch):
    """Sept appelants se servent de l'objet que _mark_order_paid leur rend.

    Le rendre perime les ferait travailler sur une commande qui dit encore
    « preorder » alors qu'elle vient de passer en preparation.
    """
    cmd = commande(list(MIXTE))
    brancher(mod, monkeypatch, cmd)

    rafraichie = scinder(mod, cmd)

    assert rafraichie["fulfillment_status"] == "processing"
    assert rafraichie["has_preorder"] is False
    assert rafraichie["suite_order_id"]


# ===========================================================================
# LE FILTRE DE _order_items
# ===========================================================================

def test_order_items_ecarte_les_lignes_deplacees(mod):
    cmd = {"items": [ligne("creatine", False),
                     {**ligne("bpc157", True), "fulfilled_by_order_id": "enfant-1"}]}
    assert [it["slug"] for it in mod._order_items(cmd)] == ["creatine"]
    assert len(mod._order_items_factures(cmd)) == 2


def test_order_items_ne_change_rien_a_une_commande_ordinaire(mod):
    """Filet : le filtre ne doit toucher aucune commande existante."""
    cmd = {"items": [ligne("creatine", False), ligne("bpc157", True)]}
    assert len(mod._order_items(cmd)) == 2


def test_order_items_accepte_encore_line_items(mod):
    """Compatibilite conservee : d'anciennes commandes portent cette clef."""
    cmd = {"line_items": [ligne("creatine", False)]}
    assert len(mod._order_items(cmd)) == 1
    assert len(mod._order_items_factures(cmd)) == 1


def test_le_poids_du_colis_exclut_la_precommande(mod, monkeypatch):
    """La consequence concrete : le port ne se calcule pas sur un absent."""
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    poids_avant = mod._order_weight_kg(cmd)

    scinder(mod, cmd)
    mere = base.orders.documents["cmd-1"]

    assert mod._order_weight_kg(mere) < poids_avant


# ===========================================================================
# ANNULATION
# ===========================================================================

def test_annuler_la_mere_annule_l_envoi_de_suite(mod, monkeypatch):
    """Sinon l'envoi reste orphelin, et le chien de garde de liberation
    l'expedierait un jour a quelqu'un qui a ete rembourse."""
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    mere = scinder(mod, cmd)
    enfant_id = mere["suite_order_id"]

    asyncio.run(mod._annuler_envoi_de_suite(mere))

    enfant = base.orders.documents[enfant_id]
    assert enfant["fulfillment_status"] == "cancelled"
    assert enfant["payment_status"] == "cancelled"
    assert enfant["cancelled_reason"] == "suite_parent_cancelled"


def test_un_envoi_de_suite_DEJA_EXPEDIE_n_est_pas_annule(mod, monkeypatch):
    """Une commande partie ne se referme pas rétroactivement. Si la mère fait
    l'objet d'un litige, c'est un remboursement qu'il faut, pas une
    annulation — sans quoi le stock serait restocké alors que le colis roule.
    """
    cmd = commande(list(MIXTE))
    base = brancher(mod, monkeypatch, cmd)
    mere = scinder(mod, cmd)
    enfant_id = mere["suite_order_id"]
    base.orders.documents[enfant_id]["fulfillment_status"] = "shipped"

    asyncio.run(mod._annuler_envoi_de_suite(mere))

    assert base.orders.documents[enfant_id]["fulfillment_status"] == "shipped"


def test_une_commande_sans_suite_ne_leve_pas(mod, monkeypatch):
    """_cancel_order_side_effects passe par ici a CHAQUE annulation, y compris
    celles de commandes ordinaires."""
    cmd = commande([ligne("creatine", False)], has_preorder=False)
    brancher(mod, monkeypatch, cmd)
    asyncio.run(mod._annuler_envoi_de_suite(cmd))
