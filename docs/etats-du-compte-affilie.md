# Tous les états d'un compte affilié, et ce que chaque écran en dit

Mireille, 02/10/2026 :

> « j'aimerais que tu repasse au travers de toutes les situations possible qui
> doivent être affiché au compte de l'affilié et aussi dans sa fiche, c'est
> important que tu ai ce genre de visualisation et ceux pour tous les endpoint
> du compte affiliés et de sa fiche. »

Ce fichier est cette visualisation. Il existe pour une raison précise : « rien
ne manque » n'est pas vérifiable tant que la liste des situations n'est pas
écrite. Tant qu'elle ne l'est pas, on corrige l'écran qu'on regarde et on
découvre le suivant un mois plus tard.

**Les valeurs ci-dessous sont relevées dans le code, pas supposées** — chaque
`$set` de `status`, chaque drapeau. Si le serveur se met à écrire une valeur
qui n'est pas ici, elle tombera dans un repli, et le repli est silencieux.
C'est pourquoi trois tests tiennent cette liste :

| Test | Ce qu'il surveille |
|---|---|
| `frontend/src/lib/statutVersement.test.js` | les 9 statuts de versement sont connus des deux dictionnaires |
| `backend/tests/test_commissions_orphelines.py` | les 3 sites qui posent `failed` libèrent les commissions |
| `backend/tests/test_refus_affilie.py` | les 4 réalités derrière un 403 sont distinguées |

---

## 1. Le compte lui-même — `affiliates.status`

Quatre valeurs. Cycle : `invited` → `active` → `suspended` → `closed`, et
`reopen` revient à l'état d'avant.

| État | L'affilié voit | La fiche voit |
|---|---|---|
| `invited` | « Accès sur invitation » — correct : `user_id` est `None` jusqu'à l'activation, donc personne ne peut être connecté dans cet état | pastille *Invité*, bouton **Renvoyer l'invitation** |
| `active` | son tableau de bord | pastille *Actif* |
| `suspended` | écran dédié **Compte suspendu**, avec le support et la déconnexion | pastille *Suspendu*, bouton **Réactiver** |
| `closed` | écran dédié **Dossier fermé** — *corrigé le 02/10* ; il lisait « Accès sur invitation » | pastille *Fermé*, bouton **Rouvrir** |

**Ce que le 403 porte.** Un seul statut HTTP pour quatre réalités : le corps
porte donc un `code` (`suspended`, `closed`) ou la chaîne `Not an affiliate`.
Sans lui, l'écran ne peut que deviner, et il devinait mal.

**Garde.** La fermeture est **refusée** si le compte est `active` (son code et
son coupon circulent) ou s'il reste des commissions non versées — le montant dû
est nommé dans le refus. C'est pourquoi l'écran *Dossier fermé* peut affirmer
« tout a été versé » sans réserve.

---

## 2. Une commission — `affiliate_referrals.status`

Cinq valeurs, plus trois drapeaux de reprise.

| État | L'affilié voit | La fiche voit |
|---|---|---|
| `pending` | *En attente* — mûrit pendant `AFFILIATE_APPROVAL_HOLD_DAYS` (7 j) | *En attente* |
| `approved` | *Approuvé* — payable au prochain cycle | *Approuvée* |
| `paid` | *Payé*, avec le lien vers son versement | *Payée*, lien vers le lot |
| `reversed` | *Annulé* | *Récupérée* |
| `excluded` | **rien** — le serveur l'exclut (`status: {$ne: "excluded"}`) : une commande à soi-même ne génère pas une ligne à expliquer | *Exclue*, avec `excluded_reason` |

### Les deux reprises ne sont pas le même événement

C'est la distinction qu'elle a demandée (« the reversed commission should be an
activity of its own or showed differently »), et elle porte sur de l'argent.

| Cas | Drapeaux | Conséquence | Où c'est dit |
|---|---|---|---|
| Remboursée **avant** le versement | `reversed`, `reversed_after_payout` absent | L'argent n'est jamais parti. Rien à récupérer. | `depuis-reprise` : « ce montant n'est donc pas inclus ci-dessus » |
| Remboursée **après** le versement | `reversed`, `reversed_after_payout: true`, `clawback_pending: true`, `clawback_amount` | L'argent était déjà dans son compte. **Déduit du prochain versement.** | `depuis-creance`, `cycle-creance`, `fiche-creance` |
| Créance soldée en partie | `clawback_amount` réduit, `clawback_settled_amount` incrémenté, encore `pending` | Le reste suit au cycle suivant | `cycle-creance-reportee` |
| Créance soldée en entier | `clawback_pending: false`, `clawback_settled_at`, `clawback_settled_by` | Close | Le versement porte `creance_absorbee` : `detail-creance`, `fiche-versement-creance`, `lot-detail-creance` |

**Le rapprochement, sur les trois écrans :**

```
somme des lignes  −  retenue  =  versé
     142,50       −    40,00  =  102,50
```

L'écart affiché ne mesure que ce qui reste **inexpliqué après** la retenue.
Avant le 02/10 il valait `−créance` sur tout versement juste, et les trois
écrans annonçaient une divergence — dont un en rouge.

---

## 3. Un versement — `affiliate_payouts.status`

