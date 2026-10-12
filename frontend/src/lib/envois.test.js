// Une commande, une ligne — même quand elle part en deux colis.
//
// Audit de l'espace client du 06/10/2026, @mishka, priorité 2 : « une même
// commande affichée deux fois quand elle contient une précommande : FN-…-56
// (2 326,30 $, 2 SHIPMENTS) et FN-…-56-P (0,00 $, PAID, FOLLOW-UP), chacune
// avec un lien vers l'autre. Le client croit avoir passé deux commandes, dont
// une gratuite. 4 liens pour un seul achat. »
//
// CE N'EST PAS UN DÉFAUT D'AFFICHAGE, C'EST UNE FUITE DE PLOMBERIE. La
// scission au paiement est une mécanique d'expédition, et elle n'avait aucune
// raison de remonter jusqu'à l'écran de la cliente.
//
// LE TEST QUI COMPTE LE PLUS EST CELUI DE L'ORPHELINE. Regrouper, c'est
// masquer — et masquer une commande payée est un défaut bien pire que celui
// qu'on corrige. Si l'envoi de suite arrive sans sa mère (liste coupée, accès
// invité, mère supprimée), il doit reprendre sa place de ligne autonome.

import {
  articlesDuGroupe, estEnvoiDeSuite, etatEnvoi, regrouperCommandes, totalDuGroupe,
} from "./envois";

const MERE = {
  id: "o-56", order_number: "FN-260930-56", total: 2326.30,
  payment_status: "paid", fulfillment_status: "shipped",
  items: [{ product_id: "p1" }, { product_id: "p2" }],
  suite_order_id: "o-56p", suite_order_number: "FN-260930-56-P",
};

const SUITE = {
  id: "o-56p", order_number: "FN-260930-56-P", total: 0,
  payment_status: "paid", fulfillment_status: "preorder",
  items: [{ product_id: "p3" }],
  suite_of_order_id: "o-56", suite_of_order_number: "FN-260930-56",
};

const SEULE = {
  id: "o-11", order_number: "FN-260901-11", total: 64.99,
  payment_status: "paid", fulfillment_status: "delivered",
  items: [{ product_id: "p9" }],
};

describe("le regroupement", () => {
  test("LE CAS DE L'AUDIT : deux documents, une seule ligne", () => {
    const g = regrouperCommandes([MERE, SUITE]);
    expect(g).toHaveLength(1);
    expect(g[0].principale.order_number).toBe("FN-260930-56");
    expect(g[0].envois).toHaveLength(2);
  });

  test("la ligne porte le vrai montant, pas 0,00 $", () => {
    // La seconde ligne affichait « 0,00 $ » sans rien qui l'explique : la
    // cliente concluait à une commande gratuite, ou à une erreur.
    const [g] = regrouperCommandes([MERE, SUITE]);
    expect(totalDuGroupe(g)).toBe(2326.30);
  });

  test("ON PREND LE TOTAL DE LA MÈRE, ON NE LES ADDITIONNE PAS", () => {
    /* Ce test a d'abord été écrit avec la suite à 0,00 $ — et il ne
     * vérifiait RIEN : additionner ou prendre la mère donnait le même
     * chiffre, et la mutation de contrôle est passée sans rien casser.
     *
     * Un envoi de suite porte zéro aujourd'hui parce qu'il est déjà payé.
     * Le jour où il portera des frais — un réacheminement, une seconde
     * étiquette — l'addition facturerait deux fois à l'écran. Le lot d'essai
     * doit donc faire diverger les deux calculs. */
    const suitePayante = { ...SUITE, total: 19.99 };
    const [g] = regrouperCommandes([MERE, suitePayante]);
    expect(totalDuGroupe(g)).toBe(2326.30);
    expect(totalDuGroupe(g)).not.toBe(2346.29);
  });

  test("et le compte d'articles couvre LES DEUX envois", () => {
    // C'est ce qu'elle a acheté, pas ce qui tient dans le premier colis.
    const [g] = regrouperCommandes([MERE, SUITE]);
    expect(articlesDuGroupe(g)).toBe(3);
  });

  test("une commande ordinaire reste une ligne ordinaire", () => {
    const g = regrouperCommandes([SEULE]);
    expect(g).toHaveLength(1);
    expect(g[0].envois).toHaveLength(1);
  });

  test("l'ordre de la liste est conservé", () => {
    const g = regrouperCommandes([SEULE, MERE, SUITE]);
    expect(g.map((x) => x.principale.id)).toEqual(["o-11", "o-56"]);
  });
});

