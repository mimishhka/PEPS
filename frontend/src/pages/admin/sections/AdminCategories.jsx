import { useCallback, useEffect, useState } from "react";
import { Plus, Edit, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";
import { Th } from "../ui";

const EMPTY = { slug: "", name_en: "", name_fr: "", published: true, display_order: 0 };

export default function AdminCategories() {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | {…category} | EMPTY
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/categories");
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const body = {
        slug: (editing.slug || "").trim().toLowerCase(),
        name_en: editing.name_en,
        name_fr: editing.name_fr,
        published: !!editing.published,
        display_order: Number(editing.display_order) || 0,
      };
      if (editing.id) {
        const { data } = await api.put(`/admin/categories/${editing.id}`, body);
        // Renommer un slug déplace les produits : on le dit, sinon l'admin
        // ne saura jamais que 8 fiches viennent de changer de catégorie.
        if (data.products_migrated > 0) {
          toast.success(`Category updated — ${data.products_migrated} product(s) moved to "${body.slug}".`);
        } else {
          toast.success("Category updated.");
        }
      } else {
        await api.post("/admin/categories", body);
        toast.success("Category created.");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const togglePublished = async (row) => {
    try {
      await api.put(`/admin/categories/${row.id}`, { ...row, published: !row.published });
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const remove = async (row) => {
    if (!await confirm({ title: `Delete category "${row.name_en}"?`, destructive: true })) return;
    try {
      await api.delete(`/admin/categories/${row.id}`);
      toast.success("Category deleted.");
      load();
    } catch (e) {
      // 409 = catégorie encore utilisée : le serveur l'a masquée au lieu de
      // la supprimer, pour ne jamais orpheliner un produit.
      const msg = formatApiError(e.response?.data?.detail);
      if (e.response?.status === 409) toast.warning(msg);
      else toast.error(msg);
      load();
    }
  };

  return (
    <div data-testid="admin-categories">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Categories</h1>
          <p className="text-sm text-glacier mt-1">
            Products reference categories by slug. Renaming a slug moves every product using it.
          </p>
        </div>
        <button
          data-testid="category-add"
          onClick={() => setEditing({ ...EMPTY, display_order: rows.length })}
          className="rounded-full bg-nordfjord text-white font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 inline-flex items-center gap-2"
        >
          <Plus size={14} /> New
        </button>
      </div>

      <div className="bg-white border border-ash rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ash font-mono text-[10px] uppercase tracking-[0.2em] text-glacier">
              <Th>Name (EN)</Th>
              <Th>Slug</Th>
              <Th>Order</Th>
              <Th>Published</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-glacier">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-glacier">No categories yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ash last:border-0" data-testid={`category-row-${r.slug}`}>
                <td className="px-4 py-3 text-ink">{r.name_en}</td>
                <td className="px-4 py-3 font-mono text-xs text-glacier">{r.slug}</td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums">{r.display_order}</td>
                <td className="px-4 py-3">
                  <button
                    data-testid={`category-toggle-${r.slug}`}
                    onClick={() => togglePublished(r)}
                    className={`rounded-full font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1 border ${
                      r.published ? "bg-nordfjord text-white border-nordfjord" : "border-ash text-glacier"
                    }`}
                  >
                    {r.published ? "Published" : "Hidden"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button data-testid={`category-edit-${r.slug}`} onClick={() => setEditing(r)} className="p-2 hover:text-nova">
                    <Edit size={15} strokeWidth={1.5} />
                  </button>
                  <button data-testid={`category-delete-${r.slug}`} onClick={() => remove(r)} className="p-2 hover:text-error">
                    <Trash2 size={15} strokeWidth={1.5} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B2E4F]/60 backdrop-blur-xl px-4">
          <div className="w-full max-w-md bg-white border border-ash rounded-lg shadow-lg" data-testid="category-dialog">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ash">
              <div className="font-display font-bold text-ink">{editing.id ? "Edit category" : "New category"}</div>
              <button onClick={() => setEditing(null)} className="p-1"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { k: "name_en", label: "Name (EN)" },
                { k: "name_fr", label: "Nom (FR)" },
                { k: "slug", label: "Slug — lowercase, digits, hyphens only" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-glacier">{f.label}</label>
                  <input
                    data-testid={`category-field-${f.k}`}
                    value={editing[f.k] || ""}
                    onChange={(e) => setEditing({ ...editing, [f.k]: e.target.value })}
                    className="w-full mt-1 rounded-sm border border-ash bg-white px-3 py-2 text-sm focus:outline-none focus:border-ash"
                  />
                </div>
              ))}
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-glacier">Display order</label>
                <input
                  type="number"
                  data-testid="category-field-display_order"
                  value={editing.display_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, display_order: e.target.value })}
                  className="w-full mt-1 rounded-sm border border-ash bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-ash"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="category-field-published"
                  checked={!!editing.published}
                  onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
                  className="w-4 h-4 accent-[#00B8D4]"
                />
                <span className="text-sm text-ink">Published (visible on the storefront)</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-ash">
              <button onClick={() => setEditing(null)} className="rounded-full border border-ash px-5 py-2 font-mono text-xs uppercase tracking-[0.2em]">
                Cancel
              </button>
              <button
                data-testid="category-save"
                disabled={busy}
                onClick={save}
                className="rounded-full bg-nordfjord text-white px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
