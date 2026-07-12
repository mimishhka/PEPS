import { useEffect, useMemo, useState } from "react";
import { NavLink, Routes, Route, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Ticket, Users, Truck, Settings as Cog,
  LogOut, Download, Search, X, Plus, Edit, Trash2, FileText, CheckCircle2, AlertCircle, Clock,
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

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
    { to: "/admin/products", label: "Products", icon: Package },
    { to: "/admin/coupons", label: "Coupons", icon: Ticket },
    { to: "/admin/customers", label: "Customers", icon: Users },
    { to: "/admin/shipping", label: "Shipping", icon: Truck },
  ];

  return (
    <div className="min-h-screen bg-[#f7f7f7] -mt-px" data-testid="admin-shell">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-ink/10 min-h-screen sticky top-0 hidden lg:flex flex-col" data-testid="admin-sidebar">
          <div className="px-6 py-6 border-b border-ink/10">
            <div className="font-display font-extrabold text-xl tracking-tight">
              FIRONOVA<span style={{ color: "#E51919" }}>.</span>
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
            <Route index element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:id" element={<AdminOrders />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="coupons" element={<AdminCoupons />} />
            <Route path="customers" element={<AdminCustomers />} />
            <Route path="shipping" element={<AdminShipping />} />
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