Neuf valeurs. **Vocabulaire unique** : `frontend/src/lib/statutVersement.js`.

| État | L'affilié lit | L'opératrice lit | Geste attendu |
|---|---|---|---|
| `creating` | En cours | **2FA requis** | saisir le code |
| `ready` | En cours | **Prêt** | envoyer |
| `queued_manual` | En cours | **À payer à la main** | export CSV |
| `dispatching` | En cours | Envoi en cours | attendre |
| `processing` | En cours | En traitement | attendre |
| `paid` | **Payé** | Payé | — |
| `paid_manual` | **Payé** | Payé (manuel) | — |
| `review` | En vérification | **À vérifier** (rouge) | trancher |
| `failed` | En vérification **+ « ces commissions sont reparties dans votre prochain versement »** | **Échoué** (rouge) | diagnostiquer |

Deux jeux de libellés, volontairement : l'affilié veut savoir **où est son
argent**, l'opératrice veut savoir **quel geste faire**. Un statut inconnu vaut
« En cours » pour l'affilié — jamais « Prêt » — et se **signale** comme anomalie
à l'opératrice au lieu de se déguiser en libellé.

### `period` n'est pas la période couverte

`period` est l'**étiquette du run** — le mois où *nous* avons payé. La période
couverte se déduit des commissions (`_periode_couverte`). L'index unique
`(affiliate_id, period)` interdit de redéfinir le champ ; la période est donc
calculée à la lecture, et l'export CSV la porte aussi — sinon le fichier remis
à une comptabilité porterait le mauvais mois.

---

## 4. Les situations qui bloquent l'argent

Celles-ci méritent leur propre table : elles ne sont pas des états, mais des
raisons pour lesquelles un montant dû ne part pas.

| Situation | Effet réel | Ce que l'affilié voit | Ce que l'admin voit |
|---|---|---|---|
| Sous le seuil (`AFFILIATE_PAYOUT_MIN_CAD`) | reporté au cycle suivant | `cycle-sous-seuil` | montant dû |
| **Pas d'adresse de paiement** | le versement est créé puis **sauté** par l'envoi | `cycle-sans-adresse` + bouton **Ajouter mon adresse** — *corrigé le 02/10* | compteur `no_payout_address` |
| Réseau d'adresse non reconnu | l'envoi saute, la liste blanche aussi | *(rien — voir § ouvert)* | `whitelist/pending` l'écarte |
| Compte suspendu | l'envoi saute (`affiliate suspended`) | écran *Compte suspendu* | pastille + `skipped` |
| Créance ≥ acquis | rien ne part, la dette se reporte | `cycle-creance-reportee` | `fiche-creance-reportee` |
| Envoi échoué | commissions **libérées**, reprises au cycle suivant | note sous le badge — *corrigé le 02/10* | *Échoué* en rouge |

---

## 5. Les endpoints

24 côté affilié, 34 côté administration. Ceux qui portent un état d'argent :

**Affilié** — `/affiliate/me`, `/dashboard`, `/performance`, `/referrals`,
`/payouts`, `/payouts/{id}`, `/insights`, `/customers`, `/top-products`,
`/activity`, `/notifications`.

**Administration** — `/admin/affiliates`, `/{id}`, `/{id}/customers`,
`/overview`, `/cycles`, `/risk`, `/payouts/all`, `/payouts/{id}/detail`,
`/payouts/runs`, `/payments/runs`, `/payments/runs/{id}`,
`/whitelist/pending`.

Les deux détails de versement (`/affiliate/payouts/{id}` et
`/admin/affiliates/payouts/{id}/detail`) rendent **la même forme et les mêmes
six nombres de rapprochement**. Un test les compare l'un à l'autre
(`test_LES_DEUX_ECRANS_RACONTENT_LA_MEME_HISTOIRE`) : c'est ce qui les a laissés
diverger une fois, l'un étant testé et l'autre pas.

---

## Ce qui reste ouvert

Nommé ici plutôt que découvert plus tard.

1. **Aucune trace de QUI a changé un taux ou une adresse de paiement.**
   `admin_audit_log` enregistre, la fiche ne le lit pas. Sur une contestation,
   « qui a modifié ce taux, et quand » n'a pas de réponse à l'écran. Décision
   attendue : afficher le journal dans la fiche.

2. **Deux taux de conversion contradictoires** dans l'écran Attribution.
   Diagnostiqué, non corrigé.

3. **Réseau d'adresse non reconnu** : l'affilié n'est pas averti. Même famille
   que l'adresse manquante, cas plus rare — il faudrait valider le réseau à la
   saisie plutôt que l'avertir après.

4. **`AFFILIATE_TERMS_VERSION` est en retard de deux clauses.** Décision
   attendue : la faire avancer force une nouvelle acceptation par tous.

5. **« Cycles passés » et « Historique des calculs »** sont deux tables du même
   mois dans l'écran Paiements. Fusion approuvée, non faite.

6. **Échelle, lots 3 et 4** : extraire `Pagination`, câbler AdminPayouts /
   AdminAuditLog / AdminSubscribers / AdminRefunds, et rendre les 44 plafonds
   honnêtes (« 500 sur 12 430 — affinez les filtres »). La sonde
   `scripts/verifs/echelle.py` tient la ligne en attendant.
