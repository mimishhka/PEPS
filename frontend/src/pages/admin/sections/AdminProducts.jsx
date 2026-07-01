import { useEffect, useState } from "react";
import { Download, Plus, Edit, Trash2, Star, X, Save, AlertTriangle, CheckCircle2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError } from "../../../lib/api";

const CATEGORIES = ["healing", "gh-secretagogues", "weight-loss", "cognitive", "longevity"];

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/products").then((r) => setProducts(r.data));
  useEffect(() => { load(); }, []);

  const blank = {
    slug: "", name_en: "", name_fr: "", category: "healing", sequence: "",
    purity: "≥ 99%", dosage_mg: 0, description_en: "", description_fr: "",
    price_cad: 0, stock: 0, low_stock_threshold: 10,
    image_url: "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
    lab_tested: true, active: true, featured: false, preorder_allowed: false,
    coa_url: "", coa_lot: "", coa_date: "",
    variants: [newVariant("5mg")],
  };

  const save = async () => {
    if (!editing.variants?.length) {
      toast.error("At least one variant is required");
      return;
    }
    try {
      if (editing.id) await api.put(`/admin/products/${editing.id}`, editing);
      else await api.post("/admin/products", editing);
      toast.success("Saved");
      setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/admin/products/${id}`);
    toast.success("Deleted"); load();
  };

  return (
    <div className="p-8" data-testid="admin-products">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// CATALOG</div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight mt-2">Products</h1>
          <p className="font-mono text-xs text-foreground/60 mt-1">{products.length} compounds</p>
        </div>
        <div className="flex items-center gap-3">
          <a href={`${API_BASE}/admin/products.csv`} target="_blank" rel="noopener noreferrer" data-testid="export-products-csv"
             className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-ink hover:text-white">
            <Download size={14} /> Export CSV
          </a>
          <button onClick={() => setEditing({ ...blank })} data-testid="new-product-btn"
            className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80">
            <Plus size={14} /> Add New Product
          </button>
        </div>
      </div>

      <div className="bg-white border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-foreground/70">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Product</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Category</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Variants</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Status</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const totalStock = (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
              const lowest = (p.variants || []).reduce((m, v) => v.price < m ? v.price : m, Infinity);
              return (
                <tr key={p.id} className="border-t border-ink/5" data-testid={`product-row-${p.slug}`}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <img src={p.image_url} alt={p.name_en} className="w-10 h-10 object-cover" style={{ filter: "grayscale(0.4)" }} />
                      <div>
                        <div className="font-bold">{p.name_en}</div>
                        <div className="font-mono text-[10px] text-foreground/50">{p.slug} · from ${(lowest === Infinity ? 0 : lowest).toFixed(2)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs uppercase">{p.category}</td>
                  <td className="px-6 py-3 font-mono text-xs">
                    <span className="font-bold">{(p.variants || []).length}</span>
                    <span className="text-foreground/50"> · {totalStock} units</span>
                  </td>
                  <td className="px-6 py-3">
                    {!p.active
                      ? <span className="text-[10px] font-mono uppercase tracking-[0.15em] bg-gray-400 text-white px-2 py-0.5">Hidden</span>
                      : totalStock === 0
                      ? <span className="text-[10px] font-mono uppercase tracking-[0.15em] bg-red-600 text-white px-2 py-0.5">Out</span>
                      : <span className="text-[10px] font-mono uppercase tracking-[0.15em] bg-emerald-600 text-white px-2 py-0.5">Active</span>}
                    {p.featured && <Star size={12} className="inline ml-2 fill-yellow-500 text-yellow-500" />}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => setEditing({ ...p, variants: [...(p.variants || [])] })} data-testid={`edit-${p.slug}`} className="border border-ink/30 px-2 py-1 hover:bg-ink hover:text-white mr-1"><Edit size={12} /></button>
                    <button onClick={() => del(p.id)} data-testid={`delete-${p.slug}`} className="border border-ink/30 px-2 py-1 hover:bg-red-600 hover:text-white hover:border-red-600"><Trash2 size={12} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <ProductEditor product={editing} setProduct={setEditing} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function newVariant(name = "") {
  return {
    name, price: 0, stock: 0, sku: "",
    badge_coa_available: false, badge_coa_pending: false, badge_coming_soon: false,
    preorder_enabled: false, preorder_delay_message: "", preorder_price: null, preorder_note: "",
  };
}

function ProductEditor({ product, setProduct, onSave, onCancel }) {
  const setVariant = (i, patch) => {
    const next = [...product.variants];
    next[i] = { ...next[i], ...patch };
    setProduct({ ...product, variants: next });
  };
  const addVariant = () => setProduct({ ...product, variants: [...(product.variants || []), newVariant("")] });
  const removeVariant = (i) => setProduct({ ...product, variants: product.variants.filter((_, idx) => idx !== i) });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end" onClick={onCancel}>
      <div className="bg-[#fafafa] w-full max-w-3xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="product-editor">
        <div className="bg-ink text-white px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em]">// PRODUCT</div>
            <div className="font-display text-xl font-bold tracking-tight">{product.id ? "Edit" : "New"}: {product.name_en || product.slug || "Untitled"}</div>
          </div>
          <button onClick={onCancel} aria-label="Close" data-testid="close-editor"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <Section title="Basic">
            <Grid2>
              <F label="Slug" value={product.slug} onChange={(v) => setProduct({ ...product, slug: v })} test="f-slug" />
              <F label="Category" select={CATEGORIES} value={product.category} onChange={(v) => setProduct({ ...product, category: v })} test="f-category" />
              <F label="Name EN" value={product.name_en} onChange={(v) => setProduct({ ...product, name_en: v })} test="f-name-en" />
              <F label="Name FR" value={product.name_fr} onChange={(v) => setProduct({ ...product, name_fr: v })} test="f-name-fr" />
              <F label="Sequence" value={product.sequence} onChange={(v) => setProduct({ ...product, sequence: v })} test="f-sequence" />
              <F label="Purity" value={product.purity} onChange={(v) => setProduct({ ...product, purity: v })} test="f-purity" />
            </Grid2>
            <F label="Main Image URL" value={product.image_url} onChange={(v) => setProduct({ ...product, image_url: v })} test="f-image" />
            <TA label="Description EN (rich text)" value={product.description_en} onChange={(v) => setProduct({ ...product, description_en: v })} test="f-desc-en" />
            <TA label="Description FR (texte enrichi)" value={product.description_fr} onChange={(v) => setProduct({ ...product, description_fr: v })} test="f-desc-fr" />
          </Section>

          {/* VARIANT MANAGER */}
          <div className="bg-white border border-ink/10" data-testid="variants-manager">
            <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">
                Variants ({product.variants?.length || 0})
              </div>
              <button type="button" onClick={addVariant} data-testid="add-variant-btn"
                className="bg-ink text-white text-xs font-mono uppercase tracking-[0.2em] px-3 py-1.5 flex items-center gap-1.5 hover:bg-foreground/80">
                <Plus size={12} /> Add Variant
              </button>
            </div>
            <div className="divide-y divide-ink/5">
              {(product.variants || []).map((v, i) => (
                <VariantRow key={i} index={i} variant={v} onChange={(patch) => setVariant(i, patch)} onRemove={() => removeVariant(i)} />
              ))}
              {!product.variants?.length && (
                <div className="px-4 py-6 text-center font-mono text-xs text-foreground/50">No variants yet — at least one is required.</div>
              )}
            </div>
          </div>

          <Section title="COA · Lab (product-level)">
            <Grid2>
              <F label="COA URL (PDF link)" value={product.coa_url} onChange={(v) => setProduct({ ...product, coa_url: v })} test="f-coa_url" />
              <F label="COA Lot" value={product.coa_lot} onChange={(v) => setProduct({ ...product, coa_lot: v })} test="f-coa_lot" />
            </Grid2>
            <F label="COA Date" value={product.coa_date} onChange={(v) => setProduct({ ...product, coa_date: v })} placeholder="2026-01-12" test="f-coa_date" />
            <Toggle checked={product.lab_tested} onChange={(c) => setProduct({ ...product, lab_tested: c })} label="Mark as Lab Tested" test="f-lab-tested" />
          </Section>

          <Section title="Visibility & Stock">
            <Grid2>
              <F label="Low stock threshold" type="number" value={product.low_stock_threshold} onChange={(v) => setProduct({ ...product, low_stock_threshold: parseInt(v) || 0 })} test="f-low-stock" />
              <div />
            </Grid2>
            <Toggle checked={product.featured} onChange={(c) => setProduct({ ...product, featured: c })} label="Featured Compound (homepage)" test="f-featured" />
            <Toggle checked={product.active} onChange={(c) => setProduct({ ...product, active: c })} label="Active (visible in catalog)" test="f-active" />
            <Toggle checked={product.preorder_allowed} onChange={(c) => setProduct({ ...product, preorder_allowed: c })} label="Product-level pre-order fallback" test="f-preorder_allowed" />
          </Section>

          <div className="flex gap-3 pt-2">
            <button onClick={onSave} data-testid="save-product-btn" className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-5 py-3 flex items-center gap-2 hover:bg-foreground/80">
              <Save size={14} /> Save Product
            </button>
            <button onClick={onCancel} className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-5 py-3 hover:bg-secondary">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantRow({ index, variant, onChange, onRemove }) {
  return (
    <div className="p-4 space-y-3" data-testid={`variant-row-${index}`}>
      <div className="flex items-center gap-2">
        <GripVertical size={14} className="text-foreground/30" />
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 flex-1">
          Variant #{index + 1} {variant.name && <span className="font-bold text-foreground">· {variant.name}</span>}
        </div>
        <button type="button" onClick={onRemove} data-testid={`remove-variant-${index}`}
          className="border border-ink/30 px-2 py-1 hover:bg-red-600 hover:text-white hover:border-red-600">
          <Trash2 size={12} />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <F label="Name (5mg/500mcg)" value={variant.name} onChange={(v) => onChange({ name: v })} test={`v-name-${index}`} />
        <F label="Price (CAD)" type="number" value={variant.price} onChange={(v) => onChange({ price: parseFloat(v) || 0 })} test={`v-price-${index}`} />
        <F label="Stock" type="number" value={variant.stock} onChange={(v) => onChange({ stock: parseInt(v) || 0 })} test={`v-stock-${index}`} />
        <F label="SKU" value={variant.sku} onChange={(v) => onChange({ sku: v })} test={`v-sku-${index}`} />
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50 mb-2">Badges (independent toggles)</div>
        <div className="flex flex-wrap gap-4">
          <Toggle compact checked={variant.badge_coa_available} onChange={(c) => onChange({ badge_coa_available: c })} label="COA Available" test={`v-badge-coa-available-${index}`} />
          <Toggle compact checked={variant.badge_coa_pending} onChange={(c) => onChange({ badge_coa_pending: c })} label="COA Pending" test={`v-badge-coa-pending-${index}`} />
          <Toggle compact checked={variant.badge_coming_soon} onChange={(c) => onChange({ badge_coming_soon: c })} label="Coming Soon" test={`v-badge-coming-soon-${index}`} />
        </div>
      </div>

      <div className="bg-secondary/40 border border-ink/10 p-3 space-y-2">
        <Toggle checked={variant.preorder_enabled} onChange={(c) => onChange({ preorder_enabled: c })}
          label={<span className="font-mono text-xs uppercase tracking-[0.15em]">Enable Pre-Order on this variant</span>}
          test={`v-preorder-enabled-${index}`} />
        {variant.preorder_enabled && (
          <div className="space-y-3 pt-2">
            <F label="Estimated delay message" placeholder="Ships in 3–4 weeks"
               value={variant.preorder_delay_message} onChange={(v) => onChange({ preorder_delay_message: v })}
               test={`v-preorder-delay-${index}`} />
            <Grid2>
              <F label="Pre-order price (optional)" type="number"
                 placeholder="(blank = regular price)"
                 value={variant.preorder_price ?? ""}
                 onChange={(v) => onChange({ preorder_price: v === "" ? null : parseFloat(v) })}
                 test={`v-preorder-price-${index}`} />
              <F label="Pre-order note" placeholder="Lock in your price"
                 value={variant.preorder_note} onChange={(v) => onChange({ preorder_note: v })}
                 test={`v-preorder-note-${index}`} />
            </Grid2>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-ink/10 p-4 space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">{title}</div>
      {children}
    </div>
  );
}
const Grid2 = ({ children }) => <div className="grid sm:grid-cols-2 gap-3">{children}</div>;
function F({ label, value, onChange, type = "text", select, test, placeholder }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-foreground/60">{label}</label>
      {select ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={test} className="w-full border border-ink/20 px-3 py-2 text-sm bg-white">
          {select.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ) : (
        <input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} data-testid={test} className="w-full border border-ink/20 px-3 py-2 text-sm" />
      )}
    </div>
  );
}
function TA({ label, value, onChange, test }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-foreground/60">{label}</label>
      <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={test} className="w-full border border-ink/20 px-3 py-2 text-sm h-20" />
    </div>
  );
}
function Toggle({ checked, onChange, label, test, compact = false }) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer ${compact ? "text-xs" : "text-sm"}`}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} data-testid={test} className="w-4 h-4 accent-ink" />
      {label}
    </label>
  );
}
