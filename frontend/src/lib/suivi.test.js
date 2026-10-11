// Où en est ma commande — les règles, avant l'affichage.
//
// Audit de l'espace client du 06/10/2026, @mishka, section 5 : « Aucun
// indicateur d'étape. La page commande ne montre ni étapes, ni adresse de
// livraison, ni numéro de suivi. C'est pourtant la raison n°1 pour laquelle
// un client ouvre son compte. »
//
// LE PREMIER TEST DE CE FICHIER EST LE PLUS IMPORTANT. Le numéro de suivi
// n'était pas une fonctionnalité manquante : la page le cherchait dans
// `shipping_info.tracking`, un champ que le serveur n'écrit jamais — il écrit
// `tracking_number`. Le bloc « Suivi : … » existait, et n'a jamais pu
// s'afficher sur aucune commande depuis le jour où il a été écrit.
//
// C'est le motif « champ écrit, jamais relu » à l'envers, et il ne laisse
// aucune trace : pas d'erreur, pas de page blanche, juste un bloc qui ne
// vient pas. Seul un test qui nomme le bon champ l'attrape.

import {
  adresseEnLignes, etapesCommande, lienSuiviPostesCanada,
  numeroDeSuivi, suiviPertinent,
} from "./suivi";

const COMMANDE = {
  payment_status: "paid",
  fulfillment_status: "processing",
  paid_at: "2026-10-01T20:44:00Z",
  shipping_info: {},
};

describe("le numéro de suivi", () => {
  test("LE DÉFAUT D'ORIGINE : il se lit dans `tracking_number`", () => {
    // Le champ que le serveur écrit vraiment. Si quelqu'un revient à
    // `tracking`, ce test tombe — et c'est tout ce qui séparait la cliente
    // de son numéro de suivi pendant des mois.
    expect(numeroDeSuivi({ shipping_info: { tracking_number: "1234567890" } }))
      .toBe("1234567890");
  });

  test("`tracking` reste accepté en repli, pour les commandes anciennes", () => {
    expect(numeroDeSuivi({ shipping_info: { tracking: "999" } })).toBe("999");
  });

  test("vide quand il n'y en a pas, sans rien casser", () => {
    for (const commande of [{}, { shipping_info: {} }, { shipping_info: null }, null]) {
      expect(numeroDeSuivi(commande)).toBe("");
    }
  });

  test("les espaces autour ne comptent pas", () => {
    expect(numeroDeSuivi({ shipping_info: { tracking_number: "  123  " } })).toBe("123");
  });
});

describe("le lien de Postes Canada", () => {
  test("il mène au suivi, dans la langue du site", () => {
    expect(lienSuiviPostesCanada("1234", "fr")).toContain("/track-reperage/fr#");
    expect(lienSuiviPostesCanada("1234", "en")).toContain("/track-reperage/en#");
  });

  test("le numéro est échappé", () => {
    expect(lienSuiviPostesCanada("12 34", "fr")).toContain("searchFor=12%2034");
  });

  test("pas de numéro, pas de lien", () => {
    expect(lienSuiviPostesCanada("", "fr")).toBe("");
    expect(lienSuiviPostesCanada(null, "fr")).toBe("");
  });
});

describe("les quatre étapes", () => {
  const etats = (commande) =>
    etapesCommande(commande, "fr").map((e) => `${e.cle}:${e.etat}`);

  test("en préparation : les deux premières sont franchies", () => {
    expect(etats(COMMANDE)).toEqual([
      "payee:faite", "preparation:courante", "expediee:avenir", "livree:avenir",
    ]);
  });

  test("expédiée : L'ÉTAPE COURANTE EST LA DERNIÈRE FRANCHIE", () => {
    // Marquer « Expédiée » comme à venir sur une commande expédiée serait
    // le contresens exact que la cliente vient éviter.
    expect(etats({ ...COMMANDE, fulfillment_status: "shipped" })).toEqual([
      "payee:faite", "preparation:faite", "expediee:courante", "livree:avenir",
    ]);
  });

  test("livrée : tout est franchi", () => {
    expect(etats({ ...COMMANDE, fulfillment_status: "delivered" })).toEqual([
      "payee:faite", "preparation:faite", "expediee:faite", "livree:courante",
    ]);
  });

  test("un statut inconnu retombe sur « en préparation » sans planter", () => {
    expect(etats({ ...COMMANDE, fulfillment_status: "n'importe quoi" })[1])
      .toBe("preparation:courante");
  });

  test("chaque étape porte sa propre date", () => {
    const etapes = etapesCommande({
      ...COMMANDE, fulfillment_status: "delivered",
      shipping_info: { shipped_at: "2026-10-03T12:00:00Z", delivered_at: "2026-10-05T09:00:00Z" },
    }, "fr");
    expect(etapes[0].date).toBe("2026-10-01T20:44:00Z");
    expect(etapes[2].date).toBe("2026-10-03T12:00:00Z");
    expect(etapes[3].date).toBe("2026-10-05T09:00:00Z");
  });

  test("UNE ÉTAPE FRANCHIE SANS DATE RESTE FRANCHIE", () => {
    // Une commande ancienne n'a pas d'horodatage d'expédition. L'absence de
    // date ne doit pas laisser croire que rien n'est parti.
    const etapes = etapesCommande(
      { ...COMMANDE, fulfillment_status: "shipped", shipping_info: {} }, "fr");
    expect(etapes[2].etat).toBe("courante");
    expect(etapes[2].date).toBeNull();
  });

  test("les libellés suivent la langue", () => {
    expect(etapesCommande(COMMANDE, "en")[0].libelle).toBe("Paid");
    expect(etapesCommande(COMMANDE, "fr")[0].libelle).toBe("Payée");
  });
});

describe("quand la frise a un sens", () => {
  test("une commande payée : oui", () => {
    expect(suiviPertinent({ payment_status: "paid" })).toBe(true);
  });

  test("REMBOURSÉE, ANNULÉE, ÉCHOUÉE, EN ATTENTE : non", () => {
    // Aucune n'est en route. Des étapes « Expédiée → Livrée » y seraient un
    // mensonge — et c'est exactement l'écran que Mireille avait sous les yeux.
    for (const statut of ["refunded", "cancelled", "failed", "awaiting_etransfer", "awaiting_crypto"]) {
      expect(suiviPertinent({ payment_status: statut })).toBe(false);
    }
  });
});

describe("l'adresse de livraison", () => {
  const ADRESSE = {
    full_name: "Lola Tremblay", address1: "123 rue Principale", address2: "App. 4",
    city: "Québec", province: "QC", postal_code: "G1A 1A1", country: "CA",
  };

  test("elle se lit en lignes, dans l'ordre d'une enveloppe", () => {
    expect(adresseEnLignes(ADRESSE)).toEqual([
      "Lola Tremblay", "123 rue Principale", "App. 4", "Québec, QC  G1A 1A1",
    ]);
  });

  test("le Canada ne s'écrit pas : c'est le cas normal", () => {
    expect(adresseEnLignes(ADRESSE)).not.toContain("CA");
    expect(adresseEnLignes({ ...ADRESSE, country: "US" })).toContain("US");
  });

  test("les champs vides ne laissent pas de ligne blanche", () => {
    expect(adresseEnLignes({ ...ADRESSE, address2: "" })).toHaveLength(3);
  });

  test("pas d'adresse, pas de lignes", () => {
    for (const vide of [null, undefined, {}, "pas un objet"]) {
      expect(adresseEnLignes(vide)).toEqual([]);
    }
  });
});
