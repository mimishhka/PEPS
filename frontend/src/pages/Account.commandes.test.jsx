// La liste des commandes du client : deux lignes, un seul paiement.
//
// MIREILLE, 30/09/2026 : retenir la commande complète n'est pas acceptable.
// Une commande mixte est donc scindée au paiement. Le client voit alors DEUX
// commandes dans son compte, dont une à « 0,00 $ » — ce qui, sans rien pour
// l'expliquer, se lit comme une erreur de facturation.
//
// Cette page n'avait aucun test. Celui-ci ne couvre que la liste des
// commandes ; le reste de la page (profil, adresses, sécurité) reste à faire.

import { render, screen, waitFor } from "@testing-library/react";

import Account from "./Account";
import api from "../lib/api";

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ search: "", pathname: "/account" }),
  useSearchParams: () => [new URLSearchParams(""), jest.fn()],
}));

jest.mock("../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../contexts/LanguageContext", () => ({ useLang: () => ({ t: (k) => k, lang: "fr" }) }));
jest.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-1", email: "cliente@example.com", name: "Lola" },
                    logout: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("../hooks/useDocumentHead", () => ({ __esModule: true, default: () => {} }));
jest.mock("../hooks/useAffiliate", () => ({ __esModule: true, default: () => ({ affiliate: null }) }));
// ThemeToggle et CustomerSupport exigent leurs propres contextes et n'ont
// rien a voir avec la liste des commandes.
jest.mock("../components/ThemeToggle", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/CustomerSupport", () => ({ __esModule: true, default: () => null }));
jest.mock("../components/NomEnDeux", () => ({ __esModule: true, default: () => null }));
const mockConfirm = jest.fn(async () => true);
jest.mock("../components/ConfirmDialog", () => ({ useConfirm: () => mockConfirm }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const MERE = {
  id: "o-1", order_number: "FN-1", created_at: "2026-09-30T10:00:00Z",
  payment_status: "paid", fulfillment_status: "processing",
  items: [{ product_id: "p-1" }, { product_id: "p-2" }],
  total: 160, shipping_info: {},
  suite_order_id: "o-2", suite_order_number: "FN-1-P",
};

const ENFANT = {
  id: "o-2", order_number: "FN-1-P", created_at: "2026-09-30T10:05:00Z",
  payment_status: "paid", fulfillment_status: "preorder",
  items: [{ product_id: "p-2" }],
  total: 0, shipping_info: {},
  suite_of_order_id: "o-1", suite_of_order_number: "FN-1",
};

const ORDINAIRE = {
  id: "o-9", order_number: "FN-9", created_at: "2026-09-01T10:00:00Z",
  payment_status: "paid", fulfillment_status: "delivered",
  items: [{ product_id: "p-1" }], total: 64.99, shipping_info: {},
};

const commandes = (liste) => {
  api.get.mockImplementation((url) => {
    if (String(url).includes("/orders/mine")) return Promise.resolve({ data: liste });
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

test("LE CAS DE MIREILLE : l'envoi de suite s'annonce comme tel", async () => {
  commandes([MERE, ENFANT]);
  render(<Account />);

  await waitFor(() => {
    expect(screen.getByTestId("order-suite-of-FN-1-P")).toBeInTheDocument();
  });
  // Et la commande d'origine dit qu'elle part en deux fois.
  expect(screen.getByTestId("order-has-suite-FN-1")).toBeInTheDocument();
});

test("chaque ligne mène à sa sœur", async () => {
  // Sans le lien, il faut deviner que FN-1-P complète FN-1.
  commandes([MERE, ENFANT]);
  render(<Account />);

  await waitFor(() => {
    expect(screen.getByTestId("order-suite-link-FN-1")).toHaveAttribute("href", "/order/o-2");
  });
  expect(screen.getByTestId("order-suite-link-FN-1-P")).toHaveAttribute("href", "/order/o-1");
});

test("l'envoi de suite reste identifié « Précommande » tant qu'il attend", async () => {
  // Son statut d'exécution est la seule chose qui renseigne sur l'attente —
  // et il disparaît de la carte dès qu'un numéro de suivi existe, le libellé
  // et le suivi s'excluant mutuellement à cet endroit.
  commandes([ENFANT]);
  render(<Account />);

  await waitFor(() => {
    expect(screen.getByTestId("order-row-FN-1-P")).toHaveTextContent(/Précommande/i);
  });
});

test("une commande ordinaire ne porte aucune de ces pastilles", async () => {
  // Le cas de la très grande majorité des commandes.
  commandes([ORDINAIRE]);
  render(<Account />);

  await waitFor(() => expect(screen.getByTestId("order-row-FN-9")).toBeInTheDocument());
  expect(screen.queryByTestId("order-suite-of-FN-9")).not.toBeInTheDocument();
  expect(screen.queryByTestId("order-has-suite-FN-9")).not.toBeInTheDocument();
  expect(screen.queryByTestId("order-suite-link-FN-9")).not.toBeInTheDocument();
});
