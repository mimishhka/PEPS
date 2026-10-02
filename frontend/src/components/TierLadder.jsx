// frontend/src/components/TierLadder.jsx : NOUVEAU fichier.
//
// Échelle des paliers et simulateur de commission, portés depuis le document
// du programme où ils existaient en maquette sans jamais avoir été construits.
//
// Deux choses que le tableau de bord ne disait pas :
//
//   : CE QUI VIENT ENSUITE. L'affilié voyait son palier et le montant restant,
//     jamais l'échelle entière. On ne se projette pas dans une progression
//     dont on ignore la forme.
//   : CE QU'UNE VENTE RAPPORTE VRAIMENT. Un taux en pourcentage ne parle pas ;
//     un montant en dollars, oui. Le curseur transforme l'un en l'autre.
//
// Le barème vient du SERVEUR, jamais d'une copie locale : une échelle écrite
// en dur ici divergerait des seuils réels au premier ajustement, et montrerait
// une marche à franchir qui n'existe plus.
import { useState } from "react";
import TierMark from "./TierMark";

export default function TierLadder({ data, L, lang, money, TIER_META }) {
  const tiers = data?.tiers || [];
  const [montant, setMontant] = useState(150);

  if (!tiers.length) return null;

  const actuel = data?.tier;
  // Ventes validées des douze mois CLOS (la fenêtre est calendaire depuis
  // `tier_basis: calendar_12m`) : c'est LUI qui détermine le
  // palier, pas le montant simulé au curseur. Les deux nombres coexistent sur
  // ce panneau, et les confondre est l'erreur qu'il doit éviter.
  /* LA DISTANCE SE MESURE SUR LA BASE QUI FAIT MONTER, pas sur le plancher.
   *
   * Vu sur le compte LOLA10 le 02/10/2026 : l'aperçu annonçait « 1 468,57 $ →
   * Silver », cette échelle « 1 941,00 $ of sales to go ». Deux réponses à la
   * même question, à un onglet d'écart.
   *
   * Les deux fenêtres existent et la FAQ les explique : douze mois CLOS fixent
   * le plancher du mois, onze mois + le mois en cours décident d'une montée.
   * Mais une seule répond à « combien me manque-t-il pour gagner plus » —
   * `CarteAffilie` le dit déjà de son côté : « la prévision [...] est AUSSI la
   * base du cliquet : un seuil franchi sur cette base paie tout de suite ».
   *
   * Même règle que la jauge de l'aperçu : le plus haut des deux. Un affilié
   * qui a déjà franchi le seuil sur la fenêtre close ne doit pas lire une
   * distance plus grande parce que son mois en cours est plus faible. */
  const douzeMoisClos = Number(data?.rolling12_revenue || 0);
  const projection = Number(data?.projection_prochaine_periode || 0);
  const rolling12 = Math.max(douzeMoisClos, projection);
  const rabais = Number(data?.coupon_percent ?? 10) / 100;
  // Base commissionnable : le rabais du contact est déduit avant le calcul.
  // L'afficher autrement promettrait plus que ce que le versement contient.
  const base = Math.round(montant * (1 - rabais) * 100) / 100;

  return (
    <div className="bg-white rounded-xl border border-ash p-6" data-testid="tier-ladder">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova-texte">
          {L("CE QU'UNE VENTE RAPPORTE", "WHAT A SALE EARNS")}
        </p>
        <p className="font-data text-[10px] text-glacier">
          {L(`Base après le rabais de ${Math.round(rabais * 100)} % de votre contact`,
             `Base after your contact's ${Math.round(rabais * 100)}% discount`)}
        </p>
      </div>

      {/* Dire ce que le tableau EST. Sans cette phrase, six montants alignés se
          lisent comme six promesses simultanées, alors qu'un seul s'applique -
          celui du palier courant. Les autres montrent ce que la même vente
          rapporterait plus tard. */}
      <p className="text-[12px] text-glacier leading-relaxed mb-4">
        {L("Une seule de ces commissions vous est versée : celle de votre palier. Les autres montrent ce que la même vente rapporterait aux paliers suivants. Les seuils portent sur vos ventes cumulées des douze derniers mois, pas sur le montant d'une commande.",
           "Only one of these commissions is paid to you: the one for your tier. The others show what the same sale would earn at higher tiers. Thresholds apply to your cumulative sales over the last twelve months, not to a single order's amount.")}
      </p>

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <label htmlFor="sim-montant"
               className="font-data text-[10px] uppercase tracking-[0.18em] text-glacier">
          {L("Commande", "Order")}
        </label>
        <input id="sim-montant" type="number" min="20" max="5000" step="10"
               value={montant}
               onChange={(e) => setMontant(Math.max(0, Number(e.target.value) || 0))}
               data-testid="sim-amount"
               className="w-28 font-data text-lg font-bold text-nordfjord text-right
                          bg-clinical border border-ash rounded-lg px-3 py-2
                          outline-none focus:border-nova" />
        <input type="range" min="20" max="5000" step="10"
               value={Math.min(5000, Math.max(20, montant))}
               onChange={(e) => setMontant(Number(e.target.value))}
               aria-label={L("Montant de la commande", "Order amount")}
               className="flex-1 min-w-[10rem] accent-nova" />
        <span className="font-data text-[11px] text-glacier whitespace-nowrap">
          {L("base", "base")} {money(base)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((t) => {
          const meta = TIER_META[t.name] || {};
          /* LES COULEURS VIENNENT DU JETON. Ce fichier lisait encore
             `meta.color` — un champ que la jetonisation des paliers a remplacé
             par `jeton`, sans repasser ici. Les CINQ lectures rendaient donc
             `undefined` : les six symboles tombaient sur `currentColor` et
             sortaient gris, la bordure du palier courant disparaissait, et le
             fond de la pastille « vous » valait la chaîne « undefined1f ».
             CarteAffilie avait été converti, celui-ci non.

             Deux teintes, et c'est tout l'intérêt des canaux : le TRAIT plein
             pour le texte, le VOILE pour un fond. C'est exactement ce que le
             commentaire de TIER_META annonce — une couleur déjà composée
             obligeait à coller « 1f » au bout, ce qui n'a aucun sens sur un
             `rgb(var(...))`. */
          const jeton = meta.jeton || "--fn-palier-defaut";
          const trait = `rgb(var(${jeton}))`;
          const voile = `rgb(var(${jeton}) / 0.12)`;
          /* LE SYMBOLE N'A PAS LE MÊME SEUIL QUE LE TEXTE : 4,5:1 vaut pour du
             texte, 3:1 suffit à un objet graphique. `--fn-vif-*` est calibré
             pour le second. Durcir le symbole au seuil du texte l'éteint sans
             raison — même décision que les cartes de l'onglet Performance. */
          const vif = `rgb(var(${jeton.replace("--fn-palier-", "--fn-vif-")}))`;
          const ici = t.name === actuel;
          const atteint = rolling12 >= t.floor;
          /* `data-jeton` ET `data-jeton-vif` SONT LÀ POUR ÊTRE VÉRIFIABLES.
             jsdom rejette `rgb(var(--x))` comme valeur invalide et SUPPRIME la
             propriété : `style.color` revient vide et l'attribut `style` vaut
             `null`. Une assertion `toHaveStyle("color: rgb(var(...)")` compare
             donc deux absences et passe quoi qu'il arrive — elle aurait laissé
             passer le défaut même qu'on corrige ici. Ces deux attributs rendent
             le CHOIX du jeton observable sans rien changer au rendu, comme
             `data-dedans` sur les barres de la frise. */
          return (
            <div key={t.name}
                 data-testid={`ladder-${t.name}`}
                 data-jeton={jeton}
                 data-jeton-vif={jeton.replace("--fn-palier-", "--fn-vif-")}
                 className={`rounded-xl border p-3 transition ${
                   ici ? "bg-clinical" : "bg-white border-ash"}`}
                 style={ici ? { borderColor: trait, boxShadow: `0 0 0 1px ${trait}` }
                            : undefined}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-data text-[10px]
                                 uppercase tracking-[0.14em] font-semibold"
                      style={{ color: trait }}>
                  <TierMark tier={t.name} color={vif} size={18} />
                  {meta[lang] || t.name}
                </span>
                {ici && (
                  <span className="font-data text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5
                                   rounded-full"
                        style={{ background: voile, color: trait }}>
                    {L("vous", "you")}
                  </span>
                )}
              </div>
              <p className="font-display text-xl font-bold text-nordfjord tabular-nums mt-1">
                {money(Math.round(base * t.rate * 100) / 100)}
              </p>
              {/* Le seuil porte sur le chiffre d'affaires CUMULÉ sur douze
                  mois, pas sur la commande simulée juste au-dessus. Écrit
                  « dès 2 001 $ » à côté d'un calcul par commande, il se lisait
                  comme une condition sur la commande elle-même.
                  Pour les paliers non atteints, on montre la distance réelle :
                  la question « et si je vendais plus ? » trouve sa réponse au
                  lieu de rester une comparaison abstraite. */}
              <p className="font-data text-[10px] text-glacier mt-0.5">
                {Math.round(t.rate * 1000) / 10} %
              </p>
              {t.floor > 0 && (
                <p className="font-data text-[10px] mt-0.5"
                   style={{ color: atteint ? undefined : trait }}>
                  {atteint
                    ? L("palier atteint", "tier reached")
                    : L(`encore ${money(t.floor - rolling12)} de ventes`,
                        `${money(t.floor - rolling12)} of sales to go`)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
