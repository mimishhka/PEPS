# Audit de l'espace client — Fironova

> 6 oct. 2026 · @mishka
>
> Rapport reçu de Mireille le 11/10/2026, reproduit ici pour que les
> corrections puissent s'y référer ligne à ligne.
>
> **Le tableau du plan d'action manque** : le texte s'arrête sur l'en-tête
> « Effort : S = moins d'une heure, M = une demi-journée, L = plusieurs
> jours » et la liste ne suit pas. Les cinq priorités ci-dessous font donc
> l'ordre de passage, à défaut.

L'espace client est sûr et complet sur l'essentiel : annulation, aide avec
photo, changement d'e-mail sécurisé, suppression du compte, page exclue de
Google. Il échoue sur la première question du client, « où en est ma
commande ? », et il accumule des doublons : menus, boutons, messages et même
commandes affichées deux fois.

Audit fait sur l'aperçu Emergent avec le compte administrateur (vu côté
client), à 390, 670 et 1440 px, en mode clair et sombre. Consultation
seulement : rien n'a été modifié ni envoyé.

## Les 5 corrections prioritaires

1. **Afficher le suivi de la commande** : étapes, adresse de livraison et
   numéro de suivi sont absents de la page commande (section 5).
2. **Une commande = une ligne** : une commande avec précommande apparaît deux
   fois, dont une à 0,00 $ (section 3).
3. **Supprimer les doublons de menu et de boutons** : OPS en double, 3 boutons
   « Sign out » dans le code dont 2 visibles ensemble sur ordinateur,
   « Account » alors qu'on y est déjà (section 3).
4. **Un seul message de confirmation** sur la page commande au lieu de 3
   versions du même texte (section 2).
5. **Rendre le compte utilisable au pouce** : onglets sur une ligne, dernière
   commande visible sans défiler, zones tactiles de 44 px (section 1).

## 1. Mobile et tablette

L'espace client fonctionne sur téléphone (pas de débordement, champs du profil
en 16 px), mais il ne ressemble pas à un espace « application » : la première
commande n'apparaît qu'à 523 px, les onglets passent sur deux lignes, et la
plupart des 48 zones tactiles font moins de 44 px. Testé à 390 px (iPhone),
670 px (tablette) et 1440 px (ordinateur).

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Onglets Orders / Profile / Addresses / Security / Help sur deux lignes sur iPhone ; le trait de l'onglet actif n'est que sous la première ligne | On croit voir deux menus différents ; on ne sait plus quel onglet est actif | Onglets en une ligne qui défile horizontalement (`overflow-x: auto; scroll-snap-type: x`), ou liste verticale de 5 entrées avec chevron, comme les réglages iOS / Android |
| Bandeau légal 3 lignes + en-tête + grande carte « My Account » : la première commande commence à 523 px | Le client vient surtout voir où en est sa commande ; il doit défiler pour la trouver | Sur mobile : carte du compte réduite à une ligne (initiales + nom), dernière commande en tête avec son statut en grand |
| « SIGN OUT → » : 16 px de haut. Sélecteur de thème : 3 boutons de 28 × 28 px. Icône panier 18 px, menu 20 px | Sous les 44 px (Apple) / 48 px (Android) | `min-height: 44px` sur toutes les actions ; icônes avec zone cliquable de 48 px |
| Lien vers la commande liée (« FN-…-P ») dans la ligne : 15 px de haut, collé au reste de la carte qui est elle-même un lien | Un tap mal placé ouvre la mauvaise commande | Supprimer ce lien (voir section 3 : une seule commande, deux envois) |
| Pastilles de statut (PAID, REFUNDED, CANCELLED, FOLLOW-UP…) en 10 px, dates et nombre d'articles en 11 px | Illisible sans zoomer pour beaucoup de clients | Pastilles 12 px, infos secondaires 14 px |
| Formulaire d'aide en 14 px | Zoom automatique de Safari sur iPhone | 16 px (déjà le cas dans le profil) |

## 2. Direction esthétique et finition

