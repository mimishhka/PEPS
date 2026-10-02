import { useMemo, useState } from "react";

import ChiffreAnime from "./ChiffreAnime";
import { moisLisible, periodeLisible } from "../lib/periode";

/**
 * LE BILAN D'UN AFFILIÉ — ce qu'il a vendu, ce qu'il a gagné, sur la période
 * qu'il choisit.
 *
 * MIREILLE, 01/10/2026 : « si un affilié veut voir son all-time sales on a
 * aucune vue pour ça. Pareil pour la commission. » Puis, le même jour :
 * « ensuite le all time avec des filtres : 3 derniers mois, six derniers mois,
 * dernière année, mois dernier. Donc avec un graphique peut-être aussi. »
 *
 * Les ventes cumulées existaient, mais dans l'onglet Performance, sous le
 * titre « Revenu validé cumulé » — elle-même ne les a pas trouvées. Ce titre
 * disait d'ailleurs « revenu » pour un nombre qui n'est pas le revenu de
 * l'affilié : il dit « Ventes validées cumulées » depuis. La commission
 * cumulée, elle, n'était affichée NULLE PART : `paid_commission` ne servait
 * que de booléen dans la liste de démarrage.
 *
 * ── Pourquoi chaque filtre AFFICHE la période qu'il couvre
 *
 * « 3 derniers mois » est ambigu : avec ou sans le mois courant, qui n'est pas
 * fini ? Plutôt que de choisir une convention et d'espérer qu'elle se devine,
 * le bloc écrit les mois réellement additionnés sous le montant. On ne demande
 * pas au lecteur de deviner ce qu'on a compté.
 *
 * `mois dernier` est le seul à exclure le mois courant, parce qu'il nomme un
 * mois précis et non une fenêtre glissante.
 *
 * ── Pourquoi la barre à trois états n'apparaît QUE sur « depuis le début »
 *
 * « Versée / à verser / en attente » est un état PRÉSENT de l'argent, pas une
 * quantité datable : une commission versée en mars n'était pas « versée » en
 * mars. La série mensuelle ne porte que ce qui a été acquis par mois. Afficher
 * la répartition sous un filtre de trois mois mélangerait donc deux axes et
 * donnerait trois nombres qui ne s'additionnent pas au total affiché.
 *
 * ── Pourquoi le graphique est en CSS et non en Recharts
 *
 * Recharts mesure son conteneur : il ne rend rien en jsdom, donc rien ne
 * serait testable, et sur 375 px douze graduations se chevauchent. Douze
 * barres en flex coûtent zéro kilo-octet, s'adaptent par construction, et les
 * tests peuvent lire leur hauteur. Le graphique sert aussi de repère pour le
 * filtre : les mois hors fenêtre s'estompent au lieu de disparaître, pour
 * qu'on voie ce qu'on exclut.
 *
 * ── Pourquoi les commandes remboursées sont affichées, et comment
 *
 * `reversed_commission` était calculé, renvoyé, et jamais montré. Un écart
 * qu'on découvre en comptant ses versements, c'est la certitude de s'être
 * fait avoir. Mieux vaut l'annoncer soi-même.
 *
 * MIREILLE, sur la première rédaction — « ça sonne mal, comme si nous les
 * avions repris ». Elle a raison : « repris » accuse, et c'est faux. Personne
 * n'a rien retiré à l'affilié. Le client a été remboursé, donc la vente n'a
 * pas eu lieu, donc il n'y a pas de commission dessus — la commission suit la
 * vente, exactement comme elle suit le rabais pour l'attribution. Le texte
 * énonce la règle au lieu de décrire une saisie.
 */

/* `decale` : nombre de mois à retirer de la FIN de la série. Seul « mois
   dernier » l'utilise — c'est le seul à nommer un mois clos plutôt qu'une
   fenêtre qui court jusqu'à aujourd'hui. */
/* EN DESSOUS DE TROIS MOIS, PAS DE FRISE. Deux barres ne dessinent aucune
   tendance : elles répètent en couleur ce que le montant dit déjà en chiffres,
   et occupent la place d'un graphique sans en être un. */
