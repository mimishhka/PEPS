# NOWPayments Mass Payouts — Setup JWT

Pour activer l'envoi automatique de crypto (USDT/USDC ERC-20) aux affiliés
via `POST /api/admin/affiliates/payouts/batch`, vous devez configurer deux
variables d'environnement :

```bash
# /app/backend/.env
NOWPAYMENTS_PAYOUT_ENABLED=true
NOWPAYMENTS_JWT=<jwt-token-session-mass-payouts>
```

## Étape 1 — Activer Mass Payouts sur votre compte

1. Loguez-vous sur [dashboard.nowpayments.io](https://account.nowpayments.io/).
2. Menu **Store settings → Mass payouts** → cliquez **Enable**.
3. NOWPayments vous demandera de confirmer par 2FA (Google Authenticator).
   Notez le code secret ou scannez le QR — c'est votre **secret 2FA
   Mass Payouts** (différent du 2FA du compte principal).
4. Générez ou récupérez votre **API key** habituelle (menu **Store settings →
   API keys**). Elle est stockée dans `NOWPAYMENTS_API_KEY` (déjà en place).

## Étape 2 — Obtenir le JWT session

Le JWT session est court (24h max). Il doit être régénéré à intervalles
réguliers ou juste avant chaque batch payout.

**Endpoint : `POST https://api.nowpayments.io/v1/auth`**

```bash
curl -X POST https://api.nowpayments.io/v1/auth \
  -H "Content-Type: application/json" \
  -d '{
    "email": "<email-compte-nowpayments>",
    "password": "<mot-de-passe-compte-nowpayments>"
  }'
```

**Réponse attendue** :
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
}
```

Copiez le champ `token` complet dans `NOWPAYMENTS_JWT` puis relancez le backend :
```bash
sudo supervisorctl restart backend
```

## Étape 3 — OTP 2FA à chaque batch

À chaque appel `POST /api/admin/affiliates/payouts/batch`, l'admin doit
fournir le code 6 chiffres actuel de Google Authenticator dans le champ
`otp` du body :

```json
{
  "payout_ids": ["<id1>", "<id2>", …],
  "otp": "123456"
}
```

Le backend l'insère dans le header `ncw-verify` de l'appel NOWPayments.

## Étape 4 — Rotation du JWT

Le JWT expire après ~24h. Options :
- **Manuelle** : régénérer avant chaque batch (script cron ou action admin).
- **Automatique** (à implémenter) : ajouter `NOWPAYMENTS_EMAIL` +
  `NOWPAYMENTS_PASSWORD` en env et un helper `_refresh_np_jwt()` qui
  appelle `/v1/auth` avant chaque batch et met à jour l'env en mémoire.

## Fallback CSV (sans JWT)

Si `NOWPAYMENTS_PAYOUT_ENABLED=false` (ou `NOWPAYMENTS_JWT` vide), le
backend refuse le batch et marque les payouts en `status: queued_manual`
avec un message explicatif. L'admin peut alors utiliser :

```
GET /api/admin/affiliates/payouts/export.csv
```

pour télécharger un CSV **au gabarit officiel** NOWPayments Mass Payouts et
l'importer manuellement dans le dashboard NOWPayments (**Mass payouts →
Import CSV**).

Colonnes, dans cet ordre, intitulés recopiés du gabarit `PayoutsTemplate.csv` :

| Colonne | Contenu |
| --- | --- |
| Ticker | code NOWPayments en capitales : `USDTTRC20`, `USDTERC20`, `USDCERC20` |
| Wallet Address | adresse de versement de l'affilié |
| ExtraId | vide — sans objet pour USDT/USDC sur ERC20/TRC20 |
| Amount in crypto | montant en jetons, **6 décimales, arrondi vers le bas** |
| Fiat amount / Fiat currency | **vides, volontairement** — voir ci-dessous |
| Payout description | `FIRONOVA <code> <période> <montant> CAD ref <id du versement>` |

**Pourquoi le montant fiat reste vide.** Le montant en jetons est le chiffre
audité : taux Banque du Canada et cours du jeton sont conservés sur chaque
versement. Fournir aussi un montant en CAD laisserait NOWPayments libre de le
reconvertir à son propre taux, et le montant parti différerait du montant
enregistré. Le gabarit admet ces cases vides ; le CAD figure dans la
description, à titre d'information.

Fichier sans BOM, fins de ligne LF — comme le gabarit.

## Liste blanche NOWPayments — avant chaque versement

NOWPayments refuse tout versement vers une adresse absente de la liste blanche
du compte. L'écran **Versements** affiche un bandeau dès qu'une adresse
d'affilié actif n'a pas encore été confirmée.

1. **Fichier liste blanche** — télécharge
   `GET /api/admin/affiliates/whitelist/export.csv`, au gabarit
   `WhitelistTemplate.csv` :

   ```
   Currency,Address,"ExtraId(memo, destination tag, etc.)",Label
   USDTTRC20,TR7NHq…,,Affiliate FITNES70 - Kyro1 Stlouis1
   ```

   Le libellé commence par `Affiliate`, pour distinguer ces adresses de vos
   propres portefeuilles, puis porte le code (unique) et le nom de l'affilié.
2. Importer ce fichier dans la liste blanche du compte NOWPayments.
3. **J'ai importé ces adresses** — `POST /api/admin/affiliates/whitelist/confirm`
   enregistre le couple (ticker, adresse) sur la fiche de l'affilié.

L'export ne marque rien : seul le geste de confirmation fait foi, parce que la
liste blanche ne se lit pas côté NOWPayments. Un affilié qui change d'adresse
redevient en attente pour la nouvelle ; une adresse modifiée entre l'export et
la confirmation est ignorée.

## Documentation officielle
- Auth : https://documenter.getpostman.com/view/7907941/S1a32n38#dbc9c2a6-f5c2-4c1e-a7b6-bff5f2ce2c3a
- Mass Payouts : https://documenter.getpostman.com/view/7907941/S1a32n38#0eb5f52b-c58c-45f6-a72a-9f3c22ff5527
