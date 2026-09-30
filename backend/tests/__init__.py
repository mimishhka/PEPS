"""Ce dossier est un PAQUET, et il doit l'etre.

Neuf fichiers de tests font `from tests.fake_mongo import ...` — le faux
Mongo en memoire qui rend les assertions reelles plutot que fabriquees. Sans
ce fichier, Python ne voit pas `tests` comme un paquet importable et les neuf
echouent a l'IMPORT : ils ne signalent pas un defaut du code, ils ne
s'executent simplement jamais. Une suite verte qui ne teste rien est pire
qu'une suite rouge.
"""
