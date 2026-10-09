# Audit UI/UX, SEO et conversion — Fironova

> 6 oct. 2026 · @mishka
> **Document de référence.** C'est ce rapport qui est appliqué, dans son ordre.
> Audit fait sur l'aperçu Emergent (accueil, catalogue, fiche BPC-157, panier,
> paiement), en largeur ordinateur (1440 px), tablette (700 px) et iPhone
> (390 px). Aucune commande n'a été passée.
>
> Deux constats ont été ajoutés en appendice, relevés séparément et absents du
> relevé d'origine.

Fironova a une base plus sérieuse que la plupart des boutiques de peptides :
identité cohérente, achat en invité, panier bien conçu. Ce qui la retient : des
images trop lourdes, des statuts qui se contredisent, un mobile pensé comme un
ordinateur rétréci et une version française invisible pour Google.

## Les 5 corrections qui rapporteront le plus, dans l'ordre

1. **Alléger les images** : 5,4 Mo pour deux photos. En WebP < 150 Ko, la page
   s'affiche plusieurs fois plus vite (section 4).
2. **Supprimer les contradictions** : BPC-157 « PRE-ORDER » et « IN STOCK » en
   même temps, « COA PENDING » avec un bouton « Download COA » actif. Dans un
   secteur basé sur la confiance, c'est le défaut le plus coûteux (section 3).
3. **Remonter le titre et le bouton sur mobile** : sur iPhone SE, le bouton
   d'action est hors écran au chargement (sections 1 et 5).
4. **Agrandir les zones tactiles** : panier 18 px, menu 20 px, « Add to order »
   30 px, contre 44–48 px demandés par Apple et Google (section 1).
5. **Donner une adresse propre à la version française** et une description
   unique à chaque produit, pour exister sur Google au Québec (section 4).

---

## 1. Expérience mobile et tablette

Sur téléphone, le site s'affiche sans bug majeur (pas de défilement
horizontal), mais il est pensé « bureau rétréci » plutôt que « application ».
Les icônes clés sont trop petites pour un pouce et une partie du texte descend
à 9,5 px. Tests faits sur une largeur iPhone (390 px) et tablette portrait
(700 px).

