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
  const [bulkStep, setBulkStep] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/fulfillment/day", { params: { date } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message))
      .finally(() => setLoading(false));
  }, [date]);
  useEffect(() => { load(); }, [load]);

  // Avance TOUTES les commandes d'une etape d'un coup. L'endpoint existait
  // depuis le debut sans qu'aucun bouton ne l'appelle : il fallait cliquer
  // commande par commande.
  const advanceAll = async (step) => {
    const to = NEXT[step];
    if (!to) return;
    setBulkStep(step);
    try {
      // `reponse` et non `data` : le composant a deja un etat nomme data,
      // et le masquer ici rendrait la suite trompeuse a la lecture.
      const { data: reponse } = await api.post("/admin/fulfillment/bulk-advance", {
        date, from_status: step, to,
      });
      const n = reponse?.updated ?? reponse?.count ?? 0;
      toast.success(`${n} commande(s) avancee(s) vers ${NEXT_LABEL[step]}`);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBulkStep(null);
    }
  };

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
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2 text-nordfjord">
            <Package size={26} /> Journée
          </h1>
          <p className="font-data text-xs text-glacier mt-1">
            Poste d'expédition — préparer, empaqueter, étiqueter, envoyer. Cutoff 13 h (HE).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openPicking} disabled={(counts.processing + counts.packing) === 0} data-testid="fulfil-picking"
            className="border border-ash font-data text-xs px-3 py-2 rounded-lg hover:bg-clinical disabled:opacity-40 flex items-center gap-2 text-nordfjord">
            <ClipboardList size={14} /> Liste de prélèvement
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="fulfil-date"
            className="border border-ash px-3 py-2 font-data text-sm rounded-lg" />
          <button onClick={load} data-testid="fulfil-refresh" className="border border-ash p-2 hover:bg-clinical rounded-lg">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {counts.overdue > 0 && (
        <div className="mt-6 flex items-center gap-2 bg-warning/10 border border-warning/30 text-nordfjord px-4 py-3 font-data text-xs rounded-xl" data-testid="fulfil-overdue-banner">
          <AlertTriangle size={15} className="text-warning" /> {counts.overdue} commande(s) en retard — lot antérieur non expédié. Traiter en priorité.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STEP_ORDER.map((step) => {
          const Icon = STEP_ICON[step];
          return (
            <div key={step} className="bg-card border border-ash/60 rounded-xl p-5" data-testid={`fulfil-stat-${step}`}>
              <div className="flex items-center gap-2 font-data text-[11px] text-glacier">
                <Icon size={13} /> {labels[step]?.fr || step}
              </div>
              <div className="font-display text-4xl font-bold mt-1 text-nordfjord">{counts[step] || 0}</div>
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
                <h2 className="font-data text-xs text-glacier font-medium mb-3 flex items-center gap-2 flex-wrap">
                  <Icon size={14} /> {labels[step]?.fr || step} <span className="text-glacier/50">({rows.length})</span>
                  {/* Avancement groupé — l'endpoint existait sans bouton.
                      Il n'apparaît que sur les colonnes qui ont une étape
                      suivante et au moins une commande : une colonne vide ou
                      terminale n'a rien à avancer. */}
                  {NEXT[step] && rows.length > 0 && (
                    <button
                      onClick={() => advanceAll(step)}
                      disabled={bulkStep === step}
                      data-testid={`fulfil-bulk-${step}`}
                      className="ml-auto border border-ash px-2.5 py-1 text-[11px] rounded-md text-glacier hover:border-nova hover:text-nova disabled:opacity-40"
                    >
                      {bulkStep === step ? "…" : `Tout → ${NEXT_LABEL[step]}`}
                    </button>
                  )}
                </h2>
                <div className="space-y-3">
                  {rows.length === 0 ? (
                    <div className="bg-card border border-ash/60 rounded-xl px-4 py-8 text-center font-data text-[11px] text-glacier">
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
                  <div key={o.id} className={`bg-card border rounded-xl ${o.is_overdue ? "border-warning/50" : "border-ash/60"}`} data-testid={`fulfil-card-${o.order_number}`}>
                    <button onClick={() => setOpenId(openId === o.id ? null : o.id)} className="w-full text-left px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="font-data text-xs font-semibold text-nordfjord">{o.order_number}</span>
                        {o.is_overdue && <span className="font-data text-[10px] text-warning flex items-center gap-1"><AlertTriangle size={10} /> retard</span>}
                      </div>
                      <div className="font-data text-[11px] text-glacier mt-1 flex items-center gap-1">
                        <MapPin size={10} /> {o.city || "—"}, {o.province || ""} · {o.units} u.
                      </div>
                    </button>

                    {openId === o.id && (
                      <div className="px-4 pb-3 border-t border-ash/60 pt-3" data-testid={`fulfil-picking-${o.order_number}`}>
                        <div className="font-data text-[10px] text-glacier mb-2">Prélever</div>
                        <ul className="space-y-1">
                          {o.picking.map((p, i) => (
                            <li key={i} className="font-data text-[11px] flex justify-between text-nordfjord">
                              <span>{p.name_fr || p.name_en} {p.variant_name && <span className="text-glacier">· {p.variant_name}</span>}</span>
                              <span className="font-semibold">{p.qty}×</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {NEXT[step] && !isShippedHistory && (
                      <div className="px-4 pb-3">
                        <button onClick={() => advance(o, NEXT[step])} disabled={busyId === o.id} data-testid={`fulfil-advance-${o.order_number}`}
                          className="w-full bg-nordfjord text-white font-data text-xs px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1">
                          {busyId === o.id ? "…" : <>{NEXT_LABEL[step]} <ChevronRight size={13} /></>}
                        </button>
                      </div>
                    )}
                    {step === "packed" && (
                      <div className="px-4 pb-3 font-data text-[10px] text-glacier text-center">
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
