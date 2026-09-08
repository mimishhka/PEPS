"""Minimal in-memory stand-in for a Motor collection.

Only the operators the code under test actually uses are implemented. The point
is that filters and projections are really applied, so a test asserting "the
janitor leaves cancelled jobs alone" fails if the query stops excluding them —
which a plain stub returning canned documents could never catch.
"""

import copy
import re
from datetime import datetime
from typing import Any, Optional


_MISSING = object()


def _resolve(doc, path: str):
    """Follow a dotted field path the way Mongo does: `shipping_info.label_url`."""
    current = doc
    for part in path.split("."):
        if isinstance(current, list):
            current = [c.get(part, _MISSING) if isinstance(c, dict) else _MISSING
                       for c in current]
            continue
        if not isinstance(current, dict) or part not in current:
            return _MISSING
        current = current[part]
    return current


def _matches(doc: dict, filt: dict) -> bool:
    for key, cond in (filt or {}).items():
        if key == "$or":
            if not any(_matches(doc, sub) for sub in cond):
                return False
            continue
        if key == "$and":
            if not all(_matches(doc, sub) for sub in cond):
                return False
            continue
        value = _resolve(doc, key)
        if not _match_field(None if value is _MISSING else value, cond,
                            present=value is not _MISSING):
            return False
    return True


# Ordre de comparaison des types BSON, tel que Mongo l'applique quand deux
# valeurs de types differents se retrouvent face a face. Seule la partie utile
# ici est reproduite ; l'essentiel est que String vienne AVANT Date.
_RANGS_BSON = [
    (type(None), 1), (bool, 4), (int, 2), (float, 2), (str, 3),
    (dict, 5), (list, 6), (datetime, 9),
]


def _rang_bson(value: Any) -> int:
    for typ, rang in _RANGS_BSON:
        if type(value) is typ:
            return rang
    return 99


def _match_field(value: Any, cond: Any, present: bool = True) -> bool:
    if not isinstance(cond, dict):
        return value == cond
    for op, operand in cond.items():
        if op == "$exists":
            if present != bool(operand):
                return False
            continue
        if op == "$type":
            # Mongo ordonne les types entre eux, si bien qu'une comparaison
            # « $lt » traverse les types sans $type pour la contraindre. La
            # doublure doit donc connaitre cet operateur, sinon un filtre qui
            # protege des donnees ici n'en protegerait aucune la-bas.
            attendus = operand if isinstance(operand, list) else [operand]
            reels = {datetime: "date", str: "string", bool: "bool",
                     int: "int", float: "double", list: "array", dict: "object"}
            reel = next((n for t, n in reels.items() if type(value) is t), None)
            if reel not in attendus:
                return False
            continue
        if op == "$in":
            candidates = value if isinstance(value, list) else [value]
            if not any(c in operand for c in candidates):
                return False
        elif op == "$nin":
            if value in operand:
                return False
        elif op == "$ne":
            if value == operand:
                return False
        elif op in ("$lt", "$lte", "$gt", "$gte"):
            if value is None:
                return False
            # Mongo compare A TRAVERS les types, selon un ordre global ou
            # String passe AVANT Date. « $lt <date> » est donc vrai pour TOUTE
            # chaine — et une purge sans contrainte $type effacerait des
            # documents parfaitement valides.
            #
            # Python, lui, leve TypeError. Reproduire l'ordre de Mongo est le
            # seul moyen pour qu'un test puisse constater ce danger ici plutot
            # qu'en production.
            try:
                gauche, droite = value, operand
                if _rang_bson(value) != _rang_bson(operand):
                    gauche, droite = _rang_bson(value), _rang_bson(operand)
                ok = {"$lt": gauche < droite, "$lte": gauche <= droite,
                      "$gt": gauche > droite, "$gte": gauche >= droite}[op]
            except TypeError:
                return False
            if not ok:
                return False
        elif op == "$regex":
            flags = re.IGNORECASE if "i" in cond.get("$options", "") else 0
            haystack = value if isinstance(value, list) else [value]
            if not any(isinstance(h, str) and re.search(operand, h, flags) for h in haystack):
                return False
        elif op == "$options":
            continue
        else:  # pragma: no cover - guards against silently ignoring an operator
            raise NotImplementedError(f"fake_mongo: unsupported operator {op}")
    return True


