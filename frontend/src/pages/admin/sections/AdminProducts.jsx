import { useEffect, useState } from "react";
import { Download, Plus, Edit, Trash2, Star, X, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
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
    purity: "≥ 99%", dosage_mg: 5, description_en: "", description_fr: "",
    price_cad: 0, stock: 100, low_stock_threshold: 10,
    image_url: "https://images.unsplash.com/photo-1576671081837-49000212a370?auto=format&fit=crop&w=800&q=80",
    lab_tested: true, active: true, featured: false, preorder_allowed: false,
    coa_url: "", coa_lot: "", coa_date: "",
  };

  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/products/${editing.id}`, editing);
      else await api.post("/admin/products", editing);
      toast.success("Saved");
      setEditing(null); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
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
          <a
            href={`${API_BASE}/admin/products.csv`}
            target="_blank" rel="noopener noreferrer"
            data-testid="export-products-csv"
            className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-ink hover:text-white"
          >
            <Download size={14} /> Export CSV
          </a>
          <button
            onClick={() => setEditing({ ...blank })}
            data-testid="new-product-btn"
            className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-foreground/80"
          >
            <Plus size={14} /> New Product
          </button>
        </div>
      </div>

      <div className="bg-white border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-foreground/70">
            <tr>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Product</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Category</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Stock</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">COA</th>
              <th className="px-6 py-3 text-left font-mono text-[10px] uppercase tracking-[0.2em]">Featured</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]">Price</th>
              <th className="px-6 py-3 text-right font-mono text-[10px] uppercase tracking-[0.2em]"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const low = p.stock <= (p.low_stock_threshold || 10);
              const out = p.stock <= 0;
              return (
                <tr key={p.id} className="border-t border-ink/5" data-testid={`product-row-${p.slug}`}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <img src={p.image_url} alt={p.name_en} className="w-10 h-10 object-cover" style={{ filter: "grayscale(0.4)" }} />
                      <div>
                        <div className="font-bold">{p.name_en}</div>
                        <div className="font-mono text-[10px] text-foreground/50">{p.slug} · {p.dosage_mg}mg</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 font-mono text-xs uppercase">{p.category}</td>
                  <td className="px-6 py-3">
                    {out ? (
                      p.preorder_allowed
                        ? <span className="inline-block text-[10px] font-mono uppercase tracking-[0.15em] bg-orange-500 text-white px-2 py-0.5">Pre-order · 0</span>
                        : <span className="inline-block text-[10px] font-mono uppercase tracking-[0.15em] bg-red-600 text-white px-2 py-0.5">Out · 0</span>
                    ) : low ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] text-yellow-700"><AlertTriangle size={11} /> Low · {p.stock}</span>
                    ) : (
                      <span className="font-mono text-xs">{p.stock}</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {p.coa_url
                      ? <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em] bg-emerald-600 text-white px-2 py-0.5"><CheckCircle2 size={11} /> Verified</span>
                      : <span className="inline-block text-[10px] font-mono uppercase tracking-[0.15em] bg-orange-400 text-white px-2 py-0.5">Pending</span>}
                  </td>
                  <td className="px-6 py-3">
                    {p.featured && <Star size={14} className="fill-yellow-500 text-yellow-500" />}
                  </td>
                  <td className="px-6 py-3 text-right font-bold tabular-nums">${p.price_cad?.toFixed(2)}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => setEditing({ ...p })} data-testid={`edit-${p.slug}`} className="border border-ink/30 px-2 py-1 hover:bg-ink hover:text-white mr-1"><Edit size={12} /></button>
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

function ProductEditor({ product, setProduct, onSave, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end" onClick={onCancel}>
      <div className="bg-[#fafafa] w-full max-w-2xl h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="product-editor">
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
              <F label="Dosage (mg)" type="number" value={product.dosage_mg} onChange={(v) => setProduct({ ...product, dosage_mg: parseFloat(v) || 0 })} test="f-dosage" />
              <F label="Price (CAD)" type="number" value={product.price_cad} onChange={(v) => setProduct({ ...product, price_cad: parseFloat(v) || 0 })} test="f-price" />
            </Grid2>
            <F label="Image URL" value={product.image_url} onChange={(v) => setProduct({ ...product, image_url: v })} test="f-image" />
            <TA label="Description EN" value={product.description_en} onChange={(v) => setProduct({ ...product, description_en: v })} test="f-desc-en" />
            <TA label="Description FR" value={product.description_fr} onChange={(v) => setProduct({ ...product, description_fr: v })} test="f-desc-fr" />
          </Section>

          <Section title="Stock">
            <Grid2>
              <F label="Stock units" type="number" value={product.stock} onChange={(v) => setProduct({ ...product, stock: parseInt(v) || 0 })} test="f-stock" />
              <F label="Low stock threshold" type="number" value={product.low_stock_threshold} onChange={(v) => setProduct({ ...product, low_stock_threshold: parseInt(v) || 0 })} test="f-low-stock" />
            </Grid2>
            <Toggle checked={product.preorder_allowed} onChange={(c) => setProduct({ ...product, preorder_allowed: c })} label="Allow pre-orders when out of stock" test="f-preorder" />
          </Section>

          <Section title="COA · Lab">
            <Grid2>
              <F label="COA URL (PDF link)" value={product.coa_url} onChange={(v) => setProduct({ ...product, coa_url: v })} test="f-coa-url" />
              <F label="COA Lot" value={product.coa_lot} onChange={(v) => setProduct({ ...product, coa_lot: v })} test="f-coa-lot" />
            </Grid2>
            <F label="COA Date" value={product.coa_date} onChange={(v) => setProduct({ ...product, coa_date: v })} placeholder="2026-01-12" test="f-coa-date" />
            <Toggle checked={product.lab_tested} onChange={(c) => setProduct({ ...product, lab_tested: c })} label="Mark as Lab Tested (badge)" test="f-lab-tested" />
          </Section>

          <Section title="Visibility">
            <Toggle checked={product.featured} onChange={(c) => setProduct({ ...product, featured: c })} label="Featured Compound (homepage)" test="f-featured" />
            <Toggle checked={product.active} onChange={(c) => setProduct({ ...product, active: c })} label="Active (visible in catalog)" test="f-active" />
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
function Toggle({ checked, onChange, label, test }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} data-testid={test} className="w-4 h-4 accent-ink" />
      {label}
    </label>
  );
}