**Repère simple** : Apple demande des zones tactiles de 44 × 44 px minimum,
Android (Material Design) 48 × 48 px. Le texte courant devrait faire au moins
16 px sur mobile, et jamais moins de 12 px pour les petites étiquettes.

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Icône Panier : 18 × 18 px. Icône Menu : 20 × 20 px | Zones 2 à 2,5 fois trop petites. Le client rate son tap ou ouvre le mauvais élément, surtout d'une main | Garder l'icône à 20–24 px mais agrandir la zone cliquable : `min-width: 48px; min-height: 48px; display:grid; place-items:center` sur le bouton |
| Boutons ADD TO ORDER : 30 px de haut. Sélecteur FR · EN : 29 px | Sous le minimum de 44–48 px. Ce sont les boutons qui rapportent de l'argent | Passer à `min-height: 48px` sur mobile. Pour FR/EN, deux boutons séparés de 44 × 44 px au lieu d'un seul bloc |
| Liens du pied de page (Terms, Privacy, Shipping, FAQ) : 17 px de haut, collés | Taps ratés, ouverture du mauvais lien | `padding: 12px 0; display:block` sur chaque lien (zone de 44 px) |
| Case à cocher de la newsletter : 13 × 16 px | Quasi impossible à cocher du pouce. Le client abandonne l'inscription | Agrandir à 24 px et rendre tout le texte à côté cliquable avec `<label for="...">` |
| Champ e-mail en 15 px | Sur iPhone, Safari zoome automatiquement la page dès qu'on touche un champ en dessous de 16 px. La mise en page saute | `font-size: 16px` sur tous les `input` mobiles |
| Textes en 9,5 à 11 px partout (badges SALE / PRE-ORDER, « 5 mg · Lyophilized », bandeau du haut, « FOR RESEARCH USE ONLY » des cartes) | Illisible sans zoomer pour beaucoup de gens, surtout en police monospace espacée | Plancher à 12 px pour les badges et 14 px pour les infos produit (dosage, format) |
| Le bandeau légal du haut occupe 3 lignes sur iPhone, puis la photo du flacon prend ~350 px avant le titre. Le titre arrive à 546 px et le bouton *Browse the catalog* à 681 px | Sur un iPhone SE (écran de 667 px), le bouton d'action est hors écran au chargement. Le visiteur ne voit qu'une photo et un avertissement | Sur mobile : bandeau en 1 ligne (« Recherche uniquement · 19+ »), puis titre + bouton en premier, photo en dessous ou en fond plus discret |
| Carte BPC-157 : « $64.99 FROM » et « • IN STOCK » se chevauchent et passent sur 2 lignes. Les prix ne sont pas alignés d'une carte à l'autre | Effet « cassé » qui coûte de la confiance, sur l'élément le plus regardé (le prix) | Écrire « À partir de 64,99 $ » sur sa propre ligne, statut de stock sous le prix. Fixer la hauteur des titres de carte pour aligner les prix |
| Le menu ☰ s'ouvre comme un simple panneau collé au contenu : pas de fond qui assombrit la page, pas de séparation, seulement 3 entrées (Catalog, OPS, Sign in) | Ne se comporte pas comme un menu natif iOS/Android : le visiteur ne sait plus où finit le menu et où recommence la page | Panneau plein écran ou tiroir latéral avec fond assombri, page bloquée derrière, fermeture par ✕, tap à l'extérieur ou glissement. Entrées : Catalogue, Certificats (COA), FAQ, Livraison, Contact, Mon compte |
| Tablette (700 px) : le texte du hero passe par-dessus le flacon (« Certificate of analysis » écrit sur l'étiquette) | Texte difficile à lire et image abîmée : c'est l'aspect le moins « premium » de la page | Entre 640 et 1024 px : texte sur une colonne pleine largeur au-dessus, image en dessous. Ou image décalée à droite avec `object-position: right` |

---

## 2. Direction esthétique et finition

La base est sérieuse et au-dessus de la moyenne du secteur. La palette bleu
marine et cyan est cohérente, le logo est propre, et les flacons Fironova
photographiés donnent une vraie identité. Mais trois choses tirent le site vers
le « modèle générique » : des photos de stock qui cassent l'identité, trop de
petites étiquettes en majuscules espacées, et l'avertissement légal répété
partout.

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| 4 produits sur 6 (GHK-Cu, Ipamorelin, Semaglutide, Tirzepatide) ont la même photo de stock noir et blanc, alors que BPC-157 et Epitalon ont un vrai flacon Fironova | Deux univers visuels sur une même grille. Le visiteur perçoit un site inachevé et doute que les produits existent vraiment | Produire un visuel du flacon Fironova pour chaque produit, même cadrage, même fond, seule l'étiquette change. C'est la correction esthétique la plus rentable |
| Majuscules espacées en police « machine à écrire » (monospace) partout : bandeau, « CANADIAN RESEARCH PEPTIDES », « FOR RESEARCH USE ONLY » sur chaque carte, « IN STOCK », « FROM », boutons, légendes du pied de page | C'est la signature n°1 des sites générés par IA (règle « eyebrow » de taste-skill). Utilisé partout, plus rien ne ressort et la lecture fatigue | Réserver le monospace aux données techniques (séquence, CAS, lot, SKU, masse molaire), où il a du sens. Partout ailleurs : Inter en casse normale (« En stock », « À partir de »). Maximum 1 petite étiquette en capitales pour 3 sections |
| 3 polices en même temps : Space Grotesk (titres), Inter (texte), JetBrains Mono (étiquettes), utilisées avec des rôles qui changent selon la page | Rythme visuel morcelé. Une marque premium tient sur 2 familles | Garder Space Grotesk (titres) + Inter (texte), et le monospace uniquement pour les fiches techniques. Mettre la même police sur tous les boutons |
| Mot cyan « for research. » dans le titre, sur photo claire (contraste mesuré ≈ 2,3:1) | Le mot clé du titre est le moins lisible de la page. Le cyan sur fond clair est un réflexe « template » | Mettre le titre entier en bleu marine. Montrer l'accent par la graisse (gras) ou un souligné cyan épais sous le mot, pas par la couleur du texte |
| Pied de page : l'avertissement légal en titre géant (3 lignes de capitales), puis 3 « pastilles » (For Research Use Only, 19+ Age Verified, Loi 25 / PIPEDA) dessinées comme des boutons mais non cliquables | La fin de page crie l'avertissement au lieu de rassurer. Des éléments qui ressemblent à des boutons sans en être frustrent au clic | Avertissement en texte normal 14 px dans le pied de page. Remplacer les pastilles par des liens réels (Conformité, Confidentialité Loi 25) ou par du texte simple sans bordure |
| Animations : effet de survol et petite fenêtre « ajouté au panier », mais pages qui apparaissent d'abord blanches puis des cartes vides sans effet de chargement | Rien n'indique que ça charge : le site paraît bloqué (principe d'Emil Kowalski : la vitesse perçue compte autant que la vraie) | Ajouter des cartes « squelette » animées (fond qui scintille légèrement) de la forme exacte des vraies cartes. Boutons : `transform: scale(0.97)` au clic, transition 160 ms `ease-out` |
| Survol du bouton ADD TO ORDER sur la fiche produit : passe du bleu marine au cyan avec texte blanc (contraste ≈ 2,3:1) | Au moment exact où le client va cliquer, le texte devient peu lisible | Survol = bleu marine légèrement plus clair, texte blanc conservé. Ou cyan avec texte bleu marine (comme sur l'accueil) |

### Détail des polices, page par page

Vérifié sur 6 pages (accueil, catalogue, fiche BPC-157, À propos, FAQ,
paiement) : les 3 mêmes polices sont présentes partout, mais le rôle de chacune
change d'un endroit à l'autre. C'est ce qui donne l'impression que « ce n'est
pas la même police partout » : un même type d'élément (bouton, titre) n'a pas
la même police, ni la même taille, ni la même graisse selon la page.

| Élément | Ce qu'on trouve aujourd'hui | Ce qu'il faut |
|---|---|---|
| Boutons | 3 styles : « CATALOG », « CART », « OPS », « FR · EN » en JetBrains Mono ; « ADD TO ORDER » et « VIEW FULL CATALOG » en Inter majuscules ; « Browse the catalog » en Inter casse normale | Une seule règle : tous les boutons en Inter 600, casse normale, 15–16 px |
| « ADD TO ORDER » | 11 px sur l'accueil et le catalogue, 14 px sur la fiche produit | 15 px partout (16 px sur mobile) |
| Grand titre de page (H1) | Graisse 500 sur l'accueil, 600 sur catalogue / À propos / produit / FAQ, 700 sur le paiement. Taille 32, 34 ou 36 px selon la page | Space Grotesk 600, même taille sur toutes les pages (par exemple 40 px ordinateur, 30 px mobile) |
| Sous-titres (H2) | 26 px / 600 (accueil), 30 px / 700 (FAQ), 20 px / 700 (produit), 17 px / 600 (paiement) | 2 niveaux seulement : titre de section 26 px / 600, sous-titre 18 px / 600 |
| Noms de produits sur les cartes | Space Grotesk en 13,5 px : une police de titre utilisée en très petit | 16–17 px minimum, ou Inter 600 si on veut rester petit |
| Questions de la FAQ | Space Grotesk gras 14 px, alors que le reste du texte de lecture est en Inter | Inter 600, 16 px |
| Petites étiquettes et données | JetBrains Mono pour la navigation, le bandeau, les statuts de stock, « FROM », et aussi pour les données techniques | Mono uniquement pour séquence, CAS, SKU, lot, masse molaire. Navigation et statuts en Inter |

**Solution exacte pour le développeur** : définir 3 rôles dans la feuille de
style (variables CSS) et ne plus jamais écrire une police directement dans un
composant : `--font-display: "Space Grotesk"` (titres H1–H3 uniquement),
`--font-body: "Inter"` (texte, boutons, navigation, formulaires, statuts),
`--font-data: "JetBrains Mono"` (données techniques uniquement). Ajouter une
échelle de tailles fixe (12, 14, 16, 18, 26, 40 px) et l'appliquer à tous les
composants. Le site gagne aussi en vitesse : moins de fichiers de police à
télécharger.

### Choix des polices selon les skills

Le trio actuel n'est pas interdit, mais c'est la combinaison typique des sites
générés par IA. Space Grotesk est sur la liste noire d'Impeccable pour les
pages qui doivent séduire (accueil, vente). Inter est déconseillée par défaut
par taste-skill, mais acceptée pour l'interface.

| Rôle | Aujourd'hui | Recommandé | Statut dans les skills |
|---|---|---|---|
| Titres | Space Grotesk | Cabinet Grotesk ou Satoshi (gratuites, Fontshare) | Recommandées par taste-skill, absentes de la liste noire d'Impeccable |
| Texte, boutons, menus, formulaires | Inter | Inter (ou Satoshi partout pour une seule famille) | Acceptée pour l'interface |
| Données techniques | JetBrains Mono | JetBrains Mono, uniquement séquence / CAS / SKU / lot | Acceptée si limitée aux données |

---

## 3. Cohérence des composants et doublons

Le site répète plusieurs fois les mêmes actions et les mêmes messages, et
certaines infos se contredisent sur une même carte. Chaque doublon dilue
l'attention ; chaque contradiction coûte de la confiance, ce qui pèse lourd
quand on vend des réactifs à des chercheurs.

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| BPC-157 affiche à la fois le badge PRE-ORDER et • IN STOCK | Contradiction directe : le client ne sait pas s'il recevra le produit maintenant | Un seul statut par produit, calculé à partir du stock réel. Précommande seulement si stock = 0 |
| Tirzepatide : « PRE-ORDER » écrit 3 fois (badge, statut sur 2 lignes, bouton) | Bruit visuel, le statut passe même sur 2 lignes (« PRE- / ORDER ») | Badge + bouton « Précommander » suffisent. Supprimer le statut texte en double |
| Fiche BPC-157 : « COA PENDING » et lot actuel « - », mais bouton « DOWNLOAD COA / LAB REPORT » actif juste en dessous. L'accueil promet « Certificate of analysis provided » | Promesse non tenue au moment précis où le chercheur vérifie. C'est le point de confiance n°1 du secteur | Si le COA n'existe pas : bouton désactivé « COA disponible à la sortie du lot » + inscription « M'avertir ». Si le COA existe : afficher le n° de lot et la date d'analyse |
| 3 boutons vers le catalogue sur l'accueil (« Browse the catalog », « VIEW FULL CATALOG », « Catalog » dans le menu) avec 3 textes et 3 styles différents | Même intention, libellés différents : le cerveau croit à 3 destinations différentes (règle « No duplicate CTA intent » de taste-skill) | Un seul libellé partout, par exemple « Voir le catalogue » / « Browse catalog », même style secondaire |
| « FOR RESEARCH USE ONLY » répété ~12 fois sur l'accueil (bandeau, chaque carte, pied de page en géant, pastille, encadré bilingue) | Plus personne ne le lit. Et l'effet « avertissement partout » fait plus louche que professionnel | Garder : la porte d'entrée 19+, le bandeau du haut (1 ligne), la case à cocher au paiement et une mention sur la fiche produit. Retirer la mention de chaque carte et du titre géant du pied de page |
| Bouton OPS (cadenas) dans l'en-tête public et dans le menu | Lien interne d'administration visible des clients : inutile pour eux, intrigant, et une porte d'entrée de plus pour les curieux | Retirer OPS de toute la navigation publique. Y accéder par une URL directe ou après connexion admin |
| Vocabulaire du panier incohérent : « ADD TO ORDER », puis « Added to cart », « CART », « Your cart », « Complete your order » | Le client se demande si « commande » et « panier » sont deux choses | Un seul mot : « Ajouter au panier » / « Add to cart », puis « Panier », puis « Paiement » |
| Bouton d'ajout au panier : cyan sur l'accueil, bleu marine sur la fiche produit | Même action, deux couleurs : le visiteur ne reconnaît pas le bouton principal d'une page à l'autre | Un seul style pour l'action principale sur tout le site (par exemple bleu marine plein), cyan réservé aux accents |
| Liens du pied de page « Terms » et « Shipping » mènent à la même page (`/compliance`) | Deux liens, un seul contenu : impression de site incomplet | Créer de vraies pages Conditions et Livraison, ou fusionner en un seul lien « Conformité et livraison » |
| Fiche produit : le dosage 10 mg est affiché avec « COA PENDING » dans le même bloc que le prix | Le sélecteur de dosage mélange le prix et l'état du certificat : lecture confuse | Sélecteur = dosage + prix seulement. L'état du COA va dans le bloc « Certificat » sous les données techniques |

---

## 4. Performance, SEO et accessibilité

Le plus gros frein est le poids des images : l'accueil télécharge 6,3 Mo, dont
5,4 Mo pour deux seules photos PNG. Côté Google, chaque page produit envoie la
même description que l'accueil, et la version française est invisible pour les
moteurs. Les mesures ont été prises sur l'aperçu Emergent (serveur qui se
réveille, code non optimisé), donc les temps de chargement réels en production
seront meilleurs. Le poids des images, lui, ne changera pas tout seul.

### Performance

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Photo Epitalon : 2,8 Mo. Photo BPC-157 (celle du hero) : 2,6 Mo, en PNG 1380 px, affichées en 164 à 380 px sur mobile | Sur 4G, plusieurs secondes d'attente pour l'image principale. Google mesure ce temps (le « LCP ») et il compte pour le classement | Convertir en WebP ou AVIF, qualité ~80 : viser < 150 Ko par image. Servir 3 tailles avec `srcset` (400, 800, 1400 px) et `sizes` |
| Pages blanches pendant 1 à 3 s à chaque navigation : tout le contenu est construit par JavaScript dans le navigateur | Le visiteur voit un écran vide. Les aperçus de liens (Facebook, iMessage, Slack) et certains robots ne voient rien d'autre que le titre générique | En production : pré-générer le HTML des pages publiques (rendu côté serveur ou « prerender »). Afficher au minimum l'en-tête et des squelettes de cartes immédiatement |
| Image du hero chargée normalement, sans priorité | Le navigateur la télécharge en même temps que tout le reste | Ajouter `fetchpriority="high"` sur l'image du hero et `<link rel="preload" as="image">` dans l'en-tête HTML |
| 9 fichiers de polices (Inter 3 graisses, JetBrains Mono 3 graisses, Space Grotesk…) | ~300 Ko de polices avant que le texte soit dans sa forme finale | Passer à 2 familles (voir section 2) et utiliser une seule police « variable » par famille |

### SEO

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Toutes les pages produit ont la même meta description et le même `og:title` que l'accueil. La page de paiement a aussi le titre de l'accueil | Pour Google, ce sont des pages en double. Dans les résultats, chaque produit montre le même texte générique | Description unique par produit, 140–155 caractères : « BPC-157 5 mg lyophilisé, pureté HPLC ≥ 99 %, COA par lot. Réactif de recherche expédié du Canada. » Même chose pour `og:title` et `og:image` |
| Aucune donnée structurée (balise JSON-LD absente) | Google ne peut pas afficher le prix, la disponibilité ou le nom de marque directement dans ses résultats | Ajouter sur chaque fiche un bloc `Product` avec `name`, `sku`, `brand: Fironova`, `offers` (prix, `priceCurrency: CAD`, `availability`). Sur l'accueil : `Organization` et `WebSite` |
| Version française sur la même adresse que l'anglaise (le bouton FR ne change pas l'URL), `lang="en"` fixe, pas de balises `hreflang`. Lors du test, un clic sur FR n'a pas changé la langue | Google n'indexe que l'anglais : tout le marché québécois qui cherche en français ne vous trouve pas. La Loi 96 attend aussi un site commercial disponible en français | Une URL par langue : `/fr/catalogue/bpc-157-5mg` et `/en/catalog/bpc-157-5mg`, `lang` correct sur chaque page, `<link rel="alternate" hreflang="fr-CA">` et `hreflang="en-CA"` |
| Accueil sans titres de niveau 3 et seulement 2 sous-titres. Aucun texte sur les standards de qualité, la livraison ou le processus de test | Peu de contenu que Google peut associer à « peptides recherche Canada » ou « BPC-157 COA Canada » | Ajouter 2 sections courtes : « Comment chaque lot est testé » et « Livraison au Canada ». La page FAQ peut porter un bloc `FAQPage` |
| Adresse canonique pointe vers `fironova.com` : **correct** | Rien à corriger | Vérifier au lancement que l'aperçu Emergent est bien bloqué aux moteurs (`noindex`) pour éviter le doublon |

### Accessibilité

La norme WCAG demande un contraste d'au moins 4,5:1 pour le texte normal et
3:1 pour le gros texte.

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Texte cyan (#00B8D4) sur fond clair : « CANADIAN RESEARCH PEPTIDES » en 10,5 px et « for research. » : contraste ≈ 2,3:1 | Moitié du minimum requis : illisible pour beaucoup de malvoyants, et en plein soleil sur téléphone | Pour du texte sur fond clair, utiliser un cyan foncé (#00788A ou plus sombre, ≈ 4,6:1) ou le bleu marine. Garder #00B8D4 pour les fonds de boutons et les icônes |
| Texte du hero (gris clair semi-transparent) posé directement sur la photo du flacon | Le contraste varie selon la zone de la photo, et descend sous 3:1 là où le flacon est clair | Ajouter un voile dégradé sous le texte (`linear-gradient` du bleu marine à transparent) ou séparer texte et image |
| Champ e-mail du paiement sans étiquette (seulement un exemple dans le champ) et sans `autocomplete="email"`. Champ code promo sans étiquette, en 14 px | L'exemple disparaît dès qu'on tape ; un lecteur d'écran annonce « champ sans nom ». Zoom forcé sur iPhone pour le code promo | Ajouter une vraie `<label>` « Courriel » au-dessus, `autocomplete="email"`, et passer le code promo en 16 px avec une étiquette |
| Lien vers le compte (icône) sans texte ni nom accessible. Les images produit sont des liens sans texte, en double du nom du produit | Un lecteur d'écran annonce « lien » sans dire où il mène, puis lit chaque produit deux fois | `aria-label="Mon compte"` sur l'icône. Un seul lien par carte, qui englobe image + nom |
| Petit point rond de 8 × 8 px en bas à droite du pied de page, cliquable mais sans nom | Cible minuscule et inconnue | Le supprimer s'il ne sert pas, sinon lui donner un nom et une zone de 44 px |

---

## 5. Clarté et conversion

**Test des 3 secondes** : réussi sur ordinateur, raté sur mobile. Sur grand
écran, « Precision peptides for research. » + « HPLC-tested by an independent
lab » + un flacon dit clairement ce que vous vendez. Sur iPhone, le visiteur
voit un avertissement de 3 lignes et le haut d'un flacon : le titre et le
bouton sont sous la ligne de flottaison.

Le parcours d'achat est court (invité sans compte, panier latéral, paiement sur
une page), mais 7 points de friction le ralentissent.

1. **Porte d'entrée 19+** : uniquement en anglais (« Restricted Access »), et le
   bouton « I AM 19+ AND I UNDERSTAND » passe sur 2 lignes. *C'est la toute
   première impression, et elle exclut les francophones.* → Porte bilingue (ou
   selon la langue du navigateur), bouton court « J'ai 19 ans ou plus » /
   « I'm 19+ », texte explicatif au-dessus.
2. **Accueil** : aucune preuve concrète avant la grille de produits. Les 4
   arguments sont en petites capitales sans détail. *Un chercheur veut voir la
   preuve, pas la promesse.* → 3 blocs avec icône + phrase courte + lien, dont
   un « Voir un exemple de COA » qui ouvre un vrai certificat.
3. **Catalogue** : page blanche puis cartes vides pendant ~3 s, et pas de filtre
   par catégorie. → Squelettes de chargement + filtres simples au-delà de ~12
   produits.
4. **Fiche produit** : sur tablette, le bouton d'achat arrive après ~1 570 px de
   défilement. → Barre d'achat collante en bas sur mobile/tablette. Sur
   ordinateur, photo à gauche et achat à droite.
5. **Confirmation d'ajout** : la fenêtre « Added to cart » disparaît en ~2 s,
   avant qu'on ait le temps de toucher « View cart ». Elle recouvre aussi le
   bouton COA. → 5 s minimum, pause au survol, placée en haut à droite sous
   l'icône panier.
6. **Panier** : bien fait. Mais les frais de livraison (20 $) et le seuil de
   gratuité (200 $) n'apparaissent qu'au paiement. *Un coût surprise en fin de
   parcours est la première cause d'abandon.* → Barre « Plus que 135,01 $ pour
   la livraison gratuite » dans le panier, et aussi sur les fiches.
7. **Paiement** : seulement Virement Interac et cryptomonnaie, et l'âge est
   redemandé. → Si le processeur le permet, ajouter la carte. Sinon, expliquer
   le virement Interac en 3 étapes illustrées, et regrouper les deux cases en
   une seule phrase.

**Ce qui fonctionne et doit rester** : achat en invité sans compte, champs
d'adresse avec remplissage automatique et texte en 16 px, récapitulatif clair,
panier en tiroir.

---

## 6. Passe visuelle grand écran et ergonomie (1440 px)

Sur un écran de 1440 px, la fiche produit est la page la plus réussie : deux
colonnes nettes, informations techniques bien rangées. L'accueil et le
catalogue perdent en revanche de l'impact.

| Problème constaté | Pourquoi c'est un problème | Correction exacte |
|---|---|---|
| Hero : le titre ne fait que 34 px sur un écran de 1440 px, en bas à gauche, et « for research. » touche l'étiquette du flacon centré | Le flacon écrase le message. Titre et image se marchent dessus | Composition « split » : texte à gauche sur ~45 %, flacon décalé à droite (`object-position: 75% center`). Titre à 56–64 px |
| Navigation : un seul lien (« CATALOG ») perdu au centre d'une barre de 1280 px ; icône compte de 16 px sans libellé | La barre paraît vide et ne guide pas : FAQ, certificats, livraison sont introuvables depuis le haut | 4 liens : Catalogue, Certificats (COA), Livraison, FAQ. Icône compte en 24 px avec libellé au survol et `aria-label` |
| Grille « Featured compounds » : 6 produits dans une grille de 4 colonnes → 4 puis 2, avec 2 cases vides | Effet « trou » en plein milieu de la page | Montrer 4 ou 8 produits, ou passer à 3 colonnes (3 + 3) |
| Catalogue : 12 produits, seulement 3 avec un flacon Fironova (dont CJC-1295 avec une étiquette sans nom) ; les 9 autres ont la même photo de stock | Sur grand écran, la répétition saute aux yeux : on croit voir 9 fois le même article | Un visuel de flacon par produit, nom lisible sur l'étiquette |
| Étiquettes « CATALOG » et « NEWSLETTER » flottant seules en haut à droite | Cliché de mise en page générée. L'œil ne sait pas à quoi elles se rattachent | Les supprimer : le titre suffit |
| Newsletter : le bloc occupe la moitié gauche, la moitié droite est vide, puis ~130 px de vide avant le pied de page | Section qui paraît inachevée | Bloc centré sur 640 px, ou deux colonnes. Réduire l'espace sous la section |
| Pied de page : lignes et points décoratifs derrière l'avertissement, 2 colonnes dans 1280 px | Décoration sans fonction, pied de page très vide sur grand écran | Retirer le motif. 4 colonnes : Marque, Boutique, Aide, Légal |
| Fiche produit : « ADD TO ORDER » arrive à 860 px, sous la ligne de flottaison d'un portable 13–14 pouces | Il faut défiler pour acheter, alors que l'image à gauche reste vide en bas | Monter prix + quantité + bouton juste sous le sélecteur ; fiche technique en dessous. Ou colonne de droite collante (`position: sticky; top: 96px`) |
| Fiche produit : le bandeau « FOR RESEARCH USE ONLY » est un bloc bleu marine plein, identique au bouton d'achat juste au-dessus | On croit voir deux boutons ; certains cliqueront dessus | Texte gris 13 px avec icône d'information, sans fond |
| Fiche technique avec un trait sous chaque ligne (7 lignes) | Liste « tableur », le modèle le plus banal | Grouper en 2 blocs : « Identité » (séquence, CAS, masse molaire) et « Lot » (pureté, lot, SKU, forme) |
| Fiche produit : aucun texte de description | Rien pour Google ni pour le chercheur qui découvre le composé | 2–3 phrases factuelles par produit, sans allégation santé |
| Tri du catalogue : 3 boutons « PRICE ↑ », « PRICE ↓ », « NAME » sans intitulé | On ne comprend pas que ce sont des options de tri | Un seul menu « Trier par : Nom / Prix croissant / Prix décroissant » |

**Ergonomie au clavier** : plutôt bien fait. Chaque lien affiche un contour cyan
de 2 px au `Tab`. Deux corrections : le cyan est trop pâle (≈ 2,3:1, minimum
3:1) → bleu marine ou cyan foncé avec `outline-offset: 2px` ; et il manque un
lien caché « Aller au contenu » en début de page.

---

## Plan d'action

Trié par ordre de passage : d'abord ce qui coûte des ventes ou de la confiance
et se corrige vite. **Effort** : S = moins d'une heure, M = une demi-journée,
L = plusieurs jours.

| # | Correction | Section | Impact | Effort |
|---|---|---|---|---|
| 1 | Compresser les images produit en WebP < 150 Ko avec `srcset` | 4 | Très fort | S |
| 2 | Corriger les statuts contradictoires (PRE-ORDER + IN STOCK, COA PENDING + bouton actif) | 3 | Très fort | S |
| 3 | Retirer le bouton OPS de la navigation publique | 3 | Fort | S |
| 4 | Zones tactiles ≥ 48 px et champs en 16 px | 1 | Fort | S |
| 5 | Hero mobile : bandeau 1 ligne, titre + bouton visibles sans défiler | 1, 5 | Très fort | M |
| 6 | Hero ordinateur en composition « split », titre 56–64 px | 6 | Fort | M |
| 7 | Frais de livraison et seuil de 200 $ dans le panier et sur les fiches | 5 | Fort | S |
| 8 | Contraste : cyan foncé, voile sous le hero, étiquette sur le champ e-mail | 4, 6 | Fort | S |
| 9 | Grille d'accueil sans cases vides | 6 | Moyen | S |
| 10 | Fiche produit : bouton d'achat au-dessus de la ligne de flottaison, avertissement en texte simple | 6 | Fort | S |
| 11 | Un seul libellé et un seul style pour « catalogue » et « ajouter au panier » | 3 | Moyen | S |
| 12 | Réduire « FOR RESEARCH USE ONLY » aux 4 endroits utiles | 2, 3 | Moyen | S |
| 13 | Supprimer les étiquettes flottantes et le motif du pied de page | 6 | Moyen | S |
| 14 | Rôles de polices fixes et échelle de tailles unique | 2 | Moyen | M |
| 15 | Meta description, `og:title`, `og:image` uniques par produit + `Product` JSON-LD | 4 | Fort | M |
| 16 | Description de 2–3 phrases factuelles sur chaque fiche | 6 | Fort | M |
| 17 | Barre d'achat collante sur mobile et tablette | 5 | Fort | M |
| 18 | Menu mobile en tiroir ; navigation ordinateur à 4 liens | 1, 6 | Moyen | M |
| 19 | Visuel de flacon Fironova nommé pour chaque produit | 2, 6 | Fort | M |
| 20 | Squelettes de chargement et fenêtre « ajouté au panier » de 5 s | 2, 5 | Moyen | S |
| 21 | Porte d'entrée 19+ bilingue, bouton sur 1 ligne | 5 | Moyen | S |
| 22 | Tri en menu déroulant, newsletter et pied de page recomposés, lien « Aller au contenu » | 6 | Faible | S |
| 23 | Version française sur ses propres URL avec `hreflang` | 4 | Très fort (marché québécois) | L |
| 24 | Pages publiques pré-rendues côté serveur | 4 | Fort | L |
| 25 | Bloc « Comment chaque lot est testé » + exemple de COA téléchargeable | 4, 5 | Fort | M |

---

## Appendice — deux constats ajoutés

Relevés séparément le 06/10/2026, absents du relevé d'origine.

### A. Les douze produits ne sont dans aucun sitemap

`sitemap.xml` déclare **six URL, toutes statiques** :

```
/  ·  /catalog  ·  /about  ·  /compliance  ·  /faq  ·  /privacy
```

Zéro fiche produit. Un commentaire dans `backend/server.py` (`seo_sitemap`)
affirme pourtant que « le sitemap public (sitemap.xml) le faisait déjà ». Il ne
l'a jamais fait — c'est un fichier statique de `frontend/public/`.

`robots.txt`, en revanche, est bien fait : bonnes autorisations, bons blocages
(`/checkout`, `/account`, `/order/`, `/lab`), sitemap déclaré.

**À rattacher au point 15 du plan.**

### B. Où mène réellement le bouton « Download COA »

Le point 2 du plan signale la contradiction « COA PENDING + bouton actif ».
Le lien lui-même est pire que pending :

| Produit | Destination du « COA » |
|---|---|
| `bpc-157-5mg` | `digital-media.fao.org/…&saveName=Life.pdf` — un PDF de l'**Organisation des Nations unies pour l'alimentation et l'agriculture** |
| `ghk-cu-50mg` | `peptidetestcanada.ca` — un **domaine tiers**, vers lequel l'acheteur quitte le site |

Sur **13 variantes, aucune n'héberge son COA chez Fironova** ; onze n'en ont
aucun. Les deux liens existants sont marqués `coa_status: "available"`, donc le
bouton se rend et fonctionne.

**À traiter avec le point 2.**

---

## Suivi d'application

Le tableau du plan reste tel quel : c'est le relevé d'origine, et il vaut
mieux qu'il ne bouge pas. Ce qui suit note ce qui a été appliqué, et ce que
l'application a révélé qui n'était pas dans le relevé.

| # | État | Commit | Ce qu'il faut savoir |
|---|---|---|---|
| 2 | **Fait** | `7361e18` | Un seul statut par produit, et le certificat avec ses pièces. Le badge suit désormais la variante que le bouton ajoute (`cheapest`), pas « une variante quelconque » : c'est la contradiction « PRE-ORDER + IN STOCK » de BPC-157. |
| 3 | **Reporté** | — | Décision de Mireille, 06/10/2026 : « pas le ops pour l'instant étant donné que je suis toujours en mode test ». L'accès OPS reste visible le temps des essais. |
| 4 | **Fait** | `1348f82` | Voir ci-dessous : le relevé citait un champ en 15 px, il y en avait vingt et un. |
| 1 | **Fait** | *(ce commit)* | Dérivées WebP en 400 / 800 / 1400 px, fabriquées **à la demande** par le serveur. 2,78 Mo → 5,5 Ko sur la plus lourde. |

### Ce que le point 4 a révélé

**Le champ e-mail n'était pas seul.** Le relevé citait « Champ e-mail en
15 px ». Un balayage du code en a trouvé **vingt et un**, tous côté client :
la recherche du catalogue, le **code promo de la caisse**, les trois champs du
laboratoire (lot, commande, courriel de suivi), l'infolettre, l'avis de
réapprovisionnement, les deux champs de demande de remboursement, l'adresse et
la devise de versement de l'affiliée, ses trois champs de mot de passe, les
quatre champs de billet de soutien, et les primitives partagées
`ui/input.jsx` / `ui/textarea.jsx`.

Une règle `input { font-size: 16px }` existait **déjà** dans `@layer base`.
Elle ne servait à rien : une classe l'emporte sur un sélecteur de balise, et
toutes les classes Tailwind sont écrites après. `text-sm` ou `text-[15px]`
gagnait à chaque fois, en silence. Le plancher est désormais posé hors de
toute couche, en `!important`, et uniquement sur pointeur grossier — le
bureau garde les tailles voulues par le design, le doigt ne fait plus zoomer
la page. Six tests gardent ces deux propriétés, parce que ce sont elles, et
non la règle, qui avaient été perdues.

**L'en-tête ne pouvait pas tout porter, et il a fallu le mesurer.** Les
cibles du point 4 réclament 186 px dans l'en-tête (deux boutons de langue à
44, le panier à 48, le menu à 48). Mesure du 09/10/2026 avec les polices
réelles : le mot « FIRONOVA » fait 109,5 px, le logo entier 151,5 px. Total
337,5 px — sans une seule gouttière — contre 312 px disponibles sur un
téléphone de 360 px entre les marges `px-6`. La rangée débordait de 23,5 px,
et de 8,5 px encore sur un iPhone de 375.

