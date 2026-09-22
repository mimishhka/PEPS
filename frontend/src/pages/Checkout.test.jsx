// La vérification d'adresse pendant la saisie.
//
// L'endpoint /checkout/validate-address existait depuis le début, sa note
// disait « appelé par le frontend AVANT la soumission finale », et personne
// ne l'appelait. La vérification n'avait donc lieu qu'à l'envoi, en 422 :
// le client remplissait tout, attestait son âge, acceptait les conditions,
// choisissait son paiement, cliquait « Placer la commande », et découvrait
// alors que son adresse ne passait pas.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Checkout from "./Checkout";
import api from "../lib/api";

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
  resolveAssetUrl: (u) => u,
}));

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  useNavigate: () => jest.fn(),
}));

jest.mock("../contexts/CartContext", () => ({
  useCart: () => ({
    items: [{ product_id: "p-1", variant_id: "v-1", qty: 1, name_fr: "BPC-157",
              name_en: "BPC-157", price: 64.99, slug: "bpc-157-5mg" }],
    subtotal: 64.99, clear: jest.fn(),
  }),
}));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr", t: (k) => k }) }));
jest.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
jest.mock("../contexts/SiteConfigContext", () => ({ useSiteConfig: () => ({ config: {} }) }));
jest.mock("../hooks/useAffiliateRef", () => ({ codeAffiliePourPaiement: () => null }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const remplirAdresse = async () => {
  await userEvent.type(screen.getByTestId("shipping-line1"), "123 rue Saint-Denis");
  await userEvent.type(screen.getByTestId("shipping-city"), "Montreal");
  await userEvent.type(screen.getByTestId("shipping-postal"), "H2X1Y4");
};

// Minuteurs REELS. `userEvent` v14 se bloque avec les minuteurs simules de
// CRA : chaque frappe attend un avancement qui ne vient jamais, et le test
// expire a 5 s sans rien dire de plus. La pause avant verification est de
// 700 ms, donc les attentes portent un delai explicite.
const ATTENTE = { timeout: 4000 };

beforeEach(() => {
  jest.clearAllMocks();
  // Le checkout CONSERVE son brouillon pour qu'on puisse se connecter en
  // cours de route sans tout reperdre. En test, ce brouillon fuit d'un cas au
  // suivant : la province choisie ici revenait la, et les adresses tapees
  // s'empilaient dans le meme champ. C'est la fonctionnalite qui est bonne,
  // c'est le test qui doit repartir a zero.
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.get.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { valid: true, suggestions: [], provider: "google_maps" } });
});

jest.setTimeout(20000);

it("le code postal remplit la province tout seul", async () => {
  render(<Checkout />);
  await userEvent.type(screen.getByTestId("shipping-postal"), "H2X1Y4");

  // H, G, J : le Québec. La première lettre DÉSIGNE la province.
  expect(screen.getByTestId("shipping-province")).toHaveValue("QC");
  expect(screen.getByTestId("shipping-postal")).toHaveValue("H2X 1Y4");
});

it("n écrase pas une province déjà choisie", async () => {
  render(<Checkout />);
  await userEvent.selectOptions(screen.getByTestId("shipping-province"), "ON");
  await userEvent.type(screen.getByTestId("shipping-postal"), "H2X1Y4");

  // Écraser une saisie volontaire serait pire que de ne rien faire — mais le
  // désaccord, lui, se dit.
  expect(screen.getByTestId("shipping-province")).toHaveValue("ON");
  expect(screen.getByTestId("shipping-province-desaccord")).toHaveTextContent("QC");
});

it("signale un code postal mal formé pendant la frappe", async () => {
  render(<Checkout />);
  await userEvent.type(screen.getByTestId("shipping-postal"), "H2X1");

  expect(screen.getByTestId("shipping-postal-erreur")).toBeInTheDocument();
});

it("vérifie l adresse sans attendre le bouton de commande", async () => {
  render(<Checkout />);
  await remplirAdresse();

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith("/checkout/validate-address",
      expect.objectContaining({ postal_code: "H2X 1Y4", province: "QC" }));
  }, ATTENTE);
  await waitFor(() => expect(screen.getByTestId("adresse-verifiee")).toBeInTheDocument(), ATTENTE);
});

it("propose la correction dans le formulaire, pas après le paiement", async () => {
  api.post.mockResolvedValue({ data: { valid: false, provider: "google_maps",
    suggestions: [{ formattedAddress: "123 Rue Saint-Denis, Montréal, QC H2X 1Y4",
      postalAddress: { addressLines: ["123 Rue Saint-Denis"], locality: "Montréal",
                       administrativeArea: "QC", postalCode: "H2X 1Y4", regionCode: "CA" } }] } });
  render(<Checkout />);
  await remplirAdresse();

  await screen.findByTestId("adresse-a-corriger", {}, ATTENTE);
  await userEvent.click(screen.getByTestId("adresse-appliquer"));

  expect(screen.getByTestId("shipping-city")).toHaveValue("Montréal");
  expect(screen.getByTestId("shipping-line1")).toHaveValue("123 Rue Saint-Denis");
});

it("ne dit rien quand le service est coupé", async () => {
  // Sans clé, le serveur répond « disabled » et laisse tout passer. Afficher
  // « adresse vérifiée » serait un mensonge.
  api.post.mockResolvedValue({ data: { valid: true, suggestions: [], provider: "disabled" } });
  render(<Checkout />);
  await remplirAdresse();

  await waitFor(() => expect(api.post).toHaveBeenCalled(), ATTENTE);
  expect(screen.queryByTestId("adresse-verifiee")).not.toBeInTheDocument();
});

it("ne dit rien quand la vérification échoue", async () => {
  // Un échec de vérification n'est pas une adresse invalide.
  api.post.mockRejectedValue(new Error("reseau"));
  render(<Checkout />);
  await remplirAdresse();

  await waitFor(() => expect(api.post).toHaveBeenCalled(), ATTENTE);
  expect(screen.queryByTestId("adresse-a-corriger")).not.toBeInTheDocument();
  expect(screen.queryByTestId("adresse-verifiee")).not.toBeInTheDocument();
});

it("n interroge pas le service sur une adresse incomplète", async () => {
  // Le plafond est de 30 vérifications par minute : inutile de le dépenser
  // pour une adresse dont on sait déjà qu'elle est incomplète.
  render(<Checkout />);
  await userEvent.type(screen.getByTestId("shipping-line1"), "123 rue Saint-Denis");

  await new Promise((r) => setTimeout(r, 900));
  expect(api.post).not.toHaveBeenCalledWith("/checkout/validate-address", expect.anything());
});
