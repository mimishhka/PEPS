# Audit UI/UX, SEO et conversion — Fironova

> Relevé le 06/10/2026 sur le site servi (`peptide-ca.preview.emergentagent.com`),
> pas sur le code. Chaque constat porte sa preuve : ce qui a été mesuré, et où.
> Classé par **conséquence**, pas par catégorie — l'ordre est celui dans lequel
> je traiterais les points.

---

## 1. Le site ne sert aucun contenu aux robots

**C'est le défaut qui domine tous les autres.** Chaque URL renvoie la même
coquille de 4,5 Ko :

```
GET /product/bpc-157-5mg
<title>Fironova — Research Peptides (For Research Use Only)</title>   ← générique
corps : « You need to enable JavaScript to run this app. »
« BPC-157 » : absent   ·   prix : absent   ·   donnée structurée : aucune
```

Le titre, la description et le canonical que le navigateur affiche sont
**injectés par React après l'exécution du JS** (`useDocumentHead`). Le serveur,
lui, renvoie la même page pour `/`, `/catalog` et les douze fiches produit.

### Ce que ça coûte

Google finit par rendre le JS — tardivement, sur un second passage, sans
garantie, et avec un budget de rendu qui se mérite. Mais **aucun autre robot ne
le fait** : Facebook, LinkedIn, WhatsApp, Slack, iMessage, Pinterest, X, et les
robots d'IA lisent le HTML brut et s'arrêtent là.

Conséquence directe : **chaque lien partagé affiche la carte générique** — le
nom du site, le logo, la description d'accueil. Jamais le produit, jamais son
prix, jamais sa photo.

**Et cela frappe le programme d'affiliation de plein fouet.** Les affiliés
partagent des liens produit (`/product/tirzepatide-10mg?ref=LOLA10`) : c'est le
mécanisme même de distribution du programme. Chacun de ces partages est muet.

### Pistes

Du moins cher au plus complet :

- **Prerendering** des routes publiques (accueil, catalogue, 12 fiches) à la
  compilation ou via un service de rendu en amont. Treize pages : c'est borné.
- **Rendu serveur** pour ces mêmes routes.
- À défaut, au minimum : servir les métadonnées correctes par URL côté serveur,
  même si le corps reste rendu par le client. Les robots sociaux ne lisent que
  le `<head>`.

---

## 2. Le bouton « Download COA » mène à un document de la FAO

Sur `/product/bpc-157-5mg`, bouton **visible et cliquable** :

```
digital-media.fao.org/…/GetOriginalLimited?…&saveName=Life.pdf
```

Un PDF de l'Organisation des Nations unies pour l'alimentation et
l'agriculture. Et sur `ghk-cu-50mg`, le COA pointe vers **`peptidetestcanada.ca`**
— un domaine tiers, vers lequel l'acheteur quitte le site au moment précis de
la décision.

| Variantes au catalogue | COA hébergé chez Fironova | COA externe | Aucun COA |
|---|---|---|---|
| 13 | **0** | 2 | 11 |

Pour un vendeur de peptides de recherche, le certificat d'analyse **est** le
document de confiance — c'est la promesse de la méta-description et de la page
d'accueil. Un acheteur qui clique obtient une publication de l'ONU.

**Et la page se contredit elle-même** : elle affiche « COA pending » et
« CURRENT LOT : — » à côté d'un bouton de téléchargement qui fonctionne.

### Pistes

- Héberger les vrais certificats, ou **retirer le bouton tant qu'il n'y en a
  pas**. Un bouton absent vaut mieux qu'un bouton qui mène ailleurs.
- Côté code, indépendamment des données : le bouton ne devrait pas se rendre
  quand le statut vaut `pending`. La contradiction est un défaut d'affichage,
  pas seulement un défaut de données.

---

## 3. Les douze produits ne sont dans aucun sitemap

`sitemap.xml` déclare **six URL, toutes statiques** :

```
/  ·  /catalog  ·  /about  ·  /compliance  ·  /faq  ·  /privacy
```

Zéro fiche produit. Un commentaire dans `backend/server.py` (`seo_sitemap`)
affirme pourtant que « le sitemap public (sitemap.xml) le faisait déjà ». Il ne
l'a jamais fait — c'est un fichier statique de `frontend/public/`.

`robots.txt`, en revanche, est très bien fait : bonnes autorisations, bons
blocages (`/checkout`, `/account`, `/order/`, `/lab`), sitemap déclaré.

---

## 4. Les quatre produits de la vente croisée partagent la même photo

Sous « Often researched with », TB-500, Semaglutide, Tirzepatide et Ipamorelin
affichent **la même image Unsplash**, hotlinkée depuis un domaine externe, et
**sans attribut `alt`**.

Quatre vignettes identiques, juste après un tableau de spécifications qui vient
d'inspirer confiance, disent « données de démonstration ».

L'image principale du produit, elle, est correctement faite : `loading="eager"`,
`fetchpriority="high"`, `alt` rempli. Le soin est là — il ne s'est pas rendu
jusqu'au bloc de vente croisée.

---

## 5. Le reste, par ordre de gain

| Constat | Mesure | Conséquence |
|---|---|---|
| **Aucune donnée structurée** | 0 `application/ld+json` sur toutes les pages | Ni `Product` (prix, stock, SKU, marque) ni `Organization` : aucun résultat enrichi possible dans Google |
| **Descriptions dupliquées** | les 12 fiches portent la description de l'accueil, mot pour mot | Douze pages que Google lit comme interchangeables |
| **Titres trop courts** | « BPC-157 : Fironova » = 18 caractères | Le champ le plus fort de la page, à moitié vide |
| **Pas de `hreflang`** | 0 `link[rel=alternate][hreflang]` | Site bilingue FR/EN pour le Québec, sans indication de version linguistique |
| **`og:image` générique** | le logo au lieu du flacon, sur chaque fiche | S'ajoute au point 1 : même rendu, le partage reste anonyme |
| **Pied de page à 4 liens** | Terms, Privacy, Shipping, FAQ | Ni contact, ni à-propos, ni page qualité/COA — maillage interne et signaux de confiance minces |

---

## Ce qui est bien fait, et qu'il ne faut pas casser

Le relevé serait malhonnête sans cette section.

- **La fiche produit, sur le fond.** Séquence, pureté HPLC, masse molaire, CAS,
  SKU, forme, lot, stock, variantes de dosage, vente croisée, mention RUO. C'est
  exactement ce qu'un acheteur de recherche cherche, et c'est rare de le voir
  aussi complet.
- **`robots.txt`** — précis, avec les bons blocages.
- **La page d'accueil** : titre à 52 caractères, description à 160, canonical,
  Open Graph complet, carte Twitter, un seul H1, **toutes les images avec
  `alt`** (0 manquant sur 7).
- **L'image principale du produit** : chargement prioritaire, bien décrite.
- **La porte d'âge 19+** : obligation légale, pas un défaut. Elle n'est citée au
  point 1 que parce qu'elle se rend côté client, ce qui s'ajoute au même
  problème.

---

## L'ordre que je propose

1. **Les COA.** C'est de la donnée, pas du code, et c'est ce qui coûte le plus
   cher par visiteur. Héberger les vrais, ou retirer le bouton.
2. **Sitemap et métadonnées par produit** — titres, descriptions, `og:image`.
   Travail borné, gain immédiat, aucun risque.
3. **Prerendering ou rendu serveur** des routes publiques. C'est le chantier,
   mais c'est lui qui débloque à la fois le référencement et **tous les partages
   des affiliés**.
4. Les `alt` manquants et les images de vente croisée.
