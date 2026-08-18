// Primitives visuelles partagées par les écrans d'administration.
//
// Elles existent parce que le même défaut se répétait sur 26 tableaux : tout
// était traité au même poids — en-têtes en majuscules espacées, zéros aussi
// visibles que les vrais montants, aucune couleur porteuse de sens. Corriger
// chaque tableau séparément aurait recréé la divergence dès le tableau suivant.
//
// Règle de lecture : la couleur signale une exception, jamais l'ordinaire.

const TIER_TONE = {
  standard: "#7C93A1",
  bronze: "#C97B3F",
  silver: "#8FA3B0",
  gold: "#DFA436",
  platinum: "#7FB0D4",
  diamond: "#8B7BD8",
};

/** En-tête de colonne. Casse normale : les majuscules espacées conviennent à
 *  une étiquette isolée, pas à neuf en rang — au-delà, elles cessent d'être un
 *  accent et deviennent du bruit. */
export function Th({ children, align = "left", className = "" }) {
  // Un en-tête doit être aligné comme sa colonne : décalé, il fait lire la
  // valeur d'à côté. Le centre existe pour les colonnes d'état, où la donnée
  // est une pastille et non un nombre à comparer verticalement.
  const ALIGN = { right: "text-right", center: "text-center", left: "text-left" };
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-[12px] font-semibold text-glacier border-b border-ash ${
        ALIGN[align] || ALIGN.left
      } ${className}`}
    >
      {children}
    </th>
  );
}

/** Valeur numérique. Un zéro atténué : à pleine opacité il attire l'œil autant
 *  qu'un vrai montant, alors qu'il ne dit rien. */
export function Num({ value, format, className = "" }) {
  const empty = value == null || Number(value) === 0;
  const text = value == null ? "—" : (format ? format(value) : value);
  return (
    <span
      className={`font-data tabular-nums whitespace-nowrap ${
        empty ? "text-glacier/45" : "text-nordfjord"
      } ${className}`}
    >
      {text}
    </span>
  );
}

/** Pastille d'initiales. Sur une liste longue, l'œil accroche une forme bien
 *  avant de lire un nom. */
export function Avatar({ name, email, tone }) {
  const src = (name || email || "?").trim();
  const initials = src
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="w-7 h-7 rounded-full shrink-0 grid place-items-center text-[11px] font-bold text-white"
      style={{ background: tone || "#7C93A1" }}
    >
      {initials}
    </span>
  );
}

/** Identité sur deux lignes, jamais sur trois : une adresse longue doublait la
 *  hauteur de rangée en passant à la ligne. */
export function Identity({ name, email, tone }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar name={name} email={email} tone={tone} />
      <span className="min-w-0">
        <span className="block font-semibold text-nordfjord truncate leading-tight">{name || "—"}</span>
        {email && (
          <span className="block text-[12px] text-glacier truncate" title={email}>{email}</span>
        )}
      </span>
    </div>
  );
}

/** Palier avec sa couleur métal : Diamond ne peut pas être du même gris que
 *  Standard, c'est la seule hiérarchie réelle de cet écran. */
export function TierBadge({ tier, rate, label }) {
  if (!tier) return <span className="text-glacier/45">—</span>;
  const tone = TIER_TONE[tier] || TIER_TONE.standard;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tone }} />
      <span className="text-nordfjord">{label || tier}</span>
      {rate != null && (
        <span className="font-data text-[11px] text-glacier">{Math.round(rate * 100)} %</span>
      )}
    </span>
  );
}

export { TIER_TONE };
