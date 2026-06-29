import { useEffect, useMemo, useState } from "react";
import { Download, Search, X, FileText, CheckCircle2, Save, Truck, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";
import { StatusBadge } from "../AdminLayout";

const FULFILLMENT_OPTS = ["pending", "preorder", "processing", "shipped", "delivered", "cancelled"];
const PAYMENT_OPTS = ["awaiting_etransfer", "awaiting_crypto", "paid", "refunded"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterFulfill, setFilterFulfill] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = () => api.get("/admin/orders").then((r) => setOrders(r.data));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filterPayment !== "all" && o.payment_status !== filterPayment) return false;
      if (filterFulfill !== "all" && o.fulfillment_status !== filterFulfill) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${o.order_number} ${o.email || ""} ${o.shipping_address?.full_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, query, filterPayment, filterFulfill]);

  return (
    <div className="p-8" data-testid="admin-orders">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// ORDERS</div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Orders</h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{filtered.length} of {orders.length}</p>
        </div>
        <a
          href={`${API_BASE}/admin/orders.csv`}
          target="_blank" rel="noopener noreferrer"
          data-testid="export-orders-csv"
          className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80"
        >
          <Download size={14} /> Export CSV
        </a>
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
      </div>

      {/* Table */}
      <div className="bg-white border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-foreground/70">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Order</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Customer</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Method</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Payment</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Fulfillment</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]">Total</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-t border-ink/5 hover:bg-secondary/40" data-testid={`order-row-${o.order_number}`}>
                <td className="px-6 py-3">
                  <div className="font-mono font-bold text-xs">{o.order_number}</div>
                  <div className="font-mono text-[10px] text-foreground/50">{(o.created_at || "").slice(0, 10)}</div>
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
            {!filtered.length && (
              <tr><td colSpan={7} className="px-6 py-12 text-center font-mono text-xs text-foreground/50">No orders match the filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && <OrderDetail order={selected} onClose={() => setSelected(null)} onUpdate={() => { load(); api.get(`/admin/orders`).then(r => setSelected(r.data.find(x => x.id === selected.id) || null)); }} />}
    </div>
  );
}

function OrderDetail({ order, onClose, onUpdate }) {
  const [tracking, setTracking] = useState(order.shipping_info?.tracking_number || "");
  const [carrier, setCarrier] = useState(order.shipping_info?.carrier || "Canada Post");
  const [noteText, setNoteText] = useState("");

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

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      await api.post(`/admin/orders/${order.id}/notes`, { text: noteText });
      setNoteText(""); onUpdate();
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
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="close-order-detail"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status row */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={order.payment_status} />
            <StatusBadge status={order.fulfillment_status} />
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
                <tr><td className="px-4 py-2 text-right font-bold uppercase">Total CAD</td><td className="px-4 py-2 text-right font-display font-extrabold text-lg tabular-nums" data-testid="order-total">${order.total?.toFixed(2)}</td></tr>
              </tfoot>
            </table>
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
              <button
                onClick={() => toast.info("Connect a Canada Post merchant account to print labels (placeholder).")}
                className="border border-ink text-xs font-mono uppercase tracking-[0.2em] px-4 py-2 hover:bg-ink hover:text-white"
              >
                Print Label
              </button>
            </div>
            {order.shipping_info?.shipped_at && (
              <div className="font-mono text-[10px] text-foreground/50 mt-2">Shipped at: {order.shipping_info.shipped_at}</div>
            )}
          </div>

          {/* Status quick switches */}
          <div className="bg-white border border-ink/10 p-4 grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Payment Status</label>
              <select value={order.payment_status} onChange={(e) => updateStatus("payment_status", e.target.value)} data-testid="payment-status-select" className="w-full border border-ink/20 px-3 py-2 text-sm bg-white">
                {PAYMENT_OPTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1">Fulfillment Status</label>
              <select value={order.fulfillment_status} onChange={(e) => updateStatus("fulfillment_status", e.target.value)} data-testid="fulfillment-status-select" className="w-full border border-ink/20 px-3 py-2 text-sm bg-white">
                {FULFILLMENT_OPTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white border border-ink/10 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-3 flex items-center gap-2"><MessageSquarePlus size={12} /> Internal Notes</div>
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {(order.notes || []).map((n, i) => (
                <div key={i} className="text-sm border-l-2 border-ink/30 pl-3 py-1" data-testid={`note-${i}`}>
                  <div className="text-foreground/85">{n.text}</div>
                  <div className="font-mono text-[10px] text-foreground/50 mt-1">{n.admin_email} · {(n.ts || "").slice(0, 16).replace("T", " ")}</div>
                </div>
              ))}
              {!order.notes?.length && <div className="font-mono text-[10px] text-foreground/50">No notes yet.</div>}
            </div>
            <div className="flex gap-2">
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add an internal note…" data-testid="note-input" className="flex-1 border border-ink/20 px-3 py-2 text-sm" />
              <button onClick={addNote} data-testid="add-note-btn" className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-4">Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
