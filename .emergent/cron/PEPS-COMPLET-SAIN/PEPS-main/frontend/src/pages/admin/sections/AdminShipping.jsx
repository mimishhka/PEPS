import { useEffect, useState } from "react";
import { Plus, Trash2, X, Save, MapPin, Edit } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";

export default function AdminShipping() {
  const confirm = useConfirm();
  const [zones, setZones] = useState([]);
  const [editingZone, setEditingZone] = useState(null);
  const [editingMethod, setEditingMethod] = useState(null);

  const load = () => api.get("/admin/shipping/zones").then((r) => setZones(r.data));
  useEffect(() => { load(); }, []);

  const blankZone = { name: "", countries: ["CA"], provinces: [] };
  const blankMethod = (zone_id) => ({ zone_id, name: "", cost_cad: 0, eta_days: "", active: true });

  const saveZone = async () => {
    try {
      if (editingZone.id) await api.put(`/admin/shipping/zones/${editingZone.id}`, editingZone);
      else await api.post("/admin/shipping/zones", editingZone);
      toast.success("Zone saved"); setEditingZone(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const delZone = async (id) => {
    const ok = await confirm({
      title: "Delete this zone and all its methods?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/admin/shipping/zones/${id}`);
    toast.success("Deleted"); load();
  };
  const saveMethod = async () => {
    try {
      const payload = { ...editingMethod, cost_cad: parseFloat(editingMethod.cost_cad) || 0 };
      if (editingMethod.id) await api.put(`/admin/shipping/methods/${editingMethod.id}`, payload);
      else await api.post("/admin/shipping/methods", payload);
      toast.success("Method saved"); setEditingMethod(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const delMethod = async (id) => {
    const ok = await confirm({
      title: "Delete this method?",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    await api.delete(`/admin/shipping/methods/${id}`);
    toast.success("Deleted"); load();
  };

  return (
    <div className="p-8" data-testid="admin-shipping">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// LOGISTICS</div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Shipping</h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{zones.length} zones</p>
        </div>
        <button onClick={() => setEditingZone({ ...blankZone })} data-testid="new-zone-btn" className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80">
          <Plus size={14} /> New Zone
        </button>
      </div>

      <div className="space-y-4">
        {zones.map((z) => (
          <div key={z.id} className="bg-white border border-ink/10" data-testid={`zone-${z.id}`}>
            <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin size={16} />
                <div>
                  <div className="font-display text-lg font-bold uppercase tracking-tight">{z.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60">
                    {z.countries.join(", ")} {z.provinces.length ? `· ${z.provinces.length} provinces` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditingZone({ ...z })} data-testid={`edit-zone-${z.id}`} className="border border-ink/30 px-2 py-1 hover:bg-ink hover:text-white"><Edit size={12} /></button>
                <button onClick={() => delZone(z.id)} data-testid={`delete-zone-${z.id}`} className="border border-ink/30 px-2 py-1 hover:bg-error hover:text-white hover:border-error"><Trash2 size={12} /></button>
                <button onClick={() => setEditingMethod(blankMethod(z.id))} data-testid={`add-method-${z.id}`} className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-3 py-1.5 flex items-center gap-1.5"><Plus size={12} /> Method</button>
              </div>
            </div>
            <div className="divide-y divide-ink/5">
              {(z.methods || []).map((m) => (
                <div key={m.id} className="px-6 py-3 flex items-center justify-between" data-testid={`method-${m.id}`}>
                  <div>
                    <div className="font-bold text-sm">{m.name}</div>
                    <div className="font-mono text-[10px] text-foreground/50">{m.eta_days} {m.active ? "" : "· INACTIVE"}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-bold tabular-nums">${m.cost_cad.toFixed(2)}</div>
                    <button onClick={() => setEditingMethod({ ...m })} className="border border-ink/30 px-2 py-1 hover:bg-ink hover:text-white"><Edit size={11} /></button>
                    <button onClick={() => delMethod(m.id)} className="border border-ink/30 px-2 py-1 hover:bg-error hover:text-white hover:border-error"><Trash2 size={11} /></button>
                  </div>
                </div>
              ))}
              {!z.methods?.length && <div className="px-6 py-4 font-mono text-xs text-foreground/50">No methods configured.</div>}
            </div>
          </div>
        ))}
        {!zones.length && <div className="bg-white border border-ink/10 p-12 text-center font-mono text-sm text-foreground/50">No zones configured yet.</div>}
      </div>

      {editingZone && (
        <Modal onClose={() => setEditingZone(null)} title={editingZone.id ? "Edit Zone" : "New Zone"} test="zone-editor">
          <F label="Name" value={editingZone.name} onChange={(v) => setEditingZone({ ...editingZone, name: v })} test="z-name" />
          <F label="Countries (comma-separated)" value={editingZone.countries.join(",")} onChange={(v) => setEditingZone({ ...editingZone, countries: v.split(",").map((s) => s.trim()).filter(Boolean) })} test="z-countries" />
          <F label="Provinces (comma-separated, optional)" value={editingZone.provinces.join(",")} onChange={(v) => setEditingZone({ ...editingZone, provinces: v.split(",").map((s) => s.trim()).filter(Boolean) })} test="z-provinces" />
          <Actions onSave={saveZone} onCancel={() => setEditingZone(null)} saveTest="save-zone-btn" />
        </Modal>
      )}
      {editingMethod && (
        <Modal onClose={() => setEditingMethod(null)} title={editingMethod.id ? "Edit Method" : "New Method"} test="method-editor">
          <F label="Name" value={editingMethod.name} onChange={(v) => setEditingMethod({ ...editingMethod, name: v })} test="m-name" />
          <div className="grid grid-cols-2 gap-3">
            <F label="Cost (CAD)" type="number" value={editingMethod.cost_cad} onChange={(v) => setEditingMethod({ ...editingMethod, cost_cad: v })} test="m-cost" />
            <F label="ETA (e.g. 2-3 days)" value={editingMethod.eta_days} onChange={(v) => setEditingMethod({ ...editingMethod, eta_days: v })} test="m-eta" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!editingMethod.active} onChange={(e) => setEditingMethod({ ...editingMethod, active: e.target.checked })} data-testid="m-active" className="accent-ink" /> Active
          </label>
          <Actions onSave={saveMethod} onCancel={() => setEditingMethod(null)} saveTest="save-method-btn" />
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose, title, test }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border border-ink w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()} data-testid={test}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-display text-xl font-bold uppercase tracking-tight">{title}</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function F({ label, value, onChange, type = "text", test }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-foreground/60">{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={test} className="w-full border border-ink/20 px-3 py-2 text-sm" />
    </div>
  );
}
function Actions({ onSave, onCancel, saveTest }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onSave} data-testid={saveTest} className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-5 py-3 flex items-center gap-2"><Save size={14} /> Save</button>
      <button onClick={onCancel} className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-5 py-3">Cancel</button>
    </div>
  );
}
