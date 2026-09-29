/**
 * LE PRIX S'ECRIT DANS LA LANGUE DE QUI LE LIT.
 *
 * Rapport E2E #20 : la vitrine affichait « $69.99 » meme en francais. Au
 * Quebec, un prix s'ecrit « 69,99 $ » — le symbole SUIT le nombre, apres une
 * espace insecable, et la decimale est une virgule. Voir la norme du Bureau
 * de la traduction et l'usage de tout le commerce de detail quebecois.
 *
 * Chaque fichier portait sa propre fonction `money`, toutes en format
 * anglais. Une seule source ici : corriger la regle une fois la corrige
 * partout, et un nouvel ecran ne peut plus recreer le defaut par distraction.
 *
 * L'espace avant le « $ » est une ESPACE INSECABLE (U+00A0) : sans elle, le
 * symbole peut se retrouver seul en debut de ligne.
 */

const OPTIONS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/**
 * Formate un montant en dollars canadiens selon la langue.
 *
 *   prix(69.99, "fr")  ->  "69,99 $"
 *   prix(69.99, "en")  ->  "$69.99"
 *
 * @param {number} n      le montant ; null/undefined/NaN valent zero
 * @param {string} lang   "fr" ou "en" ; tout ce qui commence par "fr" est du francais
 */
export function prix(n, lang = "en") {
  const montant = Number(n);
  const valeur = Number.isFinite(montant) ? montant : 0;
  const fr = String(lang || "").startsWith("fr");
  if (fr) {
    return `${valeur.toLocaleString("fr-CA", OPTIONS)} $`;
  }
  return `$${valeur.toLocaleString("en-CA", OPTIONS)}`;
}

/**
 * Le meme prix, avec la devise nommee — pour les ecrans ou deux monnaies
 * coexistent (versements en USDT, prix en CAD) et ou « $ » seul est ambigu.
 *
 *   prixAvecDevise(69.99, "fr")  ->  "69,99 $ CAD"
 */
export function prixAvecDevise(n, lang = "en", devise = "CAD") {
  return `${prix(n, lang)} ${devise}`;
}

export default prix;
