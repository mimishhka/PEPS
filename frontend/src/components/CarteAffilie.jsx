import TierMark from "./TierMark";
import ChiffreAnime from "./ChiffreAnime";

/**
 * LA CARTE DE L'AFFILIE — l'argent, puis deux moments separes.
 *
 * Mireille : « tout est trop melange... il faudrait separer l'information ».
 * Quatre choses cohabitaient dans un seul bloc : le taux du mois, sa base, la
 * prevision et les montants. Chacune retrouve son moment :
 *
 *   1. L'ARGENT       — les gains du mois, en grand, et le palier a cote.
 *   2. CE MOIS-CI     — la base du taux du mois : les douze derniers mois,
 *                       le graphique qui les prouve, la jauge dans le palier.
 *   3. AU 1er ...     — la prevision (onze mois + ce mois-ci), et les deux
 *                       montants mesures sur elle : garder, ou monter — et la
 *                       montee TIENT au 1er, puisque la prevision devient la
 *                       base du mois suivant.
 *
 * TROIS REGLES QUI ONT COUTE CHER A TROUVER.
 *
 * a) L'ECHELLE DU GRAPHIQUE EST ANCREE AU RYTHME DU PALIER, pas aux donnees.
 *    Haut de cadre = 2 x (plancher du palier vise / 12). Un mois au rythme =
 *    mi-hauteur ; un mois exceptionnel est ECRETE avec un chevron, au lieu de
 *    devenir la nouvelle echelle. Un premier mois de 80 $ contre un rythme de
 *    167 $ fait 24 % : l'exageration est impossible, a une ou douze valeurs.
 *
 * b) LA LIGNE DE REFERENCE EST UN CALCUL, PAS UNE CONDITION. Elle s'ecrit en
 *    equation — « 834 $/mois × 12 = Or » — parce que rien n'oblige a vendre
 *    834 $ par mois : une seule vente de 10 001 $ donne Or.
 *
 * c) LES COULEURS VIENNENT DE `--fn-marine-*`, PAS DE `--fn-vif-*`. Cette
 *    carte est marine dans les deux themes ; `--fn-vif-*` est calibre sur
 *    blanc en mode jour, au seuil d'un objet graphique. En texte sur du
 *    marine, le bronze y tombait a 4,2:1.
 */
