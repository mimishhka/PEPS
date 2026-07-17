import { useEffect, useMemo, useState } from "react";
import { NavLink, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Ticket, Users, Truck, Settings as Cog,
  LogOut, Download, Search, X, Plus, Edit, Trash2, FileText, CheckCircle2, AlertCircle, Clock, UserCog,
  History, FolderTree, ListTree, Mail,
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
import AdminStaff from "./sections/AdminStaff";
import AdminTrash from "./sections/AdminTrash";
import AdminAuditLog from "./sections/AdminAuditLog";
import AdminCategories from "./sections/AdminCategories";
import AdminMenus from "./sections/AdminMenus";
import AdminSubscribers from "./sections/AdminSubscribers";

// Un membre "staff" ne voit dans le menu que les sections où il a au moins
// un accès "view". Le rôle "admin" (owner) voit tout, sans exception. Cette
// liste côté UI n'est qu'un confort d'affichage — la vraie barrière reste
// le contrôle serveur (require_area) sur chaque appel API.
function hasAccess(user, area) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "staff") return (user.permissions?.[area] || "none") !== "none";
  return false;
}

export default function AdminLayout({ basePath = "/admin" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const nav = useMemo(() => {
    const all = [
      { to: basePath, label: "Dashboard", icon: LayoutDashboard, end: true, area: "dashboard" },
      { to: `${basePath}/orders`, label: "Orders", icon: ShoppingCart, area: "orders" },
      { to: `${basePath}/products`, label: "Products", icon: Package, area: "products" },
      { to: `${basePath}/coupons`, label: "Coupons", icon: Ticket, area: "coupons" },
      { to: `${basePath}/customers`, label: "Customers", icon: Users, area: "customers" },
      { to: `${basePath}/shipping`, label: "Shipping", icon: Truck, area: "shipping" },
      { to: `${basePath}/subscribers`, label: "Subscribers", icon: Mail, area: "subscribers" },
    ];
    const filtered = all.filter((n) => hasAccess(user, n.area));
    // Gestion des membres, corbeille et journal d'audit sont réservés aux
    // "admin" (owner) — actions à fort impact ou de gouvernance, jamais
    // déléguées à un staff même avec accès "manage" complet.
    if (user?.role === "admin") {
      filtered.push({ to: `${basePath}/categories`, label: "Categories", icon: FolderTree, area: "categories" });
      filtered.push({ to: `${basePath}/menus`, label: "Menus", icon: ListTree, area: "menus" });
      filtered.push({ to: `${basePath}/staff`, label: "Team", icon: UserCog, area: "staff" });
      filtered.push({ to: `${basePath}/trash`, label: "Trash", icon: Trash2, area: "trash" });
      filtered.push({ to: `${basePath}/audit-log`, label: "Activity log", icon: History, area: "audit" });
    }
    return filtered;
  }, [user, basePath]);

  // Première section accessible — sert de redirection si l'utilisateur
  // n'a pas accès au dashboard (ex. staff avec uniquement "orders").
  const landingPath = nav[0]?.to || basePath;

  return (
    <div className="min-h-screen bg-[#f7f7f7] -mt-px" data-testid="admin-shell">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-ink/10 min-h-screen sticky top-0 hidden lg:flex flex-col" data-testid="admin-sidebar">
          <div className="px-6 py-6 border-b border-ink/10">
            <div className="font-display font-extrabold text-xl tracking-tight">
              FIRONOVA<span style={{ color: "#C20114" }}>.</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mt-1">// Admin</div>
          </div>
          <nav className="flex-1 py-4">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-testid={`admin-nav-${n.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                    isActive ? "bg-ink text-white" : "text-foreground/70 hover:bg-secondary"
                  }`
                }
              >
                <n.icon size={16} strokeWidth={1.6} />
                {n.label}
              </NavLink>
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
              <LogOut size={12} /> Logout
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <div className="bg-white border-b border-ink/10 px-8 py-4 flex items-center justify-between" data-testid="admin-topbar">
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/60">
              FOR LABORATORY RESEARCH USE ONLY · 19+
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
              {new Date().toLocaleDateString("en-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
            </div>
          </div>
          <Routes>
            <Route index element={hasAccess(user, "dashboard") ? <AdminDashboard /> : <Navigate to={landingPath} replace />} />
            <Route path="orders" element={hasAccess(user, "orders") ? <AdminOrders /> : <Navigate to={landingPath} replace />} />
            <Route path="orders/:id" element={hasAccess(user, "orders") ? <AdminOrders /> : <Navigate to={landingPath} replace />} />
            <Route path="products" element={hasAccess(user, "products") ? <AdminProducts /> : <Navigate to={landingPath} replace />} />
            <Route path="coupons" element={hasAccess(user, "coupons") ? <AdminCoupons /> : <Navigate to={landingPath} replace />} />
            <Route path="customers" element={hasAccess(user, "customers") ? <AdminCustomers /> : <Navigate to={landingPath} replace />} />
            <Route path="shipping" element={hasAccess(user, "shipping") ? <AdminShipping /> : <Navigate to={landingPath} replace />} />
            <Route path="subscribers" element={hasAccess(user, "subscribers") ? <AdminSubscribers /> : <Navigate to={landingPath} replace />} />
            <Route path="categories" element={user?.role === "admin" ? <AdminCategories /> : <Navigate to={landingPath} replace />} />
            <Route path="menus" element={user?.role === "admin" ? <AdminMenus /> : <Navigate to={landingPath} replace />} />
            <Route path="staff" element={user?.role === "admin" ? <AdminStaff /> : <Navigate to={landingPath} replace />} />
            <Route path="trash" element={user?.role === "admin" ? <AdminTrash /> : <Navigate to={landingPath} replace />} />
            <Route path="audit-log" element={user?.role === "admin" ? <AdminAuditLog /> : <Navigate to={landingPath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

// Shared utilities for sections to import
export const StatusBadge = ({ status }) => {
  const map = {
    paid: { bg: "#0d9d57", color: "#fff", icon: CheckCircle2 },
    awaiting_etransfer: { bg: "#f59e0b", color: "#fff", icon: Clock },
    awaiting_crypto: { bg: "#f59e0b", color: "#fff", icon: Clock },
    refunded: { bg: "#6b7280", color: "#fff", icon: AlertCircle },
    pending: { bg: "#f3f4f6", color: "#111", icon: Clock },
    processing: { bg: "#3b82f6", color: "#fff", icon: Package },
    shipped: { bg: "#7c3aed", color: "#fff", icon: Truck },
    delivered: { bg: "#10b981", color: "#fff", icon: CheckCircle2 },
    cancelled: { bg: "#ef4444", color: "#fff", icon: X },
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
      {status?.replace(/_/g, " ")}
    </span>
  );
};

export { useAdminApi } from "./hooks";
