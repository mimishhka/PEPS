// Courbe de revenu — aire en SVG pur.
//
// Pas de bibliothèque de graphiques ici, pour deux raisons : les couleurs
// doivent rester celles de l'identité (elles vivent en variables CSS et
// changent au mode nuit), et un `fill="rgb(var(--fn-nova))"` posé en attribut
// SVG n'est JAMAIS résolu par le navigateur. `currentColor`, lui, hérite de la
// classe Tailwind et suit donc le thème sans une ligne de plus.
//
// Une seule série : aucune légende — le titre la nomme. Le point final est
// marqué, l'échelle et les dates sont annoncées sous l'axe, et les mêmes
// données existent en tableau pour qui ne lit pas une courbe.
import { useId, useState } from "react";

const H = 190;          // hauteur du tracé, en unités de la vue
const W = 1000;         // largeur de la vue ; le SVG s'étire ensuite
const MARGE = 12;       // air au-dessus du sommet, pour que le point respire

export function AireRevenu({ serie, argent, L, libelleCommandes }) {
  const degrade = useId().replace(/:/g, "");
  const [survol, setSurvol] = useState(null);

  if (!serie.length) return null;

  const max = Math.max(...serie.map((d) => d.revenue), 1);
  const pas = serie.length > 1 ? W / (serie.length - 1) : 0;
  const x = (i) => (serie.length > 1 ? i * pas : W / 2);
  const y = (v) => MARGE + (H - MARGE) * (1 - v / max);

  const points = serie.map((d, i) => `${x(i)},${y(d.revenue)}`).join(" ");
  const aire = `M0,${H} L${points.replace(/ /g, " L")} L${W},${H} Z`;
  const dernier = serie[serie.length - 1];

  return (
    <div className="relative">
      {/* Trois repères horizontaux : sans échelle, une courbe n'est qu'une
          forme. Ils restent très pâles pour ne pas concurrencer la donnée. */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none"
           aria-hidden="true">
        {[max, max / 2, 0].map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="font-data text-[10px] text-glacier/70 tabular-nums w-16 shrink-0">
              {argent(v)}
            </span>
            <span className="flex-1 h-px bg-ash/60" />
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
           className="w-full h-52 text-nova overflow-visible"
           aria-label={L("Revenu encaissé par période", "Collected revenue per period")}>
        <defs>
          <linearGradient id={degrade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={aire} fill={`url(#${degrade})`} />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {/* Zones de survol : plus larges que la courbe, sinon il faudrait
            viser un trait de deux pixels. */}
        {serie.map((d, i) => (
          <rect key={d.date} x={x(i) - pas / 2} y="0" width={pas || W} height={H}
                fill="transparent" className="cursor-crosshair"
                onMouseEnter={() => setSurvol(i)} onMouseLeave={() => setSurvol(null)}>
            <title>{`${d.date} · ${argent(d.revenue)} · ${d.orders} ${libelleCommandes}`}</title>
          </rect>
        ))}
        {survol != null && (
          <line x1={x(survol)} y1="0" x2={x(survol)} y2={H} stroke="currentColor"
                strokeWidth="1" strokeDasharray="3 3" opacity="0.5"
                vectorEffect="non-scaling-stroke" />
        )}
        <circle cx={x(survol != null ? survol : serie.length - 1)}
                cy={y((survol != null ? serie[survol] : dernier).revenue)}
                r="4" fill="currentColor" stroke="white" strokeWidth="2"
                vectorEffect="non-scaling-stroke" />
      </svg>

      {/* L'étiquette de survol vit en HTML, pas en SVG : elle doit rester
          lisible quelle que soit la déformation du viewBox. */}
      {survol != null && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-nordfjord text-white
                        font-data text-[11px] px-2.5 py-1.5 rounded-md whitespace-nowrap
                        pointer-events-none shadow-sm" data-testid="chart-hover">
          {serie[survol].date} · {argent(serie[survol].revenue)} · {serie[survol].orders} {libelleCommandes}
        </div>
      )}
    </div>
  );
}

export default AireRevenu;
