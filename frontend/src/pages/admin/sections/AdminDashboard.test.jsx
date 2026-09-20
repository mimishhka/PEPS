// Le tableau de bord : ce qui demande une action, et rien d'autre en premier.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminDashboard from "./AdminDashboard";
import api from "../../../lib/api";

// Le vrai routeur n'est pas importable sous Jest (react-router v7 est publié
// en ESM). Un Link suffit ici : ce qui compte est le lien porté, pas la
// navigation — même mock que AdminOrders.test.jsx.
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
}));

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
  formatApiError: (e) => String(e),
}));

jest.mock("../../../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr" }),
}));

// La page salue la personne connectée : sans ce contexte, useAuth lève.
jest.mock("../../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { name: "Mireille", email: "mireille@example.com" } }),
}));

jest.mock("../AdminLayout", () => ({
  StatusBadge: ({ status }) => <span>{status || "—"}</span>,
}));

jest.mock("../../../components/LoadingSkeletons", () => ({
  DashboardSkeleton: () => <div data-testid="skeleton" />,
}));

jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const PULSE_CALME = {
  money: { pending_payment: { amount: 0, count: 0, expiring_soon: 0, by_method: { interac: 0, crypto: 0 } },
           reconcile: { count: 0, by_provider: {} } },
  rails: { interac: { paid_amount: 4491.47, paid_count: 38 },
           crypto: { paid_amount: 782.89, paid_count: 4 } },
  ops: { to_ship: 0, low_stock: 0, low_stock_top: [], late_payments: 0, emails_failed: 0,
         tickets_open: 0, refunds: { to_review: 0, to_send: 0, to_send_amount: 0 } },
};

const PULSE_CHARGE = {
  money: { pending_payment: { amount: 240.5, count: 3, expiring_soon: 1, by_method: { interac: 2, crypto: 1 } },
           reconcile: { count: 2, by_provider: { crypto: 2 } } },
  rails: {},
  ops: { to_ship: 4, low_stock: 2, low_stock_top: [{ product_name: "BPC-157", variant_name: "10.0mg" }],
         late_payments: 0, emails_failed: 0, tickets_open: 1,
         refunds: { to_review: 1, to_send: 2, to_send_amount: 145.75 } },
};

const ANALYTICS = {
  granularity: "day", period: 30,
  daily_revenue: [{ date: "2026-09-17", revenue: 120, orders: 2,
                    returning_revenue: 100, new_revenue: 20 },
                  { date: "2026-09-18", revenue: 300, orders: 3,
                    returning_revenue: 250, new_revenue: 50 }],
  // Sept lignes de 24 heures : une seule case chargee, jeudi 20 h.
  hourly: Array.from({ length: 7 }, (_, j) =>
    Array.from({ length: 24 }, (_, h) => (j === 3 && h === 20 ? 420 : 0))),
  top_products: [{ slug: "bpc-157-5mg", variant_name: "5.0mg", name_fr: "BPC-157",
                   name_en: "BPC-157", units_sold: 7, revenue: 217.96 }],
  recent_orders: [{ id: "o-1", order_number: "FN-1", created_at: "2026-09-18T14:07:00",
                    email: "client@example.com", total: 64.99, payment_status: "paid",
                    fulfillment_status: "processing",
                    shipping_address: { full_name: "Marie Tremblay" } }],
};

const ENHANCED = {
  period_days: 30,
  current: { revenue: 420, orders: 5, aov: 84 },
  previous: { revenue: 300, orders: 4, aov: 75 },
  changes: { revenue: 40, orders: 25, aov: 12 },
  conversion: { orders_created: 14, orders_paid: 6, orders_abandoned: 2, conversion_rate: 42.9 },
  customers: { new: 3, returning: 1, total_active: 4 },
  funnel: [{ step: "created", count: 14, pct: 100.0 },
           { step: "paid", count: 6, pct: 42.9 },
           { step: "shipped", count: 4, pct: 28.6 },
           { step: "delivered", count: 3, pct: 21.4 }],
  tax_threshold: { rolling_12mo_revenue: 5274.36, threshold: 30000, ratio: 0.176,
                   level: "ok", remaining: 24725.64 },
};

