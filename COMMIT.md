# FIRONOVA — patch complet · 22 fichiers

Terminal du VS Code Emergent, depuis `/app` :

```bash
bash apply-fironova-patch.sh
```

Sauvegarde `.backup-<horodatage>/` → écrit 22 fichiers → vérifie 22 MD5 + AST Python + JSON + absence de résidu NORDPEP. Idempotent. Rollback : `cp -r .backup-<horodatage>/. .`

Puis `sudo supervisorctl restart all` → `git add -A && git commit && git push`

---

## Variables d'environnement

**Obligatoires** (`backend/.env`) :
```
CORS_ORIGINS=https://peptide-ca.preview.emergentagent.com,https://fironova.ca
PUBLIC_BASE_URL=https://fironova.ca
```

**Prélancement** (optionnel) :
```
PRELAUNCH_ENABLED=false
PRELAUNCH_PREVIEW_TOKEN=<secret long>
LAUNCH_COUPON_CODE=LAUNCH15
```

**Postes Canada — étiquettes** :
```
CANADA_POST_SENDER_ADDRESS=...
CANADA_POST_SENDER_PHONE=...
CANADA_POST_ORIGIN_POSTAL_CODE=...
```

---

## Inventaire complet de la conversation

| Discuté | Backend | Interface |
|---|---|---|
| Auth cookie-only (4 endpoints + 4 fichiers front) | ✅ | ✅ |
| `re.escape` recherche produits | ✅ | — |
| CORS explicite + `allow_credentials` | ✅ | — |
| IPN NOWPayments — vérif montant | ✅ | — |
| `tokens.css` dans `src/` (rayons cassés) | — | ✅ |
| `design_guidelines.json` → FIRONOVA | ✅ | — |
| Redesign éditorial + chromatogramme HPLC | — | ✅ |
| Newsletter câblée + consentement LCAP | ✅ | ✅ |
| **Catégories** CRUD | ✅ | Admin ✅ · **Vitrine ✅** |
| **Menus** CRUD | ✅ | Admin ✅ · **Vitrine ✅** |
| **Prélancement** + LAUNCH15 | ✅ | ComingSoon ✅ · **Abonnés ✅** |
| **Postes Canada** étiquettes + manifeste | ✅ | **✅** |

---

## Câblage vitrine (ajouté en dernier)

- `Catalog.jsx` → `GET /categories`. Masquer une catégorie la retire des filtres. Repli sur la liste historique si l'API échoue.
- `Header.jsx` → `GET /menus?location=header`. Le drapeau COA reste l'autorité sur `/lab`, même si l'item est publié.
- `Footer.jsx` → `GET /menus?location=footer`, colonnes dynamiques. Repli sur les liens en dur.
- `AdminOrders.jsx` → sélecteur de service, **Générer l'étiquette**, **Télécharger le PDF**, **Annuler (void)**, et surtout **bannière rouge + bouton Transmettre le manifeste**.
- `AdminSubscribers.jsx` → liste, taux de conversion, export CSV, colonne **preuve de consentement** (`consent_at` + `consent_ip`).

Le bouton « Print Label » était un **placeholder qui affichait un toast**. Remplacé par le vrai flux.

---

## Bugs trouvés

| # | Bug | Conséquence |
|---|---|---|
| 1 | `PUT /admin/orders/{id}/shipping` remplaçait `shipping_info` en bloc | Corriger un suivi manuel après étiquette effaçait `cp_transmitted` → sortie de la requête manifeste → **surcharge 2 $/colis silencieuse** |
| 2 | `DuplicateKeyError` non importé | `NameError` au premier slug dupliqué |
| 3 | `CreateLabelIn` référencé, jamais défini | **Crash au démarrage** |
| 4 | `send_shipping_notification` inexistante | Crash à la création d'étiquette |
| 5 | `line_items` sans `weight_grams` | Poids par défaut → Postes Canada repèse et refacture |
| 6 | `useAuth()` expose `checking`, pas `loading` | **Admins bloqués sur la page d'attente** |
| 7 | 3 adresses `@nordpep.ca` en dur | Courriels d'une marque morte |
| 8 | `ProductCard` : `bg-red-600` / `bg-orange-500` | Couleurs hors palette |

---

## Déviation assumée

Spec Bloc 3 : `POST /subscribe` + `SubscriberIn`. **Non implémenté** — créait un second système d'abonnés sur `db.subscribers`, schéma incompatible, **sans preuve de consentement ni jeton de désabonnement** (non conforme LCAP). Réutilisation de `/newsletter/subscribe`, qui a déjà `consent_at`, `consent_ip`, `unsubscribe_token`, `status`. Ajouts : `converted`, courriel de bienvenue.

---

## Validation

- Backend : AST + résolution de tous les noms + 99 routes.
- Frontend : **parseur TypeScript réel** sur 22 fichiers → 0 erreur. Étalonné sur les fichiers d'origine (mon premier vérificateur maison déclarait `App.js` et `Catalog.jsx` cassés — faux ; jeté).
- 379 imports vérifiés → aucun manquant.
- Tests réels : slug (9 cas dont `../etc/passwd`, `$where`), échappement XML (`O'Brien`, injection `</destination>`), poids (rétrocompat).
- Script rejoué : idempotent, rollback vérifié au `diff`.

**Non testé** : aucun appel réel à Postes Canada (pas de clés ni de réseau). Valider sur `ct.soa-gw.canadapost.ca` avant la prod.

---

## Checklist

**Vitrine** — [ ] masquer une catégorie la retire du catalogue · [ ] masquer un item de menu le retire de la nav · [ ] couper le backend → nav et filtres retombent sur les liens en dur (pas de nav vide)

**Postes Canada** — [ ] service peuplé · [ ] étiquette + PDF · [ ] **2ᵉ clic ne recrée rien** · [ ] bannière compte les non transmis · [ ] transmettre → `cp_transmitted=true` · [ ] **modifier le suivi manuel après étiquette ne perd pas `cp_transmitted`** (bug #1)

**Prélancement** — [ ] admin passe la porte · [ ] `?preview=<token>` passe · [ ] `LAUNCH15` s'applique · [ ] inscription → `converted=true`

**Sécurité** — [ ] `fironova_token` absent du localStorage · [ ] **rotation du mot de passe admin faite**
