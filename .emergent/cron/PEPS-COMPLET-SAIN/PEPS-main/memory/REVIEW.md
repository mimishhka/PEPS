# Revue sécurité & intégrité — PEPS/Fironova

**Date** : 2026-08-08
**Portée** : `backend/server.py` (~10 876 lignes), `frontend/src`, `backend/tests`, `backend/requirements.txt`, docs.
**Méthode** : revue de code manuelle. Limites : pas de Python ni de Node/Mongo locaux (stubs Windows Store) → vérification visuelle uniquement, aucun test exécuté ni compilation effectuée.

## 1. Retrait de Stripe — terminé

Stripe n'était pas utilisé comme moyen de paiement réel. Supprimé de bout en bout :

- `backend/server.py` : `STRIPE_API_KEY`, bloc d'import `emergentintegrations.payments.stripe.checkout`, branche `elif payment_method == "stripe"` du checkout, endpoint `GET /payments/stripe/status/{session_id}`, webhook `POST /webhook/stripe`, champ `origin_url` du modèle `CheckoutIn`, `"stripe"` retiré du `Literal` `payment_method` (désormais `["interac","nowpayments"]`), statut `awaiting_stripe` retiré des listes d'impayés (`_UNPAID`, `_UNPAID_STATUSES`, auto-annulation).
- `backend/requirements.txt` : `stripe==14.4.1` supprimé.
- Frontend : `OrderConfirmation.jsx` (polling + bannière), `Faq.jsx` (mention), `Checkout.jsx` (`origin_url`), `Account.jsx` + `AdminLayout.jsx` (mapping `awaiting_stripe`, « 9 statuts » → « 8 »).
- Tests : régressions Stripe retirées de `test_iter5_shipping_autocancel.py`, `test_iter7_countdown_nowpayments.py`, `test_iter8_invoice_ipn.py`.
- Docs : `design_guidelines.json`, `memory/PRD.md`.
- Scan final : aucune occurrence restante dans sources backend/frontend, scripts, README, package.json.
- Note : l'index unique `session_id` sur `payment_transactions` subsiste (legacy, inoffensif).

## 2. Points validés (aucun défaut critique trouvé)

**Authentification & sessions**
- JWT HS256, cookie `httpOnly` + `Secure` + `SameSite` (`set_auth_cookie`, `_cookie_secure_for_request`), token versionné (`_resolve_user`). Aucun token accessible au JS → XSS ne peut pas voler la session.
- `JWT_SECRET` et `ADMIN_PASSWORD` obligatoires via `os.environ` (pas de défaut). Le fallback `"fironova-fallback-salt"` ne sert qu'au sel d'IP affilié, jamais au JWT.
- Login : throttling par `ip:email`, comparaison en temps constant. Passwordless : anti-énumération (réponse uniforme), token SHA-256 à usage unique, TTL 15 min.
- RBAC staff : `require_area()` par zone, journal d'audit (`_log_action`) sur les mutations ; gestion des membres réservée au rôle admin.

**Admin gate** : rate-limit strict (`admin_gate`, 5/h/IP), comparaison temps constant, passerelle désactivable.

**Paiements crypto (NOWPayments)** : invoice via `_nowpayments_create` (fallback mock en dev), IPN vérifié HMAC-SHA512 sur corps brut (`x-nowpayments-sig` + `compare_digest`), défense en profondeur (commande existe, méthode cohérente, montant vérifié avant auto-confirm), `_mark_order_paid` idempotent (garde `$ne "paid"`).

**Interac Graph** : extraction de références `FN-\d{6}-[0-9A-F]{6}`, montants `_parse_amounts`, auto-confirmation uniquement si montant correspond (divergence → revue manuelle). `apply_interac.sh` : patch auto-contenu (base64) qui régénère `server.py` + `dryrun_interac.py`.

**Affiliation** : approbation différée 14 jours (`AFFILIATE_APPROVAL_HOLD_DAYS`), réversion des commissions sur `affiliate_on_order_reversed`, payouts NOWPayments gated par env.

