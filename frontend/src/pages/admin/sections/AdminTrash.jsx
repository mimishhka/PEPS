// frontend/src/pages/admin/sections/AdminTrash.jsx — NOUVEAU fichier.
// Corbeille générique — un onglet par type de donnée, restauration ou purge
// définitive. Réservé aux "admin" (owner) : la restauration/purge est une
// action à fort impact, volontairement non déléguée à un staff même avec
// accès "manage" sur la zone correspondante.
import { useEffect, useState } from "react";
import { RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";

const RESOURCES = [
  { key: "orders", label: "Orders", noAutoPurge: true },
  { key: "products", label: "Products" },
  { key: "coupons", label: "Coupons" },
  { key: "shipping_zones", label: "Shipping zones" },
  { key: "shipping_methods", label: "Shipping methods" },
];

function itemLabel(resource, item) {
  switch (resource) {
    case "orders": return item.order_number || item.id;
    case "products": return item.name_en || item.slug || item.id;
    case "coupons": return item.code || item.id;
    case "shipping_zones": return item.name || item.id;
    case "shipping_methods": return item.name || item.id;
    default: return item.id;
  }
}

export default function AdminTrash() {
  const [resource, setResource] = useState("orders");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const load = () => {
    setSelected(new Set());
    api.get(`/admin/trash/${resource}`).then((r) => setItems(r.data)).catch(() => setItems([]));
  };
  useEffect(() => { load(); }, [resource]);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)));
  };

  const restore = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/trash/${resource}/restore`, { ids: [...selected] });
      toast.success(`Restored ${data.restored}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Permanently delete ${selected.size} item(s)? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/trash/${resource}/purge`, { ids: [...selected] });
      toast.success(`Permanently deleted ${data.purged}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const activeResource = RESOURCES.find((r) => r.key === resource);

  return (
    <div className="p-8" data-testid="admin-trash">
      <div className="mb-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// TRASH</div>
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Trash</h1>
        <p className="font-mono text-xs text-foreground/60 mt-1">
          Deleted items are recoverable here for 30 days, then permanently purged automatically
          {" "}— except orders, which are kept until you purge them manually.
        </p>
      </div>

      <div className="flex gap-1 border-b border-ink/20 mb-6">
        {RESOURCES.map((r) => (
          <button key={r.key} onClick={() => setResource(r.key)} data-testid={`trash-tab-${r.key}`}
            className={`font-mono text-xs uppercase tracking-[0.15em] px-4 py-3 -mb-px border-b-2 ${
              resource === r.key ? "border-ink font-bold" : "border-transparent text-foreground/60 hover:text-ink"
            }`}>
            {r.label}
          </button>
        ))}
      </div>

      {activeResource?.noAutoPurge && (
        <div className="flex items-start gap-2 border border-copper/40 bg-copper/5 px-4 py-3 mb-5 text-xs text-foreground/70">
          <AlertTriangle size={14} className="text-copper mt-0.5 shrink-0" />
          Orders are never purged automatically — they stay in trash until you purge them yourself.
          A paid order is an accounting record; restore it if it was deleted by mistake.
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em]">
          <input type="checkbox" checked={items.length > 0 && selected.size === items.length} onChange={toggleAll} />
          {selected.size} selected
        </label>
        <div className="flex gap-3">
          <button onClick={restore} disabled={busy || selected.size === 0} data-testid="trash-restore-btn"
            className="flex items-center gap-2 bg-ink text-white font-mono text-xs uppercase tracking-[0.2em] px-4 py-2 disabled:opacity-40">
            <RotateCcw size={13} /> Restore
          </button>
          <button onClick={purge} disabled={busy || selected.size === 0} data-testid="trash-purge-btn"
            className="flex items-center gap-2 border border-signal text-signal font-mono text-xs uppercase tracking-[0.2em] px-4 py-2 disabled:opacity-40 hover:bg-signal hover:text-white">
            <Trash2 size={13} /> Delete forever
          </button>
        </div>
      </div>

      <div className="bg-white border border-ink/10">
        {items.length === 0 ? (
          <div className="p-8 text-center text-foreground/50 font-mono text-xs uppercase tracking-[0.15em]" data-testid="trash-empty">
            Trash is empty
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-ink/5" data-testid={`trash-row-${item.id}`}>
                  <td className="px-4 py-3 w-8">
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                  </td>
                  <td className="px-2 py-3 font-mono">{itemLabel(resource, item)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-foreground/50">
                    Deleted {new Date(item.deleted_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
