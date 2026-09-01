import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Search, X, FileText, CheckCircle2, Save, Truck, MessageSquarePlus, Mail, Undo2, Trash2, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";
import { useConfirm } from "../../../components/ConfirmDialog";
import { useAuth } from "../../../contexts/AuthContext";
import { Th } from "../ui";

const FULFILLMENT_OPTS = ["pending", "preorder", "processing", "shipped", "delivered", "cancelled", "failed", "refunded"];
const PAYMENT_OPTS = ["awaiting_etransfer", "awaiting_crypto", "paid", "refunded", "cancelled", "failed"];
const PAGE_SIZE = 50;
const TABS = [
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export default function AdminOrders() {
  const confirm = useConfirm();
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterFulfill, setFilterFulfill] = useState("all");
  const [filterLate, setFilterLate] = useState("all");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("active");
  const [counts, setCounts] = useState({});
  const [manifest, setManifest] = useState(null);   // {configured, pending_count, groups}
  const [txBusy, setTxBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const { id: routeOrderId } = useParams();
  const navigate = useNavigate();
  const deferredQuery = useDeferredValue(query);

  // Étiquettes créées mais non transmises = 2 $/article de surcharge et perte
  // du rabais d'automatisation. On le met sous les yeux, en haut de l'écran.
  const loadManifest = () => {
    api.get("/admin/shipping/pending-manifest")
      .then((r) => setManifest(r.data))
      .catch(() => setManifest(null));
  };
  useEffect(() => { loadManifest(); }, []);

  const transmitManifest = async () => {
    if (!await confirm({ title: "Transmit today's manifest to Canada Post?", description: "This closes the shipments for billing.", destructive: true })) return;
    setTxBusy(true);
    try {
      const { data } = await api.post("/admin/shipping/transmit");
      toast.success(`Manifest transmitted — ${data.orders_marked} shipment(s) closed.`);
      if (data.manifests?.length) {
        toast.info(`${data.manifests.length} manifest document(s) available from Canada Post.`);
      }
      loadManifest();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setTxBusy(false);
    }
  };

  // Sortie de secours quand les étiquettes ne partiront jamais (essais, erreur
  // de manipulation) : les annuler chez Postes Canada plutôt que les transmettre.
  const voidUntransmitted = async () => {
    if (!await confirm({
      title: `Void ${manifest?.pending_count ?? 0} untransmitted label(s)?`,
      description: "Cancels the shipments with Canada Post and returns the orders to processing. "
        + "Use this for labels created by mistake — not for parcels you are actually sending.",
      destructive: true,
    })) return;
    setTxBusy(true);
    try {
      const { data } = await api.post("/admin/shipping/void-untransmitted");
      toast.success(`${data.voided} label(s) voided.`);
      if (data.failed?.length) {
        toast.error(`Canada Post refused to void: ${data.failed.join(", ")}`);
      }
      if (data.no_shipment_id?.length) {
        toast.warning(`No Canada Post shipment id, void manually: ${data.no_shipment_id.join(", ")}`);
      }
      loadManifest();
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setTxBusy(false);
    }
  };

  const load = useCallback(() => {
    const params = {
      page,
      limit: PAGE_SIZE,
      ...(tab === "all" ? {} : { status_group: tab }),
      ...(deferredQuery ? { query: deferredQuery } : {}),
      ...(filterPayment === "all" ? {} : { payment_status: filterPayment }),
      ...(filterFulfill === "all" ? {} : { fulfillment_status: filterFulfill }),
      ...(filterLate === "late_only" ? { late_only: true } : {}),
    };
    // Un .catch() sur chaque appel : sans lui, une réponse en erreur devient
    // une unhandled rejection, que l'overlay CRA affiche en « [object Object] »
    // et que le build de prod avale en silence.
    api.get("/admin/orders/page", { params }).then((r) => {
      setOrders(r.data.items || []);
      setTotal(r.data.total || 0);
    }).catch((e) => {
      setOrders([]);
      setTotal(0);
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    });
    api.get("/admin/orders/counts")
      .then((r) => setCounts(r.data))
      .catch(() => setCounts({}));
  }, [deferredQuery, filterFulfill, filterLate, filterPayment, page, tab]);
  useEffect(() => { load(); }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = orders;

  useEffect(() => {
    setPage(1);
  }, [tab, query, filterPayment, filterFulfill, filterLate]);

  // Lien profond /orders/:id (tableau de bord, courriels). La route existait
  // déjà dans AdminLayout mais rien ne lisait le paramètre : on atterrissait
  // sur la liste sans que la commande s'ouvre.
  useEffect(() => {
    if (!routeOrderId || selected?.id === routeOrderId) return undefined;
    let alive = true;
    api.get("/admin/orders")
      .then((r) => {
        if (!alive) return;
        const found = (r.data || []).find((o) => o.id === routeOrderId);
        if (found) setSelected(found);
        else toast.error("Order not found");
      })
      .catch((e) => {
        if (alive) toast.error(formatApiError(e.response?.data?.detail) || e.message);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeOrderId]);

  // Refermer doit aussi retirer l'id de l'URL, sinon l'effet ci-dessus rouvre
  // la commande au moindre re-rendu.
  const closeDetail = () => {
    setSelected(null);
    if (routeOrderId) navigate("..", { relative: "path" });
  };

  return (
    <div className="p-8" data-testid="admin-orders">
      {manifest?.configured && manifest.pending_count > 0 && (
        <div
          className="mb-6 border-2 border-red-600 bg-red-50 px-5 py-4 flex flex-wrap items-center justify-between gap-4"
          data-testid="manifest-warning"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-red-700 font-bold">
                {manifest.pending_count} label(s) created but not transmitted
              </div>
              <div className="text-sm text-red-800 mt-1">
                Transmit the manifest before end of day. Canada Post bills untransmitted shipments
                with a <strong>$2 surcharge per item</strong> and removes the automation discount.
                {" "}The manifest does not exist until you transmit — transmitting is what creates it.
              </div>
              {manifest.orphan_count > 0 && (
                <div className="text-sm text-red-800 mt-2" data-testid="manifest-orphans">
                  <strong>{manifest.orphan_count} of these cannot be transmitted</strong> — they have
                  a label but no Canada Post group, so "Transmit manifest" will not clear them. Void
                  and recreate those labels: {manifest.orphans?.join(", ")}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={voidUntransmitted}
              disabled={txBusy}
              data-testid="void-untransmitted-btn"
              title="Cancel these labels with Canada Post instead of shipping them"
              className="border border-red-600 text-red-700 font-mono text-xs uppercase tracking-[0.2em] px-4 py-2.5 flex items-center gap-2 disabled:opacity-50"
            >
              <Undo2 size={14} /> Void all
            </button>
            <button
              onClick={transmitManifest}
              disabled={txBusy || !manifest.transmittable_count}
              data-testid="transmit-manifest-btn"
              className="bg-red-600 text-white font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 flex items-center gap-2 disabled:opacity-50"
            >
              <Send size={14} /> {txBusy ? "Transmitting…" : "Transmit manifest"}
            </button>
          </div>
        </div>
      )}
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ORDERS</div>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight mt-2">Orders</h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{total}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${API_BASE}/admin/orders.csv${tab === "all" ? "" : `?status_group=${tab}`}`}
            target="_blank" rel="noopener noreferrer"
            data-testid="export-orders-csv"
            className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80"
          >
            <Download size={14} /> CSV
          </a>
          <a
            href={`${API_BASE}/admin/orders.xlsx${tab === "all" ? "" : `?status_group=${tab}`}`}
            target="_blank" rel="noopener noreferrer"
            data-testid="export-orders-xlsx"
            className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-ink hover:text-white"
          >
            <Download size={14} /> Excel
          </a>
        </div>
      </div>

      {/* Status group tabs */}
      <div className="flex gap-0 mb-4 border border-ink/15 bg-white w-fit" data-testid="orders-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`orders-tab-${t.key}`}
            className={`font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 flex items-center gap-2 ${tab === t.key ? "bg-ink text-white" : "hover:bg-secondary"}`}
          >
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 ${tab === t.key ? "bg-white/20" : "bg-secondary"}`} data-testid={`orders-count-${t.key}`}>
              {counts[t.key] ?? "…"}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-ink/10 p-4 mb-4 flex flex-wrap items-center gap-3" data-testid="orders-filters">
        <div className="flex items-center gap-2 border border-ink/15 px-3 py-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-foreground/50" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order #, email, name…"
            data-testid="orders-search"
            className="bg-transparent text-sm outline-none w-full"
          />
        </div>
        <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="border border-ink/15 px-3 py-2 text-sm bg-white" data-testid="filter-payment">
          <option value="all">All payments</option>
          {PAYMENT_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterFulfill} onChange={(e) => setFilterFulfill(e.target.value)} className="border border-ink/15 px-3 py-2 text-sm bg-white" data-testid="filter-fulfill">
          <option value="all">All fulfillments</option>
          {FULFILLMENT_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterLate} onChange={(e) => setFilterLate(e.target.value)} className="border border-ink/15 px-3 py-2 text-sm bg-white" data-testid="filter-late-payment">
          <option value="all">All payments</option>
          <option value="late_only">Late payments only</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Customer</Th>
              <Th>Method</Th>
              <Th>Payment</Th>
              <Th>Fulfillment</Th>
              {/* « Total » en clair, et non L("Total","Total") : ce fichier
                  n'a aucun helper L, et les deux traductions etaient de toute
                  facon identiques. Residu de l'unification des en-tetes. */}
              <Th align="right">Total</Th>
              <Th align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((o) => (
              <tr key={o.id} className="border-t border-ink/5 hover:bg-secondary/40" data-testid={`order-row-${o.order_number}`}>
                <td className="px-6 py-3">
                  <div className="font-mono font-bold text-xs">{o.order_number}</div>
                  {o.late_payment_flagged && (
                    <span
                      className="inline-flex mt-1 items-center rounded-full border border-red-300 bg-red-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-red-700"
                      data-testid={`late-payment-badge-${o.order_number}`}
                    >
                      Late payment
                    </span>
                  )}
                  {o.has_unread_customer_message && (
                    <span
                      className="inline-flex mt-1 items-center rounded-full border border-nova bg-nova/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-nova"
                      data-testid={`unread-message-badge-${o.order_number}`}
                    >
                      Message
                    </span>
                  )}
                  <div className="font-mono text-[10px] text-foreground/50">{(o.created_at || "").slice(0, 10)}</div>
                  {o.dispatch_batch && (
                    <div className="font-mono text-[10px] text-glacier" data-testid={`dispatch-batch-${o.order_number}`}>
                      LOT {o.dispatch_batch}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3">
                  <div className="text-sm">{o.shipping_address?.full_name || "—"}</div>
                  <div className="font-mono text-[10px] text-foreground/50">{o.email || "guest"}</div>
                </td>
                <td className="px-6 py-3 font-mono text-xs uppercase">{o.payment_method}</td>
                <td className="px-6 py-3"><StatusBadge status={o.payment_status} /></td>
                <td className="px-6 py-3"><StatusBadge status={o.fulfillment_status} /></td>
                <td className="px-6 py-3 text-right font-bold tabular-nums">${o.total?.toFixed(2)}</td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => setSelected(o)}
                    data-testid={`open-order-${o.order_number}`}
                    className="font-mono text-xs uppercase tracking-[0.2em] border border-ink px-3 py-1.5 hover:bg-ink hover:text-white"
                  >
                    Open →
                  </button>
                </td>
              </tr>
            ))}
            {!pageRows.length && (
              <tr><td colSpan={7} className="px-6 py-12 text-center font-mono text-xs text-foreground/50">No orders match the filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3 font-mono text-xs">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="border border-ink/15 px-3 py-2 disabled:opacity-40"
            aria-label="Previous orders page"
          >
            ←
          </button>
          <span>{page} / {pageCount}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
            className="border border-ink/15 px-3 py-2 disabled:opacity-40"
            aria-label="Next orders page"
          >
            →
          </button>
        </div>
      )}

      {selected && <OrderDetail order={selected} onClose={closeDetail} onUpdate={() => {
        load();
        api.get(`/admin/orders`)
          .then((r) => setSelected(r.data.find((x) => x.id === selected.id) || null))
          .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
      }} />}
    </div>
  );
}

function OrderDetail({ order, onClose, onUpdate }) {
  const { user } = useAuth();
  // Sans cette ligne, `confirm(...)` ne designait pas le dialogue stylé du
  // projet mais le window.confirm DU NAVIGATEUR — un global, donc aucune
  // erreur. Or ce composant lui passe un OBJET { title, description }, la ou
  // le natif attend une chaine : la boite affichait « [object Object] ».
  //
  // Trois actions destructrices etaient concernees — mise a la corbeille,
  // annulation d'etiquette, et une troisieme — c'est-a-dire precisement
  // celles ou la personne doit comprendre ce qu'elle valide.
  const confirm = useConfirm();
  const [reopenBusy, setReopenBusy] = useState(false);
  const canUseReopenAction =
    user?.role === "admin"
    || (user?.role === "staff" && user?.permissions?.orders_reopen === "manage");
  const canReopenLatePaid =
    canUseReopenAction
    && order?.payment_status === "cancelled"
    && order?.cancelled_reason === "auto_unpaid_timeout"
    && !!order?.late_payment_flagged;

  // Réouverture générale : toute commande annulée peut être réouverte par un admin
  // (couvre les cancel manuels et les auto-cancels sans paiement tardif détecté).
  const canReopenGeneric =
    canUseReopenAction
    && order?.payment_status === "cancelled"
    && !canReopenLatePaid;

  const reopenLatePaidOrder = async () => {
    setReopenBusy(true);
    try {
      await api.post(`/admin/orders/${order.id}/reopen`, {
        mark_paid: true,
        note: "Late payment received after auto-cancel",
      });
      toast.success("Order reopened and marked as paid");
      onUpdate();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setReopenBusy(false);
    }
  };

  const reopenOrder = async () => {
    const note = window.prompt("Motif de réouverture (optionnel — trace dans l'historique) :", "") || "";
    if (!await confirm({
      title: "Réouvrir cette commande annulée ?",
      description: "Le stock sera à nouveau décrémenté (409 si un article n'est plus disponible). La commande repasse en attente de paiement.",
    })) return;
    setReopenBusy(true);
    try {
      await api.post(`/admin/orders/${order.id}/reopen`, { mark_paid: false, note });
      toast.success("Commande réouverte");
      onUpdate();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setReopenBusy(false);
    }
  };

  const deleteOrder = async () => {
    if (!await confirm({ title: `Move order ${order.order_number} to trash?`, description: "It stays recoverable there — nothing is lost." })) return;
    try {
      await api.delete(`/admin/orders/${order.id}`);
      toast.success("Order moved to trash");
      onUpdate();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };
  const [tracking, setTracking] = useState(order.shipping_info?.tracking_number || "");
  const [carrier, setCarrier] = useState(order.shipping_info?.carrier || "Canada Post");
  const [deliverySyncBusy, setDeliverySyncBusy] = useState(false);
  const [shipInfo, setShipInfo] = useState(order.shipping_info || {});
  const manifestUrl = shipInfo.cp_transmitted && order.dispatch_batch
    ? `${API_BASE.replace(/\/api$/, "")}/api/admin/dispatch/${order.dispatch_batch}/manifest.pdf`
    : "";

  useEffect(() => { setShipInfo(order.shipping_info || {}); }, [order.shipping_info]);

  const [noteText, setNoteText] = useState("");
  const [noteVisible, setNoteVisible] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState("");
  const [msgFile, setMsgFile] = useState(null);
  const [msgBusy, setMsgBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirmPayment = async () => {
    try {
      await api.post(`/admin/orders/${order.id}/confirm-payment`);
      toast.success("Payment confirmed — moved to Processing");
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const openRefundCase = async () => {
    const motif = refundReason.trim();
    if (!motif) return;
    try {
      await api.post(`/admin/orders/${order.id}/refund-case`, { reason: motif });
      toast.success("Dossier ouvert — la commission affiliée est gelée");
      setRefundReason("");
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const loadMessages = useCallback(() => {
    api.get(`/admin/orders/${order.id}/messages`)
      .then((r) => setMessages(Array.isArray(r.data) ? r.data : []))
      .catch(() => setMessages([]));
  }, [order.id]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  const sendMessage = async () => {
    if (!msgText.trim() && !msgFile) { toast.error("Message vide"); return; }
    setMsgBusy(true);
    try {
      const fd = new FormData();
      fd.append("text", msgText.trim());
      if (msgFile) fd.append("file", msgFile);
      await api.post(`/admin/orders/${order.id}/messages`, fd);
      setMsgText(""); setMsgFile(null);
      loadMessages();
      toast.success("Message envoyé");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setMsgBusy(false);
    }
  };

  const updateStatus = async (field, value) => {
    try {
      await api.put(`/admin/orders/${order.id}/status?${field}=${value}`);
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const saveShipping = async () => {
    try {
      await api.put(`/admin/orders/${order.id}/shipping`, { carrier, tracking_number: tracking });
      toast.success("Tracking saved — order marked as shipped");
      onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const syncDeliveredFromTracking = async () => {
    setDeliverySyncBusy(true);
    try {
      const { data } = await api.post(`/admin/orders/${order.id}/sync-delivery`);
      if (!data?.tracked) {
        toast.error("Repérage Canada Post indisponible pour le moment.");
        return;
      }
      if (data?.updated) {
        toast.success("Livraison confirmée: statut mis à jour à delivered.");
      } else if (data?.delivered) {
        toast.success("Commande déjà marquée delivered.");
      } else {
        toast("Colis pas encore livré selon le repérage.");
      }
      onUpdate();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setDeliverySyncBusy(false);
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      await api.post(`/admin/orders/${order.id}/notes`, { text: noteText, visible_to_customer: noteVisible });
      if (noteVisible) toast.success("Note added — email sent to customer");
      setNoteText(""); setNoteVisible(false); onUpdate();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const resendEmail = async () => {
    try {
      const { data } = await api.post(`/admin/orders/${order.id}/resend-email`);
      toast.success(`Order email re-sent to ${data.sent_to}`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  const addr = order.shipping_address || {};

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div className="bg-[#fafafa] w-full max-w-3xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="order-detail-drawer">
        <div className="bg-ink text-white px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em]">// ORDER</div>
            <div className="font-display text-xl font-bold tracking-tight" data-testid="order-detail-number">{order.order_number}</div>
            {order.dispatch_batch && (
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-glacier" data-testid="order-detail-dispatch-batch">
                LOT D'EXPÉDITION · {order.dispatch_batch}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={deleteOrder} data-testid="delete-order-btn" title="Move to trash"
              className="text-white/60 hover:text-white">
              <Trash2 size={18} />
            </button>
            <button onClick={onClose} aria-label="Close" data-testid="close-order-detail"><X size={20} /></button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status row */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={order.payment_status} />
            <StatusBadge status={order.fulfillment_status} />
            {canReopenLatePaid && (
              <button
                onClick={reopenLatePaidOrder}
                disabled={reopenBusy}
                data-testid="reopen-late-paid-btn"
                className="bg-amber-600 text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-amber-700 disabled:opacity-50"
                title="Réouvrir la commande annulée automatiquement après paiement tardif détecté"
              >
                <Undo2 size={14} /> {reopenBusy ? "Réouverture…" : "Réouvrir + marquer payé"}
              </button>
            )}
            {canReopenGeneric && (
              <button
                onClick={reopenOrder}
                disabled={reopenBusy}
                data-testid="reopen-order-btn"
                className="bg-nordfjord text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                title="Réouvrir cette commande annulée (repasse en attente de paiement)"
              >
                <Undo2 size={14} /> {reopenBusy ? "Réouverture…" : "Réouvrir"}
              </button>
            )}
            {order.payment_status !== "paid" && (
              <button
                onClick={confirmPayment}
                data-testid="confirm-payment-btn"
                className="bg-emerald-600 text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-emerald-700"
              >
                <CheckCircle2 size={14} /> Confirm Payment
              </button>
            )}
            <a
              href={`${API_BASE}/orders/${order.id}/invoice.pdf`}
              target="_blank" rel="noopener noreferrer"
              data-testid="download-invoice-pdf"
              className="border border-ink text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-ink hover:text-white"
            >
              <FileText size={14} /> Invoice PDF
            </a>
            {order.email && (
              <button
                onClick={resendEmail}
                data-testid="resend-email-btn"
                className="border border-ink text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-ink hover:text-white"
              >
                <Mail size={14} /> Resend Email
              </button>
            )}
          </div>

          {/* Customer + Address */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white border border-ink/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">Customer</div>
              <div className="font-bold mt-1">{addr.full_name || "—"}</div>
              <div className="text-sm text-foreground/70">{order.email || "Guest"}</div>
              {addr.phone && <div className="text-sm text-foreground/70">{addr.phone}</div>}
            </div>
            <div className="bg-white border border-ink/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">Ship to</div>
              <div className="text-sm mt-1">{addr.address1}{addr.address2 ? `, ${addr.address2}` : ""}</div>
              <div className="text-sm">{addr.city}, {addr.province} {addr.postal_code}</div>
              <div className="text-sm">{addr.country}</div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white border border-ink/10">
            <div className="px-4 py-3 border-b border-ink/10 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">Items</div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.product_id} className="border-t border-ink/5">
                    <td className="px-4 py-3">
                      <div className="font-bold">{it.name_en}</div>
                      <div className="font-mono text-[10px] text-foreground/50">{it.slug} · {it.qty}× @ ${it.price_cad?.toFixed(2)}</div>
                      {it.preorder && <span className="inline-block mt-1 text-[10px] font-mono uppercase tracking-[0.15em] bg-orange-500 text-white px-2 py-0.5">PRE-ORDER</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">${it.line_total?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary/50">
                <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">Subtotal</td><td className="px-4 py-1 text-right text-sm tabular-nums">${order.subtotal?.toFixed(2)}</td></tr>
                {order.discount > 0 && (
                  <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">Discount {order.coupon?.code && `(${order.coupon.code})`}</td><td className="px-4 py-1 text-right text-sm tabular-nums text-emerald-700">-${order.discount?.toFixed(2)}</td></tr>
                )}
                <tr><td className="px-4 py-1 text-right text-xs text-foreground/60">Shipping</td><td className="px-4 py-1 text-right text-sm tabular-nums">${order.shipping?.toFixed(2)}</td></tr>
                <tr><td className="px-4 py-2 text-right font-bold uppercase">Total CAD</td><td className="px-4 py-2 text-right font-display font-bold text-lg tabular-nums" data-testid="order-total">${order.total?.toFixed(2)}</td></tr>
              </tfoot>
            </table>
            </div>
          </div>

          {/* Shipping */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-3 flex items-center gap-2"><Truck size={12} /> Shipping & Tracking</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Carrier</label>
                <input value={carrier} onChange={(e) => setCarrier(e.target.value)} data-testid="shipping-carrier" className="w-full border border-ink/20 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Tracking Number</label>
                <input value={tracking} onChange={(e) => setTracking(e.target.value)} data-testid="shipping-tracking" className="w-full border border-ink/20 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={saveShipping} data-testid="save-shipping-btn" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-foreground/80">
                <Save size={14} /> Save & Mark Shipped
              </button>
              {tracking && order.fulfillment_status !== "delivered" && (
                <button
                  onClick={syncDeliveredFromTracking}
                  disabled={deliverySyncBusy}
                  data-testid="sync-delivery-btn"
                  className="border border-ink/30 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 hover:bg-ink hover:text-white disabled:opacity-50"
                  title="Vérifier le repérage Canada Post et passer la commande en livré"
                >
                  <Truck size={14} /> {deliverySyncBusy ? "Vérification…" : "Vérifier livraison"}
                </button>
              )}
            </div>
            {order.shipping_info?.shipped_at && (
              <div className="font-mono text-[10px] text-foreground/50 mt-2">Shipped at: {order.shipping_info.shipped_at}</div>
            )}

            {/* Postes Canada — l'étiquette se génère depuis l'écran Dispatch.
                Ici, lecture seule : télécharger l'étiquette / le manifeste. */}
            {shipInfo?.label_url && (
              <div className="mt-4 pt-4 border-t border-ink/10 flex flex-wrap items-center gap-3">
                <a
                  href={`${API_BASE.replace(/\/api$/, "")}${shipInfo.label_url}`}
                  target="_blank" rel="noopener noreferrer"
                  data-testid="download-label-btn"
                  className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 inline-flex items-center gap-2"
                >
                  <Download size={14} /> Download label PDF
                </a>
                <span className={`font-mono text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${
                  shipInfo.cp_transmitted ? "border-green-600 text-green-700" : "border-red-600 text-red-700"}`}>
                  {shipInfo.cp_transmitted ? "Manifest transmitted" : "Not transmitted"}
                </span>
                {manifestUrl && (
                  <a
                    href={manifestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="download-manifest-btn"
                    className="border border-ink text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 flex items-center gap-2 hover:bg-ink hover:text-white"
                  >
                    <Download size={14} /> Download manifest PDF
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Actions de statut — remplacent les menus déroulants libres : chaque
              transition a désormais UN chemin dédié avec ses effets de bord.
              La préparation (packing/packed) avance depuis l'écran Fulfillment,
              l'expédition via le suivi, l'étiquetage via Dispatch, le
              remboursement via l'écran Refunds. */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-3">Actions de statut</div>
            <div className="flex flex-wrap gap-2">
              {["awaiting_etransfer", "awaiting_crypto"].includes(order.payment_status) && (
                <button onClick={() => updateStatus("payment_status", "cancelled")} data-testid="cancel-order-btn"
                  className="border border-ink/30 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 hover:border-red-500 hover:text-red-500">
                  Annuler
                </button>
              )}
              {["awaiting_etransfer", "awaiting_crypto"].includes(order.payment_status) && (
                <button onClick={() => updateStatus("payment_status", "failed")} data-testid="mark-failed-btn"
                  className="border border-ink/30 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 hover:border-amber-500 hover:text-amber-500">
                  Marquer échoué
                </button>
              )}
            </div>
          </div>

          {/* Remboursement — décision et règlement dans l'écran Refunds. Ici :
              ouvrir un dossier (gèle la commission) ou lire l'état. */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-2">Remboursement</div>
            {order.refund_status ? (
              <div className="font-mono text-[11px] text-foreground/70" data-testid="refund-case-state">
                Dossier : {order.refund_status}
                {order.refund_reason ? ` — ${order.refund_reason}` : ""}
                {order.refunded_amount > 0 ? ` · Remboursé : $${order.refunded_amount.toFixed(2)}` : ""}
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Motif (erreur / dommage — sous 48 h)"
                  data-testid="refund-case-reason"
                  className="border border-ink/20 px-3 py-2 text-sm flex-1 min-w-[16rem]"
                />
                <button onClick={openRefundCase} disabled={!refundReason.trim()}
                  data-testid="open-refund-case-btn"
                  className="border border-ink/30 text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 hover:border-nova hover:text-nova disabled:opacity-40 disabled:cursor-not-allowed">
                  Ouvrir un dossier
                </button>
                <span className="font-mono text-[10px] text-foreground/50">gèle la commission affiliée</span>
              </div>
            )}
          </div>

          {/* Conversation client — photo produit endommagé, coordination d'un
              remplacement. Le fil est la source de vérité, pas la boîte mail. */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-3 flex items-center gap-2"><MessageSquarePlus size={12} /> Conversation</div>
            <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className={`rounded-lg p-3 max-w-[85%] ${m.sender === "admin" ? "bg-ink text-white ml-auto" : "bg-secondary/60"}`}>
                  <div className="text-xs font-bold mb-1">{m.sender === "admin" ? "Support" : "Client"}</div>
                  {m.text && <div className="text-sm whitespace-pre-wrap">{m.text}</div>}
                  {m.image_url && (
                    <a href={`${API_BASE.replace(/\/api$/, "")}${m.image_url}`} target="_blank" rel="noopener noreferrer">
                      <img src={`${API_BASE.replace(/\/api$/, "")}${m.image_url}`} alt="pièce jointe" className="mt-2 max-h-48 rounded border border-ink/10 bg-white" />
                    </a>
                  )}
                  <div className="font-mono text-[10px] opacity-60 mt-1">{(m.created_at || "").slice(0, 16).replace("T", " ")}</div>
                </div>
              ))}
              {!messages.length && <div className="font-mono text-[10px] text-foreground/50">Aucun message.</div>}
            </div>
            <div className="flex gap-2 items-center">
              <input value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Répondre au client…" data-testid="msg-input" className="flex-1 border border-ink/20 px-3 py-2 text-sm" />
              <label className="border border-ink/20 px-3 py-2 text-sm cursor-pointer hover:bg-ink/5" title="Joindre une photo">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setMsgFile(e.target.files?.[0] || null)} />
                📎
              </label>
              <button onClick={sendMessage} disabled={msgBusy} data-testid="msg-send" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 disabled:opacity-50">Envoyer</button>
            </div>
            {msgFile && <div className="font-mono text-[10px] text-foreground/50 mt-1">Pièce jointe : {msgFile.name}</div>}
          </div>

          {/* Notes */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-3 flex items-center gap-2"><MessageSquarePlus size={12} /> Order Notes</div>
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {(order.notes || []).map((n, i) => (
                <div key={i} className={`text-sm border-l-2 pl-3 py-1 ${n.visible_to_customer ? "border-emerald-500" : "border-ink/30"}`} data-testid={`note-${i}`}>
                  <div className="text-foreground/85">{n.text}</div>
                  <div className="font-mono text-[10px] text-foreground/50 mt-1">
                    {n.admin_email || n.author} · {((n.ts || n.created_at) || "").slice(0, 16).replace("T", " ")}
                    {n.visible_to_customer && <span className="ml-2 text-emerald-600 font-bold">CUSTOMER</span>}
                  </div>
                </div>
              ))}
              {!order.notes?.length && <div className="font-mono text-[10px] text-foreground/50">No notes yet.</div>}
            </div>
            <div className="flex gap-2">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" data-testid="note-input" className="flex-1 border border-ink/20 px-3 py-2 text-sm" />
              <button onClick={addNote} data-testid="add-note-btn" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4">Add</button>
            </div>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={noteVisible} onChange={(e) => setNoteVisible(e.target.checked)} data-testid="note-visible-checkbox" />
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">Visible to customer (sends email)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
