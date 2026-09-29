/**
 * LE DOSAGE S'ECRIT COMME ON LE LIT A VOIX HAUTE.
 *
 * Rapport E2E #20 : la vitrine affichait « 5.0mg ». Personne ne dit « cinq
 * point zero milligrammes » — on dit « cinq milligrammes ». Le « .0 » est un
 * artefact de saisie, et l'unite collee au chiffre se lit mal.
 *
 * Le defaut vit dans les DONNEES : les variantes sont nommees « 5.0mg » en
 * base. Normaliser a l'AFFICHAGE repare tout l'existant sans migration, et
 * protege des prochaines saisies — personne n'aura a se souvenir de la regle.
 *
 * La fonction est volontairement prudente : elle ne touche QUE le motif
 * « nombre + unite », et rend le libelle inchange des qu'elle ne le
 * reconnait pas. Un nom de variante libre (« Lot d'essai », « Kit complet »)
 * traverse intact.
 */

// Un nombre, un espace facultatif, puis une unite de masse ou de volume.
// Les unites sont listees explicitement : sans cette liste, « 5.0 flacons »
// deviendrait « 5 flacons » — correct par hasard ici, hasardeux en general.
const MOTIF = /^(\d+(?:[.,]\d+)?)\s*(mg|g|kg|mcg|µg|ug|ml|mL|l|L|UI|IU)$/;

/**
 * Nettoie un libelle de dosage pour l'affichage.
 *
 *   dosage("5.0mg")    ->  "5 mg"
 *   dosage("10.0mg")   ->  "10 mg"
 *   dosage("2.5mg")    ->  "2,5 mg"  en francais
 *   dosage("2.5mg")    ->  "2.5 mg"  en anglais
 *   dosage("Kit")      ->  "Kit"     (inchange)
 *
 * @param {string} libelle  le nom de variante, tel qu'il vient de la base
 * @param {string} lang     "fr" ou "en" — seule la decimale en depend
 */
export function dosage(libelle, lang = "en") {
  const brut = String(libelle ?? "").trim();
  if (!brut) return "";

  const m = brut.match(MOTIF);
  if (!m) return brut;

  const [, nombre, unite] = m;
  const valeur = Number(String(nombre).replace(",", "."));
  if (!Number.isFinite(valeur)) return brut;

  // Un entier perd ses decimales : « 5.0 » devient « 5 ». Une vraie
  // decimale les garde : « 2.5 » reste « 2,5 ».
  const fr = String(lang || "").startsWith("fr");
  const texte = Number.isInteger(valeur)
    ? String(valeur)
    : String(valeur).replace(".", fr ? "," : ".");

  return `${texte} ${unite}`;
}

export default dosage;
