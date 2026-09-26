"""Un courriel deja envoye ne doit plus faire planter la file.

Mireille, capture d'ecran a l'appui : l'invitation d'affilie affichait
« KeyError 'html' » et n'etait jamais partie.

LE MECANISME. Le corps d'un courriel est EFFACE a l'envoi reussi — c'est voulu,
un courriel parti n'a pas a garder son contenu en base, et l'ecran d'admin le
dit lui-meme : « The body is purged once the email is sent ».

Mais la reclamation de tache ne l'excluait pas. Une tache deja envoyee, reprise
par le concierge ou par une reprise manuelle, revenait au travailleur SANS
corps, et `job["html"]` levait un KeyError. L'administratrice voyait alors un
echec sur un courriel qui, lui, etait peut-etre deja parti — ou pas parti du
tout, sans moyen de le savoir.

TROIS DEFAUTS S'ENCHAINAIENT, et chacun a son test ici.
"""
import asyncio
import importlib
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


@pytest.fixture
def mail(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    import server  # noqa: F401  (la chaine d'import passe par lui)
    importlib.reload(server)
    from services import mail as module
    importlib.reload(module)
    return module


class FileDeCourriels:
    """Un faux `email_outbox` qui sait ce dont ce test a besoin : reclamer une
    tache selon un filtre, et enregistrer ce qu'on ecrit dessus.

    Le faux Mongo partage du projet ne gere pas find_one_and_update autrement
    que par un bouchon ; ecrire celui-ci ici garde le test lisible et honnete
    sur ce qu'il simule."""

    def __init__(self, taches):
        self.taches = taches
        self.ecritures = []

    @staticmethod
    def _correspond(doc, filtre):
        for cle, cond in filtre.items():
            if cle == "$or":
                if not any(FileDeCourriels._correspond(doc, s) for s in cond):
                    return False
                continue
            valeur = doc.get(cle)
            if isinstance(cond, dict):
                if "$exists" in cond and (cle in doc) != cond["$exists"]:
                    return False
                if "$ne" in cond and valeur == cond["$ne"]:
                    return False
                if "$in" in cond and valeur not in cond["$in"]:
                    return False
                if "$lte" in cond and not (valeur is not None and valeur <= cond["$lte"]):
                    return False
            elif valeur != cond:
                return False
        return True

    async def find_one_and_update(self, filtre, maj, **k):
        for t in self.taches:
            if self._correspond(t, filtre):
                t.update(maj.get("$set", {}))
                for cle, v in maj.get("$inc", {}).items():
                    t[cle] = t.get(cle, 0) + v
                return dict(t)
        return None

    async def update_one(self, filtre, maj, **k):
        self.ecritures.append((filtre, maj))
        for t in self.taches:
            if self._correspond(t, filtre):
                t.update(maj.get("$set", {}))
                for cle in maj.get("$unset", {}):
                    t.pop(cle, None)
                return
        return


def poser(mail, monkeypatch, taches, envoi=None):
    file = FileDeCourriels(taches)
    monkeypatch.setattr(mail.s, "db", type("Db", (), {"email_outbox": file})())
    monkeypatch.setattr(mail.s, "RESEND_API_KEY", "re_test", raising=False)
    envoye = []

    def envoyer(params):
        envoye.append(params)
        if envoi is not None:
            return envoi
        return {"id": "resend-1"}

    monkeypatch.setattr(mail.resend.Emails, "send", envoyer)
    return file, envoye


PASSE = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()


def tache(**extra):
    base = {
        "id": "e-1", "status": "pending", "to": ["marie@exemple.com"],
        "subject": "Invitation", "html": "<p>Bonjour</p>",
        "from": "affilies@fironova.com", "attempts": 0,
        "available_at": PASSE, "created_at": PASSE,
    }
    base.update(extra)
    return base


# ------------------------------------------------------------------ 1
def test_une_tache_sans_corps_n_est_plus_reclamee(mail, monkeypatch):
    """LE DEFAUT PRINCIPAL. Une tache deja envoyee, dont le corps a ete efface,
    revenait au travailleur et faisait lever un KeyError."""
    purgee = tache(status="retry")
    del purgee["html"]
    file, envoye = poser(mail, monkeypatch, [purgee])

    resultat = asyncio.run(mail._process_email_outbox_job())

    # Aucun envoi tente, aucun plantage.
    assert envoye == []
    assert resultat is False
    # Et la tache n'a pas ete marquee « sending » pour rien.
    assert purgee["status"] == "retry"


def test_un_corps_vide_compte_comme_absent(mail, monkeypatch):
    """Le champ peut exister en chaine vide : c'est la meme chose."""
    vide = tache(status="retry", html="")
    _, envoye = poser(mail, monkeypatch, [vide])

    assert asyncio.run(mail._process_email_outbox_job()) is False
    assert envoye == []


# ------------------------------------------------------------------ 2
def test_un_corps_perdu_apres_reclamation_ne_plante_pas(mail, monkeypatch):
    """CEINTURE ET BRETELLES. Deux travailleurs, un redemarrage : une tache
    peut perdre son corps entre la reclamation et l'envoi. Un KeyError
    transformerait alors un envoi DEJA REUSSI en echec affiche a
    l'administratrice, avec un message qui n'apprend rien."""
    t = tache()
    file, envoye = poser(mail, monkeypatch, [t])

    # On vide le corps au moment meme ou la tache est rendue.
    vraie = file.find_one_and_update

    async def voler_le_corps(filtre, maj, **k):
        doc = await vraie(filtre, maj, **k)
        if doc:
            doc.pop("html", None)
        return doc

    monkeypatch.setattr(file, "find_one_and_update", voler_le_corps)

    resultat = asyncio.run(mail._process_email_outbox_job())

    assert envoye == []
    assert resultat is True          # la tache est traitee, pas abandonnee
    assert t["status"] == "sent"     # elle etait deja partie : le registre le dit
    assert "purge" in (t.get("note") or "")


# ------------------------------------------------------------------ 3
def test_un_envoi_reussi_s_inscrit_meme_si_le_statut_a_change(mail, monkeypatch):
    """LE TROISIEME DEFAUT, ET LE PLUS COUTEUX. L'ecriture de succes exigeait
    « status: sending ». Quand le concierge avait remis la tache en « retry »
    entre-temps — bail expire pendant un envoi lent — elle ne correspondait
    plus : le courriel etait PARTI, mais le registre disait « a renvoyer », et
    un autre travailleur l'envoyait une SECONDE fois au meme destinataire."""
    t = tache()
    file, envoye = poser(mail, monkeypatch, [t])

    # Le concierge passe juste apres la reclamation.
    vraie = file.find_one_and_update

    async def concierge_intercale(filtre, maj, **k):
        doc = await vraie(filtre, maj, **k)
        if doc:
            t["status"] = "retry"   # plus « sending »
        return doc

    monkeypatch.setattr(file, "find_one_and_update", concierge_intercale)

    asyncio.run(mail._process_email_outbox_job())

    assert len(envoye) == 1, "le courriel doit partir une fois"
    assert t["status"] == "sent", "un envoi reussi doit s'inscrire, quoi qu'il soit devenu"
    assert "html" not in t, "le corps est purge a l'envoi"


def test_le_chemin_nominal_reste_intact(mail, monkeypatch):
    t = tache()
    file, envoye = poser(mail, monkeypatch, [t])

    assert asyncio.run(mail._process_email_outbox_job()) is True
    assert len(envoye) == 1
    assert envoye[0]["to"] == ["marie@exemple.com"]
    assert t["status"] == "sent"
    assert "html" not in t