En mode clair, l'espace client est propre et cohérent avec la boutique :
cartes blanches, pastilles douces, bonne hiérarchie. Les défauts viennent des
répétitions de texte, des formats qui changent d'une page à l'autre et d'une
page commande déséquilibrée sur grand écran.

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Page commande : le même message 2 fois. « ORDER CONFIRMED — Thank you! Your payment is confirmed and your order is being prepared. » puis « PAYMENT RECEIVED — Thank you! Your payment has been confirmed and your order is now being prepared. », sous l'étiquette « // ORDER CONFIRMED » | Triple répétition (étiquette, titre, encadré) : doublon de texte et de composant | Un seul bloc d'en-tête : statut + numéro + date. Supprimer l'encadré vert et l'étiquette « // … » |
| Page commande sur grand écran : la liste des articles occupe la moitié droite, la moitié gauche est vide | Trou visuel au centre de la page la plus consultée après achat | Deux colonnes utiles : à gauche le suivi (étapes, adresse de livraison, numéro de suivi), à droite les articles et le total |
| 3 formats de date : « Oct 1, 2026 » (liste), « 01/10/2026 20:44:09 » (commande, jour/mois avec secondes), « Sep 12, 01:47 p.m. » (aide) | « 01/10/2026 » se lit 10 janvier pour un anglophone ; incohérence visible | Un seul format par langue : « 1 oct. 2026, 20 h 44 » (FR) / « Oct 1, 2026, 8:44 PM » (EN), sans les secondes |
| 2 formats de montant : « $2326.30 » (liste) et « $2,326.30 » (commande) | Même chiffre écrit différemment selon la page | Formateur partagé (voir section 3) |
| « // ORDER CONFIRMED », « MY ACCOUNT », petites capitales mono partout (onglets, pastilles, déconnexion) | Mêmes tics typographiques que la boutique et l'admin | Titres et onglets en casse normale ; mono réservé aux numéros de commande |
| Tiret long dans le texte client : « (FN-…-P) — already paid » | Le tiret long est banni dans tout texte visible | Remplacer par une virgule ou deux phrases |
| Pastille « 2 SHIPMENTS » orange et « FOLLOW-UP » cyan pour une même commande scindée | Deux couleurs d'alerte pour une situation normale | Une seule mention neutre « 2 envois » (voir section 3) |

## 3. Cohérence des composants et doublons

Règle appliquée : une fonction = un seul endroit, un seul bouton, un seul
morceau de code. Deux éléments qui font la même chose sont un doublon à
supprimer : ils embrouillent le client, et côté code, deux versions d'une même
fonction finissent toujours par diverger (l'une est corrigée, l'autre non).