Deux cessions, dans cet ordre : la marge de l'en-tête passe à 16 px sous
`sm`, et **le mot de la marque se retire sous 430 px** — la largeur du plus
grand téléphone courant en portrait. Au-delà, il revient. La marque FN reste
toujours, elle ramène à l'accueil, et le lien porte déjà
`aria-label="FIRONOVA"`.

**FR · EN est devenu deux boutons, comme le relevé le demandait**, et pour la
raison qu'il donne : un bloc qui bascule ne dit pas ce qui va se passer quand
on le touche. S'y ajoute un piège que la bascule portait seule — un client
arrivé dans la mauvaise langue qui rate son premier tap et recommence
revenait d'où il partait. Deux boutons n'ont pas ce défaut : EN donne
l'anglais, qu'on y soit déjà ou non. Deux tests le vérifient.

### Ce que le point 1 a donné

**Mesure du 09/10/2026** : `backend/uploads/images` pèse 29,4 Mo pour
19 fichiers convertibles, dont trois à 2,78 Mo — affichés en 154 px sur une
carte de catalogue.

Mesuré ensuite sur le chemin de service réel, avec la plus lourde :

| Taille demandée | Poids servi | Gain | Fabrication |
|---|---|---|---|
| original (PNG 1380 px) | 2,78 Mo | — | — |
| 400 px | 5,5 Ko | **514 ×** | 0,40 s, une seule fois |
| 800 px | 13,5 Ko | 211 × | 0,41 s |
| 1400 px | 26,9 Ko | 106 × | 1,17 s |

