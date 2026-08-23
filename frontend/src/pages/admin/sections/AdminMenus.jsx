import { useCallback, useEffect, useState } from "react";
import { Plus, Edit, Trash2, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";
import { Th } from "../ui";

const EMPTY_MENU = {
  slug: "", name_en: "", name_fr: "", location: "header",
  published: true, display_order: 0, items: [],
};
const EMPTY_ITEM = {
  label_en: "", label_fr: "", url: "", published: true, display_order: 0, open_new_tab: false,
};

export default function AdminMenus() {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/menus");
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
      // Round-trip : on renvoie TOUS les champs d'item, y compris ceux que le
      // formulaire ne montre pas, sinon le PUT les efface silencieusement.
      const body = {
        slug: (editing.slug || "").trim().toLowerCase(),
        name_en: editing.name_en,
        name_fr: editing.name_fr,
        location: editing.location,
        published: !!editing.published,
        display_order: Number(editing.display_order) || 0,
        items: (editing.items || []).map((it, i) => ({
          id: it.id || null,
          label_en: it.label_en,
          label_fr: it.label_fr,
          url: it.url,
          published: it.published !== false,
          display_order: Number(it.display_order ?? i),
          open_new_tab: !!it.open_new_tab,
        })),
      };
      if (editing.id) await api.put(`/admin/menus/${editing.id}`, body);
      else await api.post("/admin/menus", body);
      toast.success(editing.id ? "Menu updated." : "Menu created.");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    if (!await confirm({ title: `Delete menu "${row.name_en}"?`, description: "This cannot be undone.", destructive: true })) return;
    try {
      await api.delete(`/admin/menus/${row.id}`);
      toast.success("Menu deleted.");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const setItem = (idx, patch) =>
    setEditing((m) => ({ ...m, items: m.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));

  return (
    <div data-testid="admin-menus">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Menus</h1>
          <p className="text-sm text-glacier mt-1">
            Header and footer navigation. If this list is empty the storefront falls back to the built-in links.
          </p>
        </div>
        <button
          data-testid="menu-add"
          onClick={() => setEditing({ ...EMPTY_MENU, display_order: rows.length })}
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
              <Th>Name</Th>
              <Th>Location</Th>
              <Th>Items</Th>
              <Th>Published</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-glacier">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-glacier">No menus.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-ash last:border-0" data-testid={`menu-row-${r.slug}`}>
                <td className="px-4 py-3 text-ink">{r.name_en}</td>
                <td className="px-4 py-3 font-mono text-xs text-glacier uppercase">{r.location}</td>
                <td className="px-4 py-3 font-mono text-xs tabular-nums">
                  {(r.items || []).filter((i) => i.published !== false).length}/{(r.items || []).length}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-1 border ${
                    r.published ? "bg-nordfjord text-white border-nordfjord" : "border-ash text-glacier"}`}>
                    {r.published ? "Published" : "Hidden"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button data-testid={`menu-edit-${r.slug}`} onClick={() => setEditing(JSON.parse(JSON.stringify(r)))} className="p-2 hover:text-nova">
                    <Edit size={15} strokeWidth={1.5} />
                  </button>
                  <button data-testid={`menu-delete-${r.slug}`} onClick={() => remove(r)} className="p-2 hover:text-error">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B2E4F]/60 backdrop-blur-xl px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white border border-ash rounded-lg shadow-lg my-auto" data-testid="menu-dialog">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ash">
              <div className="font-display font-bold text-ink">{editing.id ? "Edit menu" : "New menu"}</div>
              <button onClick={() => setEditing(null)} className="p-1"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {[{ k: "name_en", l: "Name (EN)" }, { k: "name_fr", l: "Nom (FR)" }, { k: "slug", l: "Slug" }].map((f) => (
                  <div key={f.k}>
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-glacier">{f.l}</label>
                    <input
                      data-testid={`menu-field-${f.k}`}
                      value={editing[f.k] || ""}
                      onChange={(e) => setEditing({ ...editing, [f.k]: e.target.value })}
                      className="w-full mt-1 rounded-md border border-ash bg-white px-3 py-2 text-sm focus:outline-none focus:border-ash"
                    />
                  </div>
                ))}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-glacier">Location</label>
                  <select
                    data-testid="menu-field-location"
                    value={editing.location}
                    onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                    className="w-full mt-1 rounded-md border border-ash bg-white px-3 py-2 text-sm focus:outline-none focus:border-ash"
                  >
                    <option value="header">header</option>
                    <option value="footer">footer</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="menu-field-published"
                  checked={!!editing.published}
                  onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
                  className="w-4 h-4 accent-[#00B8D4]"
                />
                <span className="text-sm text-ink">Menu published</span>
              </label>

              <div className="pt-4 border-t border-ash">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-glacier">Items</div>
                  <button
                    data-testid="menu-item-add"
                    onClick={() =>
                      setEditing({ ...editing, items: [...(editing.items || []), { ...EMPTY_ITEM, display_order: (editing.items || []).length }] })
                    }
                    className="rounded-full border border-ash px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] inline-flex items-center gap-1.5"
                  >
                    <Plus size={12} /> Add item
                  </button>
                </div>

                <div className="space-y-3">
                  {(editing.items || []).map((it, i) => (
                    <div key={it.id || i} className="border border-ash rounded-md p-3" data-testid={`menu-item-${i}`}>
                      <div className="flex items-start gap-2">
                        <GripVertical size={14} className="text-glacier mt-2 shrink-0" />
                        <div className="grid sm:grid-cols-3 gap-2 flex-1">
                          <input placeholder="Label EN" value={it.label_en || ""} onChange={(e) => setItem(i, { label_en: e.target.value })}
                            className="rounded-md border border-ash bg-white px-2 py-1.5 text-sm focus:outline-none focus:border-ash" />
                          <input placeholder="Libellé FR" value={it.label_fr || ""} onChange={(e) => setItem(i, { label_fr: e.target.value })}
                            className="rounded-md border border-ash bg-white px-2 py-1.5 text-sm focus:outline-none focus:border-ash" />
                          <input placeholder="/catalog" value={it.url || ""} onChange={(e) => setItem(i, { url: e.target.value })}
                            className="rounded-md border border-ash bg-white px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-ash" />
                        </div>
                        <button onClick={() => setEditing({ ...editing, items: editing.items.filter((_, j) => j !== i) })}
                          className="p-1.5 hover:text-error shrink-0" data-testid={`menu-item-remove-${i}`}>
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-5 mt-2 pl-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={it.published !== false} onChange={(e) => setItem(i, { published: e.target.checked })}
                            className="w-3.5 h-3.5 accent-[#00B8D4]" data-testid={`menu-item-published-${i}`} />
                          <span className="text-xs text-glacier">Published</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!it.open_new_tab} onChange={(e) => setItem(i, { open_new_tab: e.target.checked })}
                            className="w-3.5 h-3.5 accent-[#00B8D4]" />
                          <span className="text-xs text-glacier">New tab</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="text-xs text-glacier">Order</span>
                          <input type="number" value={it.display_order ?? i} onChange={(e) => setItem(i, { display_order: e.target.value })}
                            className="w-16 rounded-md border border-ash bg-white px-2 py-1 text-xs font-mono" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-ash">
              <button onClick={() => setEditing(null)} className="rounded-full border border-ash px-5 py-2 font-mono text-xs uppercase tracking-[0.2em]">
                Cancel
              </button>
              <button data-testid="menu-save" disabled={busy} onClick={save}
                className="rounded-full bg-nordfjord text-white px-5 py-2 font-mono text-xs uppercase tracking-[0.2em] disabled:opacity-60">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