export default function CarteAffilie({
  data, insights, L, money, tierLabel, tierJeton, tierLueur,
}) {
  const jetonMarine = (tierJeton || "--fn-palier-defaut")
    .replace("--fn-palier-", "--fn-marine-");
  const teinte = `rgb(var(${jetonMarine}))`;
  const teinteVoile = `rgb(var(${jetonMarine}) / 0.15)`;
  const teinteTrait = `rgb(var(${jetonMarine}) / 0.34)`;

  const suivant = data?.next_tier || null;
  const jetonSuivant = suivant
    ? (TOKENS[suivant.tier] || "--fn-marine-defaut") : null;
  const teinteSuivant = jetonSuivant ? `rgb(var(${jetonSuivant}))` : null;

  // ---------------------------------------------------------------- periode
  const jourCourt = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    // `timeZone: UTC` : les bornes sont posees a minuit UTC par le serveur.
    // Sans ce reglage, un navigateur a Montreal (UTC-4) affiche la veille.
    return d.toLocaleDateString(L("fr-CA", "en-CA"), {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });
  };

  // ---------------------------------------------------------------- graphique
  const serie = Array.isArray(data?.mensuel) ? data.mensuel : [];
  const plancher = Number(data?.palier_plancher || 0);
  // Standard n'a pas de plancher : sa reference est le palier AU-DESSUS,
  // sinon la ligne vaudrait zero et ne dirait rien.
  const plancherRef = plancher > 0 ? plancher : Number(suivant?.floor || 0);
  const libelleRef = plancher > 0 ? tierLabel : (suivant ? tierNom(suivant.tier, L) : "");
  const moyenneRef = plancherRef > 0 ? plancherRef / 12 : 0;
  // ECHELLE ANCREE : haut de cadre = 2x le rythme. Aucun mois ne peut la
  // deplacer — c'est le rythme du palier, pas les donnees.
  const echelle = (moyenneRef > 0 ? moyenneRef * 2 : 1);
  const hauteurLigne = moyenneRef > 0 ? 50 : null;

  // ---------------------------------------------------------------- jauge
  const total = Number(data?.rolling12_revenue || 0);
  // LA REGLE EN TROIS PARTIES (Mireille). `total` = douze mois clos : le
  // PLANCHER du mois, arrete le 1er. `projection` = onze mois + mois en
  // cours : la PREVISION du 1er prochain, qui est AUSSI la base du cliquet —
  // un seuil franchi sur cette base paie tout de suite ET tient au 1er.
  const projection = Number(data?.projection_prochaine_periode || 0);
  const plafond = Number(suivant?.floor || 0);
  const etendue = plafond > plancher ? plafond - plancher : 0;
  const pct = (v) => (etendue > 0
    ? Math.min(100, Math.max(0, ((v - plancher) / etendue) * 100)) : 0);
  // La barre montre la base qui compte VRAIMENT : le plus haut des deux.
  const position = pct(Math.max(total, projection));
  const positionProjetee = pct(projection);
  const descend = projection < total;

  // ---------------------------------------------------------------- paliers
  const maintien = data?.maintien_montant;
  const atteinte = data?.atteinte_montant;
  const sousEntente = maintien === null || maintien === undefined;
  const echeance = jourCourt(data?.taux_valide_jusqu_au);

  return (
    <div className="relative overflow-hidden bg-marine texture-bruit"
         style={{
           borderRadius: "var(--r-l)", boxShadow: "var(--ombre-flotte)",
           // LA CARTE RESTE MARINE DANS LES DEUX MODES : ses jetons de texte
           // se figent sur les valeurs de jour. Sans cela, le mode nuit
           // inversait clinical en ink (texte sombre sur marine) et mist en
           // ardoise (2,9:1) : la carte devenait illisible.
           "--fn-clinical": "247 250 252",
           "--fn-mist": "183 202 221",
           "--fn-abyss": "10 15 20",
         }}
         data-testid="affiliate-carte">
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: tierLueur }} aria-hidden="true" />

      {/* ═══════════ LA PERIODE, EN TETE ═══════════ */}
      <div className="relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1
                      px-4 sm:px-7 py-2.5 bg-abyss/25 border-b border-white/10"
           data-testid="carte-periode">
        <p className="font-data text-[11px] uppercase tracking-[0.17em] text-mist">
          {L("Période de référence", "Reference period")}
        </p>
        <p className="font-data text-[11px] sm:text-[12px] font-semibold tracking-[0.02em] text-clinical tabular-nums">
          {jourCourt(data?.periode_debut)} → {jourCourt(data?.periode_fin)}
        </p>
      </div>

      {/* ═══════════ BANDE 1 · L'ARGENT ═══════════ */}
      <div className="relative flex flex-wrap items-center gap-x-4 sm:gap-x-7 gap-y-4 px-4 sm:px-7 py-5 sm:py-6">
        <div className="flex-1 min-w-[140px]">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-nova">
            {L("Gains du mois en cours", "This month's earnings")}
          </p>
          <ChiffreAnime
            valeur={insights?.current_month?.commission}
            format={money}
            testId="affiliate-gains-mois"
            className="block font-display text-[30px] sm:text-[46px] font-bold
                       leading-[0.95] tracking-[-0.035em] mt-2"
          />
          {/* ETAT ZERO : un zero assume, et la seule chose vraie a dire — son
              outil est pret. La phrase « une commande de 100 $ rapporte... »
              n'a plus sa place ici : Mireille l'a retiree. */}
          {Number(insights?.current_month?.commission || 0) <= 0 ? (
            <p className="text-[12px] text-mist mt-2.5 leading-snug">
              <b className="text-white font-semibold">
                {L(`Votre code ${data?.code || ""} est prêt`, `Your code ${data?.code || ""} is ready`)}
              </b>
              {L(" — partagez votre lien, la première commande apparaîtra ici.",
                 " — share your link, the first order will show up here.")}
            </p>
          ) : (
            <p className="text-[12px] text-mist mt-2.5 leading-snug tabular-nums">
              {money(insights?.current_month?.revenue)}{" "}
              {L("de ventes validées", "in validated sales")}
              {Number(data?.mois_courant_commandes || 0) > 0 && (
                <> · {data.mois_courant_commandes}{" "}
                  {L(data.mois_courant_commandes > 1 ? "commandes" : "commande",
                     data.mois_courant_commandes > 1 ? "orders" : "order")}</>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3.5 sm:pl-7 sm:border-l sm:border-white/12"
             data-testid="affiliate-tier-badge">
          <TierMark tier={data?.tier} color={teinte} size={32} />
          <div>
            <p className="font-display text-[17px] sm:text-[19px] font-bold leading-tight text-clinical">
              {L("Palier ", "")}{tierLabel}{L("", " tier")}
            </p>
            <p className="font-data text-[12px] sm:text-[13px] font-semibold tabular-nums mt-1"
               style={{ color: teinte }}>
              {Math.round((data?.commission_rate || 0) * 100)} %{" "}
              {L("de commission", "commission")}
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════ LES DEUX MOMENTS ═══════════
          La confusion venait de quatre choses dans un seul bloc. Deux
          colonnes, chacune titree par son moment. Les montants vivent sous
          le chiffre qu'ils visent : plus aucune phrase d'explication, les
          titres font le travail. */}
      <div className="relative grid grid-cols-[1.05fr_0.95fr] border-t border-white/12">

        {/* — CE MOIS-CI : la base du taux, sa preuve, la position. */}
        <div className="relative px-4 sm:px-7 pt-4 sm:pt-5 pb-5 sm:pb-6
                        border-r border-white/12"
             data-testid="affiliate-periode-graph">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.12em]
                        sm:tracking-[0.2em] text-nova pb-2.5 mb-3 border-b border-dashed border-white/20">
            {L("Ce mois-ci", "This month")}
          </p>
          <p className="font-display text-[22px] sm:text-[30px] font-bold leading-none
                        tracking-[-0.03em] tabular-nums" data-testid="affiliate-periode-total">
            {money(total)}
          </p>
          <p className="text-[11px] sm:text-[12px] text-mist mt-1">
            {L("les douze derniers mois", "the last twelve months")}
          </p>

          {serie.length > 0 && (
            <>
              <div className="relative h-[96px] sm:h-[110px] mt-3">
                {hauteurLigne !== null && (
                  <>
                    <p className="absolute left-0 sm:left-auto sm:right-0 top-0 font-data text-[11px]
                                  tracking-[0.06em] text-mist">
                      {money(Math.round(moyenneRef))}{L("/mois × 12 = ", "/mo × 12 = ")}{libelleRef}
                    </p>
                    <div className="absolute left-0 right-0 border-t border-dashed border-white/40"
                         style={{ top: `calc(50% + 12px)` }} aria-hidden="true" />
                  </>
                )}
                <div className="absolute inset-x-0 bottom-0 top-6 flex items-end gap-1 sm:gap-1.5">
                  {serie.map((m) => {
                    const montant = Number(m.montant || 0);
                    const vide = montant <= 0;
                    const h = echelle > 0 ? Math.min(100, (montant / echelle) * 100) : 0;
                    const ecrete = echelle > 0 && montant > echelle;
                    return (
                      <i key={m.mois} aria-hidden="true"
                         data-testid={m.sortant ? "mois-sortant" : undefined}
                         className={`relative flex-1 rounded-t-[3px] ${vide ? "min-h-[3px]" : ""}`}
                         style={{
                           height: `${Math.max(vide ? 0 : 3, h)}%`,
                           // Le mois qui SORT au prochain changement est hachure :
                           // present dans le total d'aujourd'hui, deja dehors dans
                           // celui de demain.
                           background: vide
                             ? "rgb(255 255 255 / 0.07)"
                             : m.sortant
                               ? "repeating-linear-gradient(-45deg, rgb(183 202 221 / 0.42) 0 4px, rgb(183 202 221 / 0.12) 4px 8px)"
                               : "linear-gradient(180deg, rgb(var(--fn-nova)) 0%, rgb(var(--fn-nova) / 0.28) 100%)",
                           boxShadow: m.sortant && !vide
                             ? "inset 0 0 0 1px rgb(183 202 221 / 0.54)" : undefined,
                         }}>
                        {/* ECRETE : au-dessus de 2x le rythme, la barre se coupe
                            et le chevron dit qu'elle continue au-dela du cadre. */}
                        {ecrete && (
                          <span aria-hidden="true"
                                className="absolute left-1/2 -translate-x-1/2 top-1
                                           border-l-[5px] border-r-[5px] border-b-[6px]
                                           border-l-transparent border-r-transparent
                                           border-b-[rgb(45_191_176)]" />
                        )}
                      </i>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-1 sm:gap-1.5 mt-2" aria-hidden="true">
                {serie.map((m) => (
                  <span key={m.mois}
                        className={`flex-1 text-center font-data text-[11px] tracking-[0.04em] ${
                          m.sortant ? "text-mist font-semibold" : "text-white/65"}`}>
                    {moisInitiale(m.mois, L)}
                  </span>
                ))}
              </div>
              {Number(data?.mois_sortant_montant || 0) > 0 && (
                <p className="flex items-center gap-2 font-data text-[11px] tracking-[0.05em]
                              text-mist mt-3" data-testid="carte-mois-sortant">
                  <b className="w-[11px] h-[11px] rounded-[2px] shrink-0"
                     style={{
                       background: "repeating-linear-gradient(-45deg, rgb(183 202 221 / 0.42) 0 3px, rgb(183 202 221 / 0.12) 3px 6px)",
                       boxShadow: "inset 0 0 0 1px rgb(183 202 221 / 0.54)",
                     }} aria-hidden="true" />
                  {moisLong(data.mois_sortant_cle, L)} · {money(data.mois_sortant_montant)} ·{" "}
                  {L("ne comptera plus le ", "leaves the period on ")}
                  {jourCourt(data?.prochaine_periode_debut)}
                </p>
              )}
            </>
          )}

          {etendue > 0 && (
            <div className="relative mt-6">
              <div className="h-[7px] rounded-full bg-white/15 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                     style={{ width: `${position}%`, background: teinte }} />
              </div>
              {/* LE CURSEUR : ou la prevision atterrit le 1er, une fois le
                  vieux mois sorti et le mois courant entre. Seul pont entre
                  les deux colonnes. */}
              <div className="absolute -top-[7px] w-[2px] h-[21px] rounded-[2px]"
                   style={{
                     left: `${positionProjetee}%`,
                     background: descend ? "rgb(240 151 126)" : "rgb(45 191 176)",
                   }}
                   data-testid="carte-curseur-projection">
                <span className={`absolute top-[25px] whitespace-nowrap font-data text-[11px]
                                  tracking-[0.07em] uppercase ${
                                  positionProjetee < 18 ? "left-0"
                                    : positionProjetee > 82 ? "right-0"
                                    : "left-1/2 -translate-x-1/2"}`}
                      style={{ color: descend ? "rgb(240 151 126)" : "rgb(45 191 176)" }}>
                  {L("au ", "on ")}{jourCourt(data?.prochaine_periode_debut)}
                </span>
              </div>
              <div className="flex flex-wrap justify-between gap-y-1 mt-[34px] font-data text-[11px]
                              tracking-[0.05em] text-white/65 tabular-nums">
                <span>{money(plancher)} · {tierLabel}</span>
                <span>{money(plafond)} · {suivant ? tierNom(suivant.tier, L) : ""}</span>
              </div>
            </div>
          )}
        </div>

        {/* — AU 1er ... : la prevision, et ce qu'elle demande. */}
        <div className="relative px-4 sm:px-7 pt-4 sm:pt-5 pb-5 sm:pb-6"
             data-testid="affiliate-paliers-prix">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.12em]
                        sm:tracking-[0.2em] text-nova pb-2.5 mb-3 border-b border-dashed border-white/20">
            {L("Au ", "On ")}{jourCourt(data?.prochaine_periode_debut)}
          </p>
          <p className="font-display text-[22px] sm:text-[30px] font-bold leading-none
                        tracking-[-0.03em] tabular-nums">
            {money(projection)}
          </p>
          <p className="text-[11px] sm:text-[12px] text-mist mt-1">
            {L("les onze derniers mois + ce mois-ci",
               "the last eleven months + this month")}
          </p>

          {!sousEntente ? (
            <>
              <p className="font-data text-[11px] uppercase tracking-[0.14em]
                            text-white/65 mt-5">
                {L(`D'ici le ${echeance}`, `By ${echeance}`)}
              </p>

              <Ligne
                montant={maintien > 0 ? money(maintien) : (plancher > 0 ? L("Atteint", "Reached") : L("Aucun minimum", "No minimum"))}
                gros={maintien > 0}
                nom={`${tierLabel} · ${Math.round((data?.commission_rate || 0) * 100)} %`}
                sous={L("votre palier actuel", "your current tier")}
                sceau={maintien > 0
                  ? L("pour reconduire\nle taux", "to keep\nyour rate")
                  : plancher > 0 ? L("taux reconduit", "rate kept")
                                 : L("taux garanti", "rate guaranteed")}
                teinte={maintien > 0 ? teinte : "rgb(77 216 196)"}
                fond={maintien > 0 ? teinteVoile : "rgb(45 191 176 / 0.13)"}
                trait={maintien > 0 ? teinteTrait : "rgb(45 191 176 / 0.30)"}
                testId="palier-maintien"
              />

              {suivant && atteinte !== null && atteinte !== undefined && (
                <Ligne
                  montant={money(atteinte)} gros
                  nom={`${tierNom(suivant.tier, L)} · ${Math.round((suivant.rate || 0) * 100)} %`}
                  sous={L("le palier au-dessus", "the tier above")}
                  sceau={L("le taux monte\ndès le seuil franchi",
                           "rate rises\nas soon as you cross")}
                  teinte={teinteSuivant}
                  fond={`rgb(var(${jetonSuivant}) / 0.14)`}
                  trait={`rgb(var(${jetonSuivant}) / 0.30)`}
                  testId="palier-atteinte"
                />
              )}

              {plancher === 0 && (
                <p className="mt-3 px-3.5 py-3 rounded-[6px] text-[13px] leading-relaxed"
                   style={{
                     background: "rgb(45 191 176 / 0.11)",
                     boxShadow: "inset 0 0 0 1px rgb(45 191 176 / 0.24)",
                     color: "rgb(143 227 216)",
                   }}
                   data-testid="palier-elan">
                  {L("Ici, aucun minimum à atteindre : ", "No minimum to hit here: ")}
                  <b className="text-white font-semibold">
                    {L("tout ce que vous vendez sert à monter",
                       "everything you sell moves you up")}
                  </b>
                  {suivant && L(`. ${tierNom(suivant.tier, L)} et ses ${Math.round((suivant.rate || 0) * 100)} % sont votre prochaine étape.`,
                                `. ${tierNom(suivant.tier, L)} and its ${Math.round((suivant.rate || 0) * 100)}% are your next step.`)}
                </p>
              )}
            </>
          ) : (
            /* Sous entente, le palier est fige : afficher un montant a
               reconduire serait une fausse peur, le pendant du faux espoir. */
            <p className="text-[13px] text-mist leading-relaxed mt-5">
              {L("Taux convenu par entente — il ne dépend pas de la période.",
                 "Rate set by agreement — independent of the period.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Une ligne de prix de palier. Extraite parce qu'elle sert deux fois avec des
 *  couleurs differentes, et qu'une seule source evite qu'elles divergent. */
function Ligne({ montant, gros, nom, sous, sceau, teinte, fond, trait, testId }) {
  return (
    <div data-testid={testId}
         className="flex flex-wrap items-center gap-x-2.5 sm:gap-x-3.5 gap-y-1 px-2.5 sm:px-3.5 py-2.5 sm:py-3
                    rounded-[7px] mt-2 first:mt-4"
         style={{ background: fond, boxShadow: `inset 0 0 0 1px ${trait}` }}>
      <p className={`${gros ? "font-display text-[17px] sm:text-[20px] font-bold tracking-[-0.02em]"
                            : "font-data text-[12px] sm:text-[13px] font-semibold tracking-[0.04em]"}
                     leading-none min-w-[72px] sm:min-w-[86px] tabular-nums`}
         style={{ color: teinte }}>
        {montant}
      </p>
      <p className="font-data text-[13px] opacity-50 shrink-0" aria-hidden="true">→</p>
      <p className="font-data text-[11px] sm:text-[12px] uppercase tracking-[0.07em] leading-snug"
         style={{ color: teinte }}>
        {nom}
        <em className="not-italic block text-[11px] text-mist normal-case tracking-[0.04em] mt-0.5">
          {sous}
        </em>
      </p>
      {sceau && (
        <p className="w-full text-left mt-1 font-data text-[11px] tracking-[0.04em]
                      leading-[1.5] whitespace-pre-line
                      sm:w-auto sm:text-right sm:mt-0 sm:ml-auto"
           style={{ color: teinte }}>
          {sceau}
        </p>
      )}
    </div>
  );
}

// Les clefs du serveur (silver/gold/...) vers les jetons de la surface marine.
const TOKENS = {
  standard: "--fn-marine-standard", bronze: "--fn-marine-bronze",
  silver: "--fn-marine-argent", gold: "--fn-marine-or",
  platinum: "--fn-marine-platine", diamond: "--fn-marine-diamant",
};

const NOMS = {
  standard: ["Standard", "Standard"], bronze: ["Bronze", "Bronze"],
  silver: ["Argent", "Silver"], gold: ["Or", "Gold"],
  platinum: ["Platine", "Platinum"], diamond: ["Diamant", "Diamond"],
};

function tierNom(cle, L) {
  const n = NOMS[cle];
  return n ? L(n[0], n[1]) : (cle || "");
}

/** « 2025-09 » -> « S ». L'initiale du mois, pour l'axe du graphique. */
function moisInitiale(cle, L) {
  const m = Number(String(cle || "").slice(5, 7));
  if (!m || m < 1 || m > 12) return "";
  return L("JFMAMJJASOND", "JFMAMJJASOND")[m - 1];
}

/** « 2025-09 » -> « septembre 2025 ». */
function moisLong(cle, L) {
  const [a, m] = String(cle || "").split("-").map(Number);
  if (!a || !m) return "";
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString(L("fr-CA", "en-CA"), {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}
