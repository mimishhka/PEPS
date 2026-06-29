import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingCart, Package, Users, DollarSign, AlertTriangle, TrendingUp, ArrowUpRight,
} from "lucide-react";
import api from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/admin/analytics").then((r) => setAnalytics(r.data)).catch(() => {});
  }, []);

  const cards = stats ? [
    { k: "Revenue", v: `$${stats.revenue_cad.toFixed(2)}`, sub: "CAD · paid orders", icon: DollarSign, accent: "#0d9d57" },
    { k: "Orders", v: stats.total_orders, sub: `${stats.pending_orders} pending`, icon: ShoppingCart, accent: "#3b82f6" },
    { k: "Customers", v: stats.customers, sub: "Registered", icon: Users, accent: "#7c3aed" },
    { k: "Products", v: stats.products, sub: `${stats.low_stock || 0} low stock`, icon: Package, accent: "#f59e0b" },
  ] : [];

  // Build a tiny sparkline-style daily bar list
  const dailyMax = analytics?.daily_revenue?.length
    ? Math.max(...analytics.daily_revenue.map(d => d.revenue), 1)
    : 1;

  return (
    <div className="p-8" data-testid="admin-dashboard">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// OVERVIEW</div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Dashboard</h1>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
          Real-time · CAD
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.k} className="bg-white border border-ink/10 p-6" data-testid={`stat-${c.k.toLowerCase()}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">{c.k}</div>
                <div className="font-display text-3xl font-extrabold mt-2 tabular-nums">{c.v}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mt-1">{c.sub}</div>
              </div>
              <div className="w-10 h-10 flex items-center justify-center text-white" style={{ background: c.accent }}>
                <c.icon size={18} strokeWidth={1.6} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts & top products */}
      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2 bg-white border border-ink/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">// LAST 30 DAYS</div>
              <h2 className="font-display text-xl font-bold uppercase tracking-tight mt-1">Revenue</h2>
            </div>
            <TrendingUp size={18} strokeWidth={1.5} />
          </div>
          <div className="h-48 flex items-end gap-1" data-testid="chart-revenue">
            {(analytics?.daily_revenue || []).map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full bg-ink hover:bg-signal transition-colors relative"
                  style={{ height: `${Math.max(2, (d.revenue / dailyMax) * 100)}%`, "--signal": "#E51919" }}
                  title={`${d.date}: $${d.revenue.toFixed(2)} (${d.orders} orders)`}
                >
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 font-mono text-[10px] bg-ink text-white px-2 py-1 whitespace-nowrap pointer-events-none transition-opacity">
                    ${d.revenue.toFixed(0)}
                  </div>
                </div>
              </div>
            ))}
            {!analytics?.daily_revenue?.length && (
              <div className="flex-1 text-center font-mono text-xs text-foreground/50 self-center">
                No paid orders in the last 30 days
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-ink/10 p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">// BEST SELLERS</div>
          <h2 className="font-display text-xl font-bold uppercase tracking-tight mt-1 mb-4">Top Products</h2>
          <ul className="divide-y divide-ink/10" data-testid="top-products">
            {(analytics?.top_products || []).slice(0, 6).map((p, idx) => (
              <li key={p.slug} className="py-2.5 flex items-center gap-3">
                <span className="font-mono text-[10px] text-foreground/50 w-5">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{p.name_en}</div>
                  <div className="font-mono text-[10px] text-foreground/50">{p.units_sold} units</div>
                </div>
                <div className="font-bold tabular-nums">${p.revenue.toFixed(2)}</div>
              </li>
            ))}
            {!analytics?.top_products?.length && (
              <li className="py-4 font-mono text-xs text-foreground/50 text-center">No sales yet</li>
            )}
          </ul>
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-white border border-ink/10">
        <div className="flex items-center justify-between p-6 border-b border-ink/10">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">// RECENT</div>
            <h2 className="font-display text-xl font-bold uppercase tracking-tight mt-1">Latest Orders</h2>
          </div>
          <Link to="/admin/orders" className="font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-1 link-underline">
            View all <ArrowUpRight size={14} />
          </Link>
        </div>
        <table className="w-full text-sm" data-testid="recent-orders-table">
          <thead className="bg-secondary text-foreground/70">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Order</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Customer</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Payment</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Fulfillment</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]">Total</th>
            </tr>
          </thead>
          <tbody>
            {(analytics?.recent_orders || []).slice(0, 8).map((o) => (
              <tr key={o.id} className="border-t border-ink/5 hover:bg-secondary/50">
                <td className="px-6 py-3">
                  <Link to={`/admin/orders`} className="font-mono font-bold text-xs link-underline">{o.order_number}</Link>
                  <div className="font-mono text-[10px] text-foreground/50">{(o.created_at || "").slice(0, 16).replace("T", " ")}</div>
                </td>
                <td className="px-6 py-3">
                  <div className="text-sm">{o.shipping_address?.full_name || o.email || "—"}</div>
                  <div className="font-mono text-[10px] text-foreground/50">{o.email}</div>
                </td>
                <td className="px-6 py-3"><StatusBadge status={o.payment_status} /></td>
                <td className="px-6 py-3"><StatusBadge status={o.fulfillment_status} /></td>
                <td className="px-6 py-3 text-right font-bold tabular-nums">${o.total?.toFixed(2)}</td>
              </tr>
            ))}
            {!analytics?.recent_orders?.length && (
              <tr><td colSpan={5} className="px-6 py-8 text-center font-mono text-xs text-foreground/50">No orders yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
