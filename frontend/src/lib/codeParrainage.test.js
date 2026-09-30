// Le code d'affiliation porté par un lien : rangé, relu, oublié.
//
// MIREILLE, 29/09/2026 : « le coupon doit être appliqué, mais une fois
// déconnecté il ne tient plus — ce qui est tout à fait normal ».
//
// Ce n'était pas le cas : la déconnexion effaçait le brouillon de caisse,
// donc le coupon appliqué, mais cette copie du code survivait dans l'onglet
// et l'effet de préremplissage le remettait dès le retour à la caisse.

import {
  codeAffiliePourPaiement,
  memoriserCode,
  oublierCodeAffilie,
} from "./codeParrainage";

const CLE = "fn_ref_code";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("mémoriser et relire", () => {
  test("le code est rangé en majuscules", () => {
    // Le backend stocke les codes en majuscules ; relire « lola10 » tel quel
    // ferait échouer la comparaison du garde-fou de la caisse.
    memoriserCode("lola10");
    expect(codeAffiliePourPaiement()).toBe("LOLA10");
  });

  test("sans rien de rangé, on lit une chaîne vide", () => {
    // Et non `null` : la caisse teste la valeur telle quelle.
    expect(codeAffiliePourPaiement()).toBe("");
  });

  test("le code vit dans le stockage de SESSION, pas au-delà", () => {
    // sessionStorage disparaît avec l'onglet. Une première version gardait le
    // code 365 jours dans localStorage : un client venu une fois par un lien
    // obtenait le rabais à chaque commande de l'année suivante, sans jamais
    // recliquer.
    memoriserCode("LOLA10");
    expect(window.sessionStorage.getItem(CLE)).toBe("LOLA10");
    expect(window.localStorage.getItem(CLE)).toBeNull();
  });
});

describe("oublier", () => {
  test("LE CAS DE MIREILLE : après l'oubli, plus rien à repréremplir", () => {
    memoriserCode("LOLA10");
    oublierCodeAffilie();
    expect(codeAffiliePourPaiement()).toBe("");
    expect(window.sessionStorage.getItem(CLE)).toBeNull();
  });

  test("oublier deux fois ne lève pas", () => {
    // purgeClientSession est appelée à chaque déconnexion, y compris quand
    // aucun lien n'a jamais été cliqué.
    oublierCodeAffilie();
    expect(() => oublierCodeAffilie()).not.toThrow();
  });

  test("l'oubli ne touche que cette clé", () => {
    // La porte d'âge et le panier vivent aussi dans le navigateur : les
    // emporter ferait redemander l'attestation à chaque déconnexion.
    memoriserCode("LOLA10");
    window.sessionStorage.setItem("fironova_age_session", "1");
    window.sessionStorage.setItem("fn_ref_captured", "LOLA10");
    oublierCodeAffilie();
    expect(window.sessionStorage.getItem("fironova_age_session")).toBe("1");
    expect(window.sessionStorage.getItem("fn_ref_captured")).toBe("LOLA10");
  });
});

describe("stockage indisponible", () => {
  // Navigation privée stricte, quota atteint, réglages d'entreprise : l'accès
  // au stockage peut lever. Aucun de ces cas ne doit empêcher une connexion,
  // une déconnexion ou un passage en caisse.
  const vrai = window.sessionStorage;

  afterEach(() => {
    Object.defineProperty(window, "sessionStorage", { value: vrai, configurable: true });
  });

  const casser = () => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: () => { throw new Error("refusé"); },
        setItem: () => { throw new Error("refusé"); },
        removeItem: () => { throw new Error("refusé"); },
      },
    });
  };

  test("relire renvoie une chaîne vide au lieu de lever", () => {
    casser();
    expect(codeAffiliePourPaiement()).toBe("");
  });

  test("mémoriser et oublier restent silencieux", () => {
    casser();
    expect(() => memoriserCode("LOLA10")).not.toThrow();
    expect(() => oublierCodeAffilie()).not.toThrow();
  });
});
