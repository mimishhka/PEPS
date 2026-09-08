# Here are your Instructions

[![Precheck](https://github.com/mimishhka/PEPS/actions/workflows/precheck.yml/badge.svg?branch=main)](https://github.com/mimishhka/PEPS/actions/workflows/precheck.yml)

## État de l'intégration continue

**Si l'écusson ci-dessus est rouge, `main` est cassée.** Il se met à jour tout
seul et se voit depuis la page d'accueil du dépôt.

Ce n'est pas une précaution théorique. La chaîne a été **rouge du 15 août au
8 septembre 2026** — vingt-quatre jours, les deux tâches, sans une seule
exécution verte. Et pas pour la raison qu'on croyait : l'étape *Install backend
dependencies* échouait, si bien qu'**aucun test backend ne s'exécutait**, pas même
les cinq fichiers qui étaient listés. La tâche `backend-tests` avait été ajoutée
le 15 août et n'avait jamais réussi une seule fois.

Deux leçons y sont inscrites dans la configuration :

- **Une étape par phase.** Les journaux d'exécution demandent une session
  GitHub ; les *noms* et *résultats* des étapes sont publics. Tant que tout
  tenait dans un seul « Run unified precheck », son échec ne disait rien de plus
  que « quelque chose a cassé ». Découpé, il désigne la phase fautive à lui seul.
- **L'intégration continue n'installe pas `requirements.txt`** mais
  `requirements-ci.txt` : les dix-huit modules que le backend importe vraiment,
  au lieu d'une centaine dont plusieurs compilent depuis les sources ou viennent
  d'un hôte privé.

### Être prévenue

**Quand c'est vous qui poussez** : GitHub envoie un courriel. Le réglage est dans
**Settings → Notifications → Actions** de votre *compte* — pas du dépôt.

**Quand c'est quelqu'un d'autre** : GitHub ne prévient personne, et c'est par ce
trou que les vingt-quatre jours sont passés. La tâche `alerte-echec` du workflow
comble ça, mais elle attend une adresse :

> Créez un secret de dépôt nommé **`CI_WEBHOOK_URL`** contenant l'URL d'un
> crochet entrant Slack ou Discord — *Settings → Secrets and variables → Actions
> → New repository secret*. Tant qu'il n'existe pas, la tâche s'exécute, ne
> trouve rien à envoyer, et se termine en succès : elle ne peut pas faire passer
> l'écusson au rouge.

Le secret n'apparaît jamais dans les journaux.

## Ce que l'intégration continue vérifie

| Tâche | Contenu |
| --- | --- |
| `precheck` | compilation Python, sondes JSX, **lint bloquant** (0 avertissement), build et **tests Jest** du frontend |
| `backend-tests` | MongoDB 7, les **107 tests unitaires**, puis démarrage du serveur et les **170 tests d'intégration** |
| `alerte-echec` | prévient sur `CI_WEBHOOK_URL` si la chaîne casse — inerte sans ce secret |

Les 170 tests d'intégration sont **passés du premier coup** le 2026-09-08 : ils
sont bloquants comme les autres. Voir
[`backend/docs/TESTS.md`](backend/docs/TESTS.md).

## Backend layout

`backend/server.py` holds the FastAPI app, configuration, Pydantic models, and the
route handlers. Integration and domain logic lives under `backend/services/`:

| Module | Owns |
| --- | --- |
| `services/mail.py` | Resend transport, email outbox worker, janitor, template catalogue and rendering |
| `services/canada_post.py` | Rating, shipment/label and manifest generation, artifact download, voiding, delivery tracking sync |
| `services/interac.py` | Microsoft Graph mailbox polling and Interac e-Transfer auto-confirmation |
| `services/nowpayments.py` | Crypto invoices, IPN verification and handling, mass payouts |
| `services/affiliate.py` | Tiers, referral attribution, coupon codes and aliases, metrics, invitations, payouts |
| `services/stock.py` | Atomic reservation/release, restock, back-in-stock and low-stock alerts |

Routes stay in `server.py` and `backend/routers/`; a service never declares one.
Services read configuration, the Mongo handle, and anything still in `server.py`
through `import server as s`. `server.py` registers itself in `sys.modules` under
both `server` and `backend.server`, so either entrypoint works, and it re-exports
the service symbols that existing call sites resolve by bare name.

Outbound side effects — provider HTTP calls, email sends, stock mutations — are
always invoked as `s.<name>`, even from inside the owning service, so `server` stays
the single namespace where a caller can substitute them.

## Environment configuration

Copy `.env.example` to `.env` and populate your Canada Post credentials before running the backend.

Required Canada Post settings:

- `CANADA_POST_API_KEY`
- `CANADA_POST_CUSTOMER_NUMBER`
- `CANADA_POST_ORIGIN_POSTAL_CODE`
- `CANADA_POST_ENVIRONMENT=prod`

Optional sender info:

- `CANADA_POST_SENDER_NAME`
- `CANADA_POST_SENDER_ADDRESS`
- `CANADA_POST_SENDER_CITY`
- `CANADA_POST_SENDER_PROVINCE`
- `CANADA_POST_SENDER_PHONE`

Do not commit `.env` to source control.

Production cookie, proxy, CSP, CDN, and verification requirements are documented in
[`backend/docs/PRODUCTION_SECURITY.md`](backend/docs/PRODUCTION_SECURITY.md).

## Google OAuth setup

To enable Google Sign-In for customers, add these variables to your `.env` (see `.env.example`):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (must point to the backend callback, e.g. `https://api.fironova.com/api/auth/google/callback`)

When enabled, users can sign in via Google; the backend will create or attach the account and set the same httpOnly session cookie used by email/password login.

