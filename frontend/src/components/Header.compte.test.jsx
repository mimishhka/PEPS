// L'icône de compte doit mener quelque part.
//
// MIREILLE, 29/09/2026 : « quand je me déconnecte d'OPS et que je clique sur
// l'icône du compte client, il ne se passe rien ».
//
// L'icône portait « /login?next=<page courante> ». Sortir d'OPS laisse sur la
// page de connexion — la route admin est protégée, elle s'évacue d'elle-même
// dès que la session tombe. Le lien pointait donc vers la page où l'on se
// trouvait DÉJÀ : React Router ne changeait qu'une chaîne de requête, rien ne
// bougeait à l'écran, et aucune erreur ne venait l'expliquer.
//
// hrefConnexion a ses propres tests unitaires. Ceux-ci vérifient le CÂBLAGE :
// que le Header appelle bien la règle, et avec le chemin d'OPS. C'est ce
// branchement qui manquait, pas la règle.

import { render, screen } from "@testing-library/react";

import Header from "./Header";
import api from "../lib/api";

/* Le chemin courant, réécrit par chaque cas avant le rendu.
 *
 * Le préfixe « mock » n'est pas décoratif : Jest hisse les jest.mock() avant
 * les déclarations du fichier et refuse qu'une fabrique lise une variable
 * hors de sa portée — sauf si son nom commence par « mock ». Sans cela,
 * « Invalid variable access » et la suite ne se charge pas du tout. */
let mockChemin = { pathname: "/", search: "", hash: "" };

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
  useLocation: () => mockChemin,
}));

// Personne n'est connecté : c'est la situation après une déconnexion d'OPS.
jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, logout: jest.fn() }),
}));
jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr", toggle: jest.fn(), t: (k) => k }),
}));
jest.mock("../contexts/CartContext", () => ({
  useCart: () => ({ count: 0, setOpen: jest.fn() }),
}));
jest.mock("../contexts/SiteConfigContext", () => ({
  useSiteConfig: () => ({ coaPageEnabled: false }),
}));
jest.mock("./brand", () => ({
  FnMark: () => null,
  Wordmark: () => null,
}));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

// Doit rester aligné sur ADMIN_PATH, dans Header.jsx comme dans App.js.
const ADMIN = "/ops-portal-fn7k2q";

const hrefDeLIcone = () =>
  screen.getByTestId("nav-login").getAttribute("href");

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  mockChemin = { pathname: "/", search: "", hash: "" };
});

describe("l'icône de compte, personne connecté", () => {
  test("LE CAS DE MIREILLE : depuis OPS, elle ne renvoie pas sur OPS", () => {
    mockChemin = { pathname: `${ADMIN}/orders`, search: "", hash: "" };
    render(<Header />);
    // Le compte CLIENT, jamais l'administration — même à qui vient d'en sortir.
    expect(hrefDeLIcone()).toBe("/login?next=%2Faccount");
  });

  test("depuis la page de connexion, elle ne pointe pas sur elle-même", () => {
    // C'est littéralement le « il ne se passe rien » : la route admin évacue
    // vers /login, et l'icône y renvoyait.
    mockChemin = {
      pathname: "/login",
      search: `?next=${encodeURIComponent(ADMIN)}`,
      hash: "",
    };
    render(<Header />);
    expect(hrefDeLIcone()).toBe("/login?next=%2Faccount");
  });

  test("depuis l'accueil, elle annonce le compte", () => {
    render(<Header />);
    expect(hrefDeLIcone()).toBe("/login?next=%2Faccount");
  });

  test("depuis une page ordinaire, on y revient après connexion", () => {
    // La mémorisation garde son intérêt : se connecter depuis une fiche
    // produit ne doit pas faire perdre la fiche produit.
    mockChemin = { pathname: "/product/bpc-157", search: "", hash: "" };
    render(<Header />);
    expect(hrefDeLIcone()).toBe("/login?next=%2Fproduct%2Fbpc-157");
  });

  test("l'icône mène TOUJOURS quelque part", () => {
    // Le filet qui aurait attrapé le défaut : quelle que soit la page, le lien
    // doit exister et ne jamais désigner la page courante.
    for (const pathname of ["/", "/login", "/register", ADMIN, `${ADMIN}/produits`,
                            "/catalog", "/checkout", "/order/abc"]) {
      mockChemin = { pathname, search: "", hash: "" };
      const { unmount } = render(<Header />);
      const href = hrefDeLIcone();
      expect(href).toMatch(/^\/login\?next=%2F/);
      expect(href).not.toBe(`${pathname}`);
      unmount();
    }
  });
});