**Expédition / Canada Post** : `_cp_xml_escape` (anti-injection XML), noms d'artefacts générés `{order_id}-{uuid}.pdf` (pas de path traversal), OAuth token via env, idempotence du sync livraison.

**Uploads** : `admin_upload_coa` (magic bytes `%PDF`, limite de taille, nom `uuid4().hex.pdf`), `admin_upload_image` (magic bytes, décompression bomb).

**Corbeille** : suppression douce + purge auto 30 jours **sauf commandes** (pièce comptable, purge manuelle owner uniquement) — vérifié dans `_trash_auto_purge_watchdog` (`auto_purge_days=None` → skip).

**Prelaunch** : `/prelaunch/preview` vérifié par `hmac.compare_digest`, token jamais exposé.

**Frontend** : `api.js` cookie-only (`withCredentials`, aucun stockage JS), `AuthContext` propre (nettoyage d'un legacy `localStorage.fironova_token`).

## 3. Réserves mineures

| # | Réserve | Statut |
|---|---------|--------|
| 1 | `STRIPE_API_KEY` présent dans le `.env` local (non soumis) | À retirer par l'utilisateur |
| 2 | `supabaseClient.js` code mort (jamais importé) | **Corrigé** : fichier supprimé, `@supabase/supabase-js` retiré de `package.json` (pas de lock à régénérer : aucun `yarn.lock`/`package-lock.json`) |
| 3 | `inviter_name` interpolé non échappé dans l'email d'invitation staff | **Corrigé** : `html.escape()` ajouté dans `_staff_invite_html` (`import html`) |
| 4 | TOCTOU bénin sur `coupon.usage_limit` (incrément à la confirmation, pas de réservation) | Documenté, non modifié (cf. §4) |
| 5 | Exports CSV/XLSX : champs utilisateur bruts → injection de formule (CWE-1236) | **Corrigé** : `_csv_safe()` préfixe `'` les cellules commençant par `= + - @` ou contrôle (appliqué dans `_csv_response` et `_xlsx_response`) |
| 6 | Tests d'intégration écrits pour l'ancien modèle d'auth (token dans le corps) | **Corrigé** : cf. §4bis |

## 4bis. Tests d'intégration — alignement sur l'auth cookie-only

Constat : `login`/`register` ne renvoient plus de token dans le corps (cookie `access_token` uniquement) et `register` exige une activation par email (le token brut ne part que dans l'email). Les tests qui lisaient `r.json()["token"]` étaient donc cassés.

**Correction backend** (`server.py`) : flag `MAGIC_LINK_DEBUG=1` (défaut : off, jamais en prod) qui renvoie `debug_magic_token` dans les réponses `POST /auth/register` et `POST /auth/magic/request`. Permet aux tests de finaliser la vérification email via `/auth/magic/verify` sans boîte de réception.

**Correction tests** : `test_iter3_features.py`, `test_iter9_variant_sale_preorder.py`, `test_iter12_affiliate.py` migrés vers `requests.Session()` (cookie jar) + `debug_magic_token`. `test_iter5`/`iter7`/`iter8` inchangés (checkout public + accès Mongo direct).

**Pour exécuter la suite en local** : `MAGIC_LINK_DEBUG=1` dans l'env backend, backend + Mongo démarrés, `REACT_APP_BACKEND_URL` pointant sur le backend. NB : rate-limit register = 5/h/IP — lancer les fichiers par lot si besoin.

## 4. Recommandations restantes

- **Coupon `usage_limit`** : en cas de besoin, passer à un incrément atomique réservé au checkout (pré-réservation + release si échec). Risque faible, à faire avec tests.
- **Canada Post** : si mode OpenAPI seul (sans `CANADA_POST_API_KEY` legacy), l'auto-sync des statuts livrés est inopérant — vérifier que le mode voulu est bien celui configuré en prod.
- **Vérification locale** : installer Python + Mongo + Node pour lancer `pytest` (backend, avec `MAGIC_LINK_DEBUG=1`) et `craco test/build` (frontend) afin de valider par exécution.
- **Hygiène repo** : aucune clé commise ; conserver `.env*`, `*.pem`, `credentials.json` dans `.gitignore`.
