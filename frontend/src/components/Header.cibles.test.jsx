// Les cibles tactiles de l'en-tête, et la langue qui se choisit.
//
// Audit UI/UX du 06/10/2026, section 1, point 4 du plan d'action :
//
//   « Icône Panier : 18 × 18 px. Icône Menu : 20 × 20 px → Zones 2 à 2,5 fois
//     trop petites. Le client rate son tap ou ouvre le mauvais élément,
//     surtout d'une main. »
//   « Sélecteur FR · EN : 29 px → Pour FR/EN, deux boutons séparés de
//     44 × 44 px au lieu d'un seul bloc. »
//
// Deux choses se vérifient ici, et la seconde est la seule qui soit du
// COMPORTEMENT :
//
//  1. les classes qui portent le plancher sont présentes. C'est une
//     vérification pauvre — jsdom ne calcule aucune mise en page, donc
//     personne ne peut mesurer 48 px dans un test. Elle attrape quand même
//     ce qui arrive vraiment : quelqu'un reformate la ligne et la perd.
//  2. FR et EN sont deux boutons qui POSENT la langue, chacun la sienne.
//     L'ancien bloc basculait : le toucher en français donnait l'anglais, et
//     le toucher en anglais redonnait le français. Un client qui arrive dans
//     la mauvaise langue et touche deux fois — parce qu'il a raté la première
//     fois, ce qui est précisément le défaut qu'on corrige — revenait d'où il
//     partait. Deux boutons n'ont pas ce piège : EN donne l'anglais, qu'on y
//     soit déjà ou non.

import { render, screen, fireEvent } from "@testing-library/react";

import Header from "./Header";
import api from "../lib/api";

let mockLangue = "fr";
const mockSetLang = jest.fn();
const mockToggle = jest.fn();

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
  resolveAssetUrl: (u) => u,
}));

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  NavLink: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: "/", search: "", hash: "" }),
}));

jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, logout: jest.fn() }),
}));
jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({
    lang: mockLangue,
    setLang: mockSetLang,
    toggle: mockToggle,
    t: (k) => k,
  }),
}));
jest.mock("../contexts/CartContext", () => ({
  useCart: () => ({ count: 0, setOpen: jest.fn() }),
}));
jest.mock("../contexts/SiteConfigContext", () => ({
  useSiteConfig: () => ({ coaPageEnabled: false }),
}));
jest.mock("./brand", () => ({
  FnMark: () => null,
  Wordmark: () => <span>FIRONOVA</span>,
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

/* Le plancher s'écrit `min-w-[48px]` ou `min-h-[48px]` en Tailwind. On lit la
 * valeur plutôt que la chaîne exacte, pour qu'un passage à `min-h-12` (la
 * même chose dans l'échelle de Tailwind) ne fasse pas échouer un test qui
 * porte sur des pixels, pas sur une orthographe. */
const pixelsMinimum = (element, axe) => {
  const classes = element.getAttribute("class") || "";
  const arbitraire = classes.match(new RegExp(`min-${axe}-\\[(\\d+)px\\]`));
  if (arbitraire) return Number(arbitraire[1]);
  const echelle = classes.match(new RegExp(`min-${axe}-(\\d+)(?:\\s|$)`));
  if (echelle) return Number(echelle[1]) * 4;
  return 0;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLangue = "fr";
  api.get.mockResolvedValue({ data: [] });
});

describe("les cibles tactiles de l'en-tête", () => {
  test("le panier tient 48 px dans les deux sens", () => {
    render(<Header />);
    const panier = screen.getByTestId("cart-button");
    expect(pixelsMinimum(panier, "w")).toBeGreaterThanOrEqual(48);
    expect(pixelsMinimum(panier, "h")).toBeGreaterThanOrEqual(48);
  });

  test("le menu tient 48 px dans les deux sens", () => {
    render(<Header />);
    const menu = screen.getByTestId("mobile-menu-toggle");
    expect(pixelsMinimum(menu, "w")).toBeGreaterThanOrEqual(48);
    expect(pixelsMinimum(menu, "h")).toBeGreaterThanOrEqual(48);
  });

  test("chaque bouton de langue tient 44 px dans les deux sens", () => {
    render(<Header />);
    for (const code of ["fr", "en"]) {
      const bouton = screen.getByTestId(`lang-${code}`);
      expect(pixelsMinimum(bouton, "w")).toBeGreaterThanOrEqual(44);
      expect(pixelsMinimum(bouton, "h")).toBeGreaterThanOrEqual(44);
    }
  });

  test("le menu annonce ce qu'il ouvre et son état", () => {
    render(<Header />);
    const menu = screen.getByTestId("mobile-menu-toggle");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("aria-controls", "menu-mobile");

    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    // L'identifiant doit désigner quelque chose, sinon l'annonce est creuse.
    expect(screen.getByTestId("mobile-menu")).toHaveAttribute("id", "menu-mobile");
  });

  test("les rangées du menu ouvert ne sont plus hautes de 35 px", () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId("mobile-menu-toggle"));
    const menu = screen.getByTestId("mobile-menu");
    const rangees = menu.querySelectorAll("a, button");
    expect(rangees.length).toBeGreaterThan(0);
    for (const rangee of rangees) {
      // py-3.5 = 14 px de marge haut et bas, sur 19,2 px de texte : 47,2 px.
      expect(rangee.getAttribute("class") || "").toMatch(/py-(3\.5|4|5)\b/);
    }
  });
});

describe("le mot de la marque cède la place aux cibles, pas l'inverse", () => {
  test("il est masqué sous 430 px et revient au-delà", () => {
    render(<Header />);
    // Mesuré le 09/10/2026 : le mot fait 109,5 px, et le budget d'un
    // téléphone de 360 px n'en a pas 23 à donner une fois les cibles
    // portées à leur minimum.
    const classes = screen.getByTestId("header-wordmark").getAttribute("class") || "";
    expect(classes).toMatch(/\bhidden\b/);
    expect(classes).toMatch(/min-\[(4[0-9][0-9])px\]:inline/);
  });
});

describe("la langue se choisit, elle ne bascule plus", () => {
  test("FR pose le français, EN pose l'anglais", () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId("lang-en"));
    expect(mockSetLang).toHaveBeenCalledWith("en");

    mockSetLang.mockClear();
    fireEvent.click(screen.getByTestId("lang-fr"));
    expect(mockSetLang).toHaveBeenCalledWith("fr");
  });

  test("LE PIÈGE DE L'ANCIEN BLOC : deux fois EN donne toujours l'anglais", () => {
    // C'est le cas qui rendait la bascule dangereuse pour qui vise mal : le
    // deuxième tap annulait le premier.
    mockLangue = "en";
    render(<Header />);
    fireEvent.click(screen.getByTestId("lang-en"));
    fireEvent.click(screen.getByTestId("lang-en"));
    expect(mockSetLang).toHaveBeenCalledTimes(2);
    for (const appel of mockSetLang.mock.calls) expect(appel).toEqual(["en"]);
    // Et surtout : jamais par l'ancienne porte.
    expect(mockToggle).not.toHaveBeenCalled();
  });

  test("la langue courante se voit sur son bouton", () => {
    mockLangue = "fr";
    render(<Header />);
    expect(screen.getByTestId("lang-fr")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("lang-en")).toHaveAttribute("aria-pressed", "false");
  });

  test("chaque bouton se nomme, parce qu'il ne porte que deux lettres", () => {
    render(<Header />);
    expect(screen.getByTestId("lang-fr")).toHaveAttribute("aria-label", "Français");
    expect(screen.getByTestId("lang-en")).toHaveAttribute("aria-label", "English");
  });
});