| Doublon ou incohérence | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Deux déconnexions : « SIGN OUT » dans l'en-tête du site et « SIGN OUT → » dans la carte « My Account » | Même action, deux boutons, deux styles | Garder une seule déconnexion : dans le menu du compte (icône de profil de l'en-tête). Retirer celle de la carte |
| Deux liens par commande dans la liste (le numéro + la carte entière pointent vers la même page) | Un lecteur d'écran annonce chaque commande deux fois ; deux liens = deux composants à maintenir | Un seul lien : la carte entière |
| Une même commande affichée deux fois quand elle contient une précommande : « FN-…-56 » (2 326,30 $, « 2 SHIPMENTS ») et « FN-…-56-P » (0,00 $, PAID, FOLLOW-UP), chacune avec un lien vers l'autre | Le client croit avoir passé deux commandes, dont une gratuite. 4 liens pour un seul achat | Une seule commande dans l'historique, avec deux envois à l'intérieur (« Envoi 1 : expédié », « Envoi 2 : précommande, dès réception du lot »). La sous-commande -P reste un détail technique invisible pour le client |
| Sélecteur de thème (Clair / Sombre / Système) présent dans la carte du compte client et dans la barre latérale admin, alors que les pages publiques n'en ont pas et restent claires | Le même réglage existe à deux endroits et ne s'applique qu'à une partie du site : le client passe en sombre dans son compte, puis retombe en clair sur le catalogue | Un seul composant ThemeSwitcher, placé une seule fois (menu du compte ou pied de page), qui s'applique à toutes les pages. Si la boutique reste claire par choix, retirer le sélecteur du compte client |
| Bouton OPS dans l'en-tête de l'espace client (visible ici car le compte testé est administrateur) | Raccourci admin mélangé à la navigation client | Afficher l'accès admin uniquement dans le menu du compte, et seulement pour les rôles admin |
| Deux façons de nommer le compte : « FIRONOVA » (icône de l'en-tête) et « My Account » (titre de page) | Le lien vers le compte porte le nom de la marque au lieu du nom de la personne ou de « Mon compte » | Libellé « Mon compte » (ou le prénom) partout |
| Formats de date et d'argent mélangés : « Sep 12, 01:47 p.m. » (mois anglais + « p.m. » façon fr-CA), « $2326.30 » sans séparateur de milliers | Deux formateurs différents pour la même donnée = doublon de code | Un seul utilitaire de format (`Intl.DateTimeFormat` et `Intl.NumberFormat`) partagé par la boutique, l'admin et le compte client, selon la langue choisie |

### Doublons dans les menus

Le menu ☰ ne contient que 4 options, dont 3 existent déjà ailleurs sur le même
écran. Et sur grand écran, deux boutons « Sign out » sont visibles en même
temps.

| Option | Où elle apparaît | Ce qu'il faut garder |
|---|---|---|
| OPS | En-tête (bouton blanc) et menu ☰ (même bouton blanc) | Aucun des deux pour un client. Pour un admin : une seule entrée « Administration » dans le menu du compte |
| Sign out | En-tête (ordinateur), menu ☰ (mobile), carte « My Account » : 3 boutons dans le code, 2 visibles ensemble sur ordinateur | Un seul composant, dans le menu du compte. Sur mobile, ce même menu s'ouvre depuis l'icône de profil |
| Account | Menu ☰ alors qu'on est déjà sur la page du compte ; en-tête « FIRONOVA » (icône de profil) pointe aussi vers `/account` | Une seule entrée « Mon compte », marquée comme active quand on y est |
| Catalog | Lien d'en-tête (ordinateur) et menu ☰ (mobile) | Normal : c'est le même lien affiché selon la taille d'écran. À garder, mais généré depuis une seule liste de liens partagée par l'en-tête et le menu mobile |
| Aide | Onglet « HELP » dans le compte, lien « Open help » (`/account?tab=support`) dans la commande, page FAQ dans le pied de page | Un seul nom (« Aide ») et une seule adresse (`/account/aide`). L'onglet s'appelle « Help » mais l'adresse dit « support » |

**Correction de fond** : une seule source de vérité pour la navigation (un
fichier `navigation.ts` avec la liste des liens et le rôle requis pour
chacun), lue par l'en-tête ordinateur, le menu mobile et le pied de page. Plus
aucun bouton de navigation écrit à la main dans une page.

## 4. Performance, sécurité et accessibilité

La sécurité du compte client est bien pensée : changement d'e-mail confirmé
par lien et protégé par le mot de passe, déconnexion de tous les appareils,
suppression du compte avec anonymisation (conforme à l'esprit de la Loi 25),
page exclue de Google (`noindex`). Les faiblesses sont surtout d'accessibilité
dans les formulaires. Testé en consultation seulement, sans rien enregistrer.

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Les étiquettes visibles (« FULL NAME », « NEW EMAIL ADDRESS », « CURRENT PASSWORD », « SUBJECT », « YOUR QUESTION »…) ne sont pas reliées à leur champ dans le code | Un lecteur d'écran annonce « champ de texte » sans dire lequel ; cliquer sur l'étiquette ne place pas le curseur dans le champ | Chaque champ avec `<label for="id">` ou le champ placé dans son `<label>` |
| Nom et e-mail sans remplissage automatique (`autocomplete` vide). Les champs mot de passe, eux, l'ont | Le client retape ce que son navigateur connaît déjà | `autocomplete="name"` et `autocomplete="email"` |
| Formulaire d'aide (sujet, question, photo) en 14 px | Zoom forcé sur iPhone à chaque champ touché | 16 px sur mobile, comme les champs du profil |
| Champ « Photo (optional) » : bouton natif du navigateur, 32 px de haut | Petite cible, style différent du reste | Zone de dépôt de 48 px minimum avec icône, texte « Ajouter une photo », et aperçu après sélection |
| « DELETE MY ACCOUNT » et « Delete » (adresse) : action définitive à un clic (confirmation non vérifiée : je n'ai pas cliqué) | Une suppression sans étape de confirmation est irréversible | Fenêtre de confirmation, avec saisie du mot « SUPPRIMER » pour le compte |
| Pas de double authentification proposée au client | Pas obligatoire pour un compte client, mais un plus de confiance pour des commandes à plusieurs centaines de dollars | Option « Code par e-mail à la connexion », désactivée par défaut |

## 5. Clarté et parcours

Test des 3 secondes : « où en est ma commande ? » → **raté**. La liste dit
seulement « Processing », et la page de la commande ne montre ni étapes, ni
adresse de livraison, ni numéro de suivi. C'est pourtant la raison n°1 pour
laquelle un client ouvre son compte. Le reste du parcours est solide :
annulation possible tant que rien n'est parti, formulaire d'aide avec photo et
suivi des demandes, e-mail modifiable de façon sécurisée.

1. **Liste des commandes.** 30 commandes d'un bloc, sans filtre ni
   pagination, annulées et remboursées mélangées aux actives. *Correction* :
   commandes en cours en haut (« En cours »), puis « Historique » replié ;
   pagination par 10.
2. **Suivi d'une commande.** Aucun indicateur d'étape. *Correction* : frise en
   4 étapes (Payée → En préparation → Expédiée → Livrée) avec la date de
   chaque étape, et le lien de suivi Postes Canada dès qu'il existe. Pour une
   commande en deux envois : une frise par envoi.
3. **Adresse et facture.** La page commande n'affiche pas l'adresse de
   livraison, et le client ne peut pas télécharger sa facture (le back-office,
   lui, a un bouton « Invoice PDF »). *Correction* : bloc « Livré à » + bouton
   « Télécharger la facture », en réutilisant le générateur PDF de l'admin
   (pas un deuxième).
4. **Recommander.** Aucun bouton « Commander à nouveau », alors que ce sont
   des réactifs rachetés régulièrement. *Correction* : bouton « Recommander »
   sur chaque commande livrée, qui remet les articles disponibles dans le
   panier.
5. **Navigation dans le compte.** Les onglets ne changent pas l'adresse de la
   page (toujours `/account`), alors que `/account?tab=support` ouvre bien
   l'onglet Aide. Conséquence : le bouton Retour du navigateur quitte le
   compte au lieu de revenir à l'onglet précédent, et un e-mail ne peut pas
   envoyer directement vers « Mes adresses ». *Correction* : chaque onglet =
   une adresse (`/account/commandes`, `/account/profil`, `/account/adresses`,
   `/account/securite`, `/account/aide`).
6. **Annulation.** Bouton « Request cancellation » clair, avec l'explication
   du remboursement. À garder. Ajouter seulement une confirmation avant
   l'envoi (non vérifiée : je n'ai pas cliqué).

## 6. Jour et nuit, grand écran

Le compte client a son propre sélecteur Clair / Sombre / Système, mais il ne
s'applique qu'à la page du compte : en ouvrant une commande depuis le compte
en mode sombre, on passe d'une page sombre à une page claire. Le mode clair
est le plus soigné ; le mode sombre est correct sur la page compte elle-même.

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Mode sombre : page compte sombre, page commande claire, catalogue clair, bandeau légal clair au-dessus de l'en-tête sombre | Flash blanc à chaque changement de page ; le réglage choisi ne « tient » pas | Appliquer le thème à la racine du site (`<html data-theme>`), lu une seule fois au chargement, pour toutes les pages. Sinon, retirer le sélecteur et rester en clair partout |
| Pastilles PAID et FOLLOW-UP en mode clair : texte cyan sur fond cyan pâle, ≈ 2,5:1, en 10 px | Sous le minimum de 4,5:1 | Texte cyan foncé (`#00788A`) et 12 px |
| Grand écran (1440 px) : en-tête avec 2 « Sign out » visibles en même temps (en-tête + carte du compte) | Doublon visible (section 3) | Un seul, dans le menu du compte |
| Grand écran : liste des commandes en cartes pleine largeur avec seulement numéro, date, montant | Beaucoup d'espace pour peu d'information | Tableau compact sur ordinateur : n°, date, articles, statut d'envoi, total, action (Suivre / Recommander) |
| Page commande sur grand écran : colonne gauche vide | Voir section 2 | Suivi à gauche, articles à droite |

**Point positif** : le choix du thème est mémorisé et l'option « Système »
suit le réglage du téléphone, comme une application native. J'ai remis ton
réglage d'origine (sombre) après le test.

---

## Suivi d'application

| Priorité | État | Ce qu'il faut savoir |
|---|---|---|
| 1 — suivi de la commande | **Fait** | Le numéro de suivi n'était pas absent : la page le lisait dans `shipping_info.tracking`, que le serveur n'écrit jamais. Frise, adresse et lien Postes Canada ajoutés. |
| 2 — une commande = une ligne | à faire | Touche la liste du compte ET la page commande (bandeaux « deux envois »). |
| 3 — doublons de menu et de boutons | partiel | La partie OPS attend : « pas le ops pour l'instant étant donné que je suis toujours en mode test » (06/10/2026). Les trois « Sign out » et le « Account » en double restent à faire. |
| 4 — un seul message de confirmation | **Fait** | L'encadré vert disait mot pour mot ce que l'en-tête venait de dire. Le préfixe « // » des étiquettes est retiré aussi. |
| 5 — compte utilisable au pouce | à faire | Recoupe le point 4 de l'audit UI/UX, déjà appliqué à l'en-tête public, au pied de page et aux cartes produit. |

### Ce que la priorité 1 a révélé

**Le suivi n'était pas une fonctionnalité manquante : c'était un champ mal
lu.** La page de commande portait déjà un bloc « Suivi : … », conditionné à
`order.shipping_info.tracking`. Le serveur écrit `tracking_number`. Aucune
commande n'a donc jamais pu afficher son numéro, depuis le jour où ce bloc a
été écrit — et rien ne le signalait : pas d'erreur, pas de page blanche, juste
un bloc qui ne vient pas. C'est le motif « champ écrit, jamais relu », à
l'envers.

**Toutes les données étaient déjà envoyées au client.**
`_customer_order_payload` transmet la commande entière moins quelques
caviardages : `shipping_address`, `shipping_info`, `fulfillment_status` et
`paid_at` étaient tous là. La correction est donc entièrement côté client,
sans changement de serveur ni migration.

**La colonne de gauche vide et le suivi absent étaient le même défaut.** Les
sections 2 et 6 les signalent séparément ; ils n'en font qu'un. La colonne
était vide parce que le suivi n'existait pas. Elle se remplit maintenant de ce
que la cliente vient chercher. Les états où la frise mentirait — remboursée,
annulée, échouée, en attente de paiement — gardent la colonne unique.

### Deux réserves sur le rapport

- **Section 6, « J'ai remis ton réglage d'origine (sombre) après le test »** :
  l'audit dit par ailleurs n'avoir fait que consulter. Le réglage de thème est
  stocké côté navigateur, donc c'est sans conséquence sur les données — mais
  l'écart entre les deux phrases mérite d'être noté.
- **Section 3, « un fichier `navigation.ts` »** : le projet est en JavaScript,
  pas en TypeScript. La recommandation reste valable, le nom de fichier sera
  `navigation.js`.
