import os
import itertools
import secrets

import requests


os.environ.setdefault(
    "REACT_APP_BACKEND_URL",
    "http://127.0.0.1:8001",
)

_original_request = requests.sessions.Session.request
_request_counter = itertools.count(1)


def _integration_request(self, method, url, **kwargs):
    headers = dict(kwargs.pop("headers", {}) or {})
    headers.setdefault("Origin", os.environ["REACT_APP_BACKEND_URL"])
    if url.rstrip("/").endswith(("/api/auth/register", "/api/auth/login", "/api/checkout")):
        next(_request_counter)
        octets = secrets.token_bytes(3)
        headers.setdefault("X-Forwarded-For", f"23.{octets[0]}.{octets[1]}.{octets[2]}")
    if url.rstrip("/").endswith("/api/checkout"):
        # /api/checkout EXIGE une cle d'idempotence — c'est ce qui empeche un
        # double clic de creer deux commandes. Les tests, ecrits avant cette
        # regle, n'en envoyaient pas : chaque passage en caisse repondait
        # « Idempotency key is required », et les tests de stock, de coupon et
        # de parrainage echouaient sur un motif etranger a ce qu'ils verifient.
        #
        # La cle est posee ICI plutot que dans chaque fichier : une par requete,
        # donc l'idempotence reelle reste testable par les tests qui la visent
        # explicitement — ils passent leur propre en-tete, et setdefault la
        # respecte.
        headers.setdefault("Idempotency-Key", secrets.token_hex(16))
    return _original_request(self, method, url, headers=headers, **kwargs)


requests.sessions.Session.request = _integration_request