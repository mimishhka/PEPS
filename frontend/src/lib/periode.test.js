// Les mois et les périodes.
//
// MIREILLE, 01/10/2026 : « le payout indique le mois d'octobre alors que c'est
// pour les commissions du mois de septembre ». Et : « aussi pour les courriels
// qui indiquent la mauvaise période ».
//
// CE QUE CES TESTS N'ASSERTENT PAS : le nom des mois. « septembre » vient
// d'`Intl`, pas de ce fichier — l'épingler ferait échouer la suite sur une
// plateforme à l'ICU réduite sans qu'aucun défaut n'existe. Ce qui est testé
// est ce qui m'appartient : les gardes, le choix entre un mois et une plage,
// la non-répétition de l'année, et le repli.

import { moisLisible, jourLisible, momentLisible, periodeLisible } from "./periode";

const nomDuMois = (cle, lang) => {
  const [a, m] = cle.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString(
    lang === "fr" ? "fr-CA" : "en-CA", { month: "long" });
};

describe("moisLisible", () => {
  test("un mois valide est rendu avec son année", () => {
    const rendu = moisLisible("2026-09", "fr");
    expect(rendu).toContain(nomDuMois("2026-09", "fr"));
    expect(rendu).toContain("2026");
  });

  test("le français et l'anglais ne donnent pas la même chaîne", () => {
    expect(moisLisible("2026-09", "fr")).not.toBe(moisLisible("2026-09", "en"));
  });

  test("une clé qui n'est pas un mois ne lève pas et n'invente rien", () => {
    // Des données héritées traversent ces écrans. Dégrader, jamais casser.
    expect(moisLisible("", "fr")).toBe("-");
    expect(moisLisible(null, "fr")).toBe("-");
    expect(moisLisible(undefined, "fr")).toBe("-");
    expect(moisLisible("2026", "fr")).toBe("2026");
    expect(moisLisible("pas-un-mois", "fr")).toBe("pas-un-mois");
  });

  test("un mois HORS BORNES est rendu tel quel, pas reporté sur l'année", () => {
    /* `new Date(2026, 12, 1)` est janvier 2027 — JavaScript reporte
     * silencieusement. Sans la garde, « 2026-13 » s'afficherait
     * « janvier 2027 » avec aplomb. */
    expect(moisLisible("2026-13", "fr")).toBe("2026-13");
    expect(moisLisible("2026-00", "fr")).toBe("2026-00");
  });
});

describe("jourLisible et momentLisible", () => {
  test("une date ISO rend un jour", () => {
    expect(jourLisible("2026-10-06T16:00:00Z", "fr")).toContain("6");
  });

  test("momentLisible porte l'année, jourLisible non", () => {
    // La date d'un paiement se situe dans le temps long : l'année compte.
    expect(momentLisible("2026-10-06T16:00:00Z", "fr")).toContain("2026");
    expect(jourLisible("2026-10-06T16:00:00Z", "fr")).not.toContain("2026");
  });

  test("une date absente ou illisible rend un tiret", () => {
    for (const valeur of ["", null, undefined, "pas-une-date"]) {
      expect(jourLisible(valeur, "fr")).toBe("-");
      expect(momentLisible(valeur, "fr")).toBe("-");
    }
  });
});

describe("periodeLisible", () => {
  test("un seul mois ne se rend pas comme une plage", () => {
    const rendu = periodeLisible({ debut: "2026-09", fin: "2026-09" }, "fr");
    expect(rendu).toBe(moisLisible("2026-09", "fr"));
    expect(rendu).not.toContain(" à ");
  });

  test("LE CAS DE MIREILLE : une plage dans la même année ne répète pas l'année", () => {
    /* Un versement couvrant plusieurs mois n'est pas un cas tordu : le seuil
     * minimum reporte le solde, donc un affilié resté dessous en juillet et
     * août est payé en septembre pour les trois.
     *
     * « juillet à septembre 2026 » se lit ; « juillet 2026 à septembre 2026 »
     * se déchiffre. */
    const rendu = periodeLisible({ debut: "2026-07", fin: "2026-09", multi: true }, "fr");

    expect(rendu).toBe(`${nomDuMois("2026-07", "fr")} à ${nomDuMois("2026-09", "fr")} 2026`);
    // L'année apparaît UNE fois.
    expect(rendu.match(/2026/g)).toHaveLength(1);
  });

  test("en anglais la jointure est « to »", () => {
    const rendu = periodeLisible({ debut: "2026-07", fin: "2026-09", multi: true }, "en");
    expect(rendu).toBe(`${nomDuMois("2026-07", "en")} to ${nomDuMois("2026-09", "en")} 2026`);
  });

  test("à cheval sur deux années, les DEUX années sont portées", () => {
    // Sans cela, « décembre à janvier 2026 » laisserait croire que décembre
    // est aussi de 2026.
    const rendu = periodeLisible({ debut: "2025-12", fin: "2026-01", multi: true }, "fr");
    expect(rendu).toContain("2025");
    expect(rendu).toContain("2026");
    expect(rendu).toContain(" à ");
  });

  test("sans période, le repli est rendu — l'écran choisit quoi dire", () => {
    /* C'est ce qui permet de ne pas inventer un mois pour un versement
     * ancien sans commissions rattachées. */
    expect(periodeLisible(null, "fr")).toBe("-");
    expect(periodeLisible(undefined, "fr", "indisponible")).toBe("indisponible");
    expect(periodeLisible({}, "fr", "indisponible")).toBe("indisponible");
    expect(periodeLisible({ fin: "2026-09" }, "fr", "indisponible")).toBe("indisponible");
  });

  test("une période sans fin se rend comme un mois unique", () => {
    // Robustesse : `fin` absente ne doit pas produire « septembre 2026 à  ».
    expect(periodeLisible({ debut: "2026-09" }, "fr"))
      .toBe(moisLisible("2026-09", "fr"));
  });
});
