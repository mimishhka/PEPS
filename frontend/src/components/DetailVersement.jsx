import { useCallback, useEffect, useRef, useState } from "react";

import api, { formatApiError } from "../lib/api";
import { periodeLisible, momentLisible, moisLisible, jourLisible } from "../lib/periode";

/**
 * CE QU'UN VERSEMENT CONTIENT — la fenêtre de détail.
 *
 * MIREILLE, 01/10/2026 : « il faudrait que l'affilié puisse constater quelles
 * sont les commandes [que] représente ce paiement, incluant bien sûr les
 * commandes remboursées ou annulées. (donc un bouton ou avec une fenêtre
 * contextuelle) »
 *
 * ── Pourquoi les commandes remboursées sont le cœur de cette fenêtre
 *
 * Un versement est un montant unique. Quand il ne correspond pas à ce qu'on
 * avait calculé de son côté, il n'y a aujourd'hui aucun moyen de savoir
 * pourquoi — et la raison la plus fréquente est une commande remboursée après
 * coup. `affiliate_on_order_reversed` pose le statut et la créance mais ne
 * vide jamais `payout_id` : la ligne est donc encore là, elle n'était
 * simplement jamais montrée. Elle porte même `reversed_after_payout`, qui
 * distingue « repris avant que l'argent ne parte » de « l'argent était déjà
 * parti » — deux situations très différentes pour qui lit son relevé.
 *
 * ── Pourquoi un seul balisage pour le téléphone et l'écran
 *
 * Une table de six colonnes et une liste de cartes, c'est deux balisages à
 * maintenir et deux occasions de diverger. Chaque ligne est ici un bloc de
 * deux niveaux — le numéro et le montant en vis-à-vis, le reste en dessous —
 * qui se lit aussi bien sur 375 px que sur un écran large. Le dépôt n'avait
 * aucun patron de table responsive ; celui-ci n'en demande pas.
 *
 * ── Les détails qui rendent une fenêtre modale utilisable
 *
 * Échap ferme. Le corps ne défile plus derrière — sans quoi la molette
 * continue la page et on croit la fenêtre bloquée. Le clic sur le voile ferme,
 * le clic dans le panneau non. Le bouton de fermeture prend le focus à
 * l'ouverture, pour que la fenêtre soit traversable au clavier. Et sous `sm`
 * elle occupe toute la hauteur : une fenêtre centrée sur un téléphone laisse
 * deux bandes mortes et une zone de lecture étroite.
 */
