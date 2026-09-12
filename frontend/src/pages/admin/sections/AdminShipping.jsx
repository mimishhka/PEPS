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

  const load = () => api.get("/admin/shipping/zones")
    .then((r) => setZones(r.data))
    .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
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
    if (!await confirm({ title: "Delete this zone and all its methods?", destructive: true })) return;
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
    if (!await confirm({ title: "Delete this method?", destructive: true })) return;
    await api.delete(`/admin/shipping/methods/${id}`);
    toast.success("Deleted"); load();
  };

  return (
    <div className="p-8" data-testid="admin-shipping">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-data text-[11px] tracking-[0.18em] text-nova">Logistique</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-1 text-nordfjord">Shipping</h1>
          <p className="font-data text-xs text-glacier mt-1">{zones.length} zones</p>
        </div>
        <button onClick={() => setEditingZone({ ...blankZone })} data-testid="new-zone-btn" className="bg-nordfjord text-white font-data text-xs rounded-lg px-4 py-2.5 flex items-center gap-2 hover:opacity-90">
          <Plus size={14} /> Nouvelle zone
        </button>
      </div>

      <div className="space-y-4">
        {zones.map((z) => (
          <div key={z.id} className="bg-card border border-ash/60 rounded-xl" data-testid={`zone-${z.id}`}>
            <div className="px-6 py-4 border-b border-ash/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-nova" />
                <div>
                  <div className="font-display text-lg font-bold tracking-tight text-nordfjord">{z.name}</div>
                  <div className="font-data text-[10px] text-glacier">
                    {z.countries.join(", ")} {z.provinces.length ? `· ${z.provinces.length} provinces` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditingZone({ ...z })} data-testid={`edit-zone-${z.id}`} className="border border-ash text-glacier rounded-md px-2 py-2 hover:bg-clinical hover:text-nordfjord"><Edit size={12} /></button>
                <button onClick={() => delZone(z.id)} data-testid={`delete-zone-${z.id}`} className="border border-ash text-glacier rounded-md px-2 py-2 hover:bg-error hover:text-white hover:border-error"><Trash2 size={12} /></button>
                <button onClick={() => setEditingMethod(blankMethod(z.id))} data-testid={`add-method-${z.id}`} className="bg-nordfjord text-white text-xs font-data rounded-lg px-3 py-2 flex items-center gap-1.5"><Plus size={12} /> Méthode</button>
              </div>
            </div>
            <div className="divide-y divide-ash/50">
              {(z.methods || []).map((m) => (
                <div key={m.id} className="px-6 py-3 flex items-center justify-between" data-testid={`method-${m.id}`}>
                  <div>
                    <div className="font-semibold text-sm text-nordfjord">{m.name}</div>
                    <div className="font-data text-[10px] text-glacier">{m.eta_days} {m.active ? "" : "· INACTIVE"}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-semibold tabular-nums text-nordfjord">${m.cost_cad.toFixed(2)}</div>
                    <button onClick={() => setEditingMethod({ ...m })} className="border border-ash text-glacier rounded-md px-2 py-2 hover:bg-clinical hover:text-nordfjord"><Edit size={11} /></button>
                    <button onClick={() => delMethod(m.id)} className="border border-ash text-glacier rounded-md px-2 py-2 hover:bg-error hover:text-white hover:border-error"><Trash2 size={11} /></button>
                  </div>
                </div>
              ))}
              {!z.methods?.length && <div className="px-6 py-4 font-data text-xs text-glacier">Aucune méthode configurée.</div>}
            </div>
          </div>
        ))}
        {!zones.length && <div className="bg-card border border-ash/60 rounded-xl p-12 text-center font-data text-sm text-glacier">Aucune zone configurée.</div>}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      <div className="bg-card border border-ash/60 rounded-xl w-full max-w-md p-6 space-y-3" onClick={(e) => e.stopPropagation()} data-testid={test}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-display text-xl font-bold tracking-tight text-nordfjord">{title}</div>
          <button onClick={onClose} className="text-glacier hover:text-nordfjord"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function F({ label, value, onChange, type = "text", test }) {
  return (
    <div>
      <label className="block font-data text-[11px] mb-1 text-glacier">{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={test} className="w-full border border-ash rounded-lg px-3 py-2 text-sm text-nordfjord outline-none focus:border-nova" />
    </div>
  );
}
function Actions({ onSave, onCancel, saveTest }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onSave} data-testid={saveTest} className="bg-nordfjord text-white font-data text-xs rounded-lg px-5 py-3 flex items-center gap-2 hover:opacity-90"><Save size={14} /> Enregistrer</button>
      <button onClick={onCancel} className="border border-ash font-data text-xs rounded-lg px-5 py-3 text-nordfjord hover:bg-clinical">Annuler</button>
    </div>
  );
}
