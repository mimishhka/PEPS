import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Ticket, Users, Truck, Settings as Cog,
  LogOut, Download, Search, X, Plus, Edit, Trash2, FileText, CheckCircle2, AlertCircle, Clock, UserCog,
  History, FolderTree, ListTree, Mail, Handshake, Globe,
  CalendarCheck, Send, Boxes, LayoutGrid, DollarSign, Inbox,
  Link2, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useLang } from "../../contexts/LanguageContext";

import AdminDashboard from "./sections/AdminDashboard";
import AdminOrders from "./sections/AdminOrders";
import AdminProducts from "./sections/AdminProducts";
import AdminCoupons from "./sections/AdminCoupons";
import AdminCustomers from "./sections/AdminCustomers";
import AdminShipping from "./sections/AdminShipping";
import AdminFulfillment from "./sections/AdminFulfillment";
import AdminDispatch from "./sections/AdminDispatch";
import AdminBoxes from "./sections/AdminBoxes";
import AdminStaff from "./sections/AdminStaff";
import AdminTrash from "./sections/AdminTrash";
import AdminAuditLog from "./sections/AdminAuditLog";
import AdminSeo from "./sections/AdminSeo";
import AdminEmails from "./sections/AdminEmails";
import AdminEmailOutbox from "./sections/AdminEmailOutbox";
import AdminCategories from "./sections/AdminCategories";
import AdminMenus from "./sections/AdminMenus";
import AdminSubscribers from "./sections/AdminSubscribers";
import AdminAffiliates from "./sections/AdminAffiliates";
import AdminPayouts from "./sections/AdminPayouts";
import AdminTickets from "./sections/AdminTickets";
import ThemeToggle from "../../components/ThemeToggle";
import AdminReconciliation from "./sections/AdminReconciliation";
import AdminCheckoutFailures from "./sections/AdminCheckoutFailures";
import AdminRefunds from "./sections/AdminRefunds";

function hasAccess(user, area) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "staff") return (user.permissions?.[area] || "none") !== "none";
  return false;
}

