/* Le code d'affiliation porte par un lien, cote navigateur.
 *
 * Ce module ne connait NI le routeur NI le reseau : il ne fait que ranger,
 * relire et oublier une chaine dans le stockage de session. useAffiliateRef
 * s'occupe de lire « ?ref= » et de journaliser le clic ; la caisse s'occupe
 * de valider le code aupres du serveur.
 *
 * Pourquoi c'est un module separe : AuthContext doit pouvoir OUBLIER ce code
 * a la deconnexion. Importer le hook depuis le contexte d'authentification y
 * entrainait react-router-dom, et la suite de tests d'AuthContext ne se
 * chargeait plus. Un contexte d'authentification n'a de toute facon aucune
 * raison de dependre du routage.
 */

/* Le code porté par le lien, le temps de la VISITE EN COURS. Rien de plus.
 *
 * Pourquoi il faut le porter du tout : le témoin d'attribution posé par le
 * backend est `httpOnly`, donc le paiement ne peut pas le lire. Sans cette
 * copie, cliquer sur le lien créditait l'affilié mais n'accordait aucun
 * rabais : le contact payait plein tarif.
 *
 * POURQUOI `sessionStorage` ET NON `localStorage`. Une première version gardait
 * le code 365 jours. Conséquence : un client venu une fois par un lien obtenait
 * le rabais à CHAQUE commande de l'année suivante, sans jamais recliquer. Ce
 * n'est pas la règle voulue : le rabais se mérite par un geste : taper le code,
 * cliquer sur le lien, scanner le code QR. `sessionStorage` disparaît avec
 * l'onglet : le code vaut pour la visite pendant laquelle il a été utilisé, et
 * pour elle seule.
 *
 * Cette copie ne décide de RIEN : le rabais reste accordé par le serveur, qui
 * revalide le coupon au paiement : un code d'affilié suspendu sera refusé là,
 * quoi qu'il y ait ici.
 */
const CLE_CODE = "fn_ref_code";

export function codeAffiliePourPaiement() {
  try {
    return (window.sessionStorage.getItem(CLE_CODE) || "").toUpperCase();
  } catch {
    return "";
  }
}

/* Le code s'oublie avec la session.
 *
 * MIREILLE, 29/09/2026 : « le coupon doit etre applique, mais une fois
 * deconnecte il ne tient plus — ce qui est tout a fait normal ».
 *
 * Ce n'etait pas le cas. La deconnexion effacait bien le brouillon de caisse,
 * donc le coupon applique, mais cette copie du code survivait dans l'onglet :
 * en revenant a la caisse, l'effet de preremplissage le reappliquait aussitot.
 *
 * Le laisser serait aussi une attribution de trop. Sur un ordinateur partage,
 * la personne suivante obtiendrait le rabais d'un affilie qu'elle n'a jamais
 * rencontre, et cet affilie une commission sur une vente qu'il n'a pas
 * apportee. Le rabais se merite par un geste : cliquer, scanner, taper. La
 * deconnexion dit qu'on change de personne, donc de geste.
 */
export function oublierCodeAffilie() {
  try {
    window.sessionStorage.removeItem(CLE_CODE);
  } catch {
    /* stockage indisponible : il n'y avait rien a oublier */
  }
}

export function memoriserCode(code) {
  try {
    window.sessionStorage.setItem(CLE_CODE, String(code).toUpperCase());
  } catch {
    /* stockage indisponible : le lien crédite toujours, sans préremplissage */
  }
}