export default function DetailVersement({ payoutId, L, money, lang, onClose }) {
  const [detail, setDetail] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);
  const fermeture = useRef(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const { data } = await api.get(`/affiliate/payouts/${payoutId}`);
      setDetail(data);
    } catch (e) {
      setErreur(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setChargement(false);
    }
  }, [payoutId]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Le focus part sur la sortie : c'est l'action qu'on cherche en premier
    // au clavier, et cela ancre le lecteur d'écran dans la fenêtre.
    fermeture.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = avant;
    };
  }, [onClose]);

  const versement = detail?.payout;
  const lignes = detail?.lines || [];

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center sm:px-4 sm:py-6"
         style={{ zIndex: "var(--z-modal)", background: "rgba(11,46,79,.72)" }}
         onClick={onClose}
         data-testid="detail-versement">
      <div className="w-full sm:max-w-lg h-full sm:h-auto sm:max-h-full bg-white
                      sm:rounded-xl border-t sm:border border-ash
                      flex flex-col overflow-hidden shadow-2xl"
           role="dialog" aria-modal="true"
           aria-label={L("Détail du versement", "Payout detail")}
           onClick={(e) => e.stopPropagation()}>

        <div className="px-5 sm:px-6 pt-5 pb-3.5 border-b border-ash flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-nova-texte">
              {L("Détail du versement", "Payout detail")}
            </p>
            {versement && (
              <>
                <p className="font-display text-xl font-bold text-nordfjord mt-1 tabular-nums">
                  {money(detail.payout_amount_cad)}
                </p>
                <p className="text-[12px] text-glacier mt-0.5" data-testid="detail-periode">
                  {periodeLisible(versement.periode_couverte, lang,
                                  moisLisible(versement.period, lang))}
                  {versement.paid_at
                    && ` · ${L("payé le", "paid")} ${momentLisible(versement.paid_at, lang)}`}
                </p>
              </>
            )}
          </div>
          {/* 44 px de cible tactile : un X de 16 px au doigt se rate. */}
          <button ref={fermeture} onClick={onClose}
                  className="shrink-0 -mr-1.5 -mt-1.5 w-11 h-11 flex items-center justify-center
                             rounded-full text-glacier hover:text-nordfjord hover:bg-clinical
                             transition-colors active:scale-[0.97]"
                  style={{ touchAction: "manipulation" }}
                  aria-label={L("Fermer", "Close")}
                  data-testid="detail-fermer">
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4"
             style={{ overscrollBehavior: "contain" }}
             data-testid="detail-corps">
          {chargement && (
            <p className="text-[13px] text-glacier py-8 text-center" data-testid="detail-chargement">
              {L("Chargement…", "Loading…")}
            </p>
          )}

          {!chargement && erreur && (
            <div className="py-8 text-center" data-testid="detail-erreur">
              <p className="text-[13px] text-error">{erreur}</p>
              <button onClick={charger}
                      className="mt-3 px-3 py-1.5 rounded-md border border-ash text-xs
                                 text-nordfjord hover:bg-clinical transition active:scale-[0.97]"
                      style={{ touchAction: "manipulation" }}>
                {L("Réessayer", "Try again")}
              </button>
            </div>
          )}

          {!chargement && !erreur && lignes.length === 0 && (
            /* Versement ancien dont les commissions ne sont plus rattachées.
               On le dit au lieu d'afficher une liste vide, qui se lirait comme
               « ce versement ne couvrait rien ». */
            <p className="text-[13px] text-glacier py-8 text-center" data-testid="detail-vide">
              {L("Le détail par commande n'est pas disponible pour ce versement.",
                 "The per-order detail is not available for this payout.")}
            </p>
          )}

          {!chargement && !erreur && lignes.length > 0 && (
            <ul className="space-y-3" data-testid="detail-lignes">
              {lignes.map((l) => {
                const reprise = l.status === "reversed";
                return (
                  <li key={l.id}
                      className={`rounded-lg border p-3 ${
                        reprise ? "border-warning/40 bg-warning/[0.04]" : "border-ash"}`}
                      data-testid={`detail-ligne-${l.order_number || l.id}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-data text-[12px] font-semibold text-nordfjord break-all">
                        {l.order_number || "-"}
                      </span>
                      <span className={`font-display text-[15px] font-bold tabular-nums shrink-0 ${
                        reprise ? "text-glacier line-through" : "text-nordfjord"}`}>
                        {money(l.commission_amount)}
                      </span>
                    </div>
                    <p className="font-data text-[11px] text-glacier mt-1">
                      {jourLisible(l.approved_at || l.created_at, lang)}
                      {" · "}
                      {L(`sur ${money(l.base_amount)} de ventes`,
                         `on ${money(l.base_amount)} in sales`)}
                    </p>
                    {reprise && (
                      /* Le texte dit la RÈGLE, pas une saisie. Même décision
                         que le bloc Depuis le début : « la commission suit la
                         vente ». Personne n'a rien retiré à l'affilié. */
                      <p className="text-[11px] text-warning mt-1.5 leading-relaxed"
                         data-testid={`detail-reprise-${l.order_number || l.id}`}>
                        {l.reversed_at
                          ? L(`Commande remboursée le ${jourLisible(l.reversed_at, lang)} : cette vente ne compte plus.`,
                              `Order refunded on ${jourLisible(l.reversed_at, lang)}: that sale no longer counts.`)
                          : L("Commande remboursée : cette vente ne compte plus.",
                              "Order refunded: that sale no longer counts.")}
                        {l.reversed_after_payout
                          && L(" Le montant avait déjà été versé.",
                               " The amount had already been paid out.")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!chargement && !erreur && lignes.length > 0 && (
          <div className="px-5 sm:px-6 py-3.5 border-t border-ash" data-testid="detail-total">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-data text-[11px] uppercase tracking-[0.14em] text-glacier">
                {L(`${detail.lines_count} commande${detail.lines_count > 1 ? "s" : ""}`,
                   `${detail.lines_count} order${detail.lines_count > 1 ? "s" : ""}`)}
              </span>
              <span className="font-display text-base font-bold text-nordfjord tabular-nums">
                {money(detail.lines_sum_cad)}
              </span>
            </div>
            {/* CE QUI A ÉTÉ RETENU SUR CE VERSEMENT, nommé ici et pas
                ailleurs : c'est la seule page où l'affilié voit les commandes
                de ce versement, donc la seule où « 250 de commandes, 150
                versés » peut se refermer. Sans cette ligne, l'écart se
                lisait comme une erreur de notre part. */}
            {Number(detail.creance_absorbee || 0) > 0 && (
              <div className="mt-2 pt-2 border-t border-ash/60" data-testid="detail-creance">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-data text-[11px] text-glacier">
                    {L("Retenu sur des commandes remboursées après un versement précédent",
                       "Withheld for orders refunded after an earlier payout")}
                  </span>
                  <span className="font-data text-[12px] text-warning tabular-nums whitespace-nowrap">
                    −{money(detail.creance_absorbee)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 mt-1.5">
                  <span className="font-data text-[11px] uppercase tracking-[0.14em] text-nordfjord">
                    {L("Versé", "Paid")}
                  </span>
                  <span className="font-display text-base font-bold text-nordfjord tabular-nums">
                    {money(detail.payout_amount_cad)}
                  </span>
                </div>
              </div>
            )}

            {/* L'ÉCART EST MONTRÉ, PAS TU — mais après la déduction ci-dessus.
                Une reprise change le statut d'une ligne, jamais son montant ;
                une retenue est nommée. Ce qui reste après les deux n'a aucune
                explication, et l'affilié mérite de le voir plutôt que de nous
                croire sur parole — c'est ce qui rend ce total une preuve et
                non une affirmation. */}
            {Math.abs(Number(detail.difference || 0)) >= 0.01 && (
              <p className="text-[11px] text-warning mt-1.5 leading-relaxed"
                 data-testid="detail-ecart">
                {L(`Écart de ${money(detail.difference)} avec le montant versé — écrivez-nous, nous le reprenons avec vous.`,
                   `${money(detail.difference)} gap against the amount paid — write to us and we will go through it with you.`)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
