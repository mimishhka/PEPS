// Le prix s'ecrit dans la langue de qui le lit (rapport E2E #20).
//
// La vitrine affichait « $69.99 » meme en francais. Au Quebec le symbole SUIT
// le nombre, apres une espace insecable, et la decimale est une virgule.
import { prix, prixAvecDevise } from "./prix";

const INSECABLE = " ";

describe("prix — francais", () => {
  test("le symbole suit le nombre, apres une espace insecable", () => {
    expect(prix(69.99, "fr")).toBe(`69,99${INSECABLE}$`);
  });

  test("la decimale est une virgule", () => {
    expect(prix(5.5, "fr")).toContain("5,50");
    expect(prix(5.5, "fr")).not.toContain("5.50");
  });

  test("les milliers se separent, et jamais par une virgule", () => {
    // fr-CA emploie l'espace, pas la virgule : « 1 234,00 $ ». Une virgule
    // de milliers se lirait comme une decimale.
    const sortie = prix(1234, "fr");
    expect(sortie).toContain("234,00");
    expect(sortie.indexOf(",")).toBe(sortie.lastIndexOf(","));
  });

  test("toute langue commencant par « fr » est du francais", () => {
    expect(prix(10, "fr-CA")).toBe(`10,00${INSECABLE}$`);
  });
});

describe("prix — anglais", () => {
  test("le symbole precede le nombre, sans espace", () => {
    expect(prix(69.99, "en")).toBe("$69.99");
  });

  test("la decimale est un point", () => {
    expect(prix(5.5, "en")).toBe("$5.50");
  });
});

describe("prix — valeurs limites", () => {
  test("toujours deux decimales, meme sur un entier", () => {
    expect(prix(7, "en")).toBe("$7.00");
    expect(prix(7, "fr")).toBe(`7,00${INSECABLE}$`);
  });

  test("zero s'ecrit, il ne disparait pas", () => {
    expect(prix(0, "en")).toBe("$0.00");
    expect(prix(0, "fr")).toBe(`0,00${INSECABLE}$`);
  });

  test("une valeur absente vaut zero plutot que « $NaN »", () => {
    // Un prix manquant arrivait a l'ecran en « $NaN » : le client lisait une
    // erreur la ou il attendait un montant.
    expect(prix(null, "en")).toBe("$0.00");
    expect(prix(undefined, "fr")).toBe(`0,00${INSECABLE}$`);
    expect(prix("abc", "en")).toBe("$0.00");
  });

  test("une chaine numerique se formate quand meme", () => {
    expect(prix("12.5", "en")).toBe("$12.50");
  });
});

describe("prixAvecDevise", () => {
  test("nomme la devise quand deux monnaies coexistent", () => {
    expect(prixAvecDevise(69.99, "fr")).toBe(`69,99${INSECABLE}$ CAD`);
    expect(prixAvecDevise(69.99, "en")).toBe("$69.99 CAD");
  });

  test("la devise se choisit", () => {
    expect(prixAvecDevise(10, "en", "USD")).toBe("$10.00 USD");
  });
});
