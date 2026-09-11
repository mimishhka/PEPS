// Ouvrir un dossier de remboursement depuis un billet client.
//
// Ce que ces tests protègent : le dossier s'ouvre sur LA bonne commande, il
// passe par le même point d'entrée que la fiche commande, et il n'apparaît
// pas dans la file des affiliés, qui n'ont rien à faire rembourser.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminTickets from "./AdminTickets";
import api from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

const BILLET = {
  id: "t-1", status: "open", subject: "Flacon cassé à la réception",
  customer_name: "Marie Tremblay", customer_email: "marie@example.com",
  updated_at: new Date().toISOString(), messages: [],
};

const COMMANDES = [
  { id: "o-1", order_number: "FN-260901-AA1111", total: 120, created_at: "2026-09-01T10:00:00Z",
    payment_status: "paid", fulfillment_status: "delivered", refund_blocked_reason: null },
  { id: "o-2", order_number: "FN-260702-BB2222", total: 80, created_at: "2026-07-02T10:00:00Z",
    payment_status: "paid", fulfillment_status: "delivered",
    refund_blocked_reason: "Une demande est déjà en cours (statut : approved)" },
];

beforeEach(() => jest.clearAllMocks());

const rendreFileClients = () => render(<AdminTickets
  base="/admin/customer-tickets"
  titre={{ fr: "Billets clients", en: "Customer tickets" }}
  identite={(t) => ({ name: t.customer_name, email: t.customer_email, code: "" })}
  remboursement />);

it("ouvre le dossier sur la commande choisie, par le point d'entrée commun", async () => {
  api.get.mockImplementation((url) => Promise.resolve(
    url.endsWith("/orders") ? { data: { items: COMMANDES } } : { data: [BILLET] }));
  api.post.mockResolvedValue({ data: {} });
  rendreFileClients();

  await userEvent.click(await screen.findByText("Flacon cassé à la réception"));
  await userEvent.click(screen.getByTestId("ticket-refund-open"));

  // Les commandes viennent du billet : aucun numéro à retrouver à la main.
  await waitFor(() => expect(api.get)
    .toHaveBeenCalledWith("/admin/customer-tickets/t-1/orders"));

  await userEvent.selectOptions(screen.getByTestId("ticket-refund-order"), "o-1");
  await userEvent.click(screen.getByTestId("ticket-refund-submit"));

  // Le MÊME point d'entrée que la fiche commande — une seule logique.
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/admin/orders/o-1/refund-case",
    { reason: "Flacon cassé à la réception" }));
});

it("montre la commande non éligible sans permettre de la choisir", async () => {
  api.get.mockImplementation((url) => Promise.resolve(
    url.endsWith("/orders") ? { data: { items: COMMANDES } } : { data: [BILLET] }));
  rendreFileClients();

  await userEvent.click(await screen.findByText("Flacon cassé à la réception"));
  await userEvent.click(screen.getByTestId("ticket-refund-open"));

  // Masquer la commande ferait croire qu'elle n'existe pas ; on la laisse
  // visible avec sa raison, et on la rend inchoisissable.
  const ligne = await screen.findByRole("option", { name: /FN-260702-BB2222/ });
  expect(ligne).toBeDisabled();
  expect(ligne).toHaveTextContent(/déjà en cours/);
});

it("retient un motif trop court au lieu de le laisser partir en 422", async () => {
  // Le serveur exige 10 caractères. Un sujet de billet peut en faire 3.
  api.get.mockImplementation((url) => Promise.resolve(
    url.endsWith("/orders") ? { data: { items: COMMANDES } } : { data: [{ ...BILLET, subject: "Cas" }] }));
  rendreFileClients();

  await userEvent.click(await screen.findByText("Cas"));
  await userEvent.click(screen.getByTestId("ticket-refund-open"));
  await userEvent.selectOptions(await screen.findByTestId("ticket-refund-order"), "o-1");

  expect(screen.getByTestId("ticket-refund-submit")).toBeDisabled();
  expect(api.post).not.toHaveBeenCalled();
});

it("n'apparaît pas dans la file des affiliés", async () => {
  api.get.mockResolvedValue({ data: [{ ...BILLET, affiliate_name: "Kyro" }] });
  render(<AdminTickets />);

  await userEvent.click(await screen.findByText("Flacon cassé à la réception"));
  expect(screen.queryByTestId("ticket-refund-open")).not.toBeInTheDocument();
});
