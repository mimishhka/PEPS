// Un certificat manquant n'est pas une rupture de stock.
//
// MIREILLE, 11/10/2026 : « j'ai rajouté du BPC-157 mais pour lequel je n'ai
// pas encore de COA. Il sort en précommande comme s'il n'était pas en stock
// [...] on veut permettre à ceux qui ne se soucient pas du COA de commander,
// mais il faut un avertissement, et il ne faut pas que la commande soit
// traitée comme une précommande. »
//
// LES DEUX CÔTÉS DOIVENT DIRE LA MÊME CHOSE. C'est le serveur qui tranche à
// la caisse (`precommande_requise`, dans backend/server.py). Si cette règle-ci
// s'en écarte, la cliente voit un prix sur la fiche et en paie un autre — et
// c'est exactement le genre d'écart qu'une règle recopiée à sept endroits
// finit par produire.

import { avertirCoa, coaEnAttente, estPrecommande } from "./precommande";

const variante = (champs = {}) => ({
  id: "v1", name: "5mg", price: 64.99, preorder_price: 54.99,
  stock: 12, preorder_enabled: true,
  badge_coming_soon: false, badge_coa_pending: false, coa_status: "none",
  ...champs,
});

describe("le certificat ne décide plus de la précommande", () => {
  test("LE CAS DE MIREILLE : du stock, pas de certificat", () => {
    const v = variante({ stock: 12, badge_coa_pending: true, coa_status: "pending" });
    expect(estPrecommande(v, 1)).toBe(false);
    expect(coaEnAttente(v)).toBe(true);
  });

  test("même à grande quantité, tant que le stock suit", () => {
    expect(estPrecommande(variante({ stock: 50, badge_coa_pending: true }), 30)).toBe(false);
  });

  test("les deux champs du certificat se valent", () => {
    // `badge_coa_pending` est l'ancien, `coa_status` le nouveau. Les deux
    // cohabitent depuis la migration.
    for (const v of [variante({ badge_coa_pending: true, coa_status: "none" }),
                     variante({ badge_coa_pending: false, coa_status: "pending" })]) {
      expect(coaEnAttente(v)).toBe(true);
      expect(estPrecommande(v, 1)).toBe(false);
    }
  });
});

describe("ce qui reste une vraie précommande", () => {
  test("un stock insuffisant", () => {
    expect(estPrecommande(variante({ stock: 2 }), 5)).toBe(true);
  });

  test("un stock à zéro", () => {
    expect(estPrecommande(variante({ stock: 0 }), 1)).toBe(true);
  });

  test("BIENTÔT DISPONIBLE, même avec du stock", () => {
    // Le produit n'existe pas encore en tablette : la précommande garde tout
    // son sens, contrairement au certificat.
    expect(estPrecommande(variante({ stock: 30, badge_coming_soon: true }), 1)).toBe(true);
  });

  test("sans précommande activée, jamais", () => {
    for (const champs of [{ preorder_enabled: false, stock: 0 },
                          { preorder_enabled: false, badge_coming_soon: true },
                          { preorder_enabled: false, badge_coa_pending: true }]) {
      expect(estPrecommande(variante(champs), 1)).toBe(false);
    }
  });
});

describe("quand avertir, et quand se taire", () => {
  test("on avertit sur un lot en stock dont le certificat manque", () => {
    expect(avertirCoa(variante({ stock: 12, coa_status: "pending" }), 1)).toBe(true);
  });

  test("ON SE TAIT SUR UNE PRÉCOMMANDE", () => {
    // Le délai d'arrivée est déjà le sujet, et le certificat viendra avec le
    // lot. Deux mentions au même endroit s'annulent.
    expect(avertirCoa(variante({ stock: 0, coa_status: "pending" }), 1)).toBe(false);
    expect(avertirCoa(variante({ stock: 30, coa_status: "pending", badge_coming_soon: true }), 1)).toBe(false);
  });

  test("et on se tait quand le certificat est là", () => {
    expect(avertirCoa(variante({ coa_status: "available" }), 1)).toBe(false);
    expect(avertirCoa(variante({ coa_status: "none" }), 1)).toBe(false);
  });
});

describe("les bords ne font pas tomber", () => {
  test("une variante absente ou vide", () => {
    for (const v of [null, undefined, {}]) {
      expect(typeof estPrecommande(v, 1)).toBe("boolean");
      expect(coaEnAttente(v)).toBe(false);
      expect(avertirCoa(v, 1)).toBe(false);
    }
  });

  test("une quantité absurde vaut au moins un", () => {
    const v = variante({ stock: 1 });
    for (const qte of [0, -3, null, undefined, "abc"]) {
      expect(estPrecommande(v, qte)).toBe(false);
    }
  });
});
