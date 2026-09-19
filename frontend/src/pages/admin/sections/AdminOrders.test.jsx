// Onglets de la liste des commandes.
//
// Défauts constatés sur les vraies données le 2026-09-19 : les commandes
// remboursées restaient dans « Active », les exports ignoraient la recherche
// et les filtres affichés, les compteurs étaient redemandés à chaque frappe,
// et le lien direct chargeait 500 commandes pour en retrouver une.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminOrders from "./AdminOrders";
import api from "../../../lib/api";

let mockParams = {};
jest.mock("react-router-dom", () => ({
  useParams: () => mockParams,
  useNavigate: () => jest.fn(),
}));

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  API_BASE: "/api",
  formatApiError: (e) => String(e),
}));

jest.mock("../AdminLayout", () => ({ StatusBadge: () => null }));
jest.mock("../../../components/ConfirmDialog", () => ({ useConfirm: () => jest.fn() }));
jest.mock("../../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() },
}));

const COMPTEURS = { active: 9, completed: 35, refunded: 4, cancelled: 161, all: 209 };

const appelsVers = (chemin) => api.get.mock.calls.filter(([url]) => url === chemin);

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  api.get.mockImplementation(async (url) => {
    if (url === "/admin/orders/counts") return { data: COMPTEURS };
    if (url === "/admin/orders/page") return { data: { items: [], total: 0 } };
    if (url === "/admin/shipping/pending-manifest") return { data: { configured: false } };
    return { data: {} };
  });
});

it("donne aux commandes remboursees leur propre onglet", async () => {
  render(<AdminOrders />);
  // 4 remboursées dans leur onglet, et « Active » ne les compte plus.
  await waitFor(() => expect(screen.getByTestId("orders-count-refunded")).toHaveTextContent("4"));
  expect(screen.getByTestId("orders-count-active")).toHaveTextContent("9");
});

it("ne redemande pas les compteurs a chaque frappe dans la recherche", async () => {
  render(<AdminOrders />);
  await waitFor(() => expect(appelsVers("/admin/orders/counts")).toHaveLength(1));

  fireEvent.change(screen.getByTestId("orders-search"), { target: { value: "marie" } });

  // La liste suit la recherche...
  await waitFor(() => expect(api.get).toHaveBeenCalledWith(
    "/admin/orders/page", { params: expect.objectContaining({ query: "marie" }) }));
  // ...mais les compteurs, qui ne dépendent d'aucun filtre, restent à un appel.
  expect(appelsVers("/admin/orders/counts")).toHaveLength(1);
});

it("exporte ce qui est affiche, recherche comprise", async () => {
  render(<AdminOrders />);
  fireEvent.change(screen.getByTestId("orders-search"), { target: { value: "marie" } });

  await waitFor(() => expect(screen.getByTestId("export-orders-csv").getAttribute("href"))
    .toContain("query=marie"));
  const csv = screen.getByTestId("export-orders-csv").getAttribute("href");
  const xlsx = screen.getByTestId("export-orders-xlsx").getAttribute("href");
  expect(csv).toContain("status_group=active");
  // Les deux exports portent exactement les mêmes filtres.
  expect(xlsx.split("?")[1]).toBe(csv.split("?")[1]);
});

it("le filtre de retard ne porte plus l'etiquette du filtre de paiement", async () => {
  render(<AdminOrders />);
  await screen.findByTestId("filter-late-payment");
  expect(screen.getByTestId("filter-late-payment")).not.toHaveTextContent("All payments");
  expect(screen.getByTestId("filter-payment")).toHaveTextContent("All payments");
});

it("le lien direct demande la commande seule, pas la liste entiere", async () => {
  // L'ancienne version chargeait /admin/orders (plafonné à 500) et cherchait
  // la commande côté navigateur : au-delà de 500, « Order not found ».
  mockParams = { id: "o-9" };
  const commande = {
    id: "o-9", order_number: "FN-9", email: "a@example.com",
    payment_status: "paid", fulfillment_status: "processing", payment_method: "interac",
    created_at: "2026-09-01T10:00:00Z", total: 64.99, subtotal: 64.99, shipping: 0,
    items: [{ product_id: "p-1", name_en: "BPC-157", qty: 1, price: 64.99, line_total: 64.99 }],
    shipping_address: { full_name: "Marie Tremblay" }, notes: [],
  };
  const parDefaut = api.get.getMockImplementation();
  api.get.mockImplementation(async (url, config) => (
    url === "/admin/orders/o-9" ? { data: commande } : parDefaut(url, config)));
  render(<AdminOrders />);

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/orders/o-9"));
  expect(appelsVers("/admin/orders")).toHaveLength(0);
});
