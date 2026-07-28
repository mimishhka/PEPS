import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, X, Save, Ticket } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/admin/coupons").then((r) => setCoupons(r.data));
  useEffect(() => { load(); }, []);

  const blank = {
    code: "", discount_type: "percent", value: 10, min_subtotal: 0,
    usage_limit: null, active: true, expires_at: null, public: false,
  };

  const save = async () => {
    try {
      const payload = { ...editing };
      if (payload.usage_limit === "" || payload.usage_limit == null) payload.usage_limit = null;
      else payload.usage_limit = parseInt(payload.usage_limit);
      if (!payload.expires_at) payload.expires_at = null;
      payload.value = parseFloat(payload.value);
      payload.min_subtotal = parseFloat(payload.min_subtotal) || 0;
      if (editing.id) await api.put(`/admin/coupons/${editing.id}`, payload);
      else await api.post("/admin/coupons", payload);
      toast.success("Saved"); setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this coupon?")) return;
    await api.delete(`/admin/coupons/${id}`);
    toast.success("Deleted"); load();
  };

  return (
    <div className="p-8" data-testid="admin-coupons">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// PROMOTIONS</div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Coupons</h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{coupons.length} active codes</p>
        </div>
        <button onClick={() => setEditing({ ...blank })} data-testid="new-coupon-btn" className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80">
          <Plus size={14} /> New Coupon
        </button>
      </div>

      <div className="bg-white border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-foreground/70">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Code</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Discount</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Min subtotal</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Usage</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Expires</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Active</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-ink/5" data-testid={`coupon-row-${c.code}`}>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2"><Ticket size={14} /> <span className="font-mono font-bold">{c.code}</span></div>
                </td>
                <td className="px-6 py-3 font-mono text-sm">
                  {c.discount_type === "percent" ? `${c.value}% off` : `$${c.value.toFixed(2)} off`}
                </td>
                <td className="px-6 py-3 font-mono text-xs">${(c.min_subtotal || 0).toFixed(2)}</td>
                <td className="px-6 py-3 font-mono text-xs">
                  {c.used_count || 0}{c.usage_limit ? ` / ${c.usage_limit}` : " / ∞"}
                </td>
                <td className="px-6 py-3 font-mono text-xs">{c.expires_at ? c.expires_at.slice(0, 10) : "—"}</td>
                <td className="px-6 py-3">
                  {c.active
                    ? <span className="text-[10px] font-mono uppercase tracking-[0.15em] bg-emerald-600 text-white px-2 py-0.5">ON</span>
                    : <span className="text-[10px] font-mono uppercase tracking-[0.15em] bg-gray-400 text-white px-2 py-0.5">OFF</span>}
                </td>
                <td className="px-6 py-3 text-right">
                  <button onClick={() => setEditing({ ...c })} data-testid={`edit-coupon-${c.code}`} className="border border-ink/30 px-2 py-1 hover:bg-ink hover:text-white mr-1"><Edit size={12} /></button>
                  <button onClick={() => del(c.id)} data-testid={`delete-coupon-${c.code}`} className="border border-ink/30 px-2 py-1 hover:bg-red-600 hover:text-white hover:border-red-600"><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
            {!coupons.length && (
              <tr><td colSpan={7} className="px-6 py-12 text-center font-mono text-xs text-foreground/50">No coupons yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white border border-ink w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} data-testid="coupon-editor">
            <div className="flex items-center justify-between mb-4">
              <div className="font-display text-xl font-bold uppercase tracking-tight">{editing.id ? "Edit Coupon" : "New Coupon"}</div>
              <button onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <F label="Code (uppercase)" value={editing.code} onChange={(v) => setEditing({ ...editing, code: v.toUpperCase() })} test="c-code" />
              <div className="grid grid-cols-2 gap-3">
                <F label="Type" select={["percent", "fixed"]} value={editing.discount_type} onChange={(v) => setEditing({ ...editing, discount_type: v })} test="c-type" />
                <F label={editing.discount_type === "percent" ? "Percent (%)" : "Amount (CAD)"} type="number" value={editing.value} onChange={(v) => setEditing({ ...editing, value: v })} test="c-value" />
              </div>
              <F label="Minimum subtotal (CAD)" type="number" value={editing.min_subtotal} onChange={(v) => setEditing({ ...editing, min_subtotal: v })} test="c-min" />
              <F label="Usage limit (blank = unlimited)" type="number" value={editing.usage_limit ?? ""} onChange={(v) => setEditing({ ...editing, usage_limit: v })} test="c-limit" />
              <F label="Expires at (YYYY-MM-DD, optional)" value={editing.expires_at?.slice(0, 10) ?? ""} onChange={(v) => setEditing({ ...editing, expires_at: v ? `${v}T23:59:59+00:00` : null })} test="c-expires" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} data-testid="c-active" className="accent-ink" />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.public} onChange={(e) => setEditing({ ...editing, public: e.target.checked })} data-testid="c-public" className="accent-ink" />
                Show publicly at checkout (available coupons)
              </label>
              <div className="flex gap-2 pt-2">
                <button onClick={save} data-testid="save-coupon-btn" className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-5 py-3 flex items-center gap-2"><Save size={14} /> Save</button>
                <button onClick={() => setEditing(null)} className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-5 py-3">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ label, value, onChange, type = "text", select, test }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-foreground/60">{label}</label>
      {select ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={test} className="w-full border border-ink/20 px-3 py-2 text-sm bg-white">
          {select.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={test} className="w-full border border-ink/20 px-3 py-2 text-sm" />
      )}
    </div>
  );
}
