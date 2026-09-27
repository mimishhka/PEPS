import TierMark from "./TierMark";
import ChiffreAnime from "./ChiffreAnime";

/**
 * LA CARTE DE L'AFFILIE — disposition « trois bandes ».
 *
 * Elle remplace six blocs qui vivaient separement dans l'apercu : le bandeau
 * de gains, le palier, la fenetre de douze mois, la barre de progression, et
 * les deux chiffres cles. Mireille : « les gains du mois sont beaucoup trop
 * loin dans le tableau », et « je ne veux pas que tout soit deroule sur une
 * page du haut a la fin ».
 *
 * L'ordre de lecture est impose par la structure, pas par la taille :
 *
 *   1. L'ARGENT   — ce qu'elle vient voir. Les gains du mois, en grand, et le
 *                   palier qui les explique juste a cote.
 *   2. LA PREUVE  — d'ou vient le palier. Le graphique mensuel, le total de la
 *                   periode, et la position dans le palier.
 *   3. LES PALIERS— ce qu'il y a a faire. Ce que coute chaque palier pour le
 *                   mois prochain, avec une seule echeance.
 *
 * TROIS REGLES QUI ONT COUTE CHER A TROUVER.
 *
 * a) L'ECHELLE DU GRAPHIQUE N'EST PAS LE MEILLEUR MOIS. Si elle l'etait, un
 *    affilie avec UN SEUL mois de ventes verrait ce mois a 100 % : une
 *    premiere vente de 80 $ s'afficherait comme un sommet. L'echelle est donc
 *    `max(meilleur mois, moyenne du palier vise) × 1,15`. Le facteur garde
 *    15 % de degagement pour qu'aucune barre ne touche jamais le haut.
 *
 * b) LA LIGNE DE REFERENCE EST UN CALCUL, PAS UNE CONDITION. Elle s'ecrit en
 *    equation — « 834 $/mois × 12 = Or » — parce que rien n'oblige a vendre
 *    834 $ par mois : une seule vente de 10 001 $ donne Or. Le mot « minimum »
 *    serait faux.
 *
 * c) LES COULEURS VIENNENT DE `--fn-marine-*`, PAS DE `--fn-vif-*`. Cette
 *    carte est marine dans les deux themes ; `--fn-vif-*` est calibre sur
 *    blanc en mode jour, au seuil d'un objet graphique. En texte sur du
 *    marine, le bronze y tombait a 4,2:1.
 */
