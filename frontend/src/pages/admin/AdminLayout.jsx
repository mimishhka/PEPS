import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Ticket, Users, Truck, Settings as Cog,
  LogOut, Download, Search, X, Plus, Edit, Trash2, FileText, CheckCircle2, AlertCircle, Clock, UserCog,
  History, FolderTree, ListTree, Mail, Handshake, Globe,
  CalendarCheck, Send, Boxes, LayoutGrid, DollarSign, Inbox,
  Link2,
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
    <div className="min-h-screen bg-[#f7f7f7] -mt-px" data-testid="admin-shell">
      <div className="flex">
        <aside className="w-60 bg-white border-r border-ink/10 min-h-screen sticky top-0 hidden lg:flex flex-col" data-testid="admin-sidebar">
          <div className="px-6 py-6 border-b border-ink/10">
            <div className="font-display font-extrabold text-xl tracking-tight">
              FIRONOVA<span style={{ color: "#00B8D4" }}>.</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mt-1">// Admin</div>
          </div>
          <nav className="flex-1 py-3 overflow-y-auto">
            {navGroups.map((group, gi) => (
              <div key={group.id} className={gi > 0 ? "mt-1" : ""}>
                <div className="px-6 pt-4 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/40">
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
                        `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                          isActive
                            ? "bg-ink text-white font-medium"
                            : "text-foreground/70 hover:bg-secondary"
                        }`
                      }
                    >
                      <n.icon size={16} strokeWidth={1.6} />
                      <span className="flex-1">{n.label}</span>
                      {badge && (
                        <span
                          className="bg-red-600 text-white font-mono text-[10px] px-1.5 py-0.5 rounded-full"
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
          <div className="border-t border-ink/10 p-4 space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
              {user?.email}
            </div>
            <button
              onClick={() => { logout(); navigate("/"); }}
              className="w-full flex items-center justify-center gap-2 border border-ink py-2 text-xs font-mono uppercase tracking-[0.2em] hover:bg-ink hover:text-white"
              data-testid="admin-logout"
            >
              <LogOut size={12} /> {L("Déconnexion", "Logout")}
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="bg-white border-b border-ink/10 px-8 py-4 flex items-center justify-between" data-testid="admin-topbar">
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/60">
              {L("USAGE EN LABORATOIRE UNIQUEMENT · 19+", "FOR LABORATORY RESEARCH USE ONLY · 19+")}
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
              {new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
          </div>
          {signals && signals.pending_manifest > 0 && !location.pathname.includes("/dispatch") && (
            <div className="bg-red-50 border-b border-red-300 text-red-900 px-8 py-3 font-mono text-xs flex items-center justify-between gap-3" data-testid="manifest-alert">
              <span className="flex items-center gap-2">
                <AlertCircle size={14} />
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
  const map = {
    paid: { bg: "#0d9d57", color: "#fff", icon: CheckCircle2 },
    awaiting_etransfer: { bg: "#f59e0b", color: "#fff", icon: Clock },
    awaiting_crypto: { bg: "#f59e0b", color: "#fff", icon: Clock },
    refunded: { bg: "#6b7280", color: "#fff", icon: AlertCircle },
    pending: { bg: "#f3f4f6", color: "#111", icon: Clock },
    processing: { bg: "#3b82f6", color: "#fff", icon: Package },
    packing: { bg: "#6366f1", color: "#fff", icon: Package },
    packed: { bg: "#8b5cf6", color: "#fff", icon: CheckCircle2 },
    shipped: { bg: "#7c3aed", color: "#fff", icon: Truck },
    delivered: { bg: "#10b981", color: "#fff", icon: CheckCircle2 },
    cancelled: { bg: "#ef4444", color: "#fff", icon: X },
    failed: { bg: "#ef4444", color: "#fff", icon: X },
    preorder: { bg: "#f97316", color: "#fff", icon: Clock },
  };
  const conf = map[status] || { bg: "#f3f4f6", color: "#111", icon: Clock };
  const Icon = conf.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em]"
      style={{ background: conf.bg, color: conf.color }}
      data-testid={`status-${status}`}
    >
      <Icon size={11} strokeWidth={2} />
      {statusLabel(status, lang)}
    </span>
  );
};

export { useAdminApi } from "./hooks";
