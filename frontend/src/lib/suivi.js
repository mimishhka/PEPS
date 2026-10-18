/* Où en est ma commande.
 *
 * Audit de l'espace client du 06/10/2026, @mishka, section 5, test des trois
 * secondes : « où en est ma commande ? → raté. La liste dit seulement
 * "Processing", et la page de la commande ne montre ni étapes, ni adresse de
 * livraison, ni numéro de suivi. C'est pourtant la raison n°1 pour laquelle
 * un client ouvre son compte. »
 *
 * LE NUMÉRO DE SUIVI N'ÉTAIT PAS ABSENT : IL ÉTAIT MAL LU.
 *
 * La page de commande affichait déjà un bloc « Suivi : … », conditionné à
 * `order.shipping_info.tracking`. Or le serveur n'écrit jamais ce champ-là :
 * il écrit `tracking_number`. Aucune commande n'a donc jamais pu afficher son
 * suivi, et le bloc était invisible depuis le jour où il a été écrit — c'est
 * le motif « champ écrit, jamais relu », à l'envers : champ LU, jamais écrit.
 *
 * Les données, elles, étaient déjà toutes envoyées au client :
 * `_customer_order_payload` transmet la commande entière moins quelques
 * caviardages. Rien à ajouter côté serveur.
 */

/* Le lien de suivi de Postes Canada, écrit à un seul endroit.
 *
 * Il existait déjà dans `Account.jsx`, en ligne. La page de commande en
 * aurait écrit un second : deux copies d'une même URL finissent toujours par
 * diverger — l'une est corrigée, l'autre non. C'est précisément la règle que
 * l'audit applique à la section 3. */
export function lienSuiviPostesCanada(pin, lang) {
  const numero = String(pin || "").trim();
  if (!numero) return "";
  const langue = lang === "fr" ? "fr" : "en";
  return `https://www.canadapost-postescanada.ca/track-reperage/${langue}#/resultList?searchFor=${encodeURIComponent(numero)}`;
}

/* Le numéro de suivi d'une commande, quel que soit le champ qui le porte.
 *
 * `tracking_number` est ce que le serveur écrit. `tracking` est le nom que la
 * page lisait à tort ; on le garde en repli le temps qu'on soit certain
 * qu'aucune commande ancienne ne le porte — lire un champ de trop ne coûte
 * rien, ne pas lire le bon a coûté l'affichage entier. */
export function numeroDeSuivi(order) {
  const exp = (order && order.shipping_info) || {};
  return String(exp.tracking_number || exp.tracking || "").trim();
}

/* CE QUE LE TRANSPORTEUR DIT, par opposition aux quatre étapes du site.
 *
 * MIREILLE, 18/10/2026 : « le suivi, puisque chaque commande a un suivi qui
 * montre l'état de livraison ».
 *
 * La frise ci-dessous est pilotée par `fulfillment_status`, qui ne connaît que
 * trois valeurs et ne bouge que lorsque le site la fait bouger. Elle ne saura
 * jamais dire « en cours de livraison », « au bureau de poste » ou
 * « tentative de livraison » — ces mots viennent de Postes Canada.
 *
 * LE SERVEUR LES AVAIT DÉJÀ, ET LES JETAIT. Le veilleur de livraison
 * interrogeait le repérage toutes les quinze minutes pour chaque commande
 * expédiée, et ne posait qu'une question à la réponse : « est-ce livré ? ».
 * Tout le reste partait. Depuis le 18/10/2026 il le range dans
 * `shipping_info`, sans un seul appel d'API de plus.
 *
 * Rendre `null` plutôt qu'un objet à champs vides : l'écran teste une seule
 * chose, et une donnée absente ne s'affiche pas du tout — la règle de la fiche
 * produit, qui vaut ici aussi. Une ligne « Statut : — » occupe de la place
 * pour dire qu'on ne sait pas. */
export function statutTransporteur(order) {
  const exp = (order && order.shipping_info) || {};
  const texte = String(exp.cp_statut || "").trim();
  if (!texte) return null;
  return {
    texte,
    lieu: String(exp.cp_lieu || "").trim(),
    /* `cp_evenement_a` est l'instant de l'événement chez le transporteur ;
     * `delivery_checked_at` est celui de notre dernière vérification. Les deux
     * répondent à des questions différentes — « quand le colis a-t-il bougé »
     * et « à quel point est-ce à jour » — et l'écran montre les deux. */
    evenementA: String(exp.cp_evenement_a || "").trim(),
    verifieA: String(exp.delivery_checked_at || "").trim(),
  };
}

export const ETATS_EXPEDITION = ["processing", "shipped", "delivered"];

/**
 * Les quatre étapes d'une commande, dans l'ordre, avec leur date et leur état.
 *
 * `etat` vaut « faite » (franchie, avec sa date), « courante » (là où en est
 * la commande) ou « avenir ». Une étape franchie sans date reste « faite » :
 * l'absence d'horodatage sur une vieille commande ne doit pas faire croire
 * qu'elle n'a pas été expédiée.
 */
export function etapesCommande(order, lang) {
  const fr = lang === "fr";
  const exp = (order && order.shipping_info) || {};
  const statut = String((order && order.fulfillment_status) || "processing");
  const rang = Math.max(0, ETATS_EXPEDITION.indexOf(statut));

  const definitions = [
    { cle: "payee", libelle: fr ? "Payée" : "Paid", date: order && order.paid_at, atteinte: 0 },
    { cle: "preparation", libelle: fr ? "En préparation" : "Being prepared", date: null, atteinte: 0 },
    { cle: "expediee", libelle: fr ? "Expédiée" : "Shipped", date: exp.shipped_at, atteinte: 1 },
    { cle: "livree", libelle: fr ? "Livrée" : "Delivered", date: exp.delivered_at, atteinte: 2 },
  ];

  /* L'étape COURANTE est la dernière franchie, pas la suivante. Marquer
   * « Expédiée » comme à venir sur une commande expédiée serait exactement
   * le contresens que la cliente vient chercher à éviter. */
  return definitions.map((d, i) => {
    const franchie = d.atteinte <= rang;
    const derniereFranchie = i === definitions.reduce(
      (dernier, autre, j) => (autre.atteinte <= rang ? j : dernier), 0);
    return {
      cle: d.cle,
      libelle: d.libelle,
      date: d.date || null,
      etat: !franchie ? "avenir" : derniereFranchie ? "courante" : "faite",
    };
  });
}

/* Une commande dont le suivi n'a aucun sens : rien n'est parti, rien ne
 * partira. La frise mentirait. */
export function suiviPertinent(order) {
  return !!order && order.payment_status === "paid";
}

/** L'adresse de livraison en lignes prêtes à afficher. */
export function adresseEnLignes(adresse) {
  if (!adresse || typeof adresse !== "object") return [];
  const ville = [adresse.city, adresse.province].filter(Boolean).join(", ");
  return [
    adresse.full_name,
    adresse.address1,
    adresse.address2,
    [ville, adresse.postal_code].filter(Boolean).join("  "),
    adresse.country && adresse.country !== "CA" ? adresse.country : null,
  ].map((l) => String(l || "").trim()).filter(Boolean);
}
