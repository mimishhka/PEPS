# Journal de session — 29 au 30 septembre 2026

Registre complet du travail, pour que rien ne se perde si la conversation est
compressée. **18 commits**, tous poussés sur `main`.

L'état de référence à la fin : étape bloquante du CI **580 passés / 0 échec**,
frontend **46 suites / 473 tests**, lint à zéro, les deux sondes au vert.

---

## 1. Attribution des commissions

### `b474997` — Une commande sans code n'est jamais attribuée à un affilié

**Ta règle :** « toutes les commandes passées sans entrer de code de rabais
sont attribuées à cet affilié — assure-toi que ce genre n'arrive jamais dans
aucun cas. »

Le repli sur le témoin `fn_ref` est retiré. Le clic ne posait qu'un témoin
sans accorder le moindre rabais : un client qui cliquait puis commandait sans
rien saisir payait plein tarif, et l'affilié touchait quand même — sur une
vente que rien ne distingue d'une vente directe.

**La commission accompagne désormais le RABAIS.** Pas de code, pas de rabais,
pas de commission. C'est vérifiable sur la commande, et c'est la seule règle
explicable sans embarras à un affilié comme à un client.

Les clics restent journalisés : ils mesurent l'audience. Ils ne décident plus
d'aucune commission.

### `3690bfd` — Conditions, FAQ et politique alignées

Les conditions annonçaient encore qu'une commande après un clic était
attribuée **« sans saisie de code »**. Faux depuis le commit précédent — et
c'est un document contractuel.

La politique de confidentialité présentait `fn_ref` comme servant « uniquement
à créditer cette visite ». Le témoin ne crédite plus rien : il mesure. Elle ne
mentionnait pas non plus `fn_ref_code`, la copie en stockage de session — une
donnée déposée sur l'appareil du client, qui doit y figurer.

> **DÉCISION EN ATTENTE :** `AFFILIATE_TERMS_VERSION` vaut toujours
> `2026-08-25b`. La clause d'attribution a changé sur le fond, après celle de
> paiement. La bosseler oblige **tous** tes affiliés à réaccepter. Ça se fait
> par variable d'environnement, sans toucher au code.

---

## 2. Connexion et redirections

### `7817bd3` — L'affilié connecté arrive sur son tableau de bord

**Deux définitions concurrentes de « est affilié ».** La porte du tableau de
bord cherchait par `user_id` et acceptait `active` comme `suspended`. Le
drapeau renvoyé à la connexion cherchait par **courriel** et n'acceptait
qu'`active`.

Et surtout : **`/auth/login` ne renvoyait pas le drapeau du tout.** Le lien
magique menait au bon endroit, le mot de passe jamais — la panne semblait
intermittente alors qu'elle était systématique par ce chemin.

Une seule fonction `_est_affilie`, alignée sur la porte. Elle ne peut pas
faire échouer une connexion : un incident sur la collection vaut « non » et
non une 500.

**L'icône de compte qui ne faisait rien :** elle portait
`/login?next=<page courante>`. En sortant d'OPS on est sur la page de
connexion — le lien pointait donc là où on se trouvait déjà. Rien ne bougeait,
aucune erreur. Une page d'authentification ne se mémorise plus comme
destination, le chemin d'OPS non plus.

### `8cdfe08` — Les instructions de paiement quittent l'écran

`/order/:id` est publique à dessein (retour par courriel). Rien ne l'évacuait :
le nom, le montant, la référence Interac et l'adresse restaient affichés après
la déconnexion. Elle part maintenant, avec `replace` pour que « précédent » n'y
ramène pas.

### `ac0ca01` — Les correctifs deviennent vérifiables

Je t'avais demandé de confirmer sur le site. C'était te déléguer un contrôle
que je pouvais faire tenir en CI. Les règles avaient leurs tests ; ce qui
manquait, c'est la preuve du **câblage** — et c'est un câblage oublié qui
avait causé les deux défauts.

---

## 3. Code de parrainage à la caisse

### `a80ed73` — Le code s'affiche, et part avec la session

Le code du lien n'était écrit dans le champ **qu'en cas de succès** de la
validation. Et l'échec est silencieux, à juste titre. Résultat : champ vide,
plein tarif, aucun recours. Le champ est rempli **avant** la validation.

« Une fois déconnecté il ne tient plus » n'était pas vrai : la copie du code
survivait dans l'onglet. Sur un ordinateur partagé, la personne suivante
décrochait le rabais d'un affilié qu'elle n'a jamais rencontré.

### `962eb00` — Un code inconnu s'oublie, une panne réseau non

