import { useEffect, useState } from "react";
import { Download, Plus, Edit, Trash2, Star, X, Save, AlertTriangle, CheckCircle2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError, resolveAssetUrl } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";

const CATEGORIES = ["healing", "gh-secretagogues", "weight-loss", "cognitive", "longevity"];

export default function AdminProducts() {
  const confirm = useConfirm();
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
    if (!await confirm({ title: "Delete this product?", destructive: true })) return;
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
                      <img src={resolveAssetUrl(p.image_url)} alt={p.name_en} className="w-10 h-10 object-cover" style={{ filter: "grayscale(0.4)" }} />
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
    name, price: 0, sale_price: null, stock: 0, sku: "", coa_url: "", weight_grams: 50,
    coa_status: "none", badge_coming_soon: false,
    badge_coa_available: false, badge_coa_pending: false,
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
            <ImageUploader value={product.image_url} onChange={(v) => setProduct({ ...product, image_url: v })} test="f-image" />
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

          <Section title="Lab">
            <Toggle checked={product.lab_tested} onChange={(c) => setProduct({ ...product, lab_tested: c })} label="Mark as Lab Tested" test="f-lab-tested" />
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/50 mt-2">COA files are managed per variant below — each dosage carries its own certificate.</p>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <F label="Name (5mg/500mcg)" value={variant.name} onChange={(v) => onChange({ name: v })} test={`v-name-${index}`} />
        <F label="Price (CAD)" type="number" value={variant.price} onChange={(v) => onChange({ price: parseFloat(v) || 0 })} test={`v-price-${index}`} />
        <F label="Special price (sale)" type="number"
           placeholder="(blank = no discount)"
           value={variant.sale_price ?? ""}
           onChange={(v) => onChange({ sale_price: v === "" ? null : parseFloat(v) })}
           test={`v-sale-price-${index}`} />
        <F label="Stock" type="number" value={variant.stock} onChange={(v) => onChange({ stock: parseInt(v) || 0 })} test={`v-stock-${index}`} />
        <F label="SKU" value={variant.sku} onChange={(v) => onChange({ sku: v })} test={`v-sku-${index}`} />
        <F label="Weight (g)" type="number" value={variant.weight_grams ?? 50} onChange={(v) => onChange({ weight_grams: parseFloat(v) || 0 })} test={`v-weight-${index}`} />
        <CoaUploader value={variant.coa_url} onChange={(v) => onChange({ coa_url: v })} test={`v-coa-url-${index}`} />
      </div>
      {variant.sale_price != null && variant.sale_price >= variant.price && (
        <div className="font-mono text-[10px] text-red-600 uppercase tracking-[0.15em]">⚠ Special price must be lower than the regular price to apply.</div>
      )}

      <div className="space-y-3">
        <CoaStatusField
          value={variant.coa_status || "none"}
          hasFile={!!variant.coa_url}
          onChange={(v) => onChange({
            coa_status: v,
            badge_coa_available: v === "available",
            badge_coa_pending: v === "pending",
          })}
          test={`v-coa-status-${index}`}
        />
        <Toggle compact checked={variant.badge_coming_soon} onChange={(c) => onChange({ badge_coming_soon: c })} label="Coming Soon (not yet launched)" test={`v-badge-coming-soon-${index}`} />
      </div>

      <div className="bg-secondary/40 border border-ink/10 p-3 space-y-2">
        <Toggle checked={variant.preorder_enabled} onChange={(c) => onChange({ preorder_enabled: c })}
          label={<span className="font-mono text-xs uppercase tracking-[0.15em]">Enable Pre-Order on this variant</span>}
          test={`v-preorder-enabled-${index}`} />
        {variant.preorder_enabled && (
          <div className="space-y-3 pt-2">
            <div className="font-mono text-[10px] text-foreground/60 uppercase tracking-[0.15em]">
              Applies when stock is 0 OR the variant is marked COA Pending / Coming Soon.
            </div>
            <F label="Estimated delay message" placeholder="Ships in 3–4 weeks"
               value={variant.preorder_delay_message} onChange={(v) => onChange({ preorder_delay_message: v })}
               test={`v-preorder-delay-${index}`} />
            <Grid2>
              <F label="Pre-order price (discounted)" type="number"
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

function CoaUploader({ value, onChange, test }) {
  const [uploading, setUploading] = useState(false);
  const inputId = `coa-upload-${test}`;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are allowed");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/admin/upload/coa", form);
      onChange(res.data.url);
      toast.success("COA PDF uploaded");
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
        toast.error("Session expired. Please sign in again.");
      } else if (status === 403 && (detail === "Origin required" || detail === "Origin not allowed")) {
        toast.error("Request blocked (origin/cookie). Open the preview URL directly and sign in there.");
      } else {
        toast.error(formatApiError(detail || err?.message));
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-foreground/60">COA PDF</label>
      <div className="flex items-center gap-2">
        <input
          value={value ?? ""}
          placeholder="https://…/coa.pdf"
          onChange={(e) => onChange(e.target.value)}
          data-testid={test}
          className="w-full border border-ink/20 px-3 py-2 text-sm"
        />
        <label
          htmlFor={inputId}
          data-testid={`${test}-upload-btn`}
          className={`shrink-0 border border-ink font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 cursor-pointer hover:bg-ink hover:text-white ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? "Uploading…" : "Upload PDF"}
        </label>
        <input id={inputId} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
      </div>
      {value && (
        <a href={value.startsWith("http") ? value : `${API_BASE.replace(/\/api$/, "")}${value}`}
           target="_blank" rel="noreferrer"
           className="mt-1 inline-block font-mono text-[10px] text-foreground/50 underline">
          View current PDF ↗
        </a>
      )}
    </div>
  );
}

function ImageUploader({ value, onChange, test }) {
  const [uploading, setUploading] = useState(false);
  const inputId = `image-upload-${test}`;
  const imageSrc = resolveAssetUrl(value);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      toast.error("Only PNG, JPEG, WebP, and GIF images are allowed");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/admin/upload/image", form);
      onChange(res.data.url);
      toast.success("Product image uploaded");
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
        toast.error("Session expired. Please sign in again.");
      } else if (status === 403 && (detail === "Origin required" || detail === "Origin not allowed")) {
        toast.error("Request blocked (origin/cookie). Open the preview URL directly and sign in there.");
      } else {
        toast.error(formatApiError(detail || err?.message));
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-foreground/60">Main image</label>
      <div className="flex items-center gap-2">
        <label
          htmlFor={inputId}
          data-testid={`${test}-upload-btn`}
          className={`shrink-0 border border-ink font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-2 cursor-pointer hover:bg-ink hover:text-white ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? "Uploading..." : "Upload image"}
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="border border-ink/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] hover:bg-secondary"
            data-testid={`${test}-clear-btn`}
          >
            Clear
          </button>
        )}
        <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFile} />
      </div>
      {imageSrc && (
        <div className="mt-2">
          <img
            src={imageSrc}
            alt="Product preview"
            className="w-24 h-24 object-cover border border-ink/20"
            data-testid={`${test}-preview`}
          />
        </div>
      )}
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
function CoaStatusField({ value, hasFile, onChange, test }) {
  const opts = [
    { v: "none", label: "No COA / not shown" },
    { v: "pending", label: "COA pending — coming soon (still purchasable)" },
    { v: "available", label: "COA available (file required)" },
  ];
  const warnNoFile = value === "available" && !hasFile;
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-[0.2em] mb-1 text-foreground/60">COA Status</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={test} className="w-full border border-ink/20 px-3 py-2 text-sm bg-white">
        {opts.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      {warnNoFile && (
        <p className="font-mono text-[10px] text-red-600 uppercase tracking-[0.15em] mt-1">⚠ Upload a COA PDF above, or set status to Pending.</p>
      )}
    </div>
  );
}
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
