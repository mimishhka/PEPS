// Les graphiques du tableau de bord : SVG pur, aucune bibliothèque.
//
// Deux raisons. Les couleurs vivent en variables CSS et changent au mode
// nuit ; or une couleur posée en attribut SVG (`fill="rgb(var(--x))"`) n'est
// jamais résolue, alors que `currentColor` hérite de la classe Tailwind. Et
// une dépendance de graphiques pèse plus lourd que ces quelques lignes.
//
// Parti pris, repris de Plausible et de Vercel : grilles presque invisibles,
// aucune légende quand il n'y a qu'une série, une seule couleur. Chaque
// pixel doit aider à décider : sinon il sort.
import { useState } from "react";

// ---------------------------------------------------------------------------
// Courbe principale. Une aire, un trait, trois repères d'échelle.
// ---------------------------------------------------------------------------
export function Aire({ serie, argent, L, hauteur = "h-56" }) {
  const [survol, setSurvol] = useState(null);
  if (!serie.length) return null;

  const W = 1000, H = 200, MARGE = 14;
  const max = Math.max(...serie.map((d) => d.revenue), 1);
  const pas = serie.length > 1 ? W / (serie.length - 1) : 0;
  const x = (i) => (serie.length > 1 ? i * pas : W / 2);
  const y = (v) => MARGE + (H - MARGE) * (1 - v / max);
  const points = serie.map((d, i) => `${x(i)},${y(d.revenue)}`).join(" ");
  const aire = `M0,${H} L${points.split(" ").join(" L")} L${W},${H} Z`;
  const vu = survol != null ? serie[survol] : null;

  return (
    <div className="relative">
      {/* Trois repères, très pâles : sans échelle, une courbe n'est qu'une
          forme. Le zéro reste implicite, il est sur la ligne de base. */}
      <div className={`absolute inset-x-0 top-0 ${hauteur} flex flex-col justify-between pointer-events-none`}
           aria-hidden="true">
        {[max, max / 2].map((v, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="font-data text-[10px] text-glacier/60 tabular-nums w-14 shrink-0">{argent(v)}</span>
            <span className="flex-1 h-px bg-ash/40" />
          </div>
        ))}
        <span className="h-px bg-ash/40 ml-[4.25rem]" />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
           className={`w-full ${hauteur} text-nova overflow-visible`}
           aria-label={L("Revenu encaissé par période", "Collected revenue per period")}>
        <defs>
          <linearGradient id="fnAire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.20" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={aire} fill="url(#fnAire)" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2"
                  vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {serie.map((d, i) => (
          <rect key={d.date} x={x(i) - pas / 2} y="0" width={pas || W} height={H} fill="transparent"
                onMouseEnter={() => setSurvol(i)} onMouseLeave={() => setSurvol(null)}>
            <title>{`${d.date} · ${argent(d.revenue)}`}</title>
          </rect>
        ))}
        {vu && (
          <line x1={x(survol)} y1="0" x2={x(survol)} y2={H} stroke="currentColor" strokeWidth="1"
                opacity="0.35" vectorEffect="non-scaling-stroke" />
        )}
        <circle cx={x(survol != null ? survol : serie.length - 1)}
                cy={y((vu || serie[serie.length - 1]).revenue)} r="3.5"
                fill="currentColor" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="flex items-center justify-between mt-2 pl-[4.25rem] font-data text-[10px] text-glacier/70 tabular-nums">
        <span>{serie[0].date}</span>
        <span className="text-nordfjord">
          {vu ? `${vu.date} · ${argent(vu.revenue)} · ${vu.orders} ${L("cmd", "ord")}` : ""}
        </span>
        <span>{serie[serie.length - 1].date}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barre de proportion : une seule ligne, pas un camembert. Deux valeurs se
// comparent mieux côte à côte qu'en tranches.
// ---------------------------------------------------------------------------
export function Proportion({ lignes, argent, testid }) {
  const total = lignes.reduce((s, l) => s + l.valeur, 0) || 1;
  return (
    <div data-testid={testid}>
      {lignes.map((l) => (
        <div key={l.cle} className="py-2.5 border-b border-ash/40 last:border-0"
             data-testid={`${testid}-${l.cle}`}>
          <div className="flex items-baseline gap-3 text-sm">
            <span className="text-nordfjord">{l.nom}</span>
            <span className="font-data text-[11px] text-glacier tabular-nums">
              {Math.round((l.valeur / total) * 100)} %
            </span>
            <span className="ml-auto font-data tabular-nums text-nordfjord">{argent(l.valeur)}</span>
          </div>
          <div className="mt-1.5 h-[3px] bg-ash/40">
            <div className="h-full bg-nordfjord" style={{ width: `${(l.valeur / total) * 100}%` }}
                 aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Affluence : 7 jours × 24 heures. Répond à « quand mes clients commandent »,
// donc à « quand être disponible » et « quand lancer une promotion ».
// Chaque case porte son libellé complet : la couleur seule ne dit rien à qui
// la distingue mal, et l'infobulle native suit aussi le clavier.
// ---------------------------------------------------------------------------
const JOURS_FR = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const JOURS_EN = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function Affluence({ grille, argent, L, lang }) {
  const jours = lang === "fr" ? JOURS_FR : JOURS_EN;
  const lignes = grille || [];
  const plat = lignes.flat();
  const max = Math.max(...plat, 1);
  if (!plat.some((v) => v > 0)) return null;

  let sommet = { jour: 0, heure: 0, valeur: 0 };
  lignes.forEach((ligne, j) => ligne.forEach((v, h) => {
    if (v > sommet.valeur) sommet = { jour: j, heure: h, valeur: v };
  }));

  return (
    <div data-testid="affluence">
      <p className="font-data text-[11px] text-glacier mb-3" data-testid="affluence-sommet">
        {L("Sommet", "Peak")} {jours[sommet.jour]} {sommet.heure} h
        <span className="text-nordfjord"> · {argent(sommet.valeur)}</span>
      </p>
      <div className="space-y-[3px]">
        {lignes.map((ligne, j) => (
          <div key={j} className="flex items-center gap-2">
            <span className="font-data text-[10px] text-glacier/70 w-7 shrink-0">{jours[j]}</span>
            <div className="flex-1 flex gap-[2px]">
              {ligne.map((v, h) => (
                <span key={h} title={`${jours[j]} ${h} h : ${argent(v)}`}
                      className="flex-1 h-3.5 bg-nordfjord"
                      style={{ opacity: v ? 0.12 + (v / max) * 0.88 : 0.05 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-data text-[9px] text-glacier/70 mt-1.5 pl-9">
        <span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span>
      </div>
    </div>
  );
}
