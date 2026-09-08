# Tests backend — deux familles, deux façons de les lancer

Les 36 fichiers de `backend/tests/` se divisent en deux catégories que **rien
dans le dépôt ne distinguait** avant ce document. La confusion coûte cher : elle
a laissé douze fichiers hors de l'intégration continue pendant des mois, dont
toute la suite d'affiliation.

## La distinction

| | Unitaires | Intégration |
|---|---|---|
| Nombre | 17 | 19 |
| Base de données | doublure en mémoire (`tests/fake_mongo.py`) | MongoDB réelle |
| Serveur | aucun | backend vivant sur `REACT_APP_BACKEND_URL` |
| Durée | ~80 s pour les 17 | plusieurs minutes |
| Comment les reconnaître | ne mentionnent pas `REACT_APP_BACKEND_URL` | la lisent en tête de fichier |

Les tests d'intégration font `assert BASE_URL` **au niveau module**. Ils ne se
sautent donc pas proprement : sans backend, ils échouent à la *collecte*, pas
avec un « skipped ». C'est pourquoi les deux familles se lancent séparément.

## ⚠️ Ne jamais pointer les tests d'intégration vers la prévisualisation

Ils créent des comptes, des commandes, des affiliés et des coupons. Exécutés
contre `peptide-ca.preview.emergentagent.com`, ils écrivent **dans les données
réelles**. Ils veulent une base jetable, et rien d'autre.

## Lancer les tests unitaires

Ils n'ont besoin ni de MongoDB, ni du serveur — seulement de variables
d'environnement, parce que `server.py` les lit à l'import.

```bash
cd backend
MONGO_URL="mongodb://localhost:27017" DB_NAME="testdb" \
JWT_SECRET="test-secret" ADMIN_PASSWORD="admin-pass" \
PUBLIC_BASE_URL="https://example.com" \
python -m pytest -q $(grep -L REACT_APP_BACKEND_URL tests/test_*.py)
```

Les variables sont nécessaires parce que `backend/.env` est absent en
développement : il est dans `.gitignore` et contient les secrets de production.
`test_newsletter_validation.py` importe `server` sans passer par une fixture, et
échoue à la collecte si `MONGO_URL` manque.

La liste des fichiers **se calcule**, elle ne se recopie pas. Un nouveau fichier
unitaire est couvert sans que personne pense à l'ajouter.

## Environnement local

Un `venv` suffit — pas besoin de `requirements.txt` en entier :

```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install \
  fastapi==0.110.1 starlette==0.37.2 pydantic==2.13.4 \
  motor==3.3.1 pymongo==4.6.3 python-dotenv==1.2.2 \
  PyJWT==2.13.0 bcrypt==4.1.3 passlib==1.7.4 \
  httpx==0.28.1 requests==2.34.2 email-validator==2.3.0 \
  python-multipart==0.0.32 python-jose==3.5.0 \
  pillow==12.2.0 resend==2.32.2 reportlab==5.0.0 \
  holidays tzdata pytest==9.1.1 pytest-xdist==3.8.0
```

Deux pièges :

- **`weasyprint` est inutile.** Son import est paresseux (`server.py`, dans la
  fonction de génération de PDF). L'installer sur Windows demande les
  bibliothèques GTK ; s'en passer ne coûte rien aux tests.
- **`tzdata` est indispensable sur Windows.** Le système n'a pas de base de
  fuseaux horaires, donc `ZoneInfo("America/Toronto")` — l'heure de coupure des
  commandes — lève `ModuleNotFoundError` sans lui. Sur Linux, il est facultatif.

## `pytest.ini`

`addopts = -n 2 --dist loadscope` s'applique à toute invocation. Pour un
diagnostic en série, ajouter `-n 0` — **jamais** `-p no:xdist`, qui plante
puisque `addopts` passe toujours `-n`.

## Intégration continue

`.github/workflows/precheck.yml`, tâche `backend-tests` : MongoDB 7 en service,
dépendances complètes, puis les 17 fichiers unitaires **avant même** de démarrer
uvicorn. Le serveur est ensuite lancé, sondé sur `/api/meta`, et les 19 fichiers
d'intégration tournent contre lui.

**Aucun script d'amorçage n'a été nécessaire** : `seed_admin_and_products()` est
appelée au démarrage du serveur, ce qui crée le compte administrateur à partir
de `ADMIN_EMAIL` / `ADMIN_PASSWORD` ; les tests créent ensuite leurs propres
affiliés via l'API d'administration.

Les 170 tests d'intégration **n'ont encore jamais été verts**. Ils portent
`continue-on-error: true` et publient leur résumé d'échec dans le *nom* d'un
artefact, parce que les journaux d'exécution demandent une session GitHub.

Piège rencontré en les branchant : `test_iter8_invoice_ipn.py` lisait son secret
uniquement dans `/app/backend/.env`, un chemin absolu qui n'existe que sur le
serveur de production. Il lit l'environnement d'abord désormais. **Tout test qui
lit un chemin absolu échouera en intégration continue** — la variable
d'environnement passe en premier, le fichier reste un repli.

## Ce que les tests unitaires ne voient pas

Ils remplacent MongoDB par un objet Python. Une agrégation réelle n'est donc
**jamais exécutée** : une faute dans un pipeline (`$case` au lieu de `case`, un
opérateur mal orthographié) passe tous les tests et casse la production. De
même, aucun rendu React n'a lieu.

Pour ces deux catégories, il faut ouvrir la page.
