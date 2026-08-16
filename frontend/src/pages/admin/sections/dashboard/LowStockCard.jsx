// Widget dashboard : variantes dont le stock est retombé sous son seuil.
// Alimenté par /admin/low-stock-alerts, que le backend enrichit déjà des noms
// produit/variante — une seule requête, aucun N+1 côté client.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import api, { formatApiError } from "../../../../lib/api";
import { useLang } from "../../../../contexts/LanguageContext";

const REFRESH_MS = 60000;
const MAX_ROWS = 8;

// Les liens sont relatifs : le dashboard est monté sous un basePath variable
// (/admin en dev, /ops-portal-fn7k2q en prod) et les resolve donc tout seul.
export function LowStockCard() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/low-stock-alerts");
      setItems(data.items || []);
      setRefreshedAt(new Date());
      setErr(null);
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => { if (alive) load(); };
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [load]);

  const isCritical = items.some((i) => (i.stock ?? 0) === 0);
  const borderClass = items.length
    ? (isCritical ? "border-error/50" : "border-warning/50")
    : "border-ash";

  return (
    <div
      data-testid="low-stock-card"
      className={`bg-white border ${borderClass} p-6 rounded-md`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle
            size={16}
            strokeWidth={1.6}
            className={items.length ? (isCritical ? "text-error" : "text-warning") : "text-glacier"}
          />
          <div className="font-data text-[10px] uppercase tracking-[0.25em] text-glacier">
            {L("STOCK FAIBLE", "LOW STOCK")}
          </div>
          {items.length > 0 && (
            <span
              data-testid="low-stock-count"
              className={`font-data text-[10px] font-bold px-2 py-0.5 rounded ${
                isCritical ? "bg-error text-white" : "bg-warning text-white"
              }`}
            >
              {items.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          data-testid="low-stock-refresh"
          title={L("Rafraîchir", "Refresh")}
          className="text-glacier hover:text-nordfjord p-1 disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {err && (
        <p className="text-xs text-error" data-testid="low-stock-error">{err}</p>
      )}

      {!err && !items.length && !loading && (
        <p className="text-xs text-glacier italic" data-testid="low-stock-empty">
          {L("Toutes les variantes sont au-dessus de leur seuil.",
             "All variants are above their threshold.")}
        </p>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-ash/60" data-testid="low-stock-list">
          {items.slice(0, MAX_ROWS).map((a) => {
            const critical = (a.stock ?? 0) === 0;
            const key = `${a.product_slug || a.product_id}-${a.variant_sku || "root"}`;
            return (
              <li
                key={`${a.product_id}-${a.variant_id || "root"}`}
                data-testid={`low-stock-row-${key}`}
                className="py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate text-nordfjord">{a.product_name}</div>
                  <div className="font-data text-[10px] text-glacier truncate">
                    {a.variant_name || "—"}
                    {a.variant_sku && <span className="opacity-70"> · {a.variant_sku}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 tabular-nums">
                  <span
                    className={`font-data font-bold text-sm ${critical ? "text-error" : "text-warning"}`}
                    data-testid={`low-stock-qty-${key}`}
                  >
                    {a.stock}
                  </span>
                  <span className="font-data text-[10px] text-glacier"> / {a.threshold}</span>
                </div>
                <Link
                  to={`products?highlight=${a.product_slug || ""}`}
                  data-testid={`low-stock-goto-${a.product_slug || a.product_id}`}
                  title={L("Ouvrir la fiche produit", "Open product")}
                  className="p-1.5 border border-ash hover:bg-nordfjord hover:text-white transition-colors rounded"
                >
                  <ExternalLink size={11} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > MAX_ROWS && (
        <Link
          to="products"
          data-testid="low-stock-see-all"
          className="mt-3 inline-block font-data text-[10px] uppercase tracking-[0.2em] text-glacier hover:text-nordfjord hover:underline"
        >
          {L(`Voir les ${items.length} alertes`, `See all ${items.length} alerts`)} →
        </Link>
      )}

      {refreshedAt && (
        <p className="mt-3 font-data text-[10px] text-glacier/70" data-testid="low-stock-refreshed-at">
          {L("Actualisé", "Refreshed")} {refreshedAt.toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA")}
        </p>
      )}
    </div>
  );
}

export default LowStockCard;
