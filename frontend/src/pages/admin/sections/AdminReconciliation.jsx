import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { Th } from "../ui";

export default function AdminReconciliation() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [status, setStatus] = useState("pending");
  const [provider, setProvider] = useState("all");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [matchById, setMatchById] = useState({});
  const [forceById, setForceById] = useState({});
  const [markPaidById, setMarkPaidById] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(
        `/admin/reconciliation/payments?status=${encodeURIComponent(status)}&provider=${encodeURIComponent(provider)}&limit=300`
      );
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, [status, provider]);

  useEffect(() => { load(); }, [load]);

  const onMatch = async (item) => {
    const orderNumber = (matchById[item.id] || "").trim().toUpperCase();
    if (!orderNumber) {
      toast.error(L("Numéro de commande requis", "Order number is required"));
      return;
    }
    setBusyId(item.id);
    try {
      await api.post(`/admin/reconciliation/payments/${item.id}/match`, {
        order_number: orderNumber,
        mark_paid: markPaidById[item.id] ?? true,
        force_mismatch: !!forceById[item.id],
      });
      toast.success(L("Paiement associé", "Payment matched"));
      setMatchById((s) => ({ ...s, [item.id]: "" }));
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusyId("");
    }
  };

  const onDismiss = async (item) => {
    setBusyId(item.id);
    try {
      await api.post(`/admin/reconciliation/payments/${item.id}/dismiss`, {});
      toast.success(L("Élément rejeté", "Item dismissed"));
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="p-8" data-testid="admin-reconciliation">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ORDERS</div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight mt-2 flex items-center gap-2">
            <Link2 size={28} /> {L("Réconciliation Paiements", "Payment Reconciliation")}
          </h1>
          <p className="text-sm text-foreground/70 mt-1">
            {L(
              "Associez manuellement les signaux de paiement Interac et Crypto nécessitant une validation.",
              "Manually match Interac and crypto payment signals that require validation."
            )}
          </p>
        </div>
        <button
          onClick={load}
          className="border border-ink px-4 py-2.5 font-mono text-xs uppercase tracking-[0.2em] hover:bg-ink hover:text-white inline-flex items-center gap-2"
          data-testid="reconciliation-refresh"
        >
          <RefreshCw size={14} /> {L("Rafraîchir", "Refresh")}
        </button>
      </div>

      <div className="bg-white border border-ink/10 p-4 mb-4 flex items-center gap-3" data-testid="reconciliation-filters">
        <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">{L("Statut", "Status")}</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border border-ink/15 px-3 py-2 text-sm bg-white"
          data-testid="reconciliation-status"
        >
          <option value="pending">{L("En attente", "Pending")}</option>
          <option value="matched">{L("Associé", "Matched")}</option>
          <option value="dismissed">{L("Rejeté", "Dismissed")}</option>
          <option value="all">{L("Tous", "All")}</option>
        </select>
        <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">{L("Canal", "Provider")}</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="border border-ink/15 px-3 py-2 text-sm bg-white"
          data-testid="reconciliation-provider"
        >
          <option value="all">{L("Tous", "All")}</option>
          <option value="interac">Interac</option>
          <option value="crypto">Crypto</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-ink/10 p-10 text-center text-sm text-foreground/60">
          {L("Chargement…", "Loading…")}
        </div>
      ) : (
        <div className="bg-white border border-ink/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>{L("Détection", "Detected")}</Th>
                <Th>{L("Canal", "Provider")}</Th>
                <Th>{L("Montant", "Amount")}</Th>
                <Th>{L("Expéditeur", "Sender")}</Th>
                <Th>{L("Objet", "Subject")}</Th>
                <Th>{L("Associer", "Match")}</Th>
                <Th>{L("Actions", "Actions")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const pending = it.status === "pending";
                const busy = busyId === it.id;
                const amount = typeof it.amount_cad === "number" ? `$${it.amount_cad.toFixed(2)} CAD` : "—";
                return (
                  <tr key={it.id} className="border-t border-ink/5 align-top" data-testid={`reconcile-row-${it.id}`}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{String(it.detected_at || "").slice(0, 19).replace("T", " ")}</div>
                      <div className="font-mono text-[10px] text-foreground/50">{it.status}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs uppercase">{it.provider || "interac"}</td>
                    <td className="px-4 py-3 font-semibold">{amount}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{it.from_email || "—"}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[360px]">
                      <div className="truncate" title={it.subject || ""}>{it.subject || "—"}</div>
                    </td>
                    <td className="px-4 py-3 min-w-[260px]">
                      {pending ? (
                        <>
                          <input
                            value={matchById[it.id] || ""}
                            onChange={(e) => setMatchById((s) => ({ ...s, [it.id]: e.target.value }))}
                            placeholder="FN-000000-ABC123"
                            className="w-full border border-ink/15 px-3 py-2 font-mono text-xs uppercase"
                            data-testid={`reconcile-order-input-${it.id}`}
                          />
                          <label className="mt-2 flex items-center gap-2 text-xs text-foreground/70">
                            <input
                              type="checkbox"
                              checked={markPaidById[it.id] ?? true}
                              onChange={(e) => setMarkPaidById((s) => ({ ...s, [it.id]: e.target.checked }))}
                              data-testid={`reconcile-mark-paid-${it.id}`}
                            />
                            {L("Marquer payé si possible", "Mark paid when possible")}
                          </label>
                          <label className="mt-1 flex items-center gap-2 text-xs text-foreground/70">
                            <input
                              type="checkbox"
                              checked={!!forceById[it.id]}
                              onChange={(e) => setForceById((s) => ({ ...s, [it.id]: e.target.checked }))}
                              data-testid={`reconcile-force-${it.id}`}
                            />
                            {L("Forcer même si montant différent", "Force even if amount mismatch")}
                          </label>
                        </>
                      ) : (
                        <div className="font-mono text-[11px] text-foreground/60">
                          {it.matched_order_number || it.dismiss_note || "—"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-[220px]">
                      {pending ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => onMatch(it)}
                            disabled={busy}
                            className="border border-ink px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-ink hover:text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                            data-testid={`reconcile-match-${it.id}`}
                          >
                            <CheckCircle2 size={13} /> {L("Associer", "Match")}
                          </button>
                          <button
                            onClick={() => onDismiss(it)}
                            disabled={busy}
                            className="border border-red-600 text-red-700 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-red-600 hover:text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                            data-testid={`reconcile-dismiss-${it.id}`}
                          >
                            <XCircle size={13} /> {L("Rejeter", "Dismiss")}
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-[11px] text-foreground/50">{L("Traité", "Processed")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!items.length && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-sm text-foreground/60">
                    {L("Aucun élément", "No items")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