describe("L'ORPHELINE RESTE VISIBLE", () => {
  test("un envoi de suite sans sa mère garde sa ligne", () => {
    /* Regrouper, c'est masquer. Masquer une commande PAYÉE est un défaut
     * bien pire que celui qu'on corrige : la cliente ne la retrouve plus du
     * tout. Liste paginée qui coupe entre les deux, accès invité qui n'en
     * porte qu'une, mère supprimée — tous ces cas existent. */
    const g = regrouperCommandes([SUITE]);
    expect(g).toHaveLength(1);
    expect(g[0].principale.order_number).toBe("FN-260930-56-P");
  });

  test("une mère sans sa suite ne fabrique pas d'envoi fantôme", () => {
    const g = regrouperCommandes([MERE]);
    expect(g[0].envois).toHaveLength(1);
  });

  test("deux suites pour une mère ne s'écrasent pas", () => {
    // Le cas n'existe pas aujourd'hui. S'il arrivait, la seconde ne doit pas
    // disparaître en silence.
    const autre = { ...SUITE, id: "o-56q", order_number: "FN-260930-56-Q" };
    const [g] = regrouperCommandes([MERE, SUITE, autre]);
    expect(g.envois).toHaveLength(3);
  });
});

describe("les bords ne font pas tomber", () => {
  test("une liste vide, nulle, ou qui n'en est pas une", () => {
    for (const v of [[], null, undefined, "pas une liste", 42]) {
      expect(regrouperCommandes(v)).toEqual([]);
    }
  });

  test("une suite dont l'identifiant de mère est vide", () => {
    const bancale = { ...SUITE, suite_of_order_id: "" };
    expect(regrouperCommandes([MERE, bancale])).toHaveLength(2);
  });

  test("des commandes sans articles", () => {
    const [g] = regrouperCommandes([{ ...MERE, items: null }, { ...SUITE, items: undefined }]);
    expect(articlesDuGroupe(g)).toBe(0);
  });
});

describe("l'état de chaque envoi", () => {
  test("il dit ce que le colis fait, en un mot", () => {
    expect(etatEnvoi(MERE, "fr")).toBe("expédié");
    expect(etatEnvoi(SUITE, "fr")).toBe("précommande");
    expect(etatEnvoi(SEULE, "fr")).toBe("livré");
    expect(etatEnvoi({ fulfillment_status: "processing" }, "fr")).toBe("en préparation");
  });

  test("en anglais aussi", () => {
    expect(etatEnvoi(MERE, "en")).toBe("shipped");
    expect(etatEnvoi(SUITE, "en")).toBe("pre-order");
  });

  test("un envoi de suite sans statut reste une précommande", () => {
    // C'est ce qu'il est par construction : il attend le lot.
    expect(etatEnvoi({ suite_of_order_id: "x" }, "fr")).toBe("précommande");
  });
});

describe("reconnaître un envoi de suite", () => {
  test("par son identifiant ou par son numéro", () => {
    expect(estEnvoiDeSuite(SUITE)).toBe(true);
    expect(estEnvoiDeSuite({ suite_of_order_number: "FN-1" })).toBe(true);
    expect(estEnvoiDeSuite(MERE)).toBe(false);
    expect(estEnvoiDeSuite(null)).toBe(false);
  });
});
