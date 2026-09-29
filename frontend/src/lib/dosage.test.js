// Le dosage s'ecrit comme on le lit a voix haute (rapport E2E #20).
//
// La vitrine affichait « 5.0mg ». Le « .0 » est un artefact de saisie, et
// l'unite collee au chiffre se lit mal. Le defaut vit dans les DONNEES : on
// normalise a l'affichage pour reparer l'existant sans migration.
import { dosage } from "./dosage";

describe("dosage — le cas du rapport", () => {
  test("« 5.0mg » devient « 5 mg »", () => {
    expect(dosage("5.0mg")).toBe("5 mg");
  });

  test("« 10.0mg » devient « 10 mg »", () => {
    expect(dosage("10.0mg")).toBe("10 mg");
  });
});

describe("dosage — les vraies decimales survivent", () => {
  test("2.5 mg reste 2.5 en anglais", () => {
    expect(dosage("2.5mg", "en")).toBe("2.5 mg");
  });

  test("2.5 mg devient 2,5 en francais", () => {
    expect(dosage("2.5mg", "fr")).toBe("2,5 mg");
  });

  test("une virgule en entree est comprise", () => {
    expect(dosage("2,5mg", "en")).toBe("2.5 mg");
  });
});

describe("dosage — les unites reconnues", () => {
  test.each([
    ["5.0mg", "5 mg"],
    ["1.0g", "1 g"],
    ["250.0mcg", "250 mcg"],
    ["10.0ml", "10 ml"],
    ["100.0UI", "100 UI"],
  ])("« %s » devient « %s »", (entree, attendu) => {
    expect(dosage(entree)).toBe(attendu);
  });

  test("une espace deja presente ne double pas", () => {
    expect(dosage("5 mg")).toBe("5 mg");
  });
});

describe("dosage — ce qu'il ne doit PAS toucher", () => {
  test("un nom libre traverse intact", () => {
    // Sans cette prudence, un nom de variante descriptif serait mutile.
    expect(dosage("Kit complet")).toBe("Kit complet");
    expect(dosage("Lot d'essai")).toBe("Lot d'essai");
  });

  test("une unite inconnue laisse le libelle tel quel", () => {
    // « 5.0 flacons » deviendrait « 5 flacons » par hasard ; on refuse de
    // deviner sur une unite qu'on n'a pas listee.
    expect(dosage("5.0 flacons")).toBe("5.0 flacons");
  });

  test("un libelle vide ou absent ne casse rien", () => {
    expect(dosage("")).toBe("");
    expect(dosage(null)).toBe("");
    expect(dosage(undefined)).toBe("");
  });

  test("les espaces en trop disparaissent", () => {
    expect(dosage("  5.0mg  ")).toBe("5 mg");
  });
});
