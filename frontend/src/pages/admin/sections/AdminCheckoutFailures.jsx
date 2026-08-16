import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, CheckCircle2, ShieldOff, ShieldCheck } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";

/**
 * Item 1.2 B4 SMART — Reconciliation des compensations checkout qui ont
 * échoué. L'admin y voit chaque entrée, peut la marquer "retry_attempted"
 * (audit) ou "resolved" avec une note, et gère l'état du circuit breaker.
 */
export default function AdminCheckoutFailures() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("pending_manual_review");
  const [breaker, setBreaker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter === "all" ? "" : `?status=${encodeURIComponent(statusFilter)}`;
      const [failures, breakerState] = await Promise.all([
        api.get(`/admin/reconciliation/checkout-failures${q}`),
        api.get("/admin/reconciliation/checkout-breaker"),
      ]);
      setItems(failures.data?.items || []);
      setTotal(failures.data?.total || 0);
      setBreaker(breakerState.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const retry = async (id) => {
    setBusyId(id);
    try {
      await api.post(`/admin/reconciliation/checkout-failures/${id}/retry`);
      toast.success(L("Retry marqué. Résolvez manuellement après vérification.", "Retry marked. Resolve manually after review."));
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusyId("");
    }
  };

  const resolve = async (id) => {
    const note = (notes[id] || "").trim();
    setBusyId(id);
    try {
      await api.post(`/admin/reconciliation/checkout-failures/${id}/resolve`, {
        note, action: "manual_reconciled",
      });
      toast.success(L("Entrée résolue.", "Entry resolved."));
      setNotes({ ...notes, [id]: "" });
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusyId("");
    }
  };

  const resetBreaker = async () => {
    if (!window.confirm(L(
      "Réinitialiser le circuit breaker checkout ? Les nouveaux checkouts seront acceptés à nouveau.",
      "Reset checkout circuit breaker? New checkouts will be accepted again."
    ))) return;
    try {
      await api.post("/admin/reconciliation/checkout-breaker/reset");
      toast.success(L("Circuit breaker réinitialisé.", "Circuit breaker reset."));
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="admin-checkout-failures">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-nordfjord flex items-center gap-2">
            <AlertTriangle size={22} strokeWidth={2} />
            {L("Reconciliation Checkout", "Checkout Reconciliation")}
          </h1>
          <p className="text-sm text-compliance mt-1 max-w-2xl">
            {L(
              "Chaque écriture de commande qui n'a pas pu être correctement compensée en cas d'échec apparaît ici. Vérifiez l'état des collections concernées avant de marquer résolu.",
              "Every order write that could not be properly rolled back on failure appears here. Verify state of the affected collections before marking resolved."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          data-testid="reload-failures"
          className="btn-pill btn-ghost inline-flex items-center gap-2">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {L("Rafraîchir", "Refresh")}
        </button>
      </header>

      {/* Circuit breaker banner */}
      {breaker && (
        <div
          className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
            breaker.is_open
              ? "bg-red-50 border-red-300 text-red-900"
              : "bg-emerald-50 border-emerald-300 text-emerald-900"
          }`}
          data-testid="breaker-banner"
        >
          <div className="flex items-center gap-3">
            {breaker.is_open ? <ShieldOff size={20} /> : <ShieldCheck size={20} />}
            <div>
              <div className="font-semibold text-sm">
                {breaker.is_open
                  ? L("Circuit breaker OUVERT — /checkout bloqué", "Circuit breaker OPEN — /checkout blocked")
                  : L("Circuit breaker fermé — /checkout opérationnel", "Circuit breaker closed — /checkout operational")}
              </div>
              <div className="text-xs opacity-80 mt-0.5">
                {L(
                  `${breaker.failures_in_window} échec(s) dans la dernière heure — seuil : ${breaker.threshold}`,
                  `${breaker.failures_in_window} failure(s) in the last hour — threshold: ${breaker.threshold}`
                )}
              </div>
            </div>
          </div>
          {breaker.is_open && (
            <button
              type="button"
              onClick={resetBreaker}
              data-testid="reset-breaker"
              className="btn-pill btn-nova text-xs">
              {L("Forcer réouverture", "Force reset")}
            </button>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-mono uppercase tracking-widest text-compliance">
          {L("Filtre statut", "Status filter")}
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="status-filter"
          className="border rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="pending_manual_review">{L("À examiner", "Pending review")}</option>
          <option value="retry_attempted">{L("Retry marqué", "Retry attempted")}</option>
          <option value="resolved">{L("Résolus", "Resolved")}</option>
          <option value="all">{L("Tous", "All")}</option>
        </select>
        <span className="text-xs text-compliance ml-2">
          {L(`${total} entrée(s)`, `${total} entrie(s)`)}
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-compliance">{L("Chargement…", "Loading…")}</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl bg-birch/40 p-8 text-center text-compliance text-sm">
          <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-600" />
          {L("Aucune anomalie. Le système est propre.", "No anomalies. System is clean.")}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <div key={f.id} className="rounded-xl border border-nova/20 bg-white p-4" data-testid={`failure-${f.id}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-compliance">
                    {new Date(f.created_at).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA")}
                  </div>
                  <div className="font-mono text-sm text-nordfjord mt-1">
                    Order : <span data-testid={`failure-order-${f.id}`}>{f.order_id || "-"}</span>
                  </div>
                  <div className="text-xs text-red-800 mt-1 font-mono">{f.original_error}</div>
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-nova">{L("Détails compensation", "Compensation details")}</summary>
                    <div className="mt-2 space-y-1">
                      <div className="text-xs text-compliance">
                        <strong>{L("Collections écrites : ", "Collections written: ")}</strong>
                        {(f.collections_written || []).join(", ") || "—"}
                      </div>
                      {(f.failed_compensations || []).map((c, i) => (
                        <div key={i} className="text-xs text-red-800 font-mono ml-3">
                          • <strong>{c.stage}</strong> : {c.error}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
                <div className="flex flex-col items-end gap-2 min-w-[220px]">
                  <span
                    className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded ${
                      f.status === "resolved" ? "bg-emerald-100 text-emerald-800" :
                      f.status === "retry_attempted" ? "bg-amber-100 text-amber-800" :
                      "bg-red-100 text-red-800"
                    }`}
                  >
                    {f.status}
                  </span>
                  {f.status !== "resolved" && (
                    <>
                      <input
                        type="text"
                        placeholder={L("Note de résolution…", "Resolution note…")}
                        value={notes[f.id] || ""}
                        onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })}
                        data-testid={`note-${f.id}`}
                        className="border rounded-lg px-2 py-1 text-xs w-full"
                      />
                      <div className="flex gap-2">
                        {f.status === "pending_manual_review" && (
                          <button
                            type="button"
                            onClick={() => retry(f.id)}
                            disabled={busyId === f.id}
                            data-testid={`retry-${f.id}`}
                            className="btn-pill btn-ghost text-xs px-3 py-1">
                            {L("Marquer retry", "Mark retry")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => resolve(f.id)}
                          disabled={busyId === f.id}
                          data-testid={`resolve-${f.id}`}
                          className="btn-pill btn-nova text-xs px-3 py-1">
                          {L("Résoudre", "Resolve")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