export default function AdminLayout({ basePath = "/admin" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLang();
  const L = useCallback((fr, en) => (lang === "fr" ? fr : en), [lang]);
  const [signals, setSignals] = useState(null);
  useEffect(() => {
    let alive = true;
    const pull = () => api.get("/admin/ops/signals")
      .then((r) => { if (alive) setSignals(r.data); })
      .catch(() => {});
    pull();
    const t = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Pastille "stock faible" sur Produits. Endpoint distinct de ops/signals car
  // il est protégé par products:view — un 403 laisse simplement la pastille à 0.
  const [lowStock, setLowStock] = useState(0);
  const canSeeProducts = hasAccess(user, "products");
  useEffect(() => {
    if (!canSeeProducts) { setLowStock(0); return undefined; }
    let alive = true;
    const pull = () => api.get("/admin/low-stock-alerts")
      .then((r) => { if (alive) setLowStock(r.data?.count || 0); })
      .catch(() => {});
    pull();
    const t = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [canSeeProducts]);

  // Navigation groupée par intention de travail. Chaque item conserve son
  // "area" pour le filtrage de permissions ; les groupes vides sont masqués.
  const navGroups = useMemo(() => {
    const groups = [
      {
        id: "sales",
        label: L("VENTES", "SALES"),
        items: [
          { to: basePath, label: L("Tableau de bord", "Dashboard"), icon: LayoutDashboard, end: true, area: "dashboard" },
          { to: `${basePath}/orders`, label: L("Commandes", "Orders"), icon: ShoppingCart, area: "orders" },
          { to: `${basePath}/reconciliation`, label: L("Réconciliation", "Reconciliation"), icon: Link2, area: "orders" },
          { to: `${basePath}/reconciliation/checkout`, label: L("↳ Checkout failures", "↳ Checkout failures"), icon: Link2, area: "orders" },
          { to: `${basePath}/refunds`, label: L("Remboursements", "Refunds"), icon: Link2, area: "orders" },
          { to: `${basePath}/customers`, label: L("Clients", "Customers"), icon: Users, area: "customers" },
          { to: `${basePath}/coupons`, label: L("Coupons", "Coupons"), icon: Ticket, area: "coupons" },
        ],
      },
      {
        id: "catalog",
        label: L("CATALOGUE", "CATALOG"),
        items: [
          { to: `${basePath}/products`, label: L("Produits", "Products"), icon: Package, area: "products", badge: lowStock, testid: "admin-nav-products" },
          { to: `${basePath}/categories`, label: L("Catégories", "Categories"), icon: FolderTree, area: "categories" },
          { to: `${basePath}/menus`, label: L("Menus", "Menus"), icon: ListTree, area: "menus" },
        ],
      },
      {
        id: "fulfillment",
        label: L("EXPÉDITION", "FULFILLMENT"),
        items: [
          { to: `${basePath}/fulfillment`, label: L("Journée", "Today"), icon: CalendarCheck, area: "orders", signal: "fulfillment" },
          { to: `${basePath}/dispatch`, label: L("Dispatch", "Dispatch"), icon: Send, area: "orders", signal: "dispatch" },
          { to: `${basePath}/shipping`, label: L("Expédition", "Shipping"), icon: Truck, area: "shipping" },
          { to: `${basePath}/boxes`, label: L("Contenants", "Packaging"), icon: Boxes, area: "shipping" },
        ],
      },
      {
        id: "growth",
        label: L("CROISSANCE", "GROWTH"),
        items: [
          { to: `${basePath}/affiliates`, label: L("Affiliés", "Affiliates"), icon: Handshake, area: "affiliates" },
          { to: `${basePath}/payouts`, label: L("Paiements", "Payouts"), icon: DollarSign, area: "affiliates" },
    { to: `${basePath}/tickets`, label: L("Billets", "Tickets"), icon: MessageSquare, area: "affiliates" },
          { to: `${basePath}/subscribers`, label: L("Abonnés", "Subscribers"), icon: Mail, area: "subscribers" },
        ],
      },
      {
        id: "system",
        label: L("SYSTÈME", "SYSTEM"),
        items: [
          { to: `${basePath}/staff`, label: L("Équipe", "Team"), icon: UserCog, area: "staff" },
          { to: `${basePath}/audit-log`, label: L("Journal", "Activity log"), icon: History, area: "audit" },
          { to: `${basePath}/seo`, label: L("SEO", "SEO"), icon: Globe, area: "seo" },
          { to: `${basePath}/emails`, label: L("Emails", "Emails"), icon: Mail, area: "emails", end: true },
          { to: `${basePath}/emails/outbox`, label: L("File d'attente", "Outbox"), icon: Inbox, area: "orders", testid: "admin-nav-emails-outbox" },
          { to: `${basePath}/trash`, label: L("Corbeille", "Trash"), icon: Trash2, area: "trash" },
        ],
      },
    ];
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((n) =>
          (n.adminOnly ? user?.role === "admin" : true) && hasAccess(user, n.area)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [user, basePath, L, lowStock]);

  const landingPath = navGroups[0]?.items[0]?.to || basePath;

  return (
    <div className="min-h-screen bg-clinical" data-testid="admin-shell">
      <div className="flex">
        <aside className="w-60 bg-card border-r border-ash/60 min-h-screen sticky top-0 hidden lg:flex flex-col" data-testid="admin-sidebar">
          <div className="px-6 py-6 border-b border-ash/60">
            <div className="font-display font-bold text-xl tracking-tight text-nordfjord">
              FIRONOVA<span style={{ color: "#00B8D4" }}>.</span>
            </div>
            <div className="font-data text-[10px] tracking-[0.2em] text-glacier mt-1">Administration</div>
          </div>
          <nav className="flex-1 py-3 overflow-y-auto">
            {navGroups.map((group, gi) => (
              <div key={group.id} className={gi > 0 ? "mt-2" : ""}>
                <div className="px-6 pt-4 pb-1.5 font-data text-[10px] font-medium tracking-[0.14em] text-glacier/70">
                  {group.label}
                </div>
                {group.items.map((n) => {
                  const signalBadge = n.signal && signals && signals[n.signal] > 0 ? signals[n.signal] : null;
                  const badge = signalBadge ?? (n.badge > 0 ? n.badge : null);
                  return (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      data-testid={n.testid || `admin-nav-${n.label.toLowerCase()}`}
                      className={({ isActive }) =>
                        `flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? "bg-nova/15 text-nordfjord font-medium"
                            : "text-glacier hover:bg-clinical hover:text-nordfjord"
                        }`
                      }
                    >
                      <n.icon size={16} strokeWidth={1.75} />
                      <span className="flex-1">{n.label}</span>
                      {badge && (
                        <span
                          className="bg-error text-white font-data text-[10px] min-w-[18px] h-[18px] grid place-items-center px-1 rounded-full"
                          data-testid={n.signal ? `nav-badge-${n.signal}` : "sidebar-low-stock-badge"}
                        >
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="border-t border-ash/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-data text-[11px] text-glacier truncate">
                {user?.email}
              </div>
              <ThemeToggle />
            </div>
            <button
              onClick={() => { logout(); navigate("/"); }}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-ash py-2 text-xs font-medium text-glacier hover:bg-clinical hover:text-nordfjord transition-colors"
              data-testid="admin-logout"
            >
              <LogOut size={14} /> {L("Déconnexion", "Logout")}
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="bg-card border-b border-ash/60 px-8 py-4 flex items-center justify-between" data-testid="admin-topbar">
            <div className="font-data text-[11px] tracking-[0.14em] text-compliance">
              {L("Usage en laboratoire uniquement · 19+", "For laboratory research use only · 19+")}
            </div>
            <div className="font-data text-[11px] text-glacier">
              {new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
          </div>
          {signals && signals.pending_manifest > 0 && !location.pathname.includes("/dispatch") && (
            <div className="bg-warning/10 border-b border-warning/30 text-nordfjord px-8 py-3 font-data text-xs flex items-center justify-between gap-3" data-testid="manifest-alert">
              <span className="flex items-center gap-2">
                <AlertCircle size={14} className="text-warning" />
                {L(
                  `${signals.pending_manifest} étiquette(s) non transmise(s) — surcharge de 2 $/article tant que le manifeste n'est pas envoyé.`,
                  `${signals.pending_manifest} label(s) not transmitted — $2/item surcharge until the manifest is sent.`
                )}
              </span>
              <NavLink to={`${basePath}/dispatch`} className="underline whitespace-nowrap hover:opacity-70">
                {L("Aller au Dispatch", "Go to Dispatch")} →
              </NavLink>
            </div>
          )}
          <Routes>
            <Route index element={hasAccess(user, "dashboard") ? <AdminDashboard /> : <Navigate to={landingPath} replace />} />
            <Route path="orders" element={hasAccess(user, "orders") ? <AdminOrders /> : <Navigate to={landingPath} replace />} />
            <Route path="orders/:id" element={hasAccess(user, "orders") ? <AdminOrders /> : <Navigate to={landingPath} replace />} />
            <Route path="reconciliation" element={hasAccess(user, "orders") ? <AdminReconciliation /> : <Navigate to={landingPath} replace />} />
            <Route path="reconciliation/checkout" element={hasAccess(user, "orders") ? <AdminCheckoutFailures /> : <Navigate to={landingPath} replace />} />
            <Route path="refunds" element={hasAccess(user, "orders") ? <AdminRefunds /> : <Navigate to={landingPath} replace />} />
            <Route path="products" element={hasAccess(user, "products") ? <AdminProducts /> : <Navigate to={landingPath} replace />} />
            <Route path="coupons" element={hasAccess(user, "coupons") ? <AdminCoupons /> : <Navigate to={landingPath} replace />} />
            <Route path="customers" element={hasAccess(user, "customers") ? <AdminCustomers /> : <Navigate to={landingPath} replace />} />
            <Route path="shipping" element={hasAccess(user, "shipping") ? <AdminShipping /> : <Navigate to={landingPath} replace />} />
            <Route path="fulfillment" element={hasAccess(user, "orders") ? <AdminFulfillment /> : <Navigate to={landingPath} replace />} />
            <Route path="dispatch" element={hasAccess(user, "orders") ? <AdminDispatch /> : <Navigate to={landingPath} replace />} />
            <Route path="boxes" element={hasAccess(user, "shipping") ? <AdminBoxes /> : <Navigate to={landingPath} replace />} />
            <Route path="subscribers" element={hasAccess(user, "subscribers") ? <AdminSubscribers /> : <Navigate to={landingPath} replace />} />
            <Route path="categories" element={hasAccess(user, "categories") ? <AdminCategories /> : <Navigate to={landingPath} replace />} />
            <Route path="menus" element={hasAccess(user, "menus") ? <AdminMenus /> : <Navigate to={landingPath} replace />} />
            <Route path="affiliates" element={hasAccess(user, "affiliates") ? <AdminAffiliates /> : <Navigate to={landingPath} replace />} />
            <Route path="payouts" element={hasAccess(user, "affiliates") ? <AdminPayouts /> : <Navigate to={landingPath} replace />} />
            <Route path="tickets" element={hasAccess(user, "affiliates") ? <AdminTickets /> : <Navigate to={landingPath} replace />} />
            <Route path="staff" element={hasAccess(user, "staff") ? <AdminStaff /> : <Navigate to={landingPath} replace />} />
            <Route path="trash" element={hasAccess(user, "trash") ? <AdminTrash /> : <Navigate to={landingPath} replace />} />
            <Route path="audit-log" element={hasAccess(user, "audit") ? <AdminAuditLog /> : <Navigate to={landingPath} replace />} />
            <Route path="seo" element={hasAccess(user, "seo") ? <AdminSeo /> : <Navigate to={landingPath} replace />} />
            <Route path="emails" element={hasAccess(user, "emails") ? <AdminEmails /> : <Navigate to={landingPath} replace />} />
            <Route path="emails/outbox" element={hasAccess(user, "orders") ? <AdminEmailOutbox /> : <Navigate to={landingPath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export const STATUS_LABELS = {
  paid: { fr: "Payé", en: "Paid" },
  awaiting_etransfer: { fr: "Attente virement", en: "Awaiting e-Transfer" },
  awaiting_crypto: { fr: "Attente crypto", en: "Awaiting crypto" },
  refunded: { fr: "Remboursé", en: "Refunded" },
  pending: { fr: "En attente", en: "Pending" },
  preorder: { fr: "Précommande", en: "Pre-order" },
  processing: { fr: "En traitement", en: "Processing" },
  packing: { fr: "Emballage", en: "Packing" },
  packed: { fr: "Emballé", en: "Packed" },
  shipped: { fr: "Expédié", en: "Shipped" },
  delivered: { fr: "Livré", en: "Delivered" },
  cancelled: { fr: "Annulé", en: "Cancelled" },
  failed: { fr: "Échoué", en: "Failed" },
};

export const statusLabel = (status, lang) => {
  const m = STATUS_LABELS[status];
  if (!m) return (status || "").replace(/_/g, " ");
  return lang === "fr" ? m.fr : m.en;
};

export const StatusBadge = ({ status, lang }) => {
  // Ton unique pour la signalisation : la couleur signale une exception,
  // jamais l'ordinaire. Une seule paire fond/texte porte le sens ; plus aucun
  // hex saturé étranger à la palette. Les états "au repos" (pending,
  // awaiting_*, refunded) empruntent le neutre `compliance`, réservé par
  // l'identité aux mentions calmes et officielles.
  const tone = {
    paid: "success",
    delivered: "success",
    cancelled: "error",
    failed: "error",
    pending: "compliance",
    awaiting_etransfer: "compliance",
    awaiting_crypto: "compliance",
    refunded: "compliance",
    processing: "nova",
    packing: "nova",
    packed: "nova",
    shipped: "nova",
    preorder: "warning",
  }[status] || "compliance";

  const iconFor = {
    paid: CheckCircle2,
    delivered: CheckCircle2,
    packing: Package,
    packed: CheckCircle2,
    shipped: Truck,
    failed: X,
    cancelled: X,
  };
  const Icon = iconFor[status] || Clock;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
        tone === "success" ? "bg-success/15 text-success" :
        tone === "error" ? "bg-error/15 text-error" :
        tone === "warning" ? "bg-warning/20 text-warning" :
        tone === "nova" ? "bg-nova/15 text-nordfjord" :
        "bg-compliance/15 text-compliance"
      }`}
      data-testid={`status-${status}`}
    >
      <Icon size={12} strokeWidth={2} />
      {statusLabel(status, lang)}
    </span>
  );
};

export { useAdminApi } from "./hooks";
