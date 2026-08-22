// frontend/src/components/TierMark.jsx — NOUVEAU fichier.
//
// Symbole de palier, dessiné et non téléchargé.
//
// Aller chercher des images libres aurait coûté trois choses : une dépendance
// à un service extérieur, une question de licence à porter indéfiniment, et
// six pictogrammes sans rapport avec la marque. Ces marques-ci viennent du
// logo FIRONOVA — l'hexagone et ses six sommets — et se colorent au palier.
//
// Le RANG SE LIT SANS LIRE LE NOM : un sommet allumé pour Standard, six pour
// Diamant. C'est la seule information qu'un symbole de palier doit porter, et
// elle est visible à seize pixels, là où une illustration deviendrait une
// tache.
//
// Aucun fichier, aucune requête : du SVG en ligne, qui hérite de la couleur
// qu'on lui donne et reste net à toute taille.

// Les six sommets d'un hexagone régulier, dans l'ordre où on les allume :
// on part du bas et on remonte, pour que la progression se lise comme une
// jauge plutôt que comme une rotation.
const SOMMETS = [
  [50, 92], [12, 71], [12, 29], [50, 8], [88, 29], [88, 71],
];

const RANG = {
  standard: 1, bronze: 2, silver: 3, gold: 4, platinum: 5, diamond: 6,
};

export default function TierMark({ tier, color, size = 22, className = "" }) {
  const allumes = RANG[tier] || 1;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"
         className={className} style={{ color }}>
      {/* Contour hexagonal, toujours présent : c'est la forme du logo, et elle
          donne au symbole la même silhouette quel que soit le palier. */}
      <polygon points="50,8 88,29 88,71 50,92 12,71 12,29"
               fill="none" stroke="currentColor" strokeWidth="4"
               opacity="0.28" />
      {SOMMETS.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i < allumes ? 8 : 5}
                fill="currentColor"
                opacity={i < allumes ? 1 : 0.18} />
      ))}
      {/* L'étincelle nova au centre, réservée au dernier palier. Elle est le
          sceau de la marque : la donner à tous la banaliserait, la réserver au
          sommet en fait une distinction. */}
      {allumes === 6 && (
        <path d="M50 26 L55 45 L74 50 L55 55 L50 74 L45 55 L26 50 L45 45 Z"
              fill="currentColor" />
      )}
    </svg>
  );
}
