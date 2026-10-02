// L'état d'un versement, dit UNE fois pour tous les écrans.
//
// Le même vocabulaire vivait en TROIS exemplaires, et les trois divergeaient :
//
//   - `AffiliateDashboard.jsx` projetait les dix statuts bruts sur quatre
//     états lisibles, avec un repli explicite sur « En cours ». Correct.
//   - `AdminPayouts.jsx` tenait un dictionnaire complet des dix. Correct
//     aussi, mais séparé — donc libre de dériver.
//   - `AdminAffiliates.jsx`, dans la FICHE, n'avait ni l'un ni l'autre :
//       {p.status === "paid_manual" ? L("Payé (manuel)") : p.status}
//     La fiche affichait donc `ready`, `failed`, `review`, `dispatching`,
//     `queued_manual` — le jeton anglais brut, dans une interface française.
//     Et une seule couleur orange pour TOUT ce qui n'est pas payé : un
//     versement échoué s'y lisait comme un versement en traitement.
//
// MIREILLE, 01/10/2026 : « Affiliate endpoint in admin some data is missing
// and of just not well built — same for payout the history and down it is
// confusing ». C'était ça, littéralement : la donnée était là, l'écran
// montrait son nom de variable.
//
// LES DEUX PUBLICS N'ONT PAS LE MÊME BESOIN, et c'est voulu :
//
//   - L'affilié a besoin de savoir si son argent est parti, en route, retenu,
//     ou annulé. Quatre états lui suffisent, et regrouper « à vérifier » avec
//     « échoué » sous « en vérification » lui évite une alarme sur un incident
//     qui se règle sans lui.
//   - L'opératrice a besoin de savoir QUOI FAIRE : « 2FA requis » et « à payer
//     à la main » demandent deux gestes différents, et « échoué » doit être
//     rouge, pas orange.
//
// Ce module porte donc UNE projection (statut brut → état canonique) et DEUX
// jeux de libellés. Ce qui est commun est commun ; ce qui diffère diffère pour
// une raison écrite.

// ---------------------------------------------------------------------------
// LES STATUTS QUE LA BASE ÉCRIT VRAIMENT
//
// Relevés dans le code, pas supposés : `creating`, `ready`, `queued_manual`,
// `dispatching`, `processing`, `paid`, `paid_manual`, `failed`, `review`.
// Ajouter un statut côté serveur sans l'inscrire ici le fera tomber dans le
// repli — c'est le comportement voulu, et `statutVersementConnu` permet à un
// test de le détecter.
// ---------------------------------------------------------------------------

export const ETATS_VERSEMENT = {
  paid: "paye",
  paid_manual: "paye",
  creating: "en_cours",
  ready: "en_cours",
  queued_manual: "en_cours",
  dispatching: "en_cours",
  processing: "en_cours",
  review: "retenu",
  // `failed` reste groupé avec `review` pour l'affilié : l'échec LIBÈRE ses
  // commissions (`payout_id` remis à None), elles repartent donc au cycle
  // suivant. Côté opératrice, c'est un état distinct et rouge.
  failed: "retenu",
  reversed: "annule",
};

// Ce que l'affilié lit. Quatre états, et un repli qui n'affirme rien.
export const LIBELLE_VERSEMENT = {
  paye: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success" },
  en_cours: { fr: "En cours", en: "In progress", cls: "bg-nova/15 text-nordfjord" },
  retenu: { fr: "En vérification", en: "Under review", cls: "bg-warning/15 text-warning" },
  annule: { fr: "Annulé", en: "Reversed", cls: "bg-error/15 text-error" },
};

// Ce que l'opératrice lit. Dix états, nommés par le GESTE qu'ils demandent.
export const LIBELLE_VERSEMENT_OPS = {
  ready: { fr: "Prêt", en: "Ready", cls: "bg-warning/15 text-warning border border-warning/30" },
  creating: { fr: "2FA requis", en: "2FA required", cls: "bg-nova/15 text-nova border border-nova/30" },
  dispatching: { fr: "Envoi en cours", en: "Dispatching", cls: "bg-nova/15 text-nova border border-nova/30" },
  processing: { fr: "En traitement", en: "Processing", cls: "bg-glacier/15 text-glacier border border-glacier/30" },
  paid: { fr: "Payé", en: "Paid", cls: "bg-success/15 text-success border border-success/30" },
  paid_manual: { fr: "Payé (manuel)", en: "Paid (manual)", cls: "bg-success/15 text-success border border-success/30" },
  failed: { fr: "Échoué", en: "Failed", cls: "bg-error/10 text-error border border-error/25" },
  queued_manual: { fr: "À payer à la main", en: "Manual queue", cls: "bg-glacier/15 text-glacier border border-glacier/30" },
  review: { fr: "À vérifier", en: "Needs review", cls: "bg-error/10 text-error border border-error/25" },
  reversed: { fr: "Annulé", en: "Reversed", cls: "bg-error/10 text-error border border-error/25" },
};

/** Vrai si ce statut est inscrit ici. Sert aux tests : un statut écrit par le
 *  serveur et absent de ce module tombe dans un repli, et doit se voir. */
export function statutVersementConnu(statut) {
  return Object.prototype.hasOwnProperty.call(ETATS_VERSEMENT, statut);
}

/** L'état canonique d'un versement. UN ÉTAT INCONNU VAUT « EN COURS »,
 *  jamais « Prêt » : affirmer un état précis à partir de rien est exactement
 *  ce qui avait fait annoncer « Prêt » pour un versement en vérification. */
export function etatVersement(statut) {
  return ETATS_VERSEMENT[statut] || "en_cours";
}

/** Le libellé pour l'AFFILIÉ. */
export function libelleVersement(statut, lang) {
  const e = LIBELLE_VERSEMENT[etatVersement(statut)];
  return { texte: lang === "fr" ? e.fr : e.en, cls: e.cls };
}

/** Le libellé pour l'OPÉRATRICE.
 *
 *  Le repli rend le jeton brut — mais accompagné de la classe « inconnu », ce
 *  qui le rend visible à l'écran comme une anomalie au lieu de le faire passer
 *  pour un libellé. C'est l'inverse du défaut d'origine : là, le jeton brut se
 *  déguisait en état normal, en orange, à côté des vrais libellés. */
export function libelleVersementOps(statut, lang) {
  const e = LIBELLE_VERSEMENT_OPS[statut];
  if (!e) {
    return {
      texte: statut || "—",
      cls: "bg-glacier/10 text-glacier border border-glacier/30",
      inconnu: true,
    };
  }
  return { texte: lang === "fr" ? e.fr : e.en, cls: e.cls, inconnu: false };
}

/** Un versement ÉCHOUÉ a rendu ses commissions au cycle suivant.
 *
 *  `handle_np_payout_webhook` remet `payout_id` à None sur les lignes
 *  `approved` quand l'envoi échoue — sinon elles resteraient attachées à un
 *  versement mort, et le générateur, qui filtre sur `payout_id: None`, ne les
 *  reprendrait jamais.
 *
 *  La conséquence est bonne, mais elle était INVISIBLE : l'affilié voyait un
 *  versement « en vérification » ET le même montant recompté dans son prochain
 *  cycle, sans aucun lien entre les deux. Deux fois le même argent à l'écran,
 *  c'est une erreur qu'on croit voir même quand il n'y en a pas. */
export function commissionsRenduesAuCycle(statut) {
  return statut === "failed";
}
