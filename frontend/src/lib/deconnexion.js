/* Quelles pages quitter quand une session se ferme.
 *
 * MIREILLE, 29/09/2026 : « lorsque je me déconnecte alors que je suis sur la
 * page des instructions de paiement, celle-ci reste là — cela n'a pas lieu
 * d'être ».
 *
 * Les routes PROTÉGÉES n'ont pas besoin de figurer ici : ProtectedRoute les
 * évacue de lui-même dès que `user` tombe. Cette liste ne porte que les pages
 * PUBLIQUES qui affichent quelque chose de personnel — celles qui, faute de
 * garde, restaient à l'écran après le départ.
 *
 * /order/:id est publique à dessein : un invité qui commande sans compte doit
 * pouvoir revenir à ses instructions Interac depuis le courriel de
 * confirmation. La protéger casserait cela. On la QUITTE plutôt, et seulement
 * quand une session se ferme vraiment — la visite d'un invité ne déclenche
 * rien et n'est pas dérangée.
 */
const PAGES_PERSONNELLES_PUBLIQUES = [
  // Confirmation de commande et instructions de paiement : nom, montant,
  // référence Interac, adresse de livraison.
  /^\/order\//,
];

export function doitQuitterALaDeconnexion(chemin) {
  const cible = typeof chemin === "string" ? chemin : "";
  if (!cible) return false;
  return PAGES_PERSONNELLES_PUBLIQUES.some((motif) => motif.test(cible));
}
