import { useEffect, useState } from "react";
import { Download, Plus, Edit, Trash2, Star, X, Save, AlertTriangle, CheckCircle2, GripVertical, PackagePlus, History, Upload, Minus } from "lucide-react";
import { toast } from "sonner";
import api, { API_BASE, formatApiError, resolveAssetUrl } from "../../../lib/api";
import { useConfirm } from "../../../components/ConfirmDialog";

const CATEGORIES = ["healing", "gh-secretagogues", "weight-loss", "cognitive", "longevity"];

export default function AdminProducts() {
  const confirm = useConfirm();
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [restocking, setRestocking] = useState(null);
  const [csvOpen, setCsvOpen] = useState(false);

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
          <button onClick={() => setCsvOpen(true)} data-testid="bulk-restock-csv-btn"
            className="border border-emerald-600 text-emerald-700 font-mono text-xs uppercase tracking-[0.25em] px-4 py-2.5 flex items-center gap-2 hover:bg-emerald-600 hover:text-white">
            <Upload size={14} /> Bulk Restock CSV
          </button>
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
                      <img
                        src={resolveAssetUrl(p.image_url)}
                        alt={p.name_en}
                        width="40"
                        height="40"
                        loading="lazy"
                        decoding="async"
                        className="w-10 h-10 object-cover"
                        style={{ filter: "grayscale(0.4)" }}
                      />
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
                    <button onClick={() => setRestocking(p)} data-testid={`restock-${p.slug}`}
                      className="border border-emerald-600/40 text-emerald-700 px-2 py-1 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 mr-1" title="Quick restock">
                      <PackagePlus size={12} />
                    </button>
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
      {restocking && <RestockModal product={restocking} onClose={() => setRestocking(null)} onDone={() => { setRestocking(null); load(); }} />}
      {csvOpen && <BulkRestockCSVModal onClose={() => setCsvOpen(false)} onDone={() => { setCsvOpen(false); load(); }} />}
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
            width="96"
            height="96"
            loading="lazy"
            decoding="async"
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


// ---------------------------------------------------------------------------
// Quick Restock modal — atomic per-variant delta with audit history.
// Backend: POST /admin/products/{id}/restock, GET /admin/products/{id}/stock-history
// ---------------------------------------------------------------------------
function RestockModal({ product, onClose, onDone }) {
  const variants = product.variants && product.variants.length
    ? product.variants
    : [{ id: null, name: "Default", stock: product.stock || 0 }];
  const [mode, setMode] = useState("add"); // "add" | "remove"
  const [deltas, setDeltas] = useState(
    Object.fromEntries(variants.map((v) => [v.id || "__legacy__", ""])),
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const sign = mode === "add" ? 1 : -1;
  const setDelta = (key, val) => setDeltas({ ...deltas, [key]: val });
  const setQuick = (key, val) => {
    const current = parseInt(deltas[key] || "0", 10) || 0;
    setDelta(key, String(current + val));
  };
  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    // Reset deltas to avoid confusion when toggling
    setDeltas(Object.fromEntries(variants.map((v) => [v.id || "__legacy__", ""])));
  };

  const totalDeltaSum = variants.reduce((sum, v) => {
    const k = v.id || "__legacy__";
    return sum + (parseInt(deltas[k] || "0", 10) || 0);
  }, 0);
  // Detect insufficient stock preview when in remove mode
  const insufficientRows = mode === "remove" ? variants.filter((v) => {
    const k = v.id || "__legacy__";
    const delta = parseInt(deltas[k] || "0", 10) || 0;
    return delta > (parseInt(v.stock || 0, 10) || 0);
  }).map((v) => v.name) : [];

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const r = await api.get(`/admin/products/${product.id}/stock-history?limit=50`);
      setHistory(r.data.items || []);
      setShowHistory(true);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const submit = async () => {
    const payload = {
      reason: reason.trim() || null,
      deltas: variants
        .map((v) => {
          const k = v.id || "__legacy__";
          const q = parseInt(deltas[k] || "0", 10) || 0;
          if (q <= 0) return null;
          return { variant_id: v.id || null, quantity: sign * q };
        })
        .filter(Boolean),
    };
    if (!payload.deltas.length) {
      toast.error("Enter a quantity for at least one variant");
      return;
    }
    if (insufficientRows.length) {
      toast.error(`Cannot remove more than in stock: ${insufficientRows.join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      const r = await api.post(`/admin/products/${product.id}/restock`, payload);
      const applied = r.data.applied || [];
      const skipped = r.data.skipped || [];
      if (skipped.length) {
        const insuf = skipped.filter((s) => s.reason === "insufficient_stock");
        if (insuf.length) toast.error(`Insufficient stock on ${insuf.length} variant(s)`);
      }
      const verb = mode === "add" ? "added to" : "removed from";
      toast.success(`${Math.abs(totalDeltaSum)} units ${verb} ${applied.length} variant(s)`);
      onDone();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const isAdd = mode === "add";
  const accent = isAdd ? "emerald" : "amber";
  const accentClasses = {
    emerald: { text: "text-emerald-700", bg: "bg-emerald-600", bgHover: "hover:bg-emerald-700", border: "border-emerald-600", focus: "focus:border-emerald-600", bgLight: "bg-emerald-50 border-emerald-200 text-emerald-800", badge: "bg-emerald-100 text-emerald-700 border-emerald-300" },
    amber: { text: "text-amber-700", bg: "bg-amber-600", bgHover: "hover:bg-amber-700", border: "border-amber-600", focus: "focus:border-amber-600", bgLight: "bg-amber-50 border-amber-200 text-amber-800", badge: "bg-amber-100 text-amber-700 border-amber-300" },
  }[accent];

  return (
    <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4"
         onClick={onClose} data-testid="restock-modal-overlay">
      <div className="bg-white w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()} data-testid="restock-modal">
        {/* Header */}
        <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between shrink-0">
          <div>
            <div className={`font-mono text-[10px] uppercase tracking-[0.3em] ${accentClasses.text}`}>// {isAdd ? "QUICK RESTOCK" : "STOCK ADJUSTMENT"}</div>
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight mt-1">{product.name_en}</h2>
            <p className="font-mono text-[10px] text-foreground/50 mt-1">{product.slug}</p>
          </div>
          <button onClick={onClose} data-testid="restock-close" className="p-2 hover:bg-ink/5"><X size={18} /></button>
        </div>

        {/* Mode toggle */}
        {!showHistory && (
          <div className="px-6 pt-4 shrink-0">
            <div className="inline-flex border border-ink/20 rounded-sm overflow-hidden" role="tablist">
              <button
                onClick={() => switchMode("add")}
                data-testid="restock-mode-add"
                className={`px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-2 transition-colors ${isAdd ? "bg-emerald-600 text-white" : "bg-white text-foreground/60 hover:bg-ink/5"}`}
              >
                <PackagePlus size={12} /> Add stock
              </button>
              <button
                onClick={() => switchMode("remove")}
                data-testid="restock-mode-remove"
                className={`px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-2 transition-colors ${!isAdd ? "bg-amber-600 text-white" : "bg-white text-foreground/60 hover:bg-ink/5"}`}
              >
                <Minus size={12} /> Remove stock
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {!showHistory ? (
            <>
              <p className="text-xs text-foreground/60 mb-4 leading-relaxed">
                {isAdd
                  ? "Enter the units received (never the new absolute total). All changes are atomic and audited."
                  : "Enter the units to remove for losses, breakages or customer returns. Stock cannot go below zero."}
              </p>
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50 border-b border-ink/10">
                    <th className="py-2">Variant</th>
                    <th className="py-2 text-right w-20">Current</th>
                    <th className="py-2 text-center w-64">{isAdd ? "Add" : "Remove"}</th>
                    <th className="py-2 text-right w-20">New total</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => {
                    const key = v.id || "__legacy__";
                    const current = parseInt(v.stock || 0, 10);
                    const delta = parseInt(deltas[key] || "0", 10) || 0;
                    const signed = sign * delta;
                    const next = current + signed;
                    const insufficient = mode === "remove" && delta > current;
                    return (
                      <tr key={key} className={`border-b border-ink/5 ${insufficient ? "bg-red-50" : ""}`} data-testid={`restock-row-${key}`}>
                        <td className="py-3 font-medium">{v.name || "(no name)"}</td>
                        <td className="py-3 text-right font-mono text-xs text-foreground/60">{current}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={deltas[key] || ""}
                              onChange={(e) => setDelta(key, e.target.value)}
                              placeholder="0"
                              className={`w-16 border ${insufficient ? "border-red-500" : "border-ink/20"} px-2 py-1 text-center text-sm focus:outline-none ${accentClasses.focus}`}
                              data-testid={`restock-input-${key}`}
                            />
                            {[10, 25, 50, 100].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setQuick(key, n)}
                                data-testid={`restock-quick-${key}-${n}`}
                                className={`text-[10px] font-mono px-1.5 py-1 border border-ink/15 hover:${accentClasses.bg} hover:text-white hover:${accentClasses.border}`}
                              >
                                {isAdd ? "+" : "-"}{n}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 text-right font-mono text-sm font-bold" data-testid={`restock-new-total-${key}`}>
                          {delta > 0 ? (
                            insufficient
                              ? <span className="text-red-600">— </span>
                              : <span className={accentClasses.text}>{next}</span>
                          ) : <span className="text-foreground/40">{next}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <label className="block">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-1">
                  Reason {isAdd ? "(optional)" : "(recommended)"}
                </div>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={isAdd ? "e.g. Supplier delivery #2026-08-15" : "e.g. Broken vial in transit / customer return"}
                  className={`w-full border border-ink/20 px-3 py-2 text-sm focus:outline-none ${accentClasses.focus}`}
                  data-testid="restock-reason"
                />
              </label>

              {insufficientRows.length > 0 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>Cannot remove more than in stock: {insufficientRows.join(", ")}</span>
                </div>
              )}
              {totalDeltaSum > 0 && insufficientRows.length === 0 && (
                <div className={`mt-4 p-3 border text-xs font-mono ${accentClasses.bgLight}`}>
                  <CheckCircle2 size={12} className="inline mr-1" />
                  {totalDeltaSum} units will be {isAdd ? "added to" : "removed from"} {Object.values(deltas).filter((d) => (parseInt(d, 10) || 0) > 0).length} variant(s).
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/60">// STOCK MOVEMENTS · Last 50</div>
                <button onClick={() => setShowHistory(false)} data-testid="restock-back-to-form" className="text-xs font-mono uppercase tracking-[0.15em] hover:underline">
                  ← Back to restock
                </button>
              </div>
              {loadingHistory ? (
                <p className="text-sm text-foreground/50">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-foreground/50 italic">No stock movements yet for this product.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50 border-b border-ink/10">
                      <th className="py-2">Date</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Variant</th>
                      <th className="py-2 text-right">Delta</th>
                      <th className="py-2 text-right">Before → After</th>
                      <th className="py-2">Admin</th>
                      <th className="py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((m) => {
                      const isRestock = (m.movement_type || (m.delta > 0 ? "restock" : "adjustment")) === "restock";
                      return (
                        <tr key={m.id} className="border-b border-ink/5" data-testid={`history-row-${m.id}`}>
                          <td className="py-2 font-mono">{new Date(m.created_at).toLocaleString()}</td>
                          <td className="py-2">
                            <span className={`text-[10px] px-1.5 py-0.5 border font-mono uppercase tracking-[0.1em] ${isRestock ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-amber-100 text-amber-700 border-amber-300"}`}>
                              {m.source === "csv_bulk" ? "csv" : (isRestock ? "restock" : "adjust")}
                            </span>
                          </td>
                          <td className="py-2">{m.variant_name || <span className="text-foreground/40">—</span>}</td>
                          <td className={`py-2 text-right font-mono font-bold ${m.delta > 0 ? "text-emerald-700" : "text-amber-700"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                          <td className="py-2 text-right font-mono text-foreground/60">{m.stock_before} → {m.stock_after}</td>
                          <td className="py-2 font-mono text-foreground/60">{m.admin_email || "—"}</td>
                          <td className="py-2 text-foreground/70">{m.reason || <span className="text-foreground/40">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ink/10 flex items-center justify-between shrink-0 bg-secondary/30">
          <button onClick={loadHistory} disabled={loadingHistory || showHistory} data-testid="restock-view-history"
            className="font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-2 hover:underline disabled:opacity-40">
            <History size={12} /> View history
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} data-testid="restock-cancel"
              className="border border-ink/30 font-mono text-xs uppercase tracking-[0.25em] px-4 py-2 hover:bg-ink hover:text-white">
              Cancel
            </button>
            <button onClick={submit} disabled={saving || totalDeltaSum <= 0 || showHistory || insufficientRows.length > 0} data-testid="restock-confirm"
              className={`${accentClasses.bg} text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2 ${accentClasses.bgHover} disabled:opacity-40 flex items-center gap-2`}>
              {isAdd ? <PackagePlus size={12} /> : <Minus size={12} />} {saving ? "Saving…" : `Confirm ${isAdd ? "+" : "−"}${totalDeltaSum || 0}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Restock CSV modal — client-side parse + POST /admin/products/bulk-restock
// CSV format: sku,quantity[,reason]  OR  product_slug,variant_name,quantity[,reason]
// ---------------------------------------------------------------------------
function BulkRestockCSVModal({ onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [reason, setReason] = useState("");
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const parseCsv = (text) => {
    // Auto-detect separator (comma or semicolon)
    const firstLine = text.split(/\r?\n/)[0] || "";
    const sep = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase().split(sep).map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const hasHeader = header.some((h) => ["sku", "quantity", "qty", "product_slug", "slug", "variant_name", "variant"].includes(h));
    const cols = hasHeader ? header : ["sku", "quantity"];
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const idx = {
      sku: cols.indexOf("sku"),
      slug: cols.indexOf("product_slug") >= 0 ? cols.indexOf("product_slug") : cols.indexOf("slug"),
      variant: cols.indexOf("variant_name") >= 0 ? cols.indexOf("variant_name") : cols.indexOf("variant"),
      quantity: cols.indexOf("quantity") >= 0 ? cols.indexOf("quantity") : cols.indexOf("qty"),
      reason: cols.indexOf("reason") >= 0 ? cols.indexOf("reason") : cols.indexOf("note"),
    };
    return dataLines.map((line, i) => {
      const parts = line.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const qtyRaw = idx.quantity >= 0 ? parts[idx.quantity] : parts[1];
      const qty = parseInt((qtyRaw || "").replace(/[^\d-]/g, ""), 10);
      return {
        line: i + (hasHeader ? 2 : 1),
        sku: idx.sku >= 0 ? parts[idx.sku] || null : null,
        product_slug: idx.slug >= 0 ? parts[idx.slug] || null : null,
        variant_name: idx.variant >= 0 ? parts[idx.variant] || null : null,
        quantity: Number.isFinite(qty) ? qty : null,
        note: idx.reason >= 0 ? parts[idx.reason] || null : null,
      };
    }).filter((r) => r.quantity !== null && r.quantity !== 0 && (r.sku || r.product_slug));
  };

  const onFile = async (file) => {
    if (!file) return;
    setParsing(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setRows(parsed);
      if (!parsed.length) toast.error("No valid rows found in CSV");
    } catch (e) {
      toast.error("Failed to read CSV file");
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (!rows.length) return;
    setSubmitting(true);
    try {
      const r = await api.post("/admin/products/bulk-restock", {
        reason: reason.trim() || null,
        rows: rows.map(({ line, ...rest }) => rest),
      });
      setResult(r.data);
      const c = r.data.counts || {};
      if (c.applied > 0) toast.success(`Applied ${c.applied} row(s)`);
      if (c.failed > 0) toast.error(`Failed on ${c.failed} row(s)`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4"
         onClick={onClose} data-testid="bulk-restock-overlay">
      <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
           onClick={(e) => e.stopPropagation()} data-testid="bulk-restock-modal">
        <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between shrink-0">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-700">// BULK RESTOCK · CSV</div>
            <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight mt-1">Supplier delivery</h2>
            <p className="text-xs text-foreground/60 mt-1">Upload a CSV to restock multiple products at once.</p>
          </div>
          <button onClick={onClose} data-testid="bulk-restock-close" className="p-2 hover:bg-ink/5"><X size={18} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {!result ? (
            <>
              {!rows.length ? (
                <>
                  <div className="border-2 border-dashed border-ink/20 p-8 text-center hover:border-emerald-600 transition-colors">
                    <Upload size={32} className="mx-auto mb-3 text-foreground/40" />
                    <p className="text-sm text-foreground/70 mb-2">Drag & drop your CSV here, or</p>
                    <label className="inline-block bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2 cursor-pointer hover:bg-foreground/80">
                      Choose file
                      <input type="file" accept=".csv,text/csv" className="hidden"
                        onChange={(e) => onFile(e.target.files?.[0])}
                        data-testid="bulk-restock-file-input" />
                    </label>
                    {parsing && <p className="text-xs mt-3 text-foreground/50">Parsing…</p>}
                  </div>
                  <div className="mt-6 border border-ink/10 p-4 bg-secondary/40">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-2">CSV FORMAT</div>
                    <p className="text-xs text-foreground/70 mb-2">Two accepted layouts (with or without header row):</p>
                    <pre className="text-[11px] font-mono bg-white border border-ink/10 p-2 whitespace-pre-wrap">
sku,quantity,reason
BPC-157-5MG,50,Supplier delivery
TB-500-5MG,25,
                    </pre>
                    <pre className="text-[11px] font-mono bg-white border border-ink/10 p-2 whitespace-pre-wrap mt-2">
product_slug,variant_name,quantity
bpc-157-5mg,5.0mg,50
tb-500-5mg,5.0mg,25
                    </pre>
                    <p className="text-xs text-foreground/50 mt-2">Negative quantity = adjustment (loss/breakage). Comma or semicolon separator.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/60">// PREVIEW · {rows.length} row(s)</div>
                    <button onClick={() => setRows([])} className="text-xs font-mono uppercase tracking-[0.15em] hover:underline" data-testid="bulk-restock-clear">
                      ← Choose another file
                    </button>
                  </div>
                  <table className="w-full text-xs mb-4">
                    <thead>
                      <tr className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50 border-b border-ink/10">
                        <th className="py-2 w-10">Line</th>
                        <th className="py-2">SKU</th>
                        <th className="py-2">Product slug</th>
                        <th className="py-2">Variant</th>
                        <th className="py-2 text-right">Qty</th>
                        <th className="py-2">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((r) => (
                        <tr key={r.line} className="border-b border-ink/5">
                          <td className="py-2 font-mono text-foreground/60">{r.line}</td>
                          <td className="py-2 font-mono">{r.sku || <span className="text-foreground/40">—</span>}</td>
                          <td className="py-2 font-mono">{r.product_slug || <span className="text-foreground/40">—</span>}</td>
                          <td className="py-2 font-mono">{r.variant_name || <span className="text-foreground/40">—</span>}</td>
                          <td className={`py-2 text-right font-mono font-bold ${r.quantity > 0 ? "text-emerald-700" : "text-amber-700"}`}>{r.quantity > 0 ? "+" : ""}{r.quantity}</td>
                          <td className="py-2 text-foreground/70">{r.note || <span className="text-foreground/40">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 50 && <p className="text-xs text-foreground/50 italic">…and {rows.length - 50} more row(s).</p>}
                  <label className="block mt-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-1">Global reason (optional)</div>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. PO #2026-08-15 supplier delivery"
                      className="w-full border border-ink/20 px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
                      data-testid="bulk-restock-reason"
                    />
                  </label>
                </>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-700">Applied</div>
                  <div className="font-display text-3xl font-extrabold text-emerald-700 mt-1" data-testid="bulk-restock-applied-count">{result.counts?.applied || 0}</div>
                </div>
                <div className="p-4 bg-red-50 border border-red-200">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-700">Failed</div>
                  <div className="font-display text-3xl font-extrabold text-red-700 mt-1" data-testid="bulk-restock-failed-count">{result.counts?.failed || 0}</div>
                </div>
              </div>
              {(result.failed || []).length > 0 && (
                <>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 mb-2">// FAILED ROWS</div>
                  <table className="w-full text-xs mb-4">
                    <thead>
                      <tr className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50 border-b border-ink/10">
                        <th className="py-2 w-10">Line</th>
                        <th className="py-2">SKU / Slug</th>
                        <th className="py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failed.map((f, i) => (
                        <tr key={i} className="border-b border-ink/5">
                          <td className="py-2 font-mono">{f.line}</td>
                          <td className="py-2 font-mono">{f.sku || f.product_slug || "—"}</td>
                          <td className="py-2 text-red-700">{f.reason}{f.current != null && ` (stock=${f.current}, req=${f.requested})`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-ink/10 flex items-center justify-end gap-2 shrink-0 bg-secondary/30">
          {result ? (
            <button onClick={onDone} data-testid="bulk-restock-done"
              className="bg-emerald-600 text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2 hover:bg-emerald-700">
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} data-testid="bulk-restock-cancel"
                className="border border-ink/30 font-mono text-xs uppercase tracking-[0.25em] px-4 py-2 hover:bg-ink hover:text-white">
                Cancel
              </button>
              <button onClick={submit} disabled={!rows.length || submitting} data-testid="bulk-restock-submit"
                className="bg-emerald-600 text-white font-mono text-xs uppercase tracking-[0.25em] px-4 py-2 hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2">
                <Upload size={12} /> {submitting ? "Applying…" : `Apply ${rows.length} row(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
