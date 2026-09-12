// La demande d'annulation ou de remboursement, sur la page de la commande.
//
// Le serveur savait la recevoir depuis longtemps ; aucune page ne la
// proposait. Avant expedition c'est une annulation, apres un signalement.
// fireEvent.change plutôt que userEvent.type pour les textes longs : la
// frappe simulée caractère par caractère dépassait le délai d'attente quand
// les dix suites tournent en parallèle, et faisait échouer un fichier au
// hasard à chaque exécution.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import OrderConfirmation from "./OrderConfirmation";
import api from "../lib/api";

let mockEtat = {};
jest.mock("react-router-dom", () => ({
  useParams: () => ({ id: "o-1" }),
  useLocation: () => ({ state: mockEtat, search: "" }),
  // Un vrai lien, pas seulement son contenu : sans le `to` ni le testid, la
  // destination d'un bouton ne pouvait pas etre verifiee du tout.
  Link: ({ to, children, ...reste }) => <a href={to} {...reste}>{children}</a>,
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

  fireEvent.change(screen.getByTestId("refund-reason"),
                   { target: { value: "Je me suis trompé de dosage" } });
  await userEvent.click(screen.getByTestId("refund-submit"));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/orders/o-1/refund-request",
    { reason: "Je me suis trompé de dosage", refund_type: "full", refund_destination: "" },
    expect.anything()));
  expect(await screen.findByTestId("refund-status")).toHaveTextContent(/Demande reçue/);
});

it("ramene le client vers ses commandes, pas vers la vitrine", () => {
  mockEtat = { order: { ...COMMANDE } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("back-home-btn")).toHaveAttribute("href", "/account");
});

it("garde l'accueil pour une commande passee en invite", () => {
  // Sans compte, il n'y a pas de tableau de bord a proposer.
  mockEtat = { order: { ...COMMANDE, user_id: null } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("back-home-btn")).toHaveAttribute("href", "/");
});

it("titre le bloc « Remboursement » des qu'un dossier existe", () => {
  // Le titre annoncait « Annuler cette commande » au-dessus de
  // « Remboursement effectue » : on proposait d'annuler le deja-rembourse.
  mockEtat = { order: { ...COMMANDE, payment_status: "refunded", refund_status: "processed" } };
  render(<OrderConfirmation />);
  const carte = screen.getByTestId("refund-card");
  expect(carte).toHaveTextContent(/Remboursement/);
  expect(carte).not.toHaveTextContent(/Annuler cette commande/);
});

it("dit qu'une commande remboursee est remboursee, jamais en attente de paiement", () => {
  // Cas reel signale : FN-260901-3A394C25 affichait « PAIEMENT EN ATTENTE »
  // apres remboursement. Le serveur ecrit payment_status = "refunded" au
  // reglement, et la page ne connaissait que « paid » ou non : elle reclamait
  // un paiement a quelqu'un qu'on venait de rembourser.
  mockEtat = { order: { ...COMMANDE, payment_status: "refunded", refund_status: "processed" } };
  render(<OrderConfirmation />);
  const page = screen.getByTestId("confirmation-page");
  expect(page).toHaveTextContent(/Commande remboursée/);
  expect(page).not.toHaveTextContent(/PAIEMENT EN ATTENTE/);
  expect(page).not.toHaveTextContent(/compléter le paiement/);
  // Et l'etat du dossier reste lisible : la carte disparaissait justement
  // quand le remboursement aboutissait.
  expect(screen.getByTestId("refund-status")).toHaveTextContent(/Remboursement effectué/);
});

it("dit qu'une commande annulee est annulee", () => {
  mockEtat = { order: { ...COMMANDE, payment_status: "cancelled" } };
  render(<OrderConfirmation />);
  const page = screen.getByTestId("confirmation-page");
  expect(page).toHaveTextContent(/Commande annulée/);
  expect(page).not.toHaveTextContent(/compléter le paiement/);
});

it("garde l'attente de paiement pour une commande fraiche", () => {
  // Le cas normal ne doit pas regresser.
  mockEtat = { order: { ...COMMANDE, payment_status: "awaiting_etransfer" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("confirmation-page")).toHaveTextContent(/compléter le paiement/);
});

it("apres expedition, renvoie vers la conversation au lieu d'un second formulaire", () => {
  // Deux entrees qui faisaient la meme chose : un formulaire de texte et une
  // conversation. Seule la conversation accepte les photos — c'est elle qui
  // reste, et le formulaire disparait.
  mockEtat = { order: { ...COMMANDE, fulfillment_status: "delivered" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-card"))
    .toHaveTextContent(/Produit endommagé ou erreur de commande/);
  expect(screen.queryByTestId("refund-submit")).not.toBeInTheDocument();
  expect(screen.queryByTestId("refund-reason")).not.toBeInTheDocument();
  // Le fil de messages de la commande a ete retire : le signalement avec photo
  // passe desormais par un billet, seul canal restant.
  expect(screen.getByTestId("refund-open-help")).toHaveAttribute("href", "/account?tab=support");
  expect(screen.queryByTestId("problem-toggle")).not.toBeInTheDocument();
});

it("demande ou renvoyer les fonds quand la commande a ete payee en crypto", async () => {
  // NOWPayments nous dit qu'un depot est arrive, jamais de quel portefeuille.
  mockEtat = { order: { ...COMMANDE, payment_method: "nowpayments" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-destination")).toBeInTheDocument();

  fireEvent.change(screen.getByTestId("refund-reason"),
                   { target: { value: "Je me suis trompé de dosage" } });
  await userEvent.click(screen.getByTestId("refund-submit"));
  expect(screen.getByTestId("refund-error")).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

it("annonce le remboursement Interac a l'adresse de la commande", () => {
  mockEtat = { order: { ...COMMANDE, payment_method: "interac", email: "marie@example.com" } };
  render(<OrderConfirmation />);
  expect(screen.getByTestId("refund-destination-interac"))
    .toHaveTextContent("marie@example.com");
});

it("refuse une demande vide sans appeler le serveur", async () => {
  mockEtat = { order: { ...COMMANDE } };
  render(<OrderConfirmation />);
  fireEvent.change(screen.getByTestId("refund-reason"), { target: { value: "non" } });
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