L'écart visuel se mesure aussi : 1,8 sur 255 en moyenne par canal entre la
dérivée et un redimensionnement de référence. L'étiquette du flacon reste
lisible.

**Pourquoi à la demande et non au téléversement.** Fabriquer les dérivées à
l'envoi n'aurait soigné que les images futures ; les 29,4 Mo déjà en place
seraient restés entiers jusqu'à ce qu'un script de reprise tourne sur le
serveur. Et tant qu'il n'a pas tourné, le frontend ne peut pas émettre de
`srcset` sans risquer un candidat en 404 — **ce qui casse l'image entière**,
pas seulement la taille manquante. Fabriquée au service, la dérivée existe
pour toute image dont l'original existe : ancienne ou nouvelle, sans reprise,
sans drapeau en base, sans schéma à faire évoluer. **Tu n'as rien à lancer.**

**Deux pièges trouvés en chemin, et corrigés :**

- la première version refusait de fabriquer quand l'original était plus
  étroit que la cible, et servait l'original. Ça paraissait économe : c'était
  un piège, parce que la plus grande photo fait 1380 px et qu'un navigateur
  sur grand écran demande 1400. Il recevait donc le PNG de 2,78 Mo — sur
  l'écran où l'image compte le plus. Une image plus étroite est désormais
  convertie à sa largeur native ;
- les largeurs sont une **liste fermée**. Sans cette garde, mille URL
  différentes font mille redimensionnements d'une photo de 2,9 Mo. Une
  largeur hors liste rend 404 et ne fabrique rien.

**Ce qui reste.** Les images sont en double dans le stockage : trois fichiers
identiques à 2 914 804 octets, quatre à 1 272 108, trois à 1 310 543. Rien ne
casse — chacun a ses propres dérivées — mais c'est du stockage payé plusieurs
fois. À regarder un jour, pas en passant.

### Ce qui reste du point 4

Rien d'ouvert sur les cibles elles-mêmes. Deux voisins repérés en passant,
qui appartiennent à d'autres points du plan :

- le **point de 8 × 8 px** du pied de page (relevé, section « pied de page »)
  est la porte d'administration cachée. Il relève du point 3, reporté ;
- `hoverOnlyWhenSupported` n'est pas activé dans la configuration Tailwind :
  les classes `hover:` **restent collées après un tap** sur téléphone. Ce
  n'est pas dans le relevé, le correctif est d'une ligne, et il touche toute
  l'application — donc à faire seul, pas en passant.
