import { useState } from "react";
import { VialArt } from "./brand";
import { resolveAssetUrl } from "../lib/api";
import { srcsetDerivees, TAILLES } from "../lib/derivees";

function hueFor(slug = "") {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return 190 + (h % 40);
}

/**
 * ProductImage : renders the product's stored image, falling back to the
 * brand VialArt SVG on load error or missing URL. Keeps every product tile
 * looking good even when an uploaded file has gone missing on disk.
 *
 * LE POIDS, ET NON SEULEMENT L'AFFICHAGE.
 *
 * Audit du 06/10/2026, point 1 : le catalogue pèse 29,4 Mo, dont trois
 * fichiers à 2,78 Mo — affichés en 154 px sur une carte. Le composant demande
 * désormais les trois dérivées WebP que le serveur fabrique à la demande, et
 * laisse le navigateur choisir.
 *
 * `sizes` compte autant que `srcset` : sans lui, le navigateur suppose que
 * l'image occupe toute la largeur de l'écran et prend systématiquement la
 * plus grande. Le `srcset` ne servirait alors à rien. Chaque appelant passe
 * la taille de SA grille ; la valeur par défaut est celle des cartes, qui
 * sont de loin les plus nombreuses.
 */
export default function ProductImage({
  src,
  slug = "",
  alt = "",
  className = "",
  imgClassName = "",
  loading = "lazy",
  fetchPriority = "auto",
  sizes = TAILLES.carte,
  width,
  height,
}) {
  const resolved = resolveAssetUrl(src);
  const [failed, setFailed] = useState(false);

  if (!resolved || failed) {
    return <VialArt hue={hueFor(slug)} className={className} />;
  }
  /* Chaîne vide pour un GIF, une URL externe ou une image hors téléversement :
     on retombe alors sur le seul `src`, inchangé. React omet l'attribut quand
     la valeur est `undefined`, pas quand elle est vide — d'où le `|| undefined`,
     sans quoi on émettrait `srcset=""`, que certains navigateurs traitent
     comme une liste de candidats vide. */
  const srcset = srcsetDerivees(resolved) || undefined;
  return (
    <img
      src={resolved}
      srcSet={srcset}
      sizes={srcset ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onError={() => setFailed(true)}
      className={imgClassName || className}
    />
  );
}
