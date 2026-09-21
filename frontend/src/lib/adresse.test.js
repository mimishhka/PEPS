// L'adresse du checkout : ce qui se remplit tout seul, et ce qui se refuse.
//
// Le champ « province » etait libre. « Quebec », « Qc », « PQ » partaient tels
// quels : ni le serveur ni Postes Canada ne les corrigeaient, et l'etiquette
// etait refusee des jours plus tard, apres l'encaissement.
import {
  PROVINCES_CA, ETATS_US, regionsDuPays, provinceDepuisCodePostal,
  formaterCodePostal, codePostalComplet, provinceCoherente,
} from "./adresse";

describe("la province deduite du code postal", () => {
  it.each([
    ["H2X 1Y4", "QC"], ["G1R 2B5", "QC"], ["J4B 0A1", "QC"],
    ["M5V 3L9", "ON"], ["K1A 0B1", "ON"],
    ["V6B 1A1", "BC"], ["T2P 1J9", "AB"], ["R3C 0V8", "MB"],
    ["A1C 5H5", "NL"], ["B3J 1P3", "NS"], ["C1A 1A1", "PE"], ["E1C 1A1", "NB"],
    ["S7K 1J5", "SK"], ["Y1A 1A1", "YT"],
  ])("%s est en %s", (cp, province) => {
    expect(provinceDepuisCodePostal(cp)).toBe(province);
  });

  it("ne devine pas pour X, partage entre NT et NU", () => {
    // Remplir un champ avec une valeur fausse est pire que le laisser vide :
    // personne ne relit ce qui est deja rempli.
    expect(provinceDepuisCodePostal("X0A 1H0")).toBeNull();
  });

  it("ne devine rien d une lettre inexistante", () => {
    // D, F, I, O, Q, U, W, Z ne commencent aucun code postal canadien.
    for (const lettre of ["D", "F", "I", "O", "Q", "U", "W", "Z"]) {
      expect(provinceDepuisCodePostal(`${lettre}1A 1A1`)).toBeNull();
    }
    expect(provinceDepuisCodePostal("")).toBeNull();
    expect(provinceDepuisCodePostal(null)).toBeNull();
  });
});

describe("le formatage du code postal", () => {
  it("met la majuscule et l espace du milieu", () => {
    expect(formaterCodePostal("CA", "h2x1y4")).toBe("H2X 1Y4");
    expect(formaterCodePostal("CA", "H2X  1Y4")).toBe("H2X 1Y4");
    expect(formaterCodePostal("CA", "h2x-1y4")).toBe("H2X 1Y4");
  });

  it("ne coupe pas la saisie en cours", () => {
    // Formater a la frappe ne doit pas empecher de taper.
    expect(formaterCodePostal("CA", "h")).toBe("H");
    expect(formaterCodePostal("CA", "h2x")).toBe("H2X");
    expect(formaterCodePostal("CA", "h2x1")).toBe("H2X 1");
  });

  it("refuse le septieme caractere", () => {
    expect(formaterCodePostal("CA", "H2X1Y4Z")).toBe("H2X 1Y4");
  });

  it("garde le format americain a cinq ou neuf chiffres", () => {
    expect(formaterCodePostal("US", "12345")).toBe("12345");
    expect(formaterCodePostal("US", "123456789")).toBe("12345-6789");
    expect(formaterCodePostal("US", "abc12345")).toBe("12345");
  });
});

describe("la coherence entre code postal et province", () => {
  it("accepte un accord", () => {
    expect(provinceCoherente("CA", "H2X 1Y4", "QC")).toBe(true);
  });

  it("refuse un code de Montreal annonce en Ontario", () => {
    // Postes Canada refusera l etiquette, mais seulement au moment de
    // l imprimer, c est-a-dire apres l encaissement.
    expect(provinceCoherente("CA", "H2X 1Y4", "ON")).toBe(false);
  });

  it("ne juge pas un code postal incomplet", () => {
    // Pendant la frappe, tout est incoherent : signaler a chaque caractere
    // ferait clignoter une erreur qu on apprend a ignorer.
    expect(provinceCoherente("CA", "H2X", "ON")).toBe(true);
    expect(provinceCoherente("CA", "", "ON")).toBe(true);
  });

  it("ne juge pas ce qu il ne sait pas", () => {
    expect(provinceCoherente("CA", "X0A 1H0", "NT")).toBe(true);
    expect(provinceCoherente("CA", "X0A 1H0", "NU")).toBe(true);
    expect(provinceCoherente("US", "12345", "QC")).toBe(true);
  });
});

describe("les listes de regions", () => {
  it("donne les treize provinces et territoires canadiens", () => {
    expect(PROVINCES_CA).toHaveLength(13);
    expect(PROVINCES_CA.map((p) => p.code)).toContain("NU");
  });

  it("donne les cinquante et un etats, District de Columbia compris", () => {
    expect(ETATS_US).toHaveLength(51);
    expect(ETATS_US.map((e) => e.code)).toContain("DC");
  });

  it("choisit la liste selon le pays", () => {
    expect(regionsDuPays("US")).toBe(ETATS_US);
    expect(regionsDuPays("CA")).toBe(PROVINCES_CA);
    expect(regionsDuPays(undefined)).toBe(PROVINCES_CA);
  });

  it("n a aucun code en double", () => {
    for (const liste of [PROVINCES_CA, ETATS_US]) {
      const codes = liste.map((r) => r.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});

describe("la completude du code postal", () => {
  it("reconnait un code canadien complet, avec ou sans espace", () => {
    expect(codePostalComplet("CA", "H2X 1Y4")).toBe(true);
    expect(codePostalComplet("CA", "H2X1Y4")).toBe(true);
  });

  it("refuse un code tronque ou mal forme", () => {
    expect(codePostalComplet("CA", "H2X 1Y")).toBe(false);
    expect(codePostalComplet("CA", "12345")).toBe(false);
    expect(codePostalComplet("US", "1234")).toBe(false);
  });
});
