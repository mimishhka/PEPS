// Ce qu'on sait d'une adresse SANS demander à personne.
//
// La page de compte proposait déjà une liste déroulante de provinces ; le
// checkout, lui, laissait un champ libre. Un client y tape « Québec », « Qc »,
// « PQ », et l'adresse part telle quelle : ni le serveur ni Postes Canada ne
// la corrigent, l'étiquette est refusée des jours plus tard, et personne ne
// sait pourquoi. Les deux écrans lisent désormais la même table.

export const PROVINCES_CA = [
  { code: "AB", fr: "Alberta", en: "Alberta" },
  { code: "BC", fr: "Colombie-Britannique", en: "British Columbia" },
  { code: "MB", fr: "Manitoba", en: "Manitoba" },
  { code: "NB", fr: "Nouveau-Brunswick", en: "New Brunswick" },
  { code: "NL", fr: "Terre-Neuve-et-Labrador", en: "Newfoundland and Labrador" },
  { code: "NS", fr: "Nouvelle-Écosse", en: "Nova Scotia" },
  { code: "NT", fr: "Territoires du Nord-Ouest", en: "Northwest Territories" },
  { code: "NU", fr: "Nunavut", en: "Nunavut" },
  { code: "ON", fr: "Ontario", en: "Ontario" },
  { code: "PE", fr: "Île-du-Prince-Édouard", en: "Prince Edward Island" },
  { code: "QC", fr: "Québec", en: "Quebec" },
  { code: "SK", fr: "Saskatchewan", en: "Saskatchewan" },
  { code: "YT", fr: "Yukon", en: "Yukon" },
];

export const ETATS_US = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([code, nom]) => ({ code, fr: nom, en: nom }));

export function regionsDuPays(pays) {
  return String(pays || "CA").toUpperCase() === "US" ? ETATS_US : PROVINCES_CA;
}

// La PREMIÈRE LETTRE d'un code postal canadien désigne sa province. Ce n'est
// pas une heuristique : c'est la façon dont Postes Canada découpe le pays.
//
// `X` est la seule exception, partagée entre les Territoires du Nord-Ouest et
// le Nunavut. On ne devine donc PAS pour X — remplir un champ avec une valeur
// fausse est pire que le laisser vide : personne ne relit ce qui est déjà
// rempli.
const PROVINCE_PAR_LETTRE = {
  A: "NL", B: "NS", C: "PE", E: "NB",
  G: "QC", H: "QC", J: "QC",
  K: "ON", L: "ON", M: "ON", N: "ON", P: "ON",
  R: "MB", S: "SK", T: "AB", V: "BC", Y: "YT",
};

export function provinceDepuisCodePostal(codePostal) {
  const lettre = String(codePostal || "").trim().charAt(0).toUpperCase();
  return PROVINCE_PAR_LETTRE[lettre] || null;
}

// « h2x1y4 » -> « H2X 1Y4 ». Le formatage se faisait uniquement à l'envoi :
// on tapait, on cliquait, et on découvrait alors que le format n'allait pas.
// Le faire à la frappe supprime l'erreur au lieu de la signaler.
export function formaterCodePostal(pays, valeur) {
  const v = String(valeur || "").trim();
  if (String(pays || "CA").toUpperCase() === "US") {
    const chiffres = v.replace(/[^0-9]/g, "").slice(0, 9);
    return chiffres.length > 5 ? `${chiffres.slice(0, 5)}-${chiffres.slice(5)}` : chiffres;
  }
  const brut = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return brut.length > 3 ? `${brut.slice(0, 3)} ${brut.slice(3)}` : brut;
}

export function codePostalComplet(pays, valeur) {
  const v = String(valeur || "").trim().toUpperCase();
  return String(pays || "CA").toUpperCase() === "US"
    ? /^\d{5}(-\d{4})?$/.test(v)
    : /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/.test(v);
}

// Le code postal et la province se contredisent-ils ? Un code de Montréal
// avec « ON » est une adresse que Postes Canada refusera — mais seulement au
// moment d'imprimer l'étiquette, c'est-à-dire après l'encaissement.
export function provinceCoherente(pays, codePostal, province) {
  if (String(pays || "CA").toUpperCase() !== "CA") return true;
  if (!codePostalComplet("CA", codePostal) || !province) return true;
  const attendue = provinceDepuisCodePostal(codePostal);
  return attendue === null || attendue === String(province).toUpperCase();
}
