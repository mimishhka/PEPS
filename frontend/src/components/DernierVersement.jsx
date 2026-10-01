import ChiffreAnime from "./ChiffreAnime";
import { periodeLisible, momentLisible, moisLisible } from "../lib/periode";

/**
 * LE DERNIER VERSEMENT PAYÉ — en tête de l'onglet Paiements.
 *
 * MIREILLE, 01/10/2026 : « Paid avec référence le mois dernier, c'est-à-dire
 * pour les commissions notre exemple du 1 au 30 septembre, devrait se
 * retrouver en haut de page. Suivi du next payout. »
 *
 * L'ordre qu'elle décrit est celui d'une question qu'on se pose dans cet
 * ordre : « j'ai été payé ? » puis « et la prochaine fois ? » puis « combien
 * en tout ? ». L'onglet commençait par le dernier — le cumul — et le fait
 * accompli n'était visible qu'en bas, dans une ligne de tableau.
 *
 * ── Ce que ce bloc dit, et pourquoi chaque ligne y est
 *
 * LE MONTANT, parce que c'est la réponse. LA DATE DU PAIEMENT, qui n'était
 * affichée nulle part — `paid_at` arrivait du serveur depuis toujours et aucun
 * écran ne le lisait, alors que c'est la date qu'on cherche quand on compare
 * avec son portefeuille. LA PÉRIODE COUVERTE, calculée depuis les commissions
 * et non l'étiquette de run (voir lib/periode). LA RÉFÉRENCE, qui est la seule
 * chose permettant de retrouver la transaction sur la chaîne sans nous écrire.
 *
 * ── Pourquoi il disparaît complètement avant le premier versement
 *
 * Un bloc « aucun versement » en tête de page serait une mauvaise nouvelle
 * donnée en premier, alors que l'écran a quelque chose de mieux à dire : le
 * cycle qui vient. L'état vide de l'historique porte déjà l'explication du
 * seuil, de la devise et du rythme — et il la porte là où on la cherche.
 */
export default function DernierVersement({ versement, L, money, lang }) {
  if (!versement) return null;

  const montant = Number(versement.amount_cad ?? versement.amount ?? 0);
  const devise = String(versement.currency || "").toUpperCase();
  const recu = versement.amount;
  // La quantité de jetons n'a de sens qu'avec sa devise : « 104,10 » seul, sur
  // un écran où tout est en dollars, se lirait comme un second montant CAD.
  const recuLisible = recu != null && devise
    ? `${Number(recu).toFixed(2)} ${devise}` : "";
  const reference = String(versement.reference || "").trim();

  return (
    <div className="relative overflow-hidden rounded-xl border border-ash bg-white p-5 sm:p-6"
         style={{ boxShadow: "var(--ombre-leve)" }}
         data-testid="dernier-versement">

      {/* Le filet de tête en vert : la couleur qualifie plutôt qu'elle ne
          décore — c'est de l'argent arrivé, le même vert que le segment
          « versée » du bloc Depuis le début. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: "linear-gradient(90deg, rgb(var(--fn-success)) 0%, transparent 85%)" }} />

      <p className="font-data text-[11px] font-semibold uppercase tracking-[0.2em] text-nova-texte">
        {L("Dernier versement", "Last payout")}
      </p>

      <ChiffreAnime
        valeur={montant} format={money} testId="dernier-montant"
        className="block font-display text-[30px] sm:text-[36px] font-bold
                   leading-none tracking-[-0.03em] tabular-nums text-nordfjord mt-3"
      />

      {/* LA DATE DU PAIEMENT. Elle n'apparaissait nulle part, et c'est celle
          qu'on cherche quand on compare avec son portefeuille. */}
      {versement.paid_at && (
        <p className="text-[13px] text-glacier mt-1.5" data-testid="dernier-date">
          {L(`payé le ${momentLisible(versement.paid_at, lang)}`,
             `paid on ${momentLisible(versement.paid_at, lang)}`)}
        </p>
      )}

      <div className="mt-4 pt-3.5 border-t border-ash space-y-1.5">
        {/* LA PÉRIODE COUVERTE, pas l'étiquette de run. Un versement peut en
            couvrir plusieurs mois : le seuil reporte le solde. */}
        <p className="text-[13px] text-glacier leading-relaxed"
           data-testid="dernier-periode">
          {L("pour ", "for ")}
          <b className="font-display font-bold text-nordfjord">
            {periodeLisible(versement.periode_couverte, lang,
                            moisLisible(versement.period, lang))}
          </b>
          {recuLisible && (
            <>
              {" · "}
              <span className="font-data text-[12px]" data-testid="dernier-recu">
                {L(`${recuLisible} reçus`, `${recuLisible} received`)}
              </span>
            </>
          )}
        </p>

        {/* LA RÉFÉRENCE. « C'est elle qui permet de retrouver la transaction
            sur la chaîne sans nous écrire » — le courriel de confirmation le
            dit déjà, l'écran le taisait. `select-all` pour qu'un seul appui
            la sélectionne en entier au doigt, et `break-all` pour qu'un hash
            de soixante-six caractères ne déborde pas d'un écran de 375 px. */}
        {reference && (
          <p className="font-data text-[11px] text-glacier/80 leading-relaxed">
            {L("réf ", "ref ")}
            <code className="text-glacier break-all select-all">{reference}</code>
          </p>
        )}
      </div>
    </div>
  );
}
