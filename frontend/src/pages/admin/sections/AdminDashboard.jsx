import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingCart, Package, Users, DollarSign, AlertTriangle, TrendingUp, TrendingDown, ArrowUpRight, Repeat, Percent,
} from "lucide-react";
import api from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";
import { useLang } from "../../../contexts/LanguageContext";
import { DashboardSkeleton } from "../../../components/LoadingSkeletons";
import { LowStockCard } from "./dashboard/LowStockCard";

export default function AdminDashboard() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [enhanced, setEnhanced] = useState(null);
  const [period, setPeriod] = useState(30);
  const [initialLoading, setInitialLoading] = useState(true);
  // allSettled avalait les echecs : un 500 sur /admin/analytics produisait le
  // meme ecran vide que « aucune vente ». Une boite vide ne doit jamais etre
  // ambigue entre « pas de donnees » et « c'est casse ».
  const [analyticsError, setAnalyticsError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.get("/admin/stats").then((r) => { if (active) setStats(r.data); }),
      api.get("/admin/analytics")
        .then((r) => { if (active) { setAnalytics(r.data); setAnalyticsError(false); } })
        .catch(() => { if (active) setAnalyticsError(true); }),
    ]).finally(() => { if (active) setInitialLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    api.get(`/admin/analytics/enhanced?period=${period}`).then((r) => setEnhanced(r.data)).catch(() => {});
  }, [period]);

  const cards = stats ? [
    { k: L("Revenu", "Revenue"), tid: "revenue", v: `${stats.revenue_cad.toFixed(2)} $`, sub: L("CAD · commandes payées", "CAD · paid orders"), icon: DollarSign, accent: "#2E9E6B" },
    { k: L("Commandes", "Orders"), tid: "orders", v: stats.total_orders, sub: L(`${stats.pending_orders} en attente`, `${stats.pending_orders} pending`), icon: ShoppingCart, accent: "#0B2E4F" },
    { k: L("Clients", "Customers"), tid: "customers", v: stats.customers, sub: L("Inscrits", "Registered"), icon: Users, accent: "#00B8D4" },
    { k: L("Produits", "Products"), tid: "products", v: stats.products, sub: L(`${stats.low_stock || 0} stock faible`, `${stats.low_stock || 0} low stock`), icon: Package, accent: "#E8A33D" },
  ] : [];

  const dailyMax = analytics?.daily_revenue?.length
    ? Math.max(...analytics.daily_revenue.map(d => d.revenue), 1)
    : 1;

  if (initialLoading) return <DashboardSkeleton />;

  return (
    <div className="p-8" data-testid="admin-dashboard">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="font-data text-[11px] uppercase tracking-[0.3em] text-nova">// {L("APERÇU", "OVERVIEW")}</div>
          <h1 className="font-display text-4xl font-bold tracking-[-0.01em] mt-2 text-nordfjord">{L("Tableau de bord", "Dashboard")}</h1>
        </div>
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">
          {L("Temps réel · CAD", "Real-time · CAD")}
        </div>
      </div>

      {/* Alerte seuil de taxe (30k CAD sur 12 mois glissants) */}
      {enhanced?.tax_threshold && enhanced.tax_threshold.level !== "ok" && (
        <div className={`mb-6 rounded-xl border p-4 flex items-start gap-3 ${
          enhanced.tax_threshold.level === "exceeded"
            ? "border-error/40 bg-error/5" : "border-warning/40 bg-warning/5"}`} data-testid="tax-alert">
          <AlertTriangle size={18} className={enhanced.tax_threshold.level === "exceeded" ? "text-error mt-0.5" : "text-warning mt-0.5"} />
          <div>
            <p className="font-medium text-sm text-nordfjord">
              {enhanced.tax_threshold.level === "exceeded"
                ? L("Seuil de taxe dépassé", "Tax threshold exceeded")
                : L("Vous approchez du seuil de taxe", "Approaching tax threshold")}
            </p>
            <p className="text-sm text-glacier mt-0.5">
              {L("CA sur 12 mois glissants : ", "Rolling 12-month revenue: ")}
              <strong>{enhanced.tax_threshold.rolling_12mo_revenue.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")} $</strong> / {enhanced.tax_threshold.threshold.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")} $.
              {enhanced.tax_threshold.level === "exceeded"
                ? L(" Vous devez vous inscrire à la TPS/TVQ et percevoir les taxes. Consultez votre comptable.",
                    " You must register for GST/QST and collect taxes. Consult your accountant.")
                : L(` Il reste ${enhanced.tax_threshold.remaining.toLocaleString("fr-CA")} $ avant le seuil de 30 000 $. Préparez l'inscription TPS/TVQ.`,
                    ` ${enhanced.tax_threshold.remaining.toLocaleString("en-CA")} $ remaining before the $30,000 threshold. Prepare your GST/QST registration.`)}
            </p>
          </div>
        </div>
      )}

      {/* Sélecteur de période */}
      <div className="flex items-center gap-2 mb-6">
        <span className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier">{L("Période", "Period")}</span>
        {[7, 30, 90].map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              period === p ? "bg-nordfjord text-white" : "border border-ash text-glacier hover:bg-clinical"}`}
            data-testid={`period-${p}`}>
            {p}{L("j", "d")}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.tid} className="bg-white border border-ash p-6 rounded-md" data-testid={`stat-${c.tid}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">{c.k}</div>
                <div className="font-display text-3xl font-bold mt-2 tabular-nums text-nordfjord">{c.v}</div>
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mt-1">{c.sub}</div>
              </div>
              <div className="w-10 h-10 flex items-center justify-center text-white rounded-md" style={{ background: c.accent }}>
                <c.icon size={18} strokeWidth={1.6} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Métriques de pilotage (période sélectionnée, avec comparaison) */}
      {enhanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-testid="enhanced-metrics">
          <DeltaCard label={L(`Revenu ${period}j`, `Revenue ${period}d`)} value={`${enhanced.current.revenue.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")} $`}
            delta={enhanced.changes.revenue} icon={DollarSign} lang={lang} />
          <DeltaCard label={L("Panier moyen", "Avg. order value")} value={`${enhanced.current.aov.toFixed(2)} $`}
            delta={enhanced.changes.aov} icon={TrendingUp} lang={lang} />
          <MetricCard label={L("Taux de conversion", "Conversion rate")}
            value={enhanced.conversion.conversion_rate != null ? `${enhanced.conversion.conversion_rate}%` : "—"}
            sub={L(`${enhanced.conversion.orders_paid}/${enhanced.conversion.orders_created} · ${enhanced.conversion.orders_abandoned} abandon.`,
                   `${enhanced.conversion.orders_paid}/${enhanced.conversion.orders_created} · ${enhanced.conversion.orders_abandoned} abandoned`)}
            icon={Percent} />
          <MetricCard label={L("Clients", "Customers")}
            value={`${enhanced.customers.new} + ${enhanced.customers.returning}`}
            sub={L(`nouveaux + fidèles (${enhanced.customers.total_active} actifs)`,
                   `new + returning (${enhanced.customers.total_active} active)`)}
            icon={Repeat} />
        </div>
      )}

      {/* Charts & top products */}
      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2 bg-white border border-ash p-6 rounded-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">// {L("30 DERNIERS JOURS", "LAST 30 DAYS")}</div>
              <h2 className="font-display text-xl font-bold tracking-tight mt-1 text-nordfjord">{L("Revenu", "Revenue")}</h2>
            </div>
            <TrendingUp size={18} strokeWidth={1.5} className="text-nova" />
          </div>
          <div className="h-48 flex items-end gap-1" data-testid="chart-revenue">
            {(analytics?.daily_revenue || []).map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full bg-nordfjord hover:bg-nova transition-colors relative"
                  style={{ height: `${Math.max(2, (d.revenue / dailyMax) * 100)}%` }}
                  title={`${d.date}: ${d.revenue.toFixed(2)} $ (${d.orders} ${L("commandes", "orders")})`}
                >
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 font-data text-[10px] bg-nordfjord text-white px-2 py-1 whitespace-nowrap pointer-events-none transition-opacity rounded">
                    {d.revenue.toFixed(0)} $
                  </div>
                </div>
              </div>
            ))}
            {!analytics?.daily_revenue?.length && (
              <div className="flex-1 text-center self-center px-4">
                {analyticsError ? (
                  <>
                    <p className="font-data text-xs text-error" data-testid="chart-revenue-error">
                      {L("Impossible de charger les revenus.", "Could not load revenue data.")}
                    </p>
                    <p className="font-data text-[10px] text-glacier mt-1">
                      {L("Les autres chiffres de cette page peuvent être incomplets.",
                         "Other figures on this page may be incomplete.")}
                    </p>
                  </>
                ) : (
                  <p className="font-data text-xs text-glacier" data-testid="chart-revenue-empty">
                    {L("Aucune commande payée sur les 30 derniers jours",
                       "No paid orders in the last 30 days")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
        <LowStockCard />

        <div className="bg-white border border-ash p-6 rounded-md">
          <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">// {L("MEILLEURES VENTES", "BEST SELLERS")}</div>
          <h2 className="font-display text-xl font-bold tracking-tight mt-1 mb-4 text-nordfjord">{L("Top produits", "Top Products")}</h2>
          <ul className="divide-y divide-ash/60" data-testid="top-products">
            {(analytics?.top_products || []).slice(0, 6).map((p, idx) => (
              // La cle inclut la variante : deux dosages du meme compose sont
              // deux lignes distinctes, et p.slug seul les ferait entrer en
              // collision (React n'en afficherait qu'une).
              <li key={`${p.slug}-${p.variant_name || "root"}`} className="py-2.5 flex items-center gap-3">
                <span className="font-data text-[10px] text-glacier w-5">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate text-nordfjord">
                    {lang === "fr" ? (p.name_fr || p.name_en) : (p.name_en || p.name_fr)}
                    {p.variant_name && (
                      <span className="font-data text-[11px] text-nova font-semibold"> · {p.variant_name}</span>
                    )}
                  </div>
                  <div className="font-data text-[10px] text-glacier">{p.units_sold} {L("unités", "units")}</div>
                </div>
                <div className="font-bold tabular-nums text-nordfjord">{p.revenue.toFixed(2)} $</div>
              </li>
            ))}
            {!analytics?.top_products?.length && (
              <li className="py-4 font-data text-xs text-glacier text-center">{L("Aucune vente pour l'instant", "No sales yet")}</li>
            )}
          </ul>
        </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-white border border-ash rounded-md">
        <div className="flex items-center justify-between p-6 border-b border-ash">
          <div>
            <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">// {L("RÉCENT", "RECENT")}</div>
            <h2 className="font-display text-xl font-bold tracking-tight mt-1 text-nordfjord">{L("Dernières commandes", "Latest Orders")}</h2>
          </div>
          <Link to="orders" className="font-data text-xs uppercase tracking-[0.2em] flex items-center gap-1 text-nova hover:text-nordfjord">
            {L("Voir tout", "View all")} <ArrowUpRight size={14} />
          </Link>
        </div>
        <table className="w-full text-sm" data-testid="recent-orders-table">
          <thead className="bg-clinical text-glacier">
            <tr>
              <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">{L("Commande", "Order")}</th>
              <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">{L("Client", "Customer")}</th>
              <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">{L("Paiement", "Payment")}</th>
              <th className="px-6 py-3 text-left font-data text-[10px] uppercase tracking-[0.2em]">{L("Traitement", "Fulfillment")}</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]">Total</th>
            </tr>
          </thead>
          <tbody>
            {(analytics?.recent_orders || []).slice(0, 8).map((o) => (
              <tr key={o.id} className="border-t border-ash/40 hover:bg-clinical/60">
                <td className="px-6 py-3">
                  {/* Lien relatif : `/admin/...` en absolu tombe sur l'alias de
                      compatibilité qui redirige vers la racine du portail en
                      perdant le sous-chemin, donc le clic ne menait nulle part. */}
                  <Link to={`orders/${o.id}`} className="font-data font-bold text-xs text-nova hover:text-nordfjord">{o.order_number}</Link>
                  <div className="font-data text-[10px] text-glacier">{(o.created_at || "").slice(0, 16).replace("T", " ")}</div>
                </td>
                <td className="px-6 py-3">
                  <div className="text-sm text-nordfjord">{o.shipping_address?.full_name || o.email || "—"}</div>
                  <div className="font-data text-[10px] text-glacier">{o.email}</div>
                </td>
                <td className="px-6 py-3"><StatusBadge status={o.payment_status} lang={lang} /></td>
                <td className="px-6 py-3"><StatusBadge status={o.fulfillment_status} lang={lang} /></td>
                <td className="px-6 py-3 text-right font-bold tabular-nums text-nordfjord">{o.total?.toFixed(2)} $</td>
              </tr>
            ))}
            {!analytics?.recent_orders?.length && (
              <tr><td colSpan={5} className="px-6 py-8 text-center font-data text-xs text-glacier">{L("Aucune commande pour l'instant", "No orders yet")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeltaCard({ label, value, delta, icon: Icon, lang }) {
  const L = (fr, en) => (lang === "fr" ? fr : en);
  const up = delta != null && delta >= 0;
  const DeltaIcon = up ? TrendingUp : TrendingDown;
  return (
    <div className="bg-white border border-ash p-6 rounded-md">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">{label}</div>
          <div className="font-display text-3xl font-bold mt-2 tabular-nums text-nordfjord">{value}</div>
          {delta != null ? (
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${up ? "text-success" : "text-error"}`}>
              <DeltaIcon size={13} /> {up ? "+" : ""}{delta}% <span className="text-glacier font-normal">{L("vs préc.", "vs prev.")}</span>
            </div>
          ) : (
            <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mt-1">{L("— vs préc.", "— vs prev.")}</div>
          )}
        </div>
        {Icon && <div className="w-10 h-10 flex items-center justify-center text-white bg-nordfjord rounded-md"><Icon size={18} strokeWidth={1.6} /></div>}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon }) {
  return (
    <div className="bg-white border border-ash p-6 rounded-md">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">{label}</div>
          <div className="font-display text-3xl font-bold mt-2 tabular-nums text-nordfjord">{value}</div>
          <div className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mt-1">{sub}</div>
        </div>
        {Icon && <div className="w-10 h-10 flex items-center justify-center text-white bg-nordfjord rounded-md"><Icon size={18} strokeWidth={1.6} /></div>}
      </div>
    </div>
  );
}
