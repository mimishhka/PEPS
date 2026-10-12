/* Une commande, une ligne — même quand elle part en deux colis.
 *
 * Audit de l'espace client du 06/10/2026, @mishka, priorité 2 :
 *
 *   « Une même commande affichée deux fois quand elle contient une
 *     précommande : FN-…-56 (2 326,30 $, 2 SHIPMENTS) et FN-…-56-P (0,00 $,
 *     PAID, FOLLOW-UP), chacune avec un lien vers l'autre. Le client croit
 *     avoir passé deux commandes, dont une gratuite. 4 liens pour un seul
 *     achat. »
 *
 * CE N'EST PAS UN DÉFAUT D'AFFICHAGE, C'EST UNE FUITE DE PLOMBERIE. Une
 * commande mixte est scindée au paiement (`_scinder_precommande`, côté
 * serveur) : le disponible part tout de suite, la précommande suit. Cette
 * scission est une mécanique d'expédition, et elle n'avait aucune raison de
 * remonter jusqu'à l'écran de la cliente. `/orders/mine` renvoie les deux
 * documents, et la liste en faisait deux lignes.
 *
 * La sous-commande reste un détail technique : elle garde son identifiant,
 * son suivi et sa page — l'admin et les transporteurs en ont besoin. Elle
 * cesse simplement d'être une LIGNE DE PLUS dans l'historique d'achat.
 */

/** La commande est-elle l'envoi de suite d'une autre ? */
export function estEnvoiDeSuite(commande) {
  return !!(commande && (commande.suite_of_order_id || commande.suite_of_order_number));
}

/**
 * Regroupe les commandes pour l'affichage.
 *
 * Rend une liste de `{ principale, envois }` où `envois` contient la
 * commande principale puis, le cas échéant, son envoi de suite — dans
 * l'ordre où ils partent.
 *
 * L'ORPHELINE RESTE VISIBLE, et c'est le cas qui compte. Si l'envoi de
 * suite arrive sans sa commande mère — une liste paginée qui coupe entre les
 * deux, un accès invité qui n'en porte qu'une, une mère supprimée — il
 * reprend sa place de ligne autonome. Mieux vaut une ligne un peu nue qu'une
 * commande payée qui disparaît de l'historique.
 */
export function regrouperCommandes(commandes) {
  const liste = Array.isArray(commandes) ? commandes : [];
  const parId = new Map(liste.map((c) => [c.id, c]));

  /* Les suites rattachées, indexées par la mère. Une mère ne peut en avoir
     qu'une par construction ; on garde un tableau pour que deux suites — cas
     qui n'existe pas aujourd'hui — ne s'écrasent pas en silence. */
  const suites = new Map();
  for (const c of liste) {
    if (!estEnvoiDeSuite(c)) continue;
    const mereId = c.suite_of_order_id;
    if (!mereId || !parId.has(mereId)) continue;
    if (!suites.has(mereId)) suites.set(mereId, []);
    suites.get(mereId).push(c);
  }

  const absorbees = new Set();
  for (const groupe of suites.values()) for (const c of groupe) absorbees.add(c.id);

  return liste
    .filter((c) => !absorbees.has(c.id))
    .map((c) => ({ principale: c, envois: [c, ...(suites.get(c.id) || [])] }));
}

/**
 * Le total d'un groupe : celui de la commande mère.
 *
 * L'envoi de suite porte 0,00 $ — il est déjà payé. Les additionner
 * donnerait le bon chiffre par accident ; les additionner le jour où la
 * suite portera des frais donnerait le double. On prend donc la mère.
 */
export function totalDuGroupe(groupe) {
  return Number(groupe?.principale?.total || 0);
}

/** Le nombre d'articles de TOUS les envois : c'est ce que la cliente a acheté. */
export function articlesDuGroupe(groupe) {
  return (groupe?.envois || []).reduce(
    (n, c) => n + ((c.items || []).length), 0);
}

/* L'état d'un envoi, en un mot, pour la ligne « Envoi 1 · … ».
   On reste sur du factuel : ce que le colis fait, pas ce qu'il contiendra. */
export function etatEnvoi(commande, lang) {
  const fr = lang === "fr";
  const statut = String(commande?.fulfillment_status || "");
  if (statut === "delivered") return fr ? "livré" : "delivered";
  if (statut === "shipped") return fr ? "expédié" : "shipped";
  if (statut === "preorder") return fr ? "précommande" : "pre-order";
  if (estEnvoiDeSuite(commande)) return fr ? "précommande" : "pre-order";
  return fr ? "en préparation" : "being prepared";
}