function brancher({ pulse = PULSE_CALME, affilie = { alerts: { payouts_ready: 0, payouts_ready_amount: 0 } } } = {}) {
  api.get.mockImplementation(async (url) => {
    if (url === "/admin/stats") return { data: { revenue_cad: 5274.36, total_orders: 209,
                                                 customers: 117, products: 12 } };
    if (url === "/admin/dashboard/pulse") return { data: pulse };
    if (url === "/admin/affiliates/overview") return { data: affilie };
    if (url.startsWith("/admin/analytics/enhanced")) return { data: ENHANCED };
    if (url.startsWith("/admin/analytics")) return { data: ANALYTICS };
    return { data: { items: [] } };
  });
}

const afficher = () => render(<AdminDashboard />);

beforeEach(() => {
  jest.clearAllMocks();
  brancher();
  try { localStorage.clear(); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// À faire : seulement ce qui appelle une décision
// ---------------------------------------------------------------------------

it("n affiche que les compteurs qui demandent quelque chose", async () => {
  // Avant : huit cartes en permanence, la plupart a zero. Un vrai signal se
  // noyait dans les zeros.
  brancher({ pulse: PULSE_CHARGE });
  afficher();

  expect(await screen.findByTestId("action-refunds-send")).toHaveTextContent("145,75 $");
  expect(screen.getByTestId("action-ship")).toHaveTextContent("4");
  expect(screen.getByTestId("action-reconcile")).toBeInTheDocument();
  expect(screen.getByTestId("action-tickets")).toBeInTheDocument();
  // A zero : absents de la page, pas affiches en gris.
  expect(screen.queryByTestId("action-late")).not.toBeInTheDocument();
  expect(screen.queryByTestId("action-emails")).not.toBeInTheDocument();
  expect(screen.queryByTestId("action-payouts")).not.toBeInTheDocument();
});

it("dit clairement quand il n y a rien a faire", async () => {
  // Une zone vide ne doit pas se lire comme une panne.
  afficher();
  expect(await screen.findByTestId("dashboard-calm")).toHaveTextContent("Rien à traiter");
  expect(screen.queryByTestId("dashboard-actions")).not.toBeInTheDocument();
});

it("met l argent qui doit partir avant le reste", async () => {
  brancher({ pulse: PULSE_CHARGE });
  afficher();
  await screen.findByTestId("dashboard-actions");
  const ordre = [...screen.getByTestId("dashboard-actions").children]
    .map((n) => n.getAttribute("data-testid"));
  // Un remboursement approuve est un client qui attend SON argent : il passe
  // devant une commande a expedier.
  expect(ordre.indexOf("action-refunds-send")).toBeLessThan(ordre.indexOf("action-ship"));
  expect(ordre[0]).toBe("action-refunds-send");
});

it("compte les actions a cote du titre de section", async () => {
  brancher({ pulse: PULSE_CHARGE });
  afficher();
  // Sept : remboursements à envoyer et à examiner, réconciliation, expédition,
  // stock, billets, et les paiements en attente.
  await waitFor(() => expect(screen.getByTestId("actions-count")).toHaveTextContent("7"));
});

// ---------------------------------------------------------------------------
// L'argent de la période
// ---------------------------------------------------------------------------

it("un seul chiffre regne, les autres sont secondaires", async () => {
  // Le revenu occupe le haut de page ; panier moyen, conversion et clients
  // vivent sur une ligne de filets, sans carte, donc sans se disputer l oeil.
  afficher();
  expect(await screen.findByTestId("kpi-revenue")).toHaveTextContent("420,00 $");
  expect(screen.getByTestId("kpi-aov")).toHaveTextContent("84,00 $");
  expect(screen.getByTestId("kpi-conversion")).toHaveTextContent("42.9 %");
  expect(screen.getByTestId("kpi-customers")).toHaveTextContent("3 nouveaux");
  // L ecart est ecrit a cote du grand chiffre, en texte, pas en pastille.
  const ecart = screen.getByTestId("kpi-revenue-delta");
  expect(ecart).toHaveTextContent("40");
  expect(ecart).toHaveTextContent("30 jours précédents");
});

it("la part des clients fideles est consultable, pas imposee", async () => {
  // Elle vit dans un bloc replie : on ne la regarde pas chaque matin, mais
  // elle reste a un clic. 100 + 250 de fideles sur 420 de total.
  afficher();
  await screen.findByTestId("repli-circuits");
  expect(screen.getByTestId("fidelite-fideles")).toHaveTextContent("350,00 $");
  expect(screen.getByTestId("fidelite-nouveaux")).toHaveTextContent("70,00 $");
});

it("montre ou se perdent les commandes", async () => {
  afficher();
  const entonnoir = await screen.findByTestId("funnel");
  expect(screen.getByTestId("funnel-created")).toHaveTextContent("14");
  expect(screen.getByTestId("funnel-delivered")).toHaveTextContent("3");
  // La perte entre deux marches est ecrite : c'est elle qui appelle une action.
  expect(entonnoir).toHaveTextContent("−8");
});

it("repartit l encaisse entre Interac et crypto", async () => {
  afficher();
  expect(await screen.findByTestId("rails-donut-interac")).toHaveTextContent("4 491,47 $");
  expect(screen.getByTestId("rails-donut-crypto")).toHaveTextContent("782,89 $");
});

it("dit a quelle heure les clients commandent, en heure locale", async () => {
  afficher();
  // Le sommet est ecrit en toutes lettres : c'est l'information cherchee.
  expect(await screen.findByTestId("affluence-sommet")).toHaveTextContent("jeu");
  expect(screen.getByTestId("affluence-sommet")).toHaveTextContent("20 h");
});

it("le graphique existe aussi en tableau, pour qui ne lit pas des barres", async () => {
  afficher();
  const table = await screen.findByTestId("chart-revenue-table");
  expect(table).toHaveTextContent("2026-09-18");
  expect(table).toHaveTextContent("300,00 $");
});

it("changer de periode recharge la serie ET les chiffres", async () => {
  afficher();
  await screen.findByTestId("kpi-revenue");
  fireEvent.click(screen.getByTestId("period-7"));

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/analytics?period=7"));
  expect(api.get).toHaveBeenCalledWith("/admin/analytics/enhanced?period=7");
});

it("une periode sans vente le dit, et ce n est pas une panne", async () => {
  api.get.mockImplementation(async (url) => {
    if (url === "/admin/dashboard/pulse") return { data: PULSE_CALME };
    if (url.startsWith("/admin/analytics/enhanced")) return { data: ENHANCED };
    if (url.startsWith("/admin/analytics")) return { data: { ...ANALYTICS, daily_revenue: [], top_products: [] } };
    return { data: {} };
  });
  afficher();
  expect(await screen.findByTestId("chart-revenue-empty")).toBeInTheDocument();
  expect(screen.queryByTestId("chart-revenue-error")).not.toBeInTheDocument();
});

it("une serie en erreur se distingue d une periode sans vente", async () => {
  api.get.mockImplementation(async (url) => {
    if (url === "/admin/dashboard/pulse") return { data: PULSE_CALME };
    if (url.startsWith("/admin/analytics/enhanced")) return { data: ENHANCED };
    if (url.startsWith("/admin/analytics")) throw new Error("500");
    return { data: {} };
  });
  afficher();
  expect(await screen.findByTestId("chart-revenue-error")).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Le reste de la page
// ---------------------------------------------------------------------------

it("garde les dernieres commandes et les totaux de reference", async () => {
  afficher();
  expect(await screen.findByTestId("recent-orders-table")).toHaveTextContent("FN-1");
  expect(screen.getByTestId("recent-orders-table")).toHaveTextContent("Marie Tremblay");
  const totaux = screen.getByTestId("reference-totals");
  expect(totaux).toHaveTextContent("209");
  expect(totaux).toHaveTextContent("Produits actifs");
});

it("n affiche plus le tableau des circuits de paiement", async () => {
  // Cinq colonnes de chiffres dont aucune ne declenchait de decision : le
  // detail vit dans l'ecran Reconciliation.
  afficher();
  await screen.findByTestId("recent-orders-table");
  expect(screen.queryByTestId("payment-rails")).not.toBeInTheDocument();
});

it("la densite du tableau se regle et se retient", async () => {
  // Recommandation constante des guides sur les tableaux denses : offrir le
  // choix, et s en souvenir d une visite a l autre.
  afficher();
  const bouton = await screen.findByTestId("densite");
  expect(bouton).toHaveTextContent("confortable");
  fireEvent.click(bouton);
  expect(bouton).toHaveTextContent("compacte");
  expect(localStorage.getItem("fironova_densite")).toBe("compacte");
});
