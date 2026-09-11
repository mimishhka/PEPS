// La demande d'annulation ou de remboursement, sur la page de la commande.
//
// Le serveur savait la recevoir depuis longtemps ; aucune page ne la
// proposait. Avant expedition c'est une annulation, apres un signalement.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OrderConfirmation from "./OrderConfirmation";
import api from "../lib/api";

let mockEtat = {};
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "o-1" }),
  useLocation: () => ({ state: mockEtat, search: "" }),
  Link: ({ children }) => children,
}));

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({ t: (k) => k, lang: "fr" }),
}));

jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const COMMANDE = {
  id: "o-1", order_number: "FN-1", created_at: "2026-09-01T10:00:00Z",
  payment_status: "paid", fulfillment_status: "processing", user_id: "u-1",
  items: [{ product_id: "p-1", qty: 1, name_fr: "BPC-157", name_en: "BPC-157", line_total: 64.99 }],
  subtotal: 64.99, total: 64.99, shipping: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

it("propose l'annulation d'une commande pas encore expediee", async () => {
  mockEtat = { order: { ...COMMANDE } };
  api.post.mockResolvedValue({ data: { ok: true } });
  api.get.mockImplementation(async (url) => (url.endsWith("/messages")
    ? { data: [] }
    : { data: { ...COMMANDE, refund_status: "requested" } }));

  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-card")).toHaveTextContent(/Annuler cette commande/);
  expect(screen.getByTestId("refund-submit")).toHaveTextContent(/Demander l'annulation/);

  await userEvent.type(screen.getByTestId("refund-reason"), "Je me suis trompé de dosage");
  await userEvent.click(screen.getByTestId("refund-submit"));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/orders/o-1/refund-request",
    { reason: "Je me suis trompé de dosage", refund_type: "full" },
    expect.anything()));
  expect(await screen.findByTestId("refund-status")).toHaveTextContent(/Demande reçue/);
});

it("parle de produit endommage une fois la commande livree", () => {
  mockEtat = { order: { ...COMMANDE, fulfillment_status: "delivered" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-card"))
    .toHaveTextContent(/Produit endommagé ou erreur de commande/);
  expect(screen.getByTestId("refund-submit")).toHaveTextContent(/Envoyer ma demande/);
});

it("refuse une demande vide sans appeler le serveur", async () => {
  mockEtat = { order: { ...COMMANDE } };
  render(<OrderConfirmation />);
  await userEvent.type(screen.getByTestId("refund-reason"), "non");
  await userEvent.click(screen.getByTestId("refund-submit"));
  expect(screen.getByTestId("refund-error")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it("montre ou en est un dossier deja ouvert, sans reproposer le formulaire", () => {
  mockEtat = { order: { ...COMMANDE, refund_status: "approved" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-status")).toHaveTextContent(/approuvée/);
  expect(screen.queryByTestId("refund-reason")).not.toBeInTheDocument();
});
