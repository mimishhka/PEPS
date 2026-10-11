/* Ce qui part en précommande, et ce qui part tout de suite.
 *
 * MIREILLE, 11/10/2026 : « j'ai rajouté du BPC-157 mais pour lequel je n'ai
 * pas encore de COA. Il sort en précommande comme s'il n'était pas en stock
 * [...] on veut permettre à ceux qui ne se soucient pas du COA de commander,
 * mais il faut un avertissement, et il ne faut pas que la commande soit
 * traitée comme une précommande. »
 *
 * UN CERTIFICAT MANQUANT N'EST PAS UNE RUPTURE DE STOCK.
 *
 * La règle confondait les deux : `badge_coa_pending` forçait la précommande
 * au même titre qu'un stock insuffisant, et elle était recopiée à sept
 * endroits — trois côté serveur, quatre ici. Les conséquences dépassaient
 * largement l'étiquette affichée : prix de précommande au lieu du prix
 * normal, commande scindée en deux (la sous-commande « -P » à 0,00 $ que la
 * cliente prend pour une erreur), stock non débité, et surtout un envoi que
 * la vérification de libération refusait de laisser partir TANT QUE LE
 * CERTIFICAT N'ÉTAIT PAS TÉLÉVERSÉ, stock en main. Le colis ne serait jamais
 * parti.
 *
 * Le certificat ne décide donc plus de rien. Il devient ce qu'il est : une
 * information à donner avant l'achat.
 *
 * DOIT RESTER ALIGNÉ sur `precommande_requise` dans `backend/server.py`.
 * C'est le serveur qui tranche à la caisse ; si les deux divergent, la
 * cliente voit un prix et en paie un autre.
 */

/** Le certificat d'analyse de ce lot n'est pas encore publié. */
export function coaEnAttente(variante) {
  const v = variante || {};
  return !!(v.badge_coa_pending || v.coa_status === "pending");
}

/**
 * Cette ligne part-elle en précommande ?
 *
 * « Bientôt disponible » reste une vraie raison : le produit n'existe pas
 * encore en tablette. Un stock insuffisant aussi. Le certificat, non.
 */
export function estPrecommande(variante, qte = 1) {
  const v = variante || {};
  if (!v.preorder_enabled) return false;
  if (v.badge_coming_soon) return true;
  return Number(v.stock || 0) < Math.max(1, Number(qte) || 1);
}

/**
 * Faut-il avertir avant l'achat ?
 *
 * Seulement quand le lot part vraiment tout de suite : sur une précommande,
 * le délai d'arrivée est déjà le sujet, et le certificat suivra avec le lot.
 * Deux avertissements au même endroit s'annulent.
 */
export function avertirCoa(variante, qte = 1) {
  return coaEnAttente(variante) && !estPrecommande(variante, qte);
}
