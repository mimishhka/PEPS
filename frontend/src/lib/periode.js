// Les mois et les périodes, dits comme on les dit.
//
// Ces fonctions vivaient en DOUBLE — une copie dans AffiliateDashboard.jsx,
// une autre dans admin/sections/AdminAffiliates.jsx. Comportement identique,
// écrit deux fois : le genre de paire qui finit par diverger sur un détail
// qu'on ne remarque que le jour où l'écran affilié et l'écran OPS nomment le
// même mois autrement.
//
// MIREILLE, 01/10/2026, sur l'historique des versements : « le payout indique
// le mois d'octobre alors que c'est pour les commissions du mois de
// septembre ». La correction demandait une troisième fonction, et donc une
// troisième copie si on ne regroupait pas d'abord.
//
// `periodeLisible` est le pendant exact de `_periode_lisible`
// (backend/services/affiliate.py), qui sert aux courriels : l'écran et le
// courriel doivent nommer la même période de la même façon.

// « 2026-09 » devient « septembre 2026 ».
// Une clé qui n'est pas un mois est rendue telle quelle : on dégrade, on ne
// lève pas, et on n'invente pas un mois pour une donnée héritée.
export function moisLisible(cle, lang) {
  if (!cle || !/^\d{4}-\d{2}$/.test(cle)) return cle || "-";
  const [a, m] = String(cle).split("-").map(Number);
  if (!(m >= 1 && m <= 12)) return cle;
  return new Date(a, m - 1, 1).toLocaleDateString(
    lang === "fr" ? "fr-CA" : "en-CA", { month: "long", year: "numeric" });
}

// « 2026-10-06T04:00:00Z » devient « 6 octobre ».
export function jourLisible(iso, lang) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { day: "numeric", month: "long" });
}

// La date ET l'heure, pour un versement : « 6 octobre 2026, 14:00 ».
export function momentLisible(iso, lang) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA",
    { day: "numeric", month: "long", year: "numeric" });
}

/**
 * La période couverte par un versement : un mois, ou une plage.
 *
 * `periode` est l'objet `{debut, fin, mois, multi}` que le serveur calcule
 * depuis les commissions du versement — et NON son champ `period`, qui n'est
 * qu'une étiquette de run.
 *
 * Un versement peut couvrir plusieurs mois, et ce n'est pas un cas tordu : le
 * seuil minimum reporte le solde, donc un affilié resté sous le seuil en
 * juillet et août est payé en septembre pour les trois.
 *
 * `repli` est rendu tel quel quand la période est indisponible (versement
 * ancien sans commissions rattachées). L'appelant choisit s'il montre
 * l'étiquette faute de mieux, ou s'il écrit « indisponible ».
 */
export function periodeLisible(periode, lang, repli = "-") {
  if (!periode || !periode.debut) return repli;
  const { debut, fin } = periode;
  if (!fin || fin === debut) return moisLisible(debut, lang);

  const fr = lang === "fr";
  // Même année : on ne la répète pas. « juillet à septembre 2026 » se lit ;
  // « juillet 2026 à septembre 2026 » se déchiffre.
  if (String(debut).slice(0, 4) === String(fin).slice(0, 4)) {
    const mois = (cle) => {
      const [a, m] = String(cle).split("-").map(Number);
      return new Date(a, m - 1, 1).toLocaleDateString(
        fr ? "fr-CA" : "en-CA", { month: "long" });
    };
    return fr
      ? `${mois(debut)} à ${mois(fin)} ${String(debut).slice(0, 4)}`
      : `${mois(debut)} to ${mois(fin)} ${String(debut).slice(0, 4)}`;
  }
  return fr
    ? `${moisLisible(debut, lang)} à ${moisLisible(fin, lang)}`
    : `${moisLisible(debut, lang)} to ${moisLisible(fin, lang)}`;
}
