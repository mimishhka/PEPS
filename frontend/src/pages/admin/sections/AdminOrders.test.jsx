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

// La fiche suit la langue de l'interface. Les tests la lisent en français.
jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
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

// ---------------------------------------------------------------------------
// La fiche d'une commande : chaque bloc n'apparaît que s'il a un sens
// ---------------------------------------------------------------------------

const BASE = {
  id: "o-1", order_number: "FN-1", email: "marie@example.com", user_id: "u-1",
  payment_status: "paid", fulfillment_status: "processing", payment_method: "interac",
  created_at: "2026-09-01T10:00:00Z", subtotal: 49.99, shipping: 20, total: 69.99, tax: 0,
  items: [{ product_id: "p-1", name_en: "BPC-157", slug: "bpc-157-5mg", qty: 1,
            price_cad: 49.99, line_total: 49.99 }],
  shipping_address: { full_name: "Marie Tremblay" }, shipping_info: {}, notes: [],
};

const ouvrir = async (surcharge) => {
  const commande = { ...BASE, ...surcharge };
  mockParams = { id: commande.id };
  const parDefaut = api.get.getMockImplementation();
  api.get.mockImplementation(async (url, config) => (
    url === `/admin/orders/${commande.id}` ? { data: commande } : parDefaut(url, config)));
  render(<AdminOrders />);
  await screen.findByTestId("order-detail-drawer");
};

const absent = (id) => expect(screen.queryByTestId(id)).not.toBeInTheDocument();
const present = (id) => expect(screen.getByTestId(id)).toBeInTheDocument();

it("une commande sans articles ne fait plus tomber l'ecran", async () => {
  // Cas réel : FN-AUTO-B3AD4F n'a pas de champ `items`. Son ouverture
  // affichait « Something went wrong » sur tout l'écran d'administration.
  await ouvrir({ items: undefined });
  present("order-no-items");
});

it("commande payee : on expedie, rien a confirmer", async () => {
  await ouvrir({});
  absent("confirm-payment-btn");      // déjà payée
  absent("order-status-actions");     // ne s'affiche plus vide
  present("save-shipping-btn");
  present("download-invoice-pdf");
  present("resend-email-btn");
});

it("commande en attente de paiement : on confirme ou on annule, pas plus", async () => {
  await ouvrir({ payment_status: "awaiting_etransfer", fulfillment_status: "pending" });
  present("confirm-payment-btn");
  present("order-status-actions");
  absent("order-shipping");           // le serveur refuse tout suivi sans paiement
  absent("order-refund");             // rien à rembourser
});

it("commande annulee : ni facture, ni courriel, ni suivi, ni confirmation", async () => {
  await ouvrir({ payment_status: "cancelled", fulfillment_status: "cancelled" });
  absent("confirm-payment-btn");      // annonçait un succès sans rien changer
  absent("download-invoice-pdf");     // pas de facture pour une vente non faite
  absent("resend-email-btn");         // lui demanderait de payer
  absent("order-shipping");
  absent("order-refund");
  present("reopen-order-btn");        // le seul chemin, qui revérifie le stock
});

it("commande remboursee : la facture reste, l'etat du dossier se lit en clair", async () => {
  await ouvrir({ payment_status: "refunded", fulfillment_status: "refunded",
                 refund_status: "processed", refunded_amount: 69.99 });
  absent("confirm-payment-btn");
  absent("resend-email-btn");
  present("download-invoice-pdf");    // la vente a existé
  expect(screen.getByTestId("refund-case-state")).toHaveTextContent("remboursé");
  expect(screen.getByTestId("refund-case-state")).not.toHaveTextContent("processed");
});

it("une commande close deja expediee garde son suivi, en lecture seule", async () => {
  await ouvrir({ payment_status: "refunded", fulfillment_status: "refunded",
                 refund_status: "processed",
                 shipping_info: { carrier: "Canada Post", tracking_number: "1234567890" } });
  expect(screen.getByTestId("order-shipping-readonly")).toHaveTextContent("1234567890");
  absent("save-shipping-btn");
});

it("dit qu'un client n'a pas de compte", async () => {
  await ouvrir({ user_id: null });
  present("order-guest");
});

