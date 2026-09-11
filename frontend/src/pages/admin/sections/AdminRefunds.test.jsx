// Ecran des remboursements : ce qu'il faut savoir pour DECIDER.
import { render, screen } from "@testing-library/react";

import AdminRefunds from "./AdminRefunds";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const maintenant = new Date().toISOString();

const DOSSIERS = [
  { id: "o-1", order_number: "FN-1", email: "a@example.com", total: 64.99,
    refund_status: "requested", refund_type_requested: "full",
    refund_reason: "Flacon fissuré", refund_requested_at: maintenant,
    refund_before_shipping: false, refund_late: true,
    refund_late_note: "Signalé 72 h après la livraison (3.0 j) — délai annoncé : 48 h" },
  { id: "o-2", order_number: "FN-2", email: "b@example.com", total: 30,
    refund_status: "requested", refund_type_requested: "full",
    refund_reason: "Erreur de dosage", refund_requested_at: maintenant,
    refund_before_shipping: true, refund_late: false, refund_late_note: "" },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: { items: DOSSIERS } });
});

it("signale une demande tardive au lieu de la refuser", async () => {
  render(<AdminRefunds />);
  expect(await screen.findByTestId("refund-late-o-1")).toHaveTextContent(/72 h/);
  expect(screen.queryByTestId("refund-late-o-2")).not.toBeInTheDocument();
});

it("distingue une annulation avant expedition", async () => {
  render(<AdminRefunds />);
  expect(await screen.findByTestId("refund-cancel-o-2")).toBeInTheDocument();
  expect(screen.queryByTestId("refund-cancel-o-1")).not.toBeInTheDocument();
});

it("ne propose plus le credit boutique, qui n'a jamais existe", async () => {
  render(<AdminRefunds />);
  await screen.findByTestId("refund-o-1");
  expect(document.querySelector('option[value="store_credit"]')).toBeNull();
});