Conséquence de mon propre correctif : depuis que le champ affiche le code, un
code mort y serait visible. Il s'oublie sur un **404** — et seulement sur 404.
Ton serveur s'endort : sur une panne réseau, le code est peut-être valide.

---

## 4. Commandes mixtes — précommande + articles disponibles

**Ta décision :** « je crois que retenir la commande complète n'est pas une
bonne idée. »

### `5ecf362` — La scission au paiement

Trois problèmes se cumulaient : le **stock gelé** (décrémenté dès la caisse,
invendable pendant des semaines), **rien ne partait** (aucune file de dispatch
ne connaît `preorder`, et pas d'expédition partielle), et la **commission
versée avant livraison**.

**Au paiement, pas à la caisse.** Scinder à la création ferait naître un envoi
marqué « payé » avant qu'un sou arrive — et le chien de garde l'expédierait.
Au paiement il n'y a qu'un point d'accroche, et tous les chemins y passent.

**Après la commission :** elle doit voir le panier entier, pour n'être créée
qu'une fois.

**La mère reste la facture.** Totaux inchangés : recalculer ferait passer sous
le seuil de 200 $ et ajouterait 20 $ non consentis.

**Le point d'appui :** les six appelants de `_order_items` sont tous des
surfaces d'expédition. Le filtre tient en un seul endroit.

### `7900e1c` — Une précommande ne s'ajoute plus en silence

Le bouton du **catalogue** appelait `add()` directement, sous un libellé
identique à un article en stock. Le panier ne gardait même pas l'information :
`isPre` n'existait que le temps de calculer un prix.

Trois défauts du même genre trouvés en chemin — un écran qui annonce autre
chose que ce qui sera facturé : la fusion de deux ajouts ne recalculait ni
prix ni statut ; `/cart/revalidate` ignorait `preorder_price` ; et il ne
recevait pas la quantité.

### `46eefbe` / `cef1231` — Le client et OPS comprennent

Deux bandeaux sur la page de confirmation, pastilles dans le compte client.
Côté OPS : où est l'argent, quel colis contient quoi, et des pastilles
**cliquables** vers la commande sœur. La pastille « Remplacement » annonçait
un lien sans y mener depuis toujours — corrigée au passage.

### `8c151ab` — Courriels et alerte d'ancienneté

Le mot « précommande » n'apparaissait **pas une seule fois** dans
`services/mail.py`. Nouveau gabarit `preorder_released` : la libération posait
une note interne et se taisait.

Une précommande oubliée ne produisait **aucun signal** — hors dispatch, hors
annulation automatique, et le client ne réclame pas toujours. Passé
`PREORDER_STALE_DAYS` (30 par défaut), une alerte part, **une seule fois**.

> **DÉCISION PRISE :** le port du second envoi sort de ta poche. Deux leviers
> sans toucher au code si ça pèse : retirer `preorder_enabled` de tes articles
> de réassort, ou réintroduire un seuil.

---

## 5. Éditeur de courriels OPS

### `e690a92` — Une accolade de trop

Les boutons de variables ajoutaient une paire d'accolades autour d'une
variable qui en portait déjà. Ton client recevait
`{FN-260930-ABCD1234}` au lieu du numéro. Le bouton **affichait** aussi la
forme fautive : l'écran était cohérent avec lui-même, et faux des deux côtés.

Corriger le bouton ne répare pas le passé : l'écran signale maintenant un
gabarit abîmé et propose « Corriger ici » — qui ne touche que le formulaire,
rien n'est enregistré avant que tu cliques « Enregistrer ».

**Un défaut dans mon propre correctif, attrapé par le test :** `.test()` sur
une expression régulière globale avance `lastIndex`. Le premier champ abîmé
était détecté, les suivants sautés.

### `5bf7ac3` — Tout le message, et tous les états

`intro` et `outro` étaient rendus mais pas éditables : les deux tiers du texte
d'un courriel étaient intouchables sans passer par le code. Le **bloc** reste
en lecture seule, délibérément — pouvoir le mettre à « aucun » sur la
confirmation Interac reviendrait à envoyer une demande de paiement sans les
instructions de paiement.

Le filtre d'OPS ignorait `packing` et `packed`, deux états où ton dispatch
place les commandes lui-même.

La sonde `chaines.py` criait à tort sur les continuations de tableau. Je l'ai
précisée — sa propre note dit qu'une sonde qui crie à tort finit ignorée — et
`scripts/verifs/_test_chaines.py` prouve que la faute d'origine reste
attrapée.

---

## 6. Langue des liens

### `e341c30` — Un courriel en français ouvre une page en français

**Deux moitiés.** Aucun des **dix** liens envoyés par courriel ne portait la
langue, plus les trois du contexte des courriels de commande. Et le navigateur
ne lisait que sa préférence, **avec l'anglais par défaut** : un affilié
francophone qui n'a jamais visité le site n'a rien en mémoire.

**Sur téléphone c'est plus fort :** un lien ouvert depuis Gmail s'affiche dans
un navigateur intégré, contexte de stockage **neuf**. Le paramètre d'URL est
la seule chose qui survive.

Vérifié sur 375 px. Et la cible tactile du sélecteur de langue, qui est la
sortie de secours de ce défaut, passe de 84 × 29 à 84 × 45 sans rien décaler.

Un test lit le **code source** : un onzième lien sans langue le fera échouer.

---

## 7. Visite guidée

### `cd73a1c` — Deux bulles perdues, et c'était de mon fait

La refonte mobile que tu avais demandée a vidé l'aperçu de onze blocs à trois,
chacun rejoignant son onglet. **Les étapes de la visite n'ont pas suivi :**

| Bulle | Onglet demandé | Où sa cible est partie |
|---|---|---|
| « Validé ne veut pas dire versé » | Aperçu | **Performance** |
| « Le seuil de versement » | Aperçu | **Paiements** |

Une cible introuvable est sautée **sans bruit**. Ces deux bulles portent le
délai de 7 jours et le seuil de 50 $. Aucun affilié ne les a vues depuis.

L'ordre visite maintenant chaque onglet **une seule fois**.

**L'entente** était déjà traitée dans le texte, mais rien ne le vérifiait.
Vingt-et-un tests arrivent, dont le parcours complet pour les deux profils et
la géométrie sur 375 px.

---

## 8. Connexion sans compte

### `6d81e39` — Ne plus laisser redemander dans le vide

Ton adresse de test portait un `+lili`. Gmail la livre dans la même boîte,
mais pour le système c'est une chaîne différente, donc **aucun compte**. Le
serveur se tait alors — anti-énumération, et c'est bon.

**L'écran, lui, mentait :** « Un lien de connexion a été envoyé à … ». Il
n'offrait ensuite que « renvoyer ». Formulation conditionnelle maintenant :
« **Si** un compte existe pour cette adresse… » — vraie dans les deux cas,
identique dans les deux cas.

La création de compte est offerte à **tout le monde** : ne la montrer que pour
les adresses inconnues reviendrait à révéler lesquelles le sont.

---

## 9. Fuseau horaire des paliers

### `2877550` — Le mois commence à minuit à Montréal

**Ta question : « est-ce que c'est UTC ? »** Oui — la docstring disait même
« à minuit UTC ». La fenêtre basculait à 20 h à Montréal en heure avancée.

Une vente payée à 21 h le dernier jour du mois tombait dans la fenêtre du mois
**suivant** : elle ne comptait pas pour le palier qu'elle clôturait.

**Un test existant était tombé dans le même piège** : il écrivait
`_utc(2026, 10, 1)` en croyant dire « 1er octobre ».

La carte : l'en-tête porte la date du jour, la période accompagne le montant
des ventes, et **la colonne du barème disparaît sous entente**.

Ce masquage a révélé un défaut plus ancien : « taux convenu par entente » ne
dépendait pas de l'entente mais de l'absence d'un montant à reconduire — ce
qui arrive aussi au dernier palier **sans** entente.

---

## Ce qui reste ouvert

| Sujet | Nature |
|---|---|
| **`AFFILIATE_TERMS_VERSION`** à `2026-08-25b` | Ta décision — force tous les affiliés à réaccepter |
| **Fuseau écrit à deux endroits** | `FUSEAU_PALIER` (serveur) et `FUSEAU` (carte). Je peux le faire descendre avec les données |
| **`.claude/settings.local.json`** non commité | Contient un `Bash(python -)` large ; le commiter l'appliquerait au serveur |
| **Boutons de variables EN** | Seul le corps français en a. Dis-le si tu le veux |
| **Espace disque** | ~200 Mo libres avant que je vide les caches. 1,86 Go dans tes 16 copies de PEPS |
| **22 échecs backend** | Tests HTTP exigeant un serveur sur `127.0.0.1:8001`. Verts en CI |

### Avant lancement (reporté de sessions antérieures)

`mode_test.py --off`, `APP_ENV=production`, `CANADA_POST_API_MODE=prod`,
supprimer `.env.sauvegarde-*`, décider `ADMIN_GATE_CODE`, mise à niveau
FastAPI. Réconciliation Interac : 3 routes backend sans interface.

---

## Déployer

```bash
git -C /app pull origin main && cd /app/frontend && npm run build && sudo supervisorctl restart backend
```
