/* Les trois largeurs d'image, côté client.
 *
 * Audit UI/UX du 06/10/2026, section 4 : « Photo Epitalon : 2,8 Mo. Photo
 * BPC-157 (celle du hero) : 2,6 Mo, en PNG 1380 px, affichées en 164 à
 * 380 px sur mobile. Convertir en WebP, qualité ~80 : viser < 150 Ko par
 * image. Servir 3 tailles avec `srcset` (400, 800, 1400 px) et `sizes`. »
 *
 * Le serveur fabrique la dérivée à la demande (voir
 * `backend/services/vignettes.py`) : toute image dont l'original existe a ses
 * trois tailles, ancienne ou nouvelle, sans reprise manuelle. C'est ce qui
 * rend le `srcset` sûr — un candidat en 404 casse l'image ENTIÈRE, pas
 * seulement la taille manquante.
 *
 * DOIT RESTER ALIGNÉ sur `LARGEURS` dans `backend/services/vignettes.py` :
 * une largeur que le serveur ne connaît pas est refusée et rend 404.
 */

export const LARGEURS = [400, 800, 1400];

/* Seuls ces formats se convertissent. Le GIF est exclu côté serveur pour ne
 * pas perdre l'animation : lui demander une dérivée rendrait 404, donc on ne
 * lui en demande pas. */
const EXTENSIONS_CONVERTIBLES = /\.(png|jpe?g|webp)$/i;

/* Une image téléversée, servie par le proxy. Les deux préfixes existent :
 * d'anciennes URL stockées en base commencent par `/uploads/` sans `/api`. */
const CHEMIN_TELEVERSE = /\/uploads\/images\/[^/?#]+$/i;

/**
 * Rend le `srcset` des trois dérivées, ou une chaîne vide quand l'image n'en
 * a pas (SVG de secours, URL externe, GIF).
 */
export function srcsetDerivees(url) {
  if (!url || typeof url !== "string") return "";
  const sansParametres = url.split(/[?#]/)[0];
  if (!CHEMIN_TELEVERSE.test(sansParametres)) return "";
  if (!EXTENSIONS_CONVERTIBLES.test(sansParametres)) return "";

  const base = sansParametres.replace(/\.[^./]+$/, "");
  return LARGEURS.map((l) => `${base}_${l}.webp ${l}w`).join(", ");
}

/* `sizes` par défaut : la largeur à laquelle l'image s'affiche réellement.
 *
 * Sans lui, le navigateur suppose 100vw et télécharge toujours la plus
 * grande — le `srcset` ne servirait alors à rien. Les valeurs suivent les
 * grilles réelles du site.
 */
export const TAILLES = {
  // Catalogue et accueil : 2 colonnes sous 640, 3 jusqu'à 1024, puis 4 dans
  // un conteneur plafonné à 1280.
  carte: "(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw",
  // Fiche produit : pleine largeur sur téléphone, moitié sur grand écran.
  fiche: "(min-width: 1024px) 600px, 100vw",
  // Hero : toute la largeur, toujours.
  hero: "100vw",
  // Panier et confirmation d'ajout : une vignette de quelques dizaines de
  // pixels. Toute valeur sous 400 choisit la même dérivée — la plus petite —
  // mais l'écrire garde l'intention lisible si une taille plus fine
  // s'ajoutait un jour.
  vignette: "96px",
};