const MOIS_MIN_GRAPHE = 3;

const FENETRES = [
  { cle: "tout", mois: null, decale: 0, fr: "Depuis le début", en: "All time" },
  { cle: "m12", mois: 12, decale: 0, fr: "12 mois", en: "12 months" },
  { cle: "m6", mois: 6, decale: 0, fr: "6 mois", en: "6 months" },
  { cle: "m3", mois: 3, decale: 0, fr: "3 mois", en: "3 months" },
  { cle: "m1", mois: 1, decale: 1, fr: "Mois dernier", en: "Last month" },
];

export default function DepuisLeDebut({ data, series, L, money, lang }) {
  const [fenetre, setFenetre] = useState("tout");

  const versee = Math.max(0, Number(data?.paid_commission || 0));
  const aVerser = Math.max(0, Number(data?.approved_commission || 0));
  const enAttente = Math.max(0, Number(data?.pending_commission || 0));
  const reprise = Math.max(0, Number(data?.reversed_commission || 0));

  // Le total NET : les reprises sont deja hors de ces trois montants, puisque
  // le statut « reversed » les sort des trois autres. On ne les soustrait donc
  // pas une seconde fois — ce serait les compter en double.
  const gagneTotal = versee + aVerser + enAttente;

  const mensuel = useMemo(
    () => (Array.isArray(series) ? series : []), [series]);

  const choisie = FENETRES.find((f) => f.cle === fenetre) || FENETRES[0];
  const toutLeTemps = choisie.mois == null;

  /* La tranche de série additionnée. `slice` sur un tableau plus court que la
     fenêtre rend simplement ce qui existe : un affilié de deux mois voit deux
     mois sous « 6 mois », et non quatre zéros inventés. */
  const tranche = useMemo(() => {
    if (toutLeTemps) return mensuel;
    const fin = Math.max(0, mensuel.length - choisie.decale);
    return mensuel.slice(Math.max(0, fin - choisie.mois), fin);
  }, [mensuel, choisie, toutLeTemps]);

  const somme = (cle) => tranche.reduce((t, m) => t + Number(m?.[cle] || 0), 0);

  const gagne = toutLeTemps ? gagneTotal : somme("commission");
  const ventes = toutLeTemps ? Number(data?.cumulative_revenue || 0) : somme("revenue");
  const commandes = toutLeTemps ? Number(data?.validated_orders || 0) : somme("orders");
  const parCommande = commandes > 0 ? gagne / commandes : 0;

  const periodeTranche = tranche.length
    ? { debut: tranche[0].month, fin: tranche[tranche.length - 1].month }
    : null;

  const SEGMENTS = [
    { cle: "versee", valeur: versee, ton: "rgb(var(--fn-success))",
      fr: "versée", en: "paid out" },
    { cle: "a-verser", valeur: aVerser, ton: "rgb(var(--fn-nova))",
      fr: "à verser", en: "to pay out" },
    { cle: "en-attente", valeur: enAttente, ton: "rgb(var(--fn-warning))",
      fr: "en attente", en: "pending" },
  ].filter((s) => s.valeur > 0);

  const vide = gagneTotal <= 0;
  // Les mois retenus par le filtre, pour estomper les autres sans les retirer.
  const retenus = new Set(tranche.map((m) => m.month));
  const sommet = Math.max(...mensuel.map((m) => Number(m?.commission || 0)), 0);

  return (
    <div className="rounded-xl border border-ash bg-white p-5 sm:p-6"
         style={{ boxShadow: "var(--ombre-leve)" }}
         data-testid="depuis-le-debut">

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-nova-texte">
          {L(choisie.fr, choisie.en)}
        </p>
        {commandes > 0 && (
          <p className="font-data text-[11px] text-glacier tabular-nums"
             data-testid="depuis-commandes">
            {commandes}{" "}
            {L(commandes > 1 ? "commandes validées" : "commande validée",
               commandes > 1 ? "validated orders" : "validated order")}
          </p>
        )}
      </div>

      {/* LES FILTRES. Rangée défilante avec accrochage, comme le menu des
          onglets : sur 375 px, cinq pastilles ne tiennent pas côte à côte, et
          les empiler sur deux lignes volerait la place du montant. */}
      {mensuel.length > 0 && (
        <div className="-mx-5 sm:-mx-6 px-5 sm:px-6 mt-3.5 overflow-x-auto
                        scrollbar-none snap-x snap-mandatory">
          <div className="flex gap-1.5 w-max" role="group"
               aria-label={L("Période", "Period")}
               data-testid="depuis-filtres">
            {FENETRES.map((f) => (
              <button key={f.cle} onClick={() => setFenetre(f.cle)}
                aria-pressed={fenetre === f.cle}
                className={`snap-start shrink-0 px-3 h-9 rounded-full font-data text-[11px]
                            font-semibold uppercase tracking-[0.08em] transition-colors
                            active:scale-[0.97] ${
                  fenetre === f.cle
                    ? "bg-nordfjord text-white"
                    : "text-glacier border border-ash hover:text-nordfjord hover:bg-clinical"}`}
                style={{ touchAction: "manipulation" }}
                data-testid={`depuis-filtre-${f.cle}`}>
                {L(f.fr, f.en)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* LE MONTANT GAGNÉ. C'est la question qu'on se pose en ouvrant la
          page ; tout le reste l'explique. */}
      <ChiffreAnime
        valeur={gagne} format={money} testId="depuis-gagne"
        className="block font-display text-[32px] sm:text-[38px] font-bold
                   leading-none tracking-[-0.03em] tabular-nums text-nordfjord mt-3"
      />
      <p className="text-[13px] text-glacier mt-1.5">
        {vide
          ? L("Votre première commission apparaîtra ici.",
              "Your first commission will show up here.")
          : L("gagné en commission", "earned in commission")}
      </p>

      {/* LES MOIS RÉELLEMENT ADDITIONNÉS. « 3 derniers mois » n'oblige plus à
          deviner si le mois courant y est. */}
      {!toutLeTemps && periodeTranche && (
        <p className="font-data text-[11px] text-glacier/80 mt-1"
           data-testid="depuis-fenetre">
          {periodeLisible(periodeTranche, lang, "")}
        </p>
      )}

      {!vide && toutLeTemps && (
        <>
          {/* LA BARRE NE SERT QU'À PARTIR DE DEUX SEGMENTS.
              Mireille : « c'est surdimensionné, ça n'a aucun sens ». Elle
              regardait un compte dont tout est versé : un seul segment, donc
              une barre pleine sur toute la largeur. Une barre de proportion
              qui n'a rien à comparer n'est plus une proportion, c'est un
              aplat — et la légende juste en dessous dit déjà le montant et
              son état. */}
          {SEGMENTS.length > 1 && (
          /* La barre : trois états, une seule lecture. */
          <div className="flex h-2.5 w-full overflow-hidden mt-5"
               style={{ borderRadius: "var(--r-s)", background: "rgb(var(--fn-ash))" }}
               role="img"
               aria-label={SEGMENTS.map((s) =>
                 `${money(s.valeur)} ${L(s.fr, s.en)}`).join(", ")}
               data-testid="depuis-barre">
            {SEGMENTS.map((s) => (
              <div key={s.cle}
                   data-testid={`depuis-segment-${s.cle}`}
                   style={{ width: `${(s.valeur / gagneTotal) * 100}%`, background: s.ton }} />
            ))}
          </div>
          )}

          <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-3.5">
            {SEGMENTS.map((s) => (
              <li key={s.cle} className="flex items-baseline gap-2"
                  data-testid={`depuis-legende-${s.cle}`}>
                <span className="w-2 h-2 rounded-full shrink-0 translate-y-[-1px]"
                      style={{ background: s.ton }} aria-hidden="true" />
                <span className="font-display text-[15px] font-bold tabular-nums text-nordfjord">
                  {money(s.valeur)}
                </span>
                <span className="font-data text-[11px] uppercase tracking-[0.1em] text-glacier">
                  {L(s.fr, s.en)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* LE GRAPHIQUE. Douze barres en flex : aucune mesure de conteneur,
          donc il rend partout — y compris dans les tests — et s'adapte sans
          point de rupture. Les mois hors fenêtre s'estompent au lieu de
          disparaître : on voit ce que le filtre exclut. */}
      {sommet > 0 && mensuel.length >= MOIS_MIN_GRAPHE && (
        /* LA LARGEUR SUIT LE NOMBRE DE MOIS.
           Mes barres étaient en `flex-1` : à douze mois c'est une frise, à
           deux mois chacune prend la moitié de l'écran et le bloc devient un
           mur de couleur. Je n'avais testé qu'avec douze.
           Le conteneur est désormais borné à ~46 px par mois : la frise
           grandit avec l'historique au lieu de s'étirer pour remplir.

           `max-width` et non `width: min(...)`, pour deux raisons. C'est
           l'expression idiomatique de « au plus ceci, sinon remplis », et
           jsdom n'évalue ni `min()` ni `calc()` — React retire alors la
           propriété, et le test ne porterait plus que sur son absence. */
        <div className="mt-5" data-testid="depuis-graphe"
             style={{ maxWidth: `${mensuel.length * 46}px` }}>
          <div className="flex items-end gap-[3px] h-12" role="img"
               aria-label={L(`Commission par mois sur ${mensuel.length} mois`,
                             `Commission per month over ${mensuel.length} months`)}>
            {mensuel.map((m) => {
              const valeur = Number(m?.commission || 0);
              const dedans = retenus.has(m.month);
              return (
                <div key={m.month}
                     className="flex-1 min-w-0 rounded-t-[2px] transition-[background,height] duration-200"
                     title={`${moisLisible(m.month, lang)} · ${money(valeur)}`}
                     style={{
                       // 2 px plancher : un mois a zero doit rester visible
                       // comme un mois, pas disparaitre de la frise.
                       height: `${Math.max(2, (valeur / sommet) * 100)}%`,
                       background: dedans
                         ? "rgb(var(--fn-nova))"
                         : "rgb(var(--fn-ash))",
                     }}
                     data-testid={`depuis-barre-${m.month}`}
                     data-dedans={dedans ? "oui" : "non"} />
              );
            })}
          </div>
          {/* UNE seule légende, alignée à gauche. Deux libellés aux
              extrémités supposaient que la frise occupe toute la largeur :
              depuis qu'elle est bornée, le second flottait dans le vide. */}
          <p className="font-data text-[10px] text-glacier/70 mt-1.5"
             data-testid="depuis-graphe-periode">
            {periodeLisible({ debut: mensuel[0]?.month,
                              fin: mensuel[mensuel.length - 1]?.month }, lang, "")}
          </p>
        </div>
      )}

      {/* LA PREUVE, en pied : les ventes qui ont produit ce montant. Elles
          repondent a « sur quoi ? », pas a « combien ai-je gagne ? ». */}
      <div className="mt-5 pt-4 border-t border-ash">
        <p className="text-[13px] text-glacier leading-relaxed" data-testid="depuis-ventes">
          {L("sur ", "on ")}
          <b className="font-display font-bold text-nordfjord tabular-nums">{money(ventes)}</b>
          {L(" de ventes validées", " in validated sales")}
          {parCommande > 0 && (
            <>
              {" · "}
              {/* « 20 % » est abstrait ; « 36 $ par commande » est
                  actionnable, et se compare a l'effort de la vente. */}
              <b className="font-display font-bold text-nordfjord tabular-nums">
                {money(parCommande)}
              </b>
              {L(" par commande en moyenne", " per order on average")}
            </>
          )}
        </p>

        {toutLeTemps && reprise > 0 && (
          /* Ni accusation ni silence : la regle, enoncee simplement. */
          <p className="text-[12px] text-glacier mt-2 leading-relaxed"
             data-testid="depuis-reprise">
            {L(`${money(reprise)} portaient sur des commandes finalement remboursées. La commission suit la vente : quand elle est annulée, elle ne compte pas — ce montant n'est donc pas inclus ci-dessus.`,
               `${money(reprise)} was on orders that ended up refunded. Commission follows the sale: when it is cancelled, it does not count — so that amount is not included above.`)}
          </p>
        )}
      </div>
    </div>
  );
}
