// Le `srcset` des dérivées : à qui on en demande, et à qui on n'en demande pas.
//
// Audit du 06/10/2026, point 1. Le serveur fabrique la dérivée à la demande,
// donc toute image dont l'original existe a ses trois tailles. Mais il ne
// fabrique rien pour un GIF, et il ne connaît rien hors de `/uploads/images`.
//
// CE QUE CES TESTS PROTÈGENT : un candidat `srcset` en 404 ne dégrade pas
// l'image, il la casse ENTIÈREMENT — le navigateur n'affiche rien, pas même
// le `src` de repli. Émettre un `srcset` pour une URL que le serveur ne sait
// pas servir fait donc disparaître l'image. Chaque refus ci-dessous est une
// image qui resterait visible.

import { srcsetDerivees, LARGEURS, TAILLES } from "./derivees";

describe("les URL qui reçoivent un srcset", () => {
  test("une image téléversée, servie par le proxy /api", () => {
    expect(srcsetDerivees("/api/uploads/images/a1b2c3.png")).toBe(
      "/api/uploads/images/a1b2c3_400.webp 400w, " +
      "/api/uploads/images/a1b2c3_800.webp 800w, " +
      "/api/uploads/images/a1b2c3_1400.webp 1400w",
    );
  });

  test("et l'ancien chemin sans /api, encore en base", () => {
    expect(srcsetDerivees("/uploads/images/a1b2c3.jpg")).toContain(
      "/uploads/images/a1b2c3_400.webp 400w",
    );
  });

  test("une URL absolue vers le proxy", () => {
    expect(srcsetDerivees("https://fironova.ca/api/uploads/images/x.jpeg"))
      .toContain("https://fironova.ca/api/uploads/images/x_800.webp 800w");
  });

  test("un .webp reçoit quand même ses tailles réduites", () => {
    // Le format est déjà bon ; c'est le POIDS qui ne l'est pas. Un WebP de
    // 1400 px servi dans une carte de 154 px reste du gras.
    expect(srcsetDerivees("/api/uploads/images/x.webp")).toContain("x_400.webp 400w");
  });

  test("les trois largeurs, et seulement elles", () => {
    const srcset = srcsetDerivees("/api/uploads/images/x.png");
    const largeurs = srcset.match(/(\d+)w/g).map((w) => Number(w.slice(0, -1)));
    expect(largeurs).toEqual(LARGEURS);
  });
});

describe("les URL qui n'en reçoivent pas", () => {
  test("UN GIF — le serveur refuse de le convertir pour garder l'animation", () => {
    // Lui demander une dérivée rendrait 404, donc une image invisible.
    expect(srcsetDerivees("/api/uploads/images/anime.gif")).toBe("");
  });

  test("un SVG", () => {
    expect(srcsetDerivees("/api/uploads/images/dessin.svg")).toBe("");
  });

  test("une image hors du proxy de téléversement", () => {
    expect(srcsetDerivees("/brand/og-image.png")).toBe("");
    expect(srcsetDerivees("https://exemple.com/photo.jpg")).toBe("");
  });

  test("un certificat d'analyse, qui n'est pas une image", () => {
    expect(srcsetDerivees("/api/uploads/coa/rapport.pdf")).toBe("");
  });

  test("rien du tout", () => {
    for (const vide of ["", null, undefined, 0, {}, []]) {
      expect(srcsetDerivees(vide)).toBe("");
    }
  });
});

describe("les paramètres d'URL ne font pas rater la reconnaissance", () => {
  test("une chaîne de requête est ignorée pour le test, pas recopiée", () => {
    const srcset = srcsetDerivees("/api/uploads/images/x.png?v=2");
    expect(srcset).toContain("/api/uploads/images/x_400.webp 400w");
    expect(srcset).not.toContain("?v=2");
  });
});

describe("les tailles d'affichage", () => {
  test("chaque grille du site a la sienne", () => {
    for (const cle of ["carte", "fiche", "hero", "vignette"]) {
      expect(typeof TAILLES[cle]).toBe("string");
      expect(TAILLES[cle].length).toBeGreaterThan(0);
    }
  });

  test("LE HERO NE DOIT PAS PRENDRE LA TAILLE DES CARTES", () => {
    // Un `sizes` trop petit sur le hero ferait choisir une dérivée de 400 px
    // étalée sur tout l'écran : floue. C'est le défaut symétrique de celui
    // qu'on corrige, et il serait bien plus visible.
    expect(TAILLES.hero).toBe("100vw");
    expect(TAILLES.hero).not.toBe(TAILLES.carte);
  });
});
