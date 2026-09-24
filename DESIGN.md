---
name: FIRONOVA — vitrine
description: Le monde « image d'abord » : la photographie porte la page, le texte murmure.
colors:
  nordfjord: "rgb(11 46 79)"
  glacier: "rgb(62 92 118)"
  nova: "rgb(0 184 212)"
  clinical: "rgb(247 250 252)"
  ash: "rgb(203 213 224)"
  ink: "rgb(10 15 20)"
  mist: "rgb(183 202 221)"
  abyss: "rgb(13 53 96)"
  fog: "rgb(143 163 184)"
  compliance: "rgb(80 108 142)"
  success: "rgb(46 158 107)"
  warning: "rgb(232 163 61)"
  error: "rgb(214 69 69)"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "clamp(24px, 3.4vw, 34px)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  data:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "13.5px"
    fontWeight: 500
rounded:
  s: "2px"
  m: "4px"
  l: "6px"
spacing:
  sm: "8px"
  md: "16px"
components:
  button-primary:
    backgroundColor: "{colors.nordfjord}"
    textColor: "{colors.clinical}"
    rounded: "{rounded.m}"
    padding: "13px 22px"
  button-accent:
    backgroundColor: "{colors.nova}"
    textColor: "{colors.nordfjord}"
    rounded: "{rounded.m}"
  input:
    backgroundColor: "{colors.clinical}"
    rounded: "{rounded.m}"
    padding: "12px 14px"
---

## Overview

Le monde visuel de la vitrine est **« image d'abord »** : la photographie porte la page,
le texte murmure. Rien n'est grand pour être grand ; la hiérarchie vient de la photo, de
l'espace et des filets, pas de la taille des titres. Une seule couleur d'accent (nova),
employée en petites doses — une étiquette, un survol, une valeur de mesure.

Le produit est visuel (flacons, pureté, verre) : chaque surface importante montre une
vraie photographie. Sans photo disponible, le repli est la maille moléculaire de la
marque, jamais un bloc de texte décoré.

## Colors

Les couleurs vivent dans `frontend/src/index.css` en canaux RVB, avec contrepartie pour
le mode nuit (les rôles s'échangent, les noms jamais). Sources normatives : les jetons
`--fn-*` du fichier. `nova` est l'accent unique ; il ne colore jamais une grande surface.

## Typography

Trois voix, chacune son rôle :

- **Space Grotesk** — titres et noms de produits, 24–34 px, poids 500–600, jamais de
  40 px et plus dans la vitrine ;
- **Inter** — texte courant, 15 px ;
- **JetBrains Mono** — tout ce qui se mesure : prix, lots, puretés, dates, données de
  laboratoire. Les nombres sont en `tabular-nums`.

## Layout

Conteneur `max-w-7xl`, espace généreux, séparation par **filets** (`border-t/b/y`,
1 px, teintés ash) plutôt que par cartes encadrées. Grille de produits : 2 colonnes sur
mobile, 3 sur petit écran, 4 au large ; gouttières 12–24 px. Le hero est une photo
pleine largeur avec un voile nordfjord dégradé et le texte posé en bas à gauche.

## Elevation & Depth

Pas d'ombre portée générique. La profondeur vient des filets, du voile sur les photos
et de l'espace blanc. La seule ombre autorisée est le jeton `--ombre`, teinté
nordfjord, avec décalage et flou doux — et elle ne s'emploie presque jamais.

## Shapes

Échelle de rayon serrée : 2 / 4 / 6 px (`--r-s/m/l`), portée par l'échelle `rounded-*`
de Tailwind — un seul point de vérité. Boutons rectangulaires à 4 px ; `rounded-full`
réservé aux éléments fonctionnels minuscules (points d'état, contrôles ronds).

## Components

- **Bouton** : rectangle 4 px, fond nordfjord, texte blanc, 13–14 px ; au survol, le
  fond passe nova. État pressé : `scale(0.99)`.
- **Carte produit** : photo carrée, légende en dessous — nom 13,5 px (poids 500),
  dosage en mono 10–11 px, prix en mono 13,5 px, état de stock en texte coloré.
- **Fiche produit** : photo à gauche ; spécifications en lignes fines — étiquette à
  gauche, valeur mono à droite, un filet sous chaque ligne ; prix en mono 26–28 px.
- **Champ** : rectangle 4 px, bordure ash, focus nova avec halo léger.
- **En-tête** : un filet, un mot-symbole, une navigation discrète.

## Do's and Don'ts

**À faire**

- La photographie d'abord : hero photo, cartes photo, fiches photo.
- Les textes à 13–15 px ; le mono pour tout ce qui se mesure.
- Un filet plutôt qu'une carte chaque fois que c'est possible.
- Un seul geste de mouvement par page (l'entrée du hero), doux et rapide (< 300 ms).
- Les contenus, textes et processus sont intacts : on ne change que l'apparence.

**À éviter** (les marqueurs « IA » rejetés, tels qu'énoncés dans les skills
emil-design-eng, impeccable et design-taste-frontend)

- Les titres massifs qui crient, les sections qui portent une étiquette au-dessus de
  chaque titre (un « eyebrow » maximum par trois sections).
- Les cartes imbriquées, les ombres génériques, les pilules décoratives.
- Les dégradés AI, le texte gris sur fond coloré, les médaillons d'icônes.
- Le monospace en costume « technique » ailleurs que pour des mesures réelles.
- Les fausses précisions : aucun chiffre inventé sur la page.
