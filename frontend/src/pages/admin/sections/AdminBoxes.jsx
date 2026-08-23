import { useEffect, useState } from "react";
import { Package2, Plus, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";
import { Th } from "../ui";

const EMPTY = { name: "", length_cm: 20.3, width_cm: 10.2, height_cm: 2, tare_grams: 20, max_units: 6, active: true };

export default function AdminBoxes() {
  const confirm = useConfirm();
  const [boxes, setBoxes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/admin/shipping/boxes")
      .then((r) => setBoxes(r.data))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = {
        name: editing.name,
        length_cm: Number(editing.length_cm),
        width_cm: Number(editing.width_cm),
        height_cm: Number(editing.height_cm),
        tare_grams: Number(editing.tare_grams),
        max_units: Number(editing.max_units),
        active: !!editing.active,
      };
      if (editing.id) await api.put(`/admin/shipping/boxes/${editing.id}`, payload);
      else await api.post("/admin/shipping/boxes", payload);
      setEditing(null);
      load();
      toast.success("Contenant enregistré.");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const remove = async (id) => {
    if (!await confirm({ title: "Supprimer ce contenant ?", destructive: true })) return;
    try { await api.delete(`/admin/shipping/boxes/${id}`); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  return (
    <div data-testid="admin-boxes">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight flex items-center gap-2">
            <Package2 size={26} /> Contenants
          </h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">
            Enveloppes / boîtes utilisées pour l'expédition. Le plus petit contenant dont la capacité couvre la commande est choisi automatiquement (tare + dimensions envoyées à Postes Canada).
          </p>
        </div>
        {!editing && (
          <button onClick={() => setEditing({ ...EMPTY })} data-testid="box-add"
            className="bg-ink text-white font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/80 flex items-center gap-2">
            <Plus size={14} /> Ajouter
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-6 bg-white border border-ink/10 p-5" data-testid="box-form">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Nom" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} testid="box-name" full />
            <Field label="Longueur (cm)" type="number" value={editing.length_cm} onChange={(v) => setEditing({ ...editing, length_cm: v })} testid="box-length" />
            <Field label="Largeur (cm)" type="number" value={editing.width_cm} onChange={(v) => setEditing({ ...editing, width_cm: v })} testid="box-width" />
            <Field label="Épaisseur (cm)" type="number" value={editing.height_cm} onChange={(v) => setEditing({ ...editing, height_cm: v })} testid="box-height" />
            <Field label="Poids à vide (g)" type="number" value={editing.tare_grams} onChange={(v) => setEditing({ ...editing, tare_grams: v })} testid="box-tare" />
            <Field label="Capacité (unités)" type="number" value={editing.max_units} onChange={(v) => setEditing({ ...editing, max_units: v })} testid="box-maxunits" />
          </div>
          <label className="flex items-center gap-2 font-mono text-xs mt-4">
            <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} data-testid="box-active" />
            Actif
          </label>
          <div className="flex gap-2 mt-4">
            <button onClick={save} data-testid="box-save" className="bg-ink text-white font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/80 flex items-center gap-2">
              <Save size={14} /> Enregistrer
            </button>
            <button onClick={() => setEditing(null)} data-testid="box-cancel" className="border border-ink/20 font-mono text-xs uppercase tracking-wider px-4 py-2 hover:bg-ink/5 flex items-center gap-2">
              <X size={14} /> Annuler
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 bg-white border border-ink/10 overflow-x-auto">
        {loading ? (
          <div className="px-6 py-10 text-center font-mono text-xs text-foreground/50">Chargement…</div>
        ) : boxes.length === 0 ? (
          <div className="px-6 py-10 text-center font-mono text-xs text-foreground/50" data-testid="boxes-empty">
            Aucun contenant. Ajoute au moins une enveloppe pour un calcul de poids correct.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-wider text-foreground/60 text-left">
                <Th>Nom</Th>
                <Th>Dimensions (L×l×é)</Th>
                <Th>Tare</Th>
                <Th>Capacité</Th>
                <Th>État</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.id} className="border-t border-ink/10 font-mono text-xs" data-testid={`box-row-${b.id}`}>
                  <td className="px-4 py-3 font-bold">{b.name}</td>
                  <td className="px-4 py-3">{b.length_cm} × {b.width_cm} × {b.height_cm} cm</td>
                  <td className="px-4 py-3">{b.tare_grams} g</td>
                  <td className="px-4 py-3">{b.max_units} u.</td>
                  <td className="px-4 py-3">{b.active ? <span className="text-green-700">actif</span> : <span className="text-foreground/40">inactif</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-3">
                      <button onClick={() => setEditing(b)} data-testid={`box-edit-${b.id}`} className="underline hover:text-ink/70">Modifier</button>
                      <button onClick={() => remove(b.id)} data-testid={`box-delete-${b.id}`} className="text-red-600 hover:opacity-70 inline-flex items-center gap-1">
                        <Trash2 size={12} /> Suppr.
                      </button>
                    </div>
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

function Field({ label, value, onChange, type = "text", testid, full }) {
  return (
    <div className={full ? "col-span-2 sm:col-span-3" : ""}>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-foreground/60 mb-1">{label}</label>
      <input type={type} step="any" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
        className="w-full border border-ink/20 px-3 py-2 font-mono text-sm" />
    </div>
  );
}