def _project(doc: dict, projection: Optional[dict]) -> dict:
    """Apply a projection, including dotted sub-field paths like `variants.id`,
    which Mongo honours by trimming each element of the embedded array."""
    if not projection:
        return copy.deepcopy(doc)
    fields = {k: v for k, v in projection.items() if k != "_id"}
    including = any(v for v in fields.values())

    subfields: dict[str, set] = {}
    for key in list(fields):
        if "." in key:
            root, sub = key.split(".", 1)
            subfields.setdefault(root, set()).add(sub)
            fields.pop(key)
            fields[root] = 1 if including else 0

    out = {}
    for key, value in doc.items():
        keep = bool(fields.get(key)) if including else bool(fields.get(key, 1))
        if not keep:
            continue
        if key in subfields and isinstance(value, list):
            wanted = subfields[key]
            out[key] = [{k: copy.deepcopy(v) for k, v in item.items() if k in wanted}
                        if isinstance(item, dict) else copy.deepcopy(item)
                        for item in value]
        else:
            out[key] = copy.deepcopy(value)
    return out


class _Result:
    def __init__(self, matched: int, modified: int):
        self.matched_count = matched
        self.modified_count = modified


class FakeCursor:
    def __init__(self, docs: list):
        self._docs = docs

    def sort(self, key, direction=1):
        if isinstance(key, list):
            key, direction = key[0]
        self._docs.sort(key=lambda d: (d.get(key) is None, d.get(key)),
                        reverse=direction == -1)
        return self

    def skip(self, n: int):
        self._docs = self._docs[n:]
        return self

    def limit(self, n: int):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        return self._docs if length is None else self._docs[:length]

    def __aiter__(self):
        self._it = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class FakeCollection:
    def __init__(self, docs: Optional[list] = None):
        self.docs = [copy.deepcopy(d) for d in (docs or [])]

    def find(self, filt=None, projection=None):
        return FakeCursor([_project(d, projection) for d in self.docs if _matches(d, filt or {})])

    async def find_one(self, filt=None, projection=None, sort=None):
        matches = [d for d in self.docs if _matches(d, filt or {})]
        if sort:
            key, direction = sort[0]
            matches.sort(key=lambda d: (d.get(key) is None, d.get(key)),
                         reverse=direction == -1)
        return _project(matches[0], projection) if matches else None

    async def count_documents(self, filt=None):
        return sum(1 for d in self.docs if _matches(d, filt or {}))

    def _apply(self, doc: dict, update: dict) -> bool:
        before = copy.deepcopy(doc)
        doc.update(update.get("$set", {}))
        for key in update.get("$unset", {}):
            doc.pop(key, None)
        for key, delta in update.get("$inc", {}).items():
            doc[key] = doc.get(key, 0) + delta
        for key, item in update.get("$push", {}).items():
            doc.setdefault(key, []).append(copy.deepcopy(item))
        return doc != before

    async def update_one(self, filt, update, **kwargs):
        for doc in self.docs:
            if _matches(doc, filt):
                return _Result(1, 1 if self._apply(doc, update) else 0)
        return _Result(0, 0)

    async def update_many(self, filt, update, **kwargs):
        matched = modified = 0
        for doc in self.docs:
            if _matches(doc, filt):
                matched += 1
                modified += 1 if self._apply(doc, update) else 0
        return _Result(matched, modified)

    async def insert_one(self, doc):
        self.docs.append(copy.deepcopy(doc))
        return _Result(1, 1)

    async def delete_many(self, filt=None, **kwargs):
        restants = [d for d in self.docs if not _matches(d, filt)]
        supprimes = len(self.docs) - len(restants)
        self.docs[:] = restants
        return _Result(supprimes, supprimes)

    def by_id(self, doc_id: str) -> Optional[dict]:
        return next((d for d in self.docs if d.get("id") == doc_id), None)


class CompteurDeDebit:
    """Collection `rate_limit_counters` toujours sous le plafond.

    Les points d'entree de versement sont limites en debit. Le limiteur echoue
    VOLONTAIREMENT en 503 quand sa collection est injoignable — un limiteur
    qu'on ne peut pas interroger ne doit pas laisser passer le trafic. Un test
    qui remplace `db` par un objet sans cette collection recevait donc 503 au
    lieu du comportement qu'il voulait verifier.

    Ce compteur repond toujours « une seule frappe », ce qui laisse passer sans
    jamais masquer autre chose.
    """

    async def find_one_and_update(self, *args, **kwargs):
        return {"count": 1}
