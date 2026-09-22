// Les durees, dites comme on les dit.
//
// Le delai de paiement etait ecrit EN DUR dans la page de commande —
// « 12 heures » — alors que la regle publiee aux clients (Conformite, FAQ)
// dit trente minutes, que le defaut du serveur vaut 0.5 h, et que le compte
// a rebours affichait 1 h 59 parce que le .env du serveur portait 2 h.
//
// Quatre chiffres sur un meme ecran, dont trois faux.
import { delaiLisible, resteLisible } from "./delais";

describe("delaiLisible", () => {
  it("dit une demi-heure en minutes", () => {
    // « 0,5 heure » ne se dit pas. C'est le cas par defaut du programme.
    expect(delaiLisible(0.5, "fr")).toBe("30 minutes");
    expect(delaiLisible(0.5, "en")).toBe("30 minutes");
  });

  it("dit les heures entieres au singulier et au pluriel", () => {
    expect(delaiLisible(1, "fr")).toBe("1 heure");
    expect(delaiLisible(2, "fr")).toBe("2 heures");
    expect(delaiLisible(1, "en")).toBe("1 hour");
    expect(delaiLisible(12, "en")).toBe("12 hours");
  });

  it("dit les durees mixtes", () => {
    expect(delaiLisible(1.5, "fr")).toBe("1 h 30");
    expect(delaiLisible(1.5, "en")).toBe("1h 30min");
  });

  it("ne fabrique aucune duree a partir de rien", () => {
    // Mieux vaut une phrase sans duree qu'une duree inventee : c'est
    // exactement ce qui a produit le « 12 heures ».
    for (const valeur of [undefined, null, 0, -1, "abc", NaN]) {
      expect(delaiLisible(valeur, "fr")).toBeNull();
    }
  });
});

describe("resteLisible", () => {
  it("arrondit vers le BAS", () => {
    // « Il vous reste 1 minute » quand il en reste quarante secondes, c'est
    // deja trop tard pour lancer un virement.
    // 119 s = 1,98 min : arrondi vers le bas, il reste UNE minute, et une
    // minute ne suffit pas a lancer un virement.
    expect(resteLisible(119000, "fr")).toBe("moins d'une minute");
    expect(resteLisible(40000, "fr")).toBe("moins d'une minute");
    expect(resteLisible(40000, "en")).toBe("less than a minute");
  });

  it("compte en minutes sous l heure", () => {
    expect(resteLisible(28 * 60000, "fr")).toBe("28 min");
    expect(resteLisible(28 * 60000, "en")).toBe("28 min");
  });

  it("compte en heures et minutes au-dela", () => {
    expect(resteLisible((1 * 60 + 59) * 60000, "fr")).toBe("1 h 59 min");
    expect(resteLisible((1 * 60 + 59) * 60000, "en")).toBe("1h 59min");
  });

  it("ne descend jamais sous zero", () => {
    expect(resteLisible(-5000, "fr")).toBe("moins d'une minute");
    expect(resteLisible(null, "fr")).toBe("moins d'une minute");
  });
});
