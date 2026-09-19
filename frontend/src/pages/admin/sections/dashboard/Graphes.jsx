// Les graphiques du tableau de bord, en SVG et en HTML — sans bibliothèque.
//
// Deux raisons. Les couleurs vivent en variables CSS et changent au mode
// nuit ; or une couleur posée en attribut SVG (`fill="rgb(var(--x))"`) n'est
// jamais résolue, alors que `currentColor` hérite de la classe Tailwind. Et
// une dépendance de graphiques pèse plus lourd que ces quelques dizaines de
// lignes.
import { useState } from "react";

// ---------------------------------------------------------------------------
// Minigraphe en barres — celui des cartes de chiffres.
// N'apparaît QUE si la série existe : dessiner une tendance là où nous n'avons
// pas d'historique (le taux de conversion, par exemple) serait l'inventer.
// ---------------------------------------------------------------------------
export function BarresMini({ valeurs, etiquette }) {
  const utiles = (valeurs || []).filter((v) => Number.isFinite(v));
  if (utiles.length < 2) return null;
  const max = Math.max(...utiles, 1);
  return (
    <div className="flex items-end gap-[2px] h-8 shrink-0" role="img" aria-label={etiquette}>
      {utiles.slice(-14).map((v, i) => (
        <span key={i} className="w-[3px] rounded-[1px] bg-nordfjord/25"
              style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barres empilées : ce que rapportent les nouveaux clients, et les fidèles.
// Les deux segments totalisent EXACTEMENT la barre — une pile dont les parts
// ne font pas le total est un mensonge graphique.
// ---------------------------------------------------------------------------
export function BarresEmpilees({ serie, argent, L, max: maxImpose }) {
  const [survol, setSurvol] = useState(null);
  if (!serie.length) return null;

  const max = maxImpose || Math.max(...serie.map((d) => d.revenue), 1);
  const paliers = [max, max * 0.5, 0];
  // Au-delà d'une douzaine de barres, une date sur deux suffit : les
  // étiquettes se chevauchaient et devenaient illisibles.
  const pasEtiquette = Math.ceil(serie.length / 8);

  return (
    <div>
      <div className="flex gap-3">
        {/* L'échelle à gauche : sans elle, des barres ne sont qu'une forme. */}
        <div className="flex flex-col justify-between h-56 py-1 shrink-0" aria-hidden="true">
          {paliers.map((v, i) => (
            <span key={i} className="font-data text-[10px] text-glacier/70 tabular-nums">
              {argent(v)}
            </span>
          ))}
        </div>
        <div className="flex-1 min-w-0 relative">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
            {paliers.map((_, i) => <span key={i} className="h-px bg-ash/60" />)}
          </div>
          <div className="relative h-56 flex items-end gap-[3px]">
            {serie.map((d, i) => {
              const hauteur = (d.revenue / max) * 100;
              const partFidele = d.revenue ? (d.returning_revenue / d.revenue) * 100 : 0;
              return (
                <div key={d.date}
                     className="flex-1 h-full flex flex-col justify-end min-w-[3px] group relative"
                     onMouseEnter={() => setSurvol(i)} onMouseLeave={() => setSurvol(null)}
                     data-testid={`bar-${d.date}`}>
                  <div className="w-full rounded-t-[3px] overflow-hidden flex flex-col justify-end
                                  transition-opacity"
                       style={{ height: `${Math.max(1.5, hauteur)}%` }}
                       title={`${d.date} · ${argent(d.revenue)} · ${d.orders} ${L("commande(s)", "order(s)")}`}>
                    {/* Nouveaux au-dessus, fidèles en dessous : la base de la
                        barre est ce qui revient tout seul chaque période. */}
                    <span className="w-full bg-nova/45 group-hover:bg-nova/60"
                          style={{ height: `${100 - partFidele}%` }} />
                    <span className="w-full bg-nordfjord group-hover:bg-nordfjord/85"
                          style={{ height: `${partFidele}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {/* Les dates sous l'axe. */}
          <div className="flex gap-[3px] mt-2">
            {serie.map((d, i) => (
              <span key={d.date} className="flex-1 min-w-0 text-center font-data text-[9px] text-glacier truncate">
                {i % pasEtiquette === 0 ? d.date.slice(5) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {survol != null && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] bg-clinical rounded-lg px-3 py-2"
             data-testid="bar-hover">
          <span className="font-data font-semibold text-nordfjord">{serie[survol].date}</span>
          <span className="text-glacier">{L("Total", "Total")}
            <b className="text-nordfjord tabular-nums"> {argent(serie[survol].revenue)}</b></span>
          <span className="text-glacier">{L("Fidèles", "Returning")}
            <b className="text-nordfjord tabular-nums"> {argent(serie[survol].returning_revenue)}</b></span>
          <span className="text-glacier">{L("Nouveaux", "New")}
            <b className="text-nordfjord tabular-nums"> {argent(serie[survol].new_revenue)}</b></span>
          <span className="text-glacier tabular-nums">
            {serie[survol].orders} {L("commande(s)", "order(s)")}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anneau des circuits de paiement — deux parts, pas douze : un camembert de
// deux tranches se lit d'un coup, ce qui est précisément son seul usage
// légitime.
// ---------------------------------------------------------------------------
export function Anneau({ parts, argent, testid = "donut" }) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  const R = 42, C = 2 * Math.PI * R;
  let debut = 0;

  return (
    <div className="flex items-center gap-5" data-testid={testid}>
      <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0 -rotate-90" role="img"
           aria-label={parts.map((p) => `${p.nom} ${argent(p.valeur)}`).join(", ")}>
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="12" className="stroke-clinical" />
        {total > 0 && parts.map((p) => {
          const part = p.valeur / total;
          const dash = `${part * C} ${C}`;
          const offset = -debut * C;
          debut += part;
          return (
            <circle key={p.nom} cx="50" cy="50" r={R} fill="none" strokeWidth="12"
                    strokeDasharray={dash} strokeDashoffset={offset}
                    className={p.classe} strokeLinecap="butt" />
          );
        })}
      </svg>
      <ul className="flex-1 min-w-0 space-y-2">
        {parts.map((p) => (
          <li key={p.nom} className="flex items-center gap-2 text-sm"
              data-testid={`${testid}-${p.cle}`}>
            <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${p.pastille}`} aria-hidden="true" />
            <span className="flex-1 min-w-0 truncate text-nordfjord">{p.nom}</span>
            <span className="text-glacier tabular-nums text-xs">
              {total > 0 ? Math.round((p.valeur / total) * 100) : 0} %
            </span>
            <span className="font-semibold tabular-nums text-nordfjord whitespace-nowrap">
              {argent(p.valeur)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Affluence : 7 jours × 24 heures. Répond à « quand mes clients commandent »,
// donc à « quand dois-je être disponible » et « quand lancer une promotion ».
// Chaque case porte son libellé complet : la couleur seule ne dit rien à qui
// la distingue mal, et une infobulle native suit aussi le clavier.
// ---------------------------------------------------------------------------
const JOURS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const JOURS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Affluence({ grille, argent, L, lang }) {
  const jours = lang === "fr" ? JOURS_FR : JOURS_EN;
  const lignes = grille || [];
  const max = Math.max(...lignes.flat(), 1);
  const total = lignes.flat().reduce((s, v) => s + v, 0);
  if (!total) return null;

  // Le sommet, écrit en toutes lettres : c'est l'information qu'on cherche.
  let sommet = { jour: 0, heure: 0, valeur: 0 };
  lignes.forEach((ligne, j) => ligne.forEach((v, h) => {
    if (v > sommet.valeur) sommet = { jour: j, heure: h, valeur: v };
  }));

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-display text-xl font-bold tabular-nums text-nordfjord">
          {argent(sommet.valeur)}
        </span>
        <span className="text-[11px] text-glacier" data-testid="affluence-sommet">
          {L("sommet", "peak")} · {jours[sommet.jour]} {sommet.heure} h
        </span>
      </div>
      <div className="space-y-[3px]" data-testid="affluence">
        {lignes.map((ligne, j) => (
          <div key={j} className="flex items-center gap-2">
            <span className="font-data text-[10px] text-glacier w-8 shrink-0">{jours[j]}</span>
            <div className="flex-1 flex gap-[2px]">
              {ligne.map((v, h) => (
                <span key={h}
                      title={`${jours[j]} ${h} h — ${argent(v)}`}
                      data-testid={v === sommet.valeur && v > 0 ? "affluence-max" : undefined}
                      className="flex-1 h-4 rounded-[2px] bg-nova"
                      style={{ opacity: v ? 0.15 + (v / max) * 0.85 : 0.06 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-data text-[9px] text-glacier mt-1.5 pl-10">
        <span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span>
      </div>
    </div>
  );
}
