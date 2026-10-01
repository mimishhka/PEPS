import ChiffreAnime from "./ChiffreAnime";

/**
 * DEPUIS LE DÉBUT — le bilan d'un affilié, en un coup d'œil.
 *
 * MIREILLE, 01/10/2026 : « si un affilié veut voir son all-time sales on a
 * aucune vue pour ça. Pareil pour la commission. »
 *
 * Les ventes cumulées existaient, mais dans l'onglet Performance, sous le
 * titre « Revenu validé cumulé » — elle-même ne les a pas trouvées. Ce titre
 * disait d'ailleurs « revenu » pour un nombre qui n'est pas le revenu de
 * l'affilié : il dit « Ventes validées cumulées » depuis. La
 * commission cumulée, elle, n'était affichée NULLE PART : `paid_commission`
 * ne servait que de booléen dans la liste de démarrage.
 *
 * LES DEUX RÉPONDENT À UNE SEULE QUESTION — « j'ai fait quoi, et ça m'a
 * rapporté combien ? » — et les séparer en deux onglets est probablement ce
 * qui a fait qu'aucun des deux n'était trouvable.
 *
 * ── Pourquoi la commission passe en premier, et les ventes en dessous
 *
 * Un affilié ne demande pas son chiffre d'affaires : il demande ce qu'il a
 * gagné. Le chiffre d'affaires est la preuve, pas la réponse. Il reste donc
 * là, mais en pied de bloc, comme la base qui a produit le montant du haut.
 *
 * ── Pourquoi une barre segmentée plutôt que trois nombres
 *
 * Les trois états ne se valent pas : « versée » est dans le portefeuille,
 * « à verser » arrive le 1er, « en attente » peut encore disparaître si une
 * commande est remboursée. Une colonne de montants le dit ; elle ne le MONTRE
 * pas. La barre donne la proportion sans qu'on ait à faire l'arithmétique —
 * on voit d'un regard si l'essentiel est acquis ou si tout est encore suspendu.
 *
 * Les couleurs sont celles que le site emploie déjà pour ces notions, et elles
 * qualifient plutôt qu'elles ne décorent : vert pour l'argent arrivé, cyan
 * pour ce qui est acquis et vient, ambre pour ce qui attend.
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
export default function DepuisLeDebut({ data, L, money, lang }) {
  const versee = Math.max(0, Number(data?.paid_commission || 0));
  const aVerser = Math.max(0, Number(data?.approved_commission || 0));
  const enAttente = Math.max(0, Number(data?.pending_commission || 0));
  const reprise = Math.max(0, Number(data?.reversed_commission || 0));

  // Le total NET : les reprises sont deja hors de ces trois montants, puisque
  // le statut « reversed » les sort des trois autres. On ne les soustrait donc
  // pas une seconde fois — ce serait les compter en double.
  const gagne = versee + aVerser + enAttente;

  const ventes = Number(data?.cumulative_revenue || 0);
  const commandes = Number(data?.validated_orders || 0);
  const parCommande = commandes > 0 ? gagne / commandes : 0;

  const SEGMENTS = [
    { cle: "versee", valeur: versee, ton: "rgb(var(--fn-success))",
      fr: "versée", en: "paid out" },
    { cle: "a-verser", valeur: aVerser, ton: "rgb(var(--fn-nova))",
      fr: "à verser", en: "to pay out" },
    { cle: "en-attente", valeur: enAttente, ton: "rgb(var(--fn-warning))",
      fr: "en attente", en: "pending" },
  ].filter((s) => s.valeur > 0);

  const vide = gagne <= 0;

  return (
    <div className="rounded-xl border border-ash bg-white p-5 sm:p-6"
         style={{ boxShadow: "var(--ombre-leve)" }}
         data-testid="depuis-le-debut">

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-nova-texte">
          {L("Depuis le début", "All time")}
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

      {/* LE MONTANT GAGNÉ, en tête. C'est la question qu'on se pose en
          ouvrant la page ; tout le reste l'explique. */}
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

      {!vide && (
        <>
          {/* La barre : trois états, une seule lecture. */}
          <div className="flex h-2.5 w-full overflow-hidden mt-5"
               style={{ borderRadius: "var(--r-s)", background: "rgb(var(--fn-ash))" }}
               role="img"
               aria-label={SEGMENTS.map((s) =>
                 `${money(s.valeur)} ${L(s.fr, s.en)}`).join(", ")}
               data-testid="depuis-barre">
            {SEGMENTS.map((s) => (
              <div key={s.cle}
                   data-testid={`depuis-segment-${s.cle}`}
                   style={{ width: `${(s.valeur / gagne) * 100}%`, background: s.ton }} />
            ))}
          </div>

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

        {reprise > 0 && (
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