it("regroupe les reports de lot consecutifs sans perdre les notes humaines", async () => {
  // Cas réel : FN-260824-4182B7 portait un report par jour depuis le 27 août.
  const report = (lot) => ({ author: "system", text: `Reportée au lot ${lot} : étiquette non imprimée.`,
                             created_at: `${lot}T10:00:00Z` });
  await ouvrir({ notes: [
    { author: "admin@fironova.com", text: "Client prévenu du retard", created_at: "2026-08-26T10:00:00Z" },
    report("2026-08-27"), report("2026-08-28"), report("2026-08-29"),
    report("2026-08-30"), report("2026-08-31"),
  ] });
  expect(screen.getByTestId("note-0")).toHaveTextContent("Client prévenu du retard");
  expect(screen.getByTestId("note-1"))
    .toHaveTextContent("Reportée 5 fois : du lot 2026-08-27 au lot 2026-08-31");
  absent("note-2");
});

it("la fiche n'ouvre plus de dossier de remboursement", async () => {
  // Doublon de l'écran Remboursements, qui ouvre un dossier pour n'importe
  // quelle commande, invités compris. Un seul endroit pour créer.
  await ouvrir({});
  absent("open-refund-case-btn");
  absent("refund-case-reason");
  absent("order-refund");             // pas de dossier : rien à lire non plus
});

it("elle lit le dossier qui existe, sans permettre d'en ouvrir un autre", async () => {
  await ouvrir({ refund_status: "approved", refund_reason: "Flacon fissuré" });
  expect(screen.getByTestId("refund-case-state")).toHaveTextContent("approuvé");
  expect(screen.getByTestId("refund-case-state")).toHaveTextContent("Flacon fissuré");
  absent("open-refund-case-btn");
});

it("l'en-tete dit quand la commande a ete passee et comment elle a ete payee", async () => {
  // Ni la date ni le moyen de paiement n'apparaissaient dans la fiche.
  await ouvrir({ paid_at: "2026-09-02T10:00:00Z" });
  const resume = screen.getByTestId("order-detail-summary");
  expect(resume).toHaveTextContent("Passée le");
  expect(resume).toHaveTextContent("Interac");
  expect(screen.getByTestId("order-detail-payment")).toHaveTextContent("Payée le");
});

it("une commande en attente dit qu'elle n'est pas encore payee", async () => {
  await ouvrir({ payment_status: "awaiting_etransfer", fulfillment_status: "pending", paid_at: null });
  expect(screen.getByTestId("order-detail-payment")).toHaveTextContent("Pas encore payée");
});

it("le lot d'expedition disparait une fois la commande partie", async () => {
  await ouvrir({ fulfillment_status: "delivered", dispatch_batch: "2026-09-19" });
  absent("order-detail-dispatch-batch");
});

it("le lot d'expedition reste affiche tant que la commande attend de partir", async () => {
  await ouvrir({ fulfillment_status: "processing", dispatch_batch: "2026-09-19" });
  expect(screen.getByTestId("order-detail-dispatch-batch")).toHaveTextContent("2026-09-19");
});

it("sur une commande livree, le bouton ne promet plus de la marquer expediee", async () => {
  // Le serveur ne fait plus reculer un statut : le libellé doit le dire.
  await ouvrir({ fulfillment_status: "delivered" });
  expect(screen.getByTestId("save-shipping-btn")).toHaveTextContent("Enregistrer le suivi");
  expect(screen.getByTestId("save-shipping-btn")).not.toHaveTextContent("expédiée");
});

it("une commande sans adresse le dit au lieu d'afficher des virgules", async () => {
  await ouvrir({ shipping_address: { full_name: "Marie" } });
  present("order-no-address");
});

it("la corbeille a quitte l'en-tete, loin de la croix de fermeture", async () => {
  await ouvrir({});
  const entete = screen.getByTestId("close-order-detail").parentElement;
  expect(entete).not.toContainElement(screen.getByTestId("delete-order-btn"));
  expect(screen.getByTestId("delete-order-btn")).toHaveTextContent("Mettre à la corbeille");
});

it("la fiche dit quand la commande a ete livree, telle que le dit Postes Canada", async () => {
  await ouvrir({ fulfillment_status: "delivered",
                 shipping_info: { delivered_at: "2026-09-18T18:07:32+00:00",
                                  delivered_at_label: "2026-09-18 à 14:07 EDT" } });
  expect(screen.getByTestId("order-delivered-at")).toHaveTextContent("2026-09-18 à 14:07 EDT");
});

it("le dossier de remboursement montre aussi la livraison", async () => {
  // C'est de cette date que part le délai de 48 h annoncé au client.
  await ouvrir({ fulfillment_status: "delivered", refund_status: "requested",
                 shipping_info: { delivered_at: "2026-09-18T18:07:32+00:00",
                                  delivered_at_label: "2026-09-18 à 14:07 EDT" } });
  expect(screen.getByTestId("refund-delivered-at")).toHaveTextContent("2026-09-18 à 14:07 EDT");
});