export default function CarteAffilie({
  data, insights, L, money, tierLabel, tierJeton, tierLueur,
  exempleBase = 100,
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
    // Sans ce reglage, un navigateur a Montreal (UTC-4) affiche la veille —
    // « 31 aout » devient « 30 aout », et la periode parait amputee d'un jour.
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
  const pic = serie.reduce((m, x) => Math.max(m, Number(x?.montant || 0)), 0);
  const echelle = Math.max(pic, moyenneRef) * 1.15 || 1;
  const hauteurLigne = moyenneRef > 0 ? (moyenneRef / echelle) * 100 : null;

  // ---------------------------------------------------------------- jauge
  const total = Number(data?.rolling12_revenue || 0);
  // LA REGLE EN TROIS PARTIES (Mireille). `total` = douze mois clos : le
  // planNCHER du mois, arrete le 1er. `projection` = onze mois + mois en
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
  // Aucune vente validee : la carte parle d'avenir, pas de bilan.
  const rien = Number(data?.cumulative_revenue || 0) === 0;

  const maintien = data?.maintien_montant;
  const atteinte = data?.atteinte_montant;
  const sousEntente = maintien === null || maintien === undefined;
  const echeance = jourCourt(data?.taux_valide_jusqu_au);

  return (
    <div className="relative overflow-hidden bg-nordfjord text-clinical texture-bruit"
         style={{ borderRadius: "var(--r-l)", boxShadow: "var(--ombre-flotte)" }}
         data-testid="affiliate-carte">
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: tierLueur }} aria-hidden="true" />

      {/* ═══════════ LA PERIODE, EN TETE ═══════════
          Les dates remplacent « 12 derniers mois ». Elles se suffisent : on
          voit sur quoi le calcul porte et jusqu'a quand il vaut, sans phrase
          explicative. */}
      <div className="relative flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5
                      px-5 sm:px-7 py-3 bg-abyss/25 border-b border-white/10"
           data-testid="carte-periode">
        <p className="font-data text-[11px] uppercase tracking-[0.17em] text-mist">
          {L("Période retenue", "Period used")}
        </p>
        <p className="font-data text-[12px] font-semibold tracking-[0.02em] text-clinical tabular-nums">
          {jourCourt(data?.periode_debut)} → {jourCourt(data?.periode_fin)}
        </p>
      </div>

      {/* ═══════════ BANDE 1 · L'ARGENT ═══════════ */}
      <div className="relative flex flex-wrap items-center gap-x-7 gap-y-5 px-5 sm:px-7 py-6">
        <div className="flex-1 min-w-[190px]">
          {/* SANS VENTE, UN « 0,00 $ » EN GROS N'APPREND RIEN.
              Le bandeau d'origine montrait ce qu'une commande RAPPORTE — la
              seule chose motivante a dire a quelqu'un qui commence. En
              reunissant les blocs dans cette carte j'avais perdu cette
              intention : un nouvel affilie se serait retrouve devant un
              zero de 46 px. */}
          {rien ? (
            <>
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-nova">
                {L("Ce que vous gagnez", "What you earn")}
              </p>
              <p className="font-display text-[24px] sm:text-[27px] font-bold
                            leading-[1.15] max-w-[22ch] mt-2.5">
                {L("Une commande de ", "A ")}
                <span className="tabular-nums">{money(exempleBase)}</span>
                {L(" vous rapporte ", " order earns you ")}
                <span className="text-nova tabular-nums">
                  {money(exempleBase * Number(data?.commission_rate || 0))}
                </span>
              </p>
              <p className="text-[12px] text-mist mt-2.5 leading-relaxed max-w-[44ch]">
                {L(`${Math.round((data?.commission_rate || 0) * 100)} % du sous-total des produits après rabais : livraison et taxes exclues.`,
                   `${Math.round((data?.commission_rate || 0) * 100)}% of the product subtotal after discount : shipping and taxes excluded.`)}
              </p>
            </>
          ) : (
            <>
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-nova">
                {L("Gains du mois en cours", "This month's earnings")}
              </p>
              <ChiffreAnime
                valeur={insights?.current_month?.commission}
                format={money}
                testId="affiliate-gains-mois"
                className="block font-display text-[40px] sm:text-[46px] font-bold
                           leading-[0.95] tracking-[-0.035em] mt-2"
              />
              <p className="text-[12px] text-mist mt-2.5 leading-snug tabular-nums">
                {money(insights?.current_month?.revenue)}{" "}
                {L("de ventes validées", "in validated sales")}
                {Number(data?.mois_courant_commandes || 0) > 0 && (
                  <> · {data.mois_courant_commandes}{" "}
                    {L(data.mois_courant_commandes > 1 ? "commandes" : "commande",
                       data.mois_courant_commandes > 1 ? "orders" : "order")}</>
                )}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-3.5 sm:pl-7 sm:border-l sm:border-white/12"
             data-testid="affiliate-tier-badge">
          <TierMark tier={data?.tier} color={teinte} size={38} />
          <div>
            <p className="font-display text-[19px] font-bold leading-tight text-clinical">
              {L("Palier ", "")}{tierLabel}{L("", " tier")}
            </p>
            <p className="font-data text-[13px] font-semibold tabular-nums mt-1"
               style={{ color: teinte }}>
              {Math.round((data?.commission_rate || 0) * 100)} %{" "}
              {L("de commission", "commission")}
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════ BANDE 2 · LA PREUVE ═══════════ */}
      <div className="relative px-5 sm:px-7 pt-5 pb-5 border-t border-white/12"
           data-testid="affiliate-periode-graph">
        {serie.length > 0 && (
          <>
            <div className="relative flex items-end gap-1.5 h-[86px] pt-6">
              {hauteurLigne !== null && (
                <div className="absolute left-0 right-0 border-t border-dashed border-white/40"
                     style={{ top: `calc(${100 - hauteurLigne}% * 0.7 + 6px)` }}
                     aria-hidden="true">
                  <span className="absolute right-0 -top-[19px] font-data text-[11px]
                                   tracking-[0.06em] text-mist whitespace-nowrap">
                    {money(Math.round(moyenneRef))}{L("/mois × 12 = ", "/mo × 12 = ")}{libelleRef}
                  </span>
                </div>
              )}
              {serie.map((m) => {
                const h = echelle > 0 ? (Number(m.montant || 0) / echelle) * 100 : 0;
                const vide = Number(m.montant || 0) <= 0;
                return (
                  <i key={m.mois} aria-hidden="true"
                     data-testid={m.sortant ? "mois-sortant" : undefined}
                     className={`flex-1 rounded-t-[3px] ${vide ? "min-h-[3px]" : ""}`}
                     style={{
                       height: `${Math.max(vide ? 0 : 3, h)}%`,
                       // Le mois qui SORT au prochain changement est hachure :
                       // present dans le total d'aujourd'hui, deja dehors dans
                       // celui de demain. C'est lui qui explique qu'un palier
                       // baisse alors que l'affilie a bien vendu.
                       background: vide
                         ? "rgb(255 255 255 / 0.07)"
                         : m.sortant
                           ? "repeating-linear-gradient(-45deg, rgb(183 202 221 / 0.42) 0 4px, rgb(183 202 221 / 0.12) 4px 8px)"
                           : "linear-gradient(180deg, rgb(var(--fn-nova)) 0%, rgb(var(--fn-nova) / 0.28) 100%)",
                       boxShadow: m.sortant && !vide
                         ? "inset 0 0 0 1px rgb(183 202 221 / 0.54)" : undefined,
                     }} />
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-2" aria-hidden="true">
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
                {L("sort de la période le ", "leaves the period on ")}
                {jourCourt(data?.prochaine_periode_debut)}
              </p>
            )}
          </>
        )}

        <p className="font-data text-[13px] font-semibold tracking-[0.02em] tabular-nums
                      mt-4 pt-4 border-t border-white/12"
           data-testid="affiliate-periode-total">
          {money(total)}
          <em className="not-italic block font-body text-[12px] font-normal tracking-normal
                         text-mist mt-1 leading-snug">
            {/* LA REGLE DITE EN DEUX LIGNES. Le grand chiffre est la base du
                mois en cours (douze mois clos). La prevision du 1er prochain
                suit, sur les onze mois + le mois en cours : c'est elle qui
                paie les montees, tout de suite ET durablement. */}
            {L(`${money(total)} sur les douze derniers mois — c'est ce qui fixe votre taux ce mois-ci. Prévision au ${jourCourt(data?.prochaine_periode_debut)} : ${money(projection)} (les onze derniers mois + ce mois-ci).`,
               `${money(total)} over the last twelve months — this sets your rate this month. Forecast on ${jourCourt(data?.prochaine_periode_debut)}: ${money(projection)} (the last eleven months + this month).`)}
          </em>
        </p>

        {etendue > 0 && (
          <div className="relative mt-5">
            <div className="h-[7px] rounded-full bg-white/15 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                   style={{ width: `${position}%`, background: teinte }} />
            </div>
            {/* LE CURSEUR : ou elle atterrit le 1er du mois prochain, une fois
                le vieux mois sorti et le mois courant entre. A gauche du trait
                elle descend, a droite elle monte. Rien d'autre sur cet ecran
                ne rend la fenetre visible. */}
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
            <div className="flex justify-between mt-[34px] font-data text-[11px]
                            tracking-[0.05em] text-white/65 tabular-nums">
              <span>{money(plancher)} · {tierLabel}</span>
              <span>{money(plafond)} · {suivant ? tierNom(suivant.tier, L) : ""}</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ BANDE 3 · LES PALIERS ═══════════
          L'ancien ecran disait « Encore 1 019,75 $ et vous passez a Platine ».
          Une promesse que la fenetre ne peut pas tenir : elle perd aussi des
          mois par l'arriere, donc l'ecart pouvait GRANDIR apres une vente.
          Ici, deux montants dates, mesures sur la fenetre du mois PROCHAIN.
          Aucun rouge : ce n'est pas une alerte, c'est le prix de chaque palier. */}
      {!sousEntente && (
        <div className="relative px-5 sm:px-7 pt-5 pb-1.5 border-t border-white/12"
             data-testid="affiliate-paliers-prix">
          <p className="font-data text-[11px] uppercase tracking-[0.17em] text-white/65">
            {L(`D'ici le ${echeance}`, `By ${echeance}`)}
          </p>
          <p className="text-[12px] text-mist mt-1 mb-3 leading-snug">
            {L("pour reconduire votre taux le mois prochain — monter, lui, se fait tout de suite",
               "to keep your rate next month — moving up happens right away")}
          </p>

          <Ligne
            montant={maintien > 0 ? money(maintien) : (plancher > 0 ? L("Atteint", "Reached") : L("Garanti", "Guaranteed"))}
            gros={maintien > 0}
            nom={`${tierLabel} · ${Math.round((data?.commission_rate || 0) * 100)} %`}
            sous={L("votre palier actuel", "your current tier")}
            sceau={maintien > 0
              ? L("pour reconduire\nle taux", "to keep\nyour rate")
              : plancher > 0 ? L("taux reconduit", "rate kept")
                             : L("taux garanti", "rate guaranteed")}
            teinte={maintien > 0 ? teinte : "rgb(45 191 176)"}
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
            <p className="mt-2.5 px-3.5 py-3 rounded-[6px] text-[13px] leading-relaxed"
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
        </div>
      )}

      {/* Sous entente, le palier est fige : afficher un montant a reconduire
          serait une fausse peur, exactement le pendant du faux espoir. */}
      {sousEntente && (
        <div className="relative px-5 sm:px-7 py-4 border-t border-white/12">
          <p className="text-[13px] text-mist leading-relaxed">
            {L("Taux convenu par entente — il ne dépend pas de la période.",
               "Rate set by agreement — independent of the period.")}
          </p>
        </div>
      )}
    </div>
  );
}

/** Une ligne de prix de palier. Extraite parce qu'elle sert deux fois avec des
 *  couleurs differentes, et qu'une seule source evite qu'elles divergent. */
function Ligne({ montant, gros, nom, sous, sceau, teinte, fond, trait, testId }) {
  return (
    <div data-testid={testId}
         className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-3.5 py-3
                    rounded-[7px] mt-1.5 first:mt-0"
         style={{ background: fond, boxShadow: `inset 0 0 0 1px ${trait}` }}>
      <p className={`${gros ? "font-display text-[20px] font-bold tracking-[-0.02em]"
                            : "font-data text-[14px] font-semibold tracking-[0.04em]"}
                     leading-none min-w-[86px] tabular-nums`}
         style={{ color: teinte }}>
        {montant}
      </p>
      <p className="font-data text-[13px] opacity-50 shrink-0" aria-hidden="true">→</p>
      <p className="font-data text-[12px] uppercase tracking-[0.07em] leading-snug"
         style={{ color: teinte }}>
        {nom}
        <em className="not-italic block text-[11px] text-mist normal-case tracking-[0.04em] mt-0.5">
          {sous}
        </em>
      </p>
      {sceau && (
        <p className="ml-auto font-data text-[11px] uppercase tracking-[0.1em]
                      text-right leading-[1.5] shrink-0 whitespace-pre-line"
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
