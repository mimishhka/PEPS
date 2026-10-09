// ProductImage : ce qu'il demande au réseau.
//
// Audit du 06/10/2026, point 1. `lib/derivees` a ses propres tests ; celui-ci
// verrouille le CÂBLAGE, et surtout la paire `srcset` + `sizes`.
//
// POURQUOI `sizes` EST AUSSI IMPORTANT QUE `srcset` : sans lui, le navigateur
// suppose que l'image occupe toute la largeur de l'écran et prend
// systématiquement le plus grand candidat. Un `srcset` sans `sizes` ne fait
// donc rien gagner du tout — c'est une correction qui a l'air faite et qui ne
// l'est pas, exactement le motif « champ écrit, jamais relu ».

import { render, screen } from "@testing-library/react";

import ProductImage from "./ProductImage";
import { TAILLES } from "../lib/derivees";

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  resolveAssetUrl: (u) => u,
}));
jest.mock("./brand", () => ({
  VialArt: () => <svg data-testid="vial-art" />,
}));

/* Et non `getByRole("img")` : une image dont l'`alt` est vide est
 * DÉCORATIVE au sens ARIA — elle n'a pas de rôle, et la requête par rôle ne
 * la trouve pas. Or la moitié des appels du site passent `alt=""` à dessein
 * (vignettes du panier, produits liés), et ce sont justement eux qu'on veut
 * couvrir. On interroge donc la balise. */
let scene;
const image = () => scene.container.querySelector("img");

describe("une image téléversée", () => {
  test("elle demande les trois dérivées", () => {
    scene = render(<ProductImage src="/api/uploads/images/a1b2c3.png" alt="flacon" />);
    const srcset = image().getAttribute("srcset");
    expect(srcset).toContain("a1b2c3_400.webp 400w");
    expect(srcset).toContain("a1b2c3_800.webp 800w");
    expect(srcset).toContain("a1b2c3_1400.webp 1400w");
  });

  test("ELLE ANNONCE SA TAILLE D'AFFICHAGE", () => {
    scene = render(<ProductImage src="/api/uploads/images/a1b2c3.png" alt="flacon" />);
    expect(image()).toHaveAttribute("sizes", TAILLES.carte);
  });

  test("et l'appelant peut la corriger pour sa grille", () => {
    scene = render(<ProductImage src="/api/uploads/images/a1b2c3.png" alt="" sizes={TAILLES.hero} />);
    expect(image()).toHaveAttribute("sizes", "100vw");
  });

  test("l'original reste le `src`, pour qui ne sait pas lire un srcset", () => {
    scene = render(<ProductImage src="/api/uploads/images/a1b2c3.png" alt="" />);
    expect(image()).toHaveAttribute("src", "/api/uploads/images/a1b2c3.png");
  });
});

describe("une image sans dérivées", () => {
  test("UN GIF N'EN DEMANDE PAS", () => {
    // Le serveur refuse de convertir un GIF pour garder l'animation :
    // demander une dérivée rendrait 404, et un candidat en 404 fait
    // disparaître l'image entière.
    scene = render(<ProductImage src="/api/uploads/images/anime.gif" alt="" />);
    expect(image()).not.toHaveAttribute("srcset");
  });

  test("et elle n'annonce pas de taille non plus", () => {
    // `sizes` sans `srcset` n'a aucun sens et trompe la lecture.
    scene = render(<ProductImage src="/api/uploads/images/anime.gif" alt="" />);
    expect(image()).not.toHaveAttribute("sizes");
  });

  test("une image de marque, hors téléversement, est laissée telle quelle", () => {
    scene = render(<ProductImage src="/brand/og-image.png" alt="" />);
    expect(image()).not.toHaveAttribute("srcset");
    expect(image()).toHaveAttribute("src", "/brand/og-image.png");
  });
});

describe("le repli existant n'a pas bougé", () => {
  test("sans source, le dessin de flacon prend la place", () => {
    scene = render(<ProductImage src="" slug="bpc-157" alt="" />);
    expect(screen.getByTestId("vial-art")).toBeInTheDocument();
  });

  test("les attributs de chargement passent toujours", () => {
    scene = render(
      <ProductImage
        src="/api/uploads/images/a1b2c3.png"
        alt="flacon"
        loading="eager"
        fetchPriority="high"
        width={1000}
        height={750}
      />,
    );
    const img = image();
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("width", "1000");
    expect(img).toHaveAttribute("height", "750");
    expect(img).toHaveAttribute("decoding", "async");
  });
});
