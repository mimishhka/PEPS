// Ecran des remboursements : ce qu'il faut savoir pour DECIDER.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

// ---------------------------------------------------------------------------
// Le parcours : ce qui reste a faire ne doit jamais disparaitre de l'ecran
// ---------------------------------------------------------------------------

it("un ecran vide ne laisse pas croire que tout est regle", async () => {
  // Apres une approbation, l'etape « a examiner » se vide. Sans compteurs,
  // la page vide passait pour « rien a faire » — alors que l'argent de deux
  // clients n'etait pas parti.
  api.get.mockResolvedValue({
    data: { items: [], counts: { requested: 0, approved: 2, processed: 5, denied: 1 } } });
  render(<AdminRefunds />);

  expect(await screen.findByTestId("refunds-empty")).toHaveTextContent(/Rien à examiner/);
  expect(screen.getByTestId("refunds-elsewhere")).toHaveTextContent(/2 dossier/);
});

it("montre l'argent non parti depuis n'importe quelle etape", async () => {
  api.get.mockResolvedValue({
    data: { items: DOSSIERS, counts: { requested: 2, approved: 3, processed: 0, denied: 0 } } });
  render(<AdminRefunds />);

  const bandeau = await screen.findByTestId("refunds-to-send");
  expect(bandeau).toHaveTextContent(/3 remboursement\(s\) approuvé\(s\)/);
  expect(bandeau).toHaveTextContent(/pas encore parti/);
});

it("affiche le compte de chaque etape, pas seulement celle ouverte", async () => {
  api.get.mockResolvedValue({
    data: { items: DOSSIERS, counts: { requested: 2, approved: 3, processed: 7, denied: 1 } } });
  render(<AdminRefunds />);

  // Les boutons d'étape existent avant les données : c'est l'arrivée des
  // COMPTEURS qu'il faut attendre, pas celle du bouton.
  await waitFor(() => expect(screen.getByTestId("stage-requested")).toHaveTextContent("2"));
  expect(screen.getByTestId("stage-approved")).toHaveTextContent("3");
  expect(screen.getByTestId("stage-processed")).toHaveTextContent("7");
});

it("approuver conduit a l etape suivante au lieu de vider la page", async () => {
  api.get.mockResolvedValue({
    data: { items: DOSSIERS, counts: { requested: 2, approved: 0, processed: 0, denied: 0 } } });
  api.post.mockResolvedValue({ data: { ok: true } });
  render(<AdminRefunds />);

  await userEvent.click(await screen.findByTestId("approve-o-2"));

  // L'ecran suit le dossier : il bascule sur « a envoyer », ou l'argent
  // attend encore.
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/refunds?status=approved"));
});

it("permet d ouvrir un dossier pour une commande sans compte", async () => {
  // Un client invite n'a ni compte ni billet : sans cette recherche, aucun
  // chemin vers un remboursement depuis cet ecran.
  api.get.mockImplementation(async (url) => (
    url.startsWith("/admin/refund-candidates")
      ? { data: { items: [{ id: "o-9", order_number: "FN-INVITE-1", total: 42,
                            created_at: "2026-09-01T10:00:00Z", email: "invite@example.com",
                            refund_blocked_reason: null }] } }
      : { data: { items: [], counts: { requested: 0, approved: 0, processed: 0, denied: 0 } } }));
  api.post.mockResolvedValue({ data: { ok: true } });
  render(<AdminRefunds />);

  await userEvent.click(await screen.findByTestId("refund-new-open"));
  // fireEvent.change plutôt que userEvent.type : taper caractère par
  // caractère prenait 3 s, ce qui faisait dépasser le délai d'attente quand
  // la suite complète tourne en parallèle. Le test échouait alors sans que
  // rien ne soit cassé.
  fireEvent.change(screen.getByTestId("refund-new-search"),
                   { target: { value: "invite@example.com" } });
  await userEvent.click(screen.getByTestId("refund-new-search-go"));

  await userEvent.selectOptions(await screen.findByTestId("refund-new-order"), "o-9");
  fireEvent.change(screen.getByTestId("refund-new-reason"),
                   { target: { value: "Produit endommagé à la livraison" } });
  await userEvent.click(screen.getByTestId("refund-new-submit"));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/admin/orders/o-9/refund-case",
    { reason: "Produit endommagé à la livraison" }));
});
