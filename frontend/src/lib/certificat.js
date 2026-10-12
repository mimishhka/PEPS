/* LES CHIFFRES DES CERTIFICATS, A UN SEUL ENDROIT.
 *
 * Ils vivaient dans `Certificats.jsx`. Le 11/10/2026, en dessinant la feuille
 * de certificat du bloc d'accueil, j'ai recopie « 99,7 % » et « 105,32 mg »
 * dans `Home.jsx` — deux copies du meme chiffre, qui finissent toujours par
 * diverger. C'est un test qui l'a signale, en refusant tout chiffre dans ce
 * bloc : il avait tort sur l'intention et raison sur le fond.
 *
 * Lot FN-OLW8W de GHK-Cu et lot FN-ELBCJ de Retatrutide, analyses le
 * 27 aout 2026 par SideChain Analytics. Ce sont de VRAIES valeurs : un
 * exemple invente se reconnait, et il abime la credibilite de tout ce qui
 * l'entoure.
 */
export const GHK = {
  compose: "GHK-Cu",
  lot: "FN-OLW8W",
  rapport: "COA-2026-SC-01688",
  labo: "GHK-078",
  recu: { fr: "21 août 2026", en: "21 August 2026" },
  analyse: { fr: "27 août 2026", en: "27 August 2026" },
  cas: "49557-75-7",
  formule: "C14H22CuN6O4 · C2H4O2",
  masse: { fr: "340,4 g/mol", en: "340.4 g/mol" },
  purete: { spec: "≥ 98 %", res: { fr: "99,7 %", en: "99.7 %" } },
  teneur: { spec: { fr: "100,00 mg", en: "100.00 mg" }, res: { fr: "105,32 mg", en: "105.32 mg" } },
  exactitude: { spec: "≥ 90 %", res: { fr: "105,3 %", en: "105.3 %" } },
  ion: "[M+H]+",
  mz: { fr: "341,20 Da", en: "341.20 Da" },
  rt: { fr: "1,199 min", en: "1.199 min" },
};

export const RET = {
  compose: "Retatrutide",
  lot: "FN-ELBCJ",
  masse: { fr: "4731,3 g/mol", en: "4731.3 g/mol" },
  ion: "[M+5H]5+",
  mz: { fr: "947,90 Da", en: "947.90 Da" },
};
