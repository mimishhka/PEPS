// La caisse dit ce qui va se passer : deux envois, un seul paiement.
//
// MIREILLE, 30/09/2026 : retenir la commande complète n'est pas acceptable.
// Le disponible part donc tout de suite et la précommande suit — mais le
// client doit le savoir AVANT de payer, sinon il verra deux commandes
// apparaître pour un seul paiement et croira à une erreur de facturation.
//
// Le mot « précommande » n'apparaissait nulle part sur cette page : ni par
// ligne, ni en explication, alors que le prix de précommande y était déjà
// calculé.

import { render, screen, waitFor } from "@testing-library/react";

import Checkout from "./Checkout";
import api from "../lib/api";
import { useCart } from "../contexts/CartContext";

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

jest.mock("../contexts/CartContext", () => ({ useCart: jest.fn() }));
jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ lang: "fr", t: (k) => k }) }));
jest.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
jest.mock("../contexts/SiteConfigContext", () => ({ useSiteConfig: () => ({ config: {} }) }));
jest.mock("../lib/codeParrainage", () => ({ codeAffiliePourPaiement: () => null }));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const ligne = (slug, preorder, prix) => ({
  product_id: `p-${slug}`, variant_id: "v1", slug,
  name_fr: slug, name_en: slug, price_cad: prix, qty: 1,
  preorder,
});

const panier = (lignes) => {
  useCart.mockReturnValue({
    items: lignes,
    subtotal: lignes.reduce((s, l) => s + l.price_cad * l.qty, 0),
    clear: jest.fn(),
    syncPrices: jest.fn(),
  });
};

const ATTENTE = { timeout: 3000 };

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  api.get.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { valid: true, suggestions: [] } });
});

jest.setTimeout(15000);

test("LE CAS DE MIREILLE : un panier mixte annonce les deux envois", async () => {
  panier([ligne("creatine", false, 60), ligne("bpc157", true, 80)]);

  render(<Checkout />);

  const avis = await screen.findByTestId("checkout-preorder-split", {}, ATTENTE);
  expect(avis).toHaveTextContent(/tout de suite/i);
  expect(avis).toHaveTextContent(/second envoi/i);
  // Les deux points qui évitent l'inquiétude : rien de plus à payer, et rien
  // de plus pour la livraison.
  expect(avis).toHaveTextContent(/sans frais/i);
  expect(avis).toHaveTextContent(/un seul paiement/i);
});

test("la ligne en précommande est marquée, l'autre non", async () => {
  panier([ligne("creatine", false, 60), ligne("bpc157", true, 80)]);

  render(<Checkout />);

  await waitFor(() => {
    expect(screen.getByTestId("summary-preorder-bpc157")).toBeInTheDocument();
  }, ATTENTE);
  expect(screen.queryByTestId("summary-preorder-creatine")).not.toBeInTheDocument();
});

test("un panier SANS précommande n'annonce rien", async () => {
  // Annoncer deux envois sur une commande qui n'en fera qu'un serait une
  // inquiétude gratuite.
  panier([ligne("creatine", false, 60), ligne("magnesium", false, 40)]);

  render(<Checkout />);

  await waitFor(() => expect(screen.getByTestId("checkout-summary")).toBeInTheDocument(), ATTENTE);
  expect(screen.queryByTestId("checkout-preorder-split")).not.toBeInTheDocument();
});

test("un panier TOUT en précommande n'annonce pas de scission", async () => {
  /* La nuance qui compte. Une commande entièrement en précommande n'est PAS
   * scindée côté serveur — il n'y aurait rien à expédier maintenant. Annoncer
   * deux envois serait donc faux, et le client attendrait un colis qui ne
   * viendrait jamais.
   *
   * Les lignes restent marquées « Précommande » : ça, c'est vrai.
   */
  panier([ligne("bpc157", true, 80), ligne("tb500", true, 90)]);

  render(<Checkout />);

  await waitFor(() => {
    expect(screen.getByTestId("summary-preorder-bpc157")).toBeInTheDocument();
  }, ATTENTE);
  expect(screen.queryByTestId("checkout-preorder-split")).not.toBeInTheDocument();
});
