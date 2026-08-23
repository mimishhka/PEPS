import { useEffect, useState, useCallback } from "react";
import { ClipboardList, Package, PackageCheck, Printer, RefreshCw, ChevronRight, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";

// Écran « Journée » — poste d'expédition Fironova.
const STEP_ORDER = ["processing", "packing", "packed"];
const STEP_ICON = { processing: ClipboardList, packing: Package, packed: PackageCheck, shipped: Printer };
const NEXT = { processing: "packing", packing: "packed" };
const NEXT_LABEL = { processing: "Démarrer", packing: "Empaquetée" };

export default function AdminFulfillment() {
  const today = new Date().toLocaleDateString("en-CA");
  const [date, setDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/fulfillment/day", { params: { date } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message))
      .finally(() => setLoading(false));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const advance = async (order, to) => {
    setBusyId(order.id);
    try {
      await api.post(`/admin/fulfillment/${order.id}/advance`, { to });
      toast.success(`${order.order_number} → ${to === "packing" ? "en préparation" : "empaquetée"}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusyId(null);
    }
  };

  const openPicking = () => {
    const root = API_BASE.replace(/\/api$/, "");
    window.open(`${root}/api/admin/fulfillment/${date}/picking-list.pdf`, "_blank", "noopener");
  };

  const counts = data?.counts || { processing: 0, packing: 0, packed: 0, total: 0 };
  const labels = data?.labels || {};
  const buckets = data?.buckets || {};

  return (
    <div data-testid="admin-fulfillment">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight flex items-center gap-2">
            <Package size={26} /> Journée
          </h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">
            Poste d'expédition — préparer, empaqueter, étiqueter, envoyer. Cutoff 13 h (HE).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openPicking} disabled={(counts.processing + counts.packing) === 0} data-testid="fulfil-picking"
            className="border border-ink/20 font-mono text-xs uppercase tracking-wider px-3 py-2 hover:bg-ink/5 disabled:opacity-40 flex items-center gap-2">
            <ClipboardList size={14} /> Liste de prélèvement
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="fulfil-date"
            className="border border-ink/20 px-3 py-2 font-mono text-sm" />
          <button onClick={load} data-testid="fulfil-refresh" className="border border-ink/20 p-2 hover:bg-ink/5">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {counts.overdue > 0 && (
        <div className="mt-6 flex items-center gap-2 bg-red-50 border border-red-300 text-red-900 px-4 py-3 font-mono text-xs" data-testid="fulfil-overdue-banner">
          <AlertTriangle size={15} /> {counts.overdue} commande(s) en retard — lot antérieur non expédié. Traiter en priorité.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STEP_ORDER.map((step) => {
          const Icon = STEP_ICON[step];
          return (
            <div key={step} className="bg-white border border-ink/10 p-5" data-testid={`fulfil-stat-${step}`}>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
                <Icon size={13} /> {labels[step]?.fr || step}
              </div>
              <div className="font-display text-4xl font-bold mt-1">{counts[step] || 0}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {["processing", "packing", "packed"].map((step) => {
          const Icon = STEP_ICON[step];
          const baseRows = buckets[step] || [];
          const rows = step === "packed"
            ? [
              ...baseRows,
              ...(buckets.shipped || [])
                .filter((o) => !baseRows.some((r) => r.id === o.id))
                .map((o) => ({ ...o, __historyShipped: true })),
            ]
            : baseRows;
          return (
            <div key={step} data-testid={`fulfil-col-${step}`}>
              <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 mb-3 flex items-center gap-2">
                <Icon size={14} /> {labels[step]?.fr || step} <span className="text-foreground/30">({rows.length})</span>
              </h2>
              <div className="space-y-3">
                {rows.length === 0 ? (
                  <div className="bg-white border border-ink/10 px-4 py-8 text-center font-mono text-[11px] text-foreground/40">
                    Vide
                  </div>
                ) : rows.map((o) => {
                  const isShippedHistory = Boolean(
                    o.__historyShipped ||
                    o.fulfillment_status === "shipped" ||
                    o.label_url ||
                    o.tracking_number
                  );
                  return (
                  <div key={o.id} className={`bg-white border ${o.is_overdue ? "border-red-300" : "border-ink/10"}`} data-testid={`fulfil-card-${o.order_number}`}>
                    <button onClick={() => setOpenId(openId === o.id ? null : o.id)} className="w-full text-left px-4 py-3 hover:bg-ink/[0.02]" data-testid={`fulfil-open-${o.order_number}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold">{o.order_number}</span>
                        {o.is_overdue && <span className="font-mono text-[10px] uppercase text-red-600 flex items-center gap-1"><AlertTriangle size={10} /> retard</span>}
                      </div>
                      <div className="font-mono text-[11px] text-foreground/50 mt-1 flex items-center gap-1">
                        <MapPin size={10} /> {o.city || "—"}, {o.province || ""} · {o.units} u. · {o.items} art.
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-ink/60 mt-2">
                        {openId === o.id ? "Masquer" : "Voir les produits"}
                      </div>
                    </button>

                    {openId === o.id && (
                      <div className="px-4 pb-3 border-t border-ink/10 pt-3" data-testid={`fulfil-picking-${o.order_number}`}>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-foreground/40 mb-2">Prélever</div>
                        {o.picking.length === 0 ? (
                          <div className="font-mono text-[11px] text-foreground/40">Aucun article.</div>
                        ) : (
                          <ul className="space-y-2">
                            {o.picking.map((p, i) => (
                              <li key={i} className="font-mono text-[11px] flex justify-between gap-2 border-b border-ink/5 pb-1">
                                <span className="min-w-0">
                                  <span className="block truncate">{p.name_fr || p.name_en}</span>
                                  <span className="block text-foreground/40 text-[10px]">
                                    {p.sku}{p.variant_name ? ` · ${p.variant_name}` : ""}
                                  </span>
                                </span>
                                <span className="font-bold whitespace-nowrap">{p.qty}×</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {NEXT[step] && !isShippedHistory && (
                      <div className="px-4 pb-3">
                        <button onClick={() => advance(o, NEXT[step])} disabled={busyId === o.id} data-testid={`fulfil-advance-${o.order_number}`}
                          className="w-full bg-ink text-white font-mono text-[11px] uppercase tracking-wider px-3 py-2 hover:bg-ink/80 disabled:opacity-40 flex items-center justify-center gap-1">
                          {busyId === o.id ? "…" : <>{NEXT_LABEL[step]} <ChevronRight size={13} /></>}
                        </button>
                      </div>
                    )}
                    {step === "packed" && (
                      <div className="px-4 pb-3 font-mono text-[10px] text-foreground/50 text-center">
                        {isShippedHistory ? "Étiquetée" : "Prête pour étiquetage"}
                      </div>
                    )}
                  </div>
                );})}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
