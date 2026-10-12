# Modèle graphique FIRONOVA — fiche de référence

À coller dans un outil de design. Les valeurs viennent de
`frontend/src/index.css` et `frontend/tailwind.config.js`, qui restent la
source de vérité : si les deux divergent un jour, c'est le code qui a raison.

---

## À lire en premier : la marque n'est pas nordique

Les couleurs portent des **noms de code internes** — `nordfjord`, `glacier`,
`mist`, `fog`, `abyss`. Un outil de design à qui on donne ces noms invente une
histoire scandinave et renvoie des fjords, du bois clair et de la laine.

**Ce ne sont pas des intentions, ce sont des étiquettes de variables.** Un
visiteur ne les voit jamais. Le monde visuel est celui d'un **laboratoire** :
du marine, du blanc clinique, un seul cyan, des filets de 1 px, et de vraies
photographies.

Quand tu décris la palette à un outil, **donne-lui la colonne de droite**, pas
la gauche :

| Nom dans le code | À dire à un outil de design |
|---|---|
| `nordfjord` | marine profond |
| `glacier` | bleu-gris (texte secondaire) |
| `nova` | cyan (accent unique) |
| `clinical` | blanc froid (fond de page) |
| `ash` | gris clair (filets) |
| `ink` | presque noir |
| `mist`, `fog`, `abyss` | nuances de bleu-gris |

---

## 1. Couleurs

Valeurs du **mode jour**, puis ce qu'elles deviennent en **mode nuit**. Les
rôles s'échangent, jamais les noms.

| Rôle | Jour | Nuit |
|---|---|---|
| Encre, structure, fonds marine | `#0B2E4F` | `#F7FAFC` |
| Texte secondaire | `#3E5C76` | `#9FB6CC` |
| **Accent unique** | `#00B8D4` | `#00B8D4` *(inchangé)* |
| Accent **en texte** sur fond clair | `#096E80` | `#00B8D4` |
| Fond de page | `#F7FAFC` | `#0A0F14` |
| Surface de carte | `#FFFFFF` | — |
| Filets, bordures | `#CBD5E0` | `#375A7A` |
| Pied de page, ancre sombre | `#0A0F14` | `#0A0F14` |
| Mentions de conformité | `#506C8E` | `#8FAFC9` |
| Succès / attention / erreur | `#2E9E6B` · `#E8A33D` · `#D64545` | `#5FC48D` · `#F0B860` · `#F07A7A` |

**Trois règles qui ne se négocient pas :**

1. **Le cyan ne colore jamais une grande surface.** Une étiquette, un survol,
   une valeur de mesure. C'est tout.
2. **Le cyan pur ne sert jamais de texte sur fond clair** : il y tombe à 2,3:1,
   sous le seuil d'accessibilité. Le texte prend la version assombrie `#096E80`,
   qui donne 5,6:1.
3. **Jamais de gris neutre** pour du texte secondaire : on teinte depuis le
   bleu de la marque.

---

## 2. Typographie

Trois voix, chacune son rôle. Aucune autre police.

| Police | Rôle |
|---|---|
| **Space Grotesk** | titres et noms de produits |
| **Inter** | texte courant |
| **JetBrains Mono** | tout ce qui se **mesure** : prix, lots, puretés, dates, données de laboratoire. Chiffres en `tabular-nums` |

**L'échelle, fixée le 12/10/2026 — une seule pour tout le site public :**

| Usage | Taille | Interlettrage |
|---|---|---|
| Titre de page | 30 px → 36 px dès 640 px | −0,01 em |
| Titre de section | 22 px → 26 px | −0,01 em |
| Texte courant | 15 px | normal |
| Sur-titre (l'étiquette au-dessus d'un titre de page) | 11 px, capitales, mono | 0,24 em |
| Étiquette (mentions, légendes, en-têtes de tableau) | 10 px, capitales, mono | 0,20 em |
| Étiquette interactive (navigation, boutons) | 12 px, capitales, mono | 0,18 em |

**Jamais 40 px ou plus dans la vitrine.** La hiérarchie vient de la photo, de
l'espace et des filets — pas de la taille des titres.

Les champs de saisie font **16 px minimum sur mobile**, sans quoi iOS zoome sur
la page à la mise au point et n'en ressort pas.

---

## 3. Formes et profondeur

- **Rayons : 2 / 4 / 6 px.** Rien d'autre. Boutons et champs à 4 px ; 6 px
  réservé aux grands conteneurs ; `rounded-full` seulement pour des éléments
  ronds minuscules (points d'état).
- **Pas d'ombre portée générique.** La profondeur vient des **filets de 1 px**,
  du voile sur les photos et de l'espace blanc. L'unique ombre autorisée est
  teintée marine, avec décalage et flou doux — et elle ne sert presque jamais.
- **Un filet plutôt qu'une carte**, chaque fois que c'est possible.

---

## 4. Mise en page

- Conteneur : largeur maximale 1280 px, centré, marges latérales 20–32 px.
- Les sections se séparent par un **filet horizontal**, pas par des cartes
  encadrées.
- Grille de produits : 2 colonnes sur mobile, 3 en moyen, 4 en large ;
  gouttières 12–24 px.
- Hero : photographie pleine largeur, voile marine dégradé, texte en bas à
  gauche.

---

## 5. Composants

- **Bouton** — rectangle 4 px, fond marine, texte blanc, 13–14 px. Au survol le
  fond passe au cyan. Pressé : `scale(0,99)`.
- **Carte produit** — photo carrée, légende dessous : nom 13,5 px, dosage en
  mono 10–11 px, prix en mono 13,5 px.
- **Fiche produit** — photo à gauche ; spécifications en lignes fines :
  étiquette à gauche, valeur en mono à droite, un filet sous chaque ligne ;
  prix en mono 26–28 px.
- **Champ** — rectangle 4 px, bordure grise, mise au point cyan avec halo léger.
- **En-tête** — un filet, le mot-symbole, une navigation discrète.

---

## 6. Ce qu'un outil de design va proposer, et qu'il faut refuser

- Les **titres massifs** qui crient.
- Une **étiquette au-dessus de chaque titre** — une seule par trois sections, et
  jamais au-dessus d'un titre de page.
- Les **cartes imbriquées**, les ombres génériques, les pastilles décoratives.
- Les **dégradés**, le texte gris sur fond coloré, les médaillons d'icônes.
- Le **monospace en costume « technique »** ailleurs que pour une vraie mesure.
- Les **fausses précisions** : aucun chiffre inventé, nulle part.
- Les **icônes en emoji** : elles sont dessinées, d'une seule bibliothèque, à
  graisse constante.

---

## 7. La limite qui prime sur tout le reste

Le site vend des **réactifs de laboratoire pour la recherche in vitro**.

Aucune page, aucune image, aucune légende ne mentionne jamais **un effet, une
dose, une voie d'administration, un bénéfice ou un usage humain**. On décrit la
**matière** et la **méthode** : composé, formule, masse molaire, pureté, teneur,
numéro de lot, méthode d'analyse.

Cette règle passe avant l'esthétique. Une page magnifique qui glisse une
posologie détruit les 396 lignes de la page de conformité.
