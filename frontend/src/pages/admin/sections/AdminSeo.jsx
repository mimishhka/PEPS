// frontend/src/pages/admin/sections/AdminSeo.jsx
// Page SEO centrale : réglages globaux du site + santé SEO + édition du SEO
// de chaque produit depuis une seule vue. Section Système.
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Search as SearchIcon, ExternalLink, Check, AlertTriangle, Save, X } from "lucide-react";
import api, { formatApiError } from "../../../lib/api";
import { useLang } from "../../../contexts/LanguageContext";
import { Th } from "../ui";

export default function AdminSeo() {
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const [tab, setTab] = useState("global");
  const [health, setHealth] = useState(null);
  const [settings, setSettings] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s, p] = await Promise.all([
        api.get("/admin/seo/health"),
        api.get("/admin/seo/settings"),
        api.get("/admin/seo/products"),
      ]);
      setHealth(h.data);
      setSettings(s.data);
      setProducts(p.data.products || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    try {
      const { data } = await api.put("/admin/seo/settings", settings);
      setSettings(data);
      toast.success(L("Réglages SEO enregistrés", "SEO settings saved"));
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const filtered = products.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
        return (p.name_en || "").toLowerCase().includes(q) ||
          (p.name_fr || "").toLowerCase().includes(q) ||
          (p.slug || "").toLowerCase().includes(q);
  });

  return (
    <div data-testid="admin-seo">
      <div className="mb-6">
        <div className="font-data text-[11px] uppercase tracking-[0.24em] text-glacier">{L("SYSTÈME", "SYSTEM")}</div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">SEO</h1>
      </div>

      {loading ? (
        <p className="text-sm text-glacier py-16 text-center">{L("Chargement…", "Loading…")}</p>
      ) : (
        <>
          {/* SANTÉ SEO */}
          {health && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <HealthCard label={L("Produits actifs", "Active products")} value={health.products_active} />
              <HealthCard
                label={L("Sans meta titre", "Missing meta title")}
                value={health.products_missing_meta_title}
                warn={health.products_missing_meta_title > 0}
              />
              <HealthCard
                label={L("Sans description", "Missing description")}
                value={health.products_missing_meta_description}
                warn={health.products_missing_meta_description > 0}
              />
              <HealthCard
                label={L("SEO global", "Global SEO")}
                value={health.global_seo_configured ? L("Configuré", "Set") : L("À faire", "Todo")}
                warn={!health.global_seo_configured}
              />
            </div>
          )}

          {/* Lien sitemap */}
          <a href="/api/sitemap.xml" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-nova hover:underline mb-6">
            <ExternalLink size={14} /> {L("Voir le sitemap.xml", "View sitemap.xml")}
          </a>

          {/* TABS */}
          <div className="flex gap-1 mb-5 border-b border-ash">
            <TabBtn active={tab === "global"} onClick={() => setTab("global")}>{L("SEO global du site", "Global site SEO")}</TabBtn>
            <TabBtn active={tab === "products"} onClick={() => setTab("products")}>{L("SEO par produit", "Per-product SEO")}</TabBtn>
          </div>

          {/* GLOBAL */}
          {tab === "global" && settings && (
            <div className="bg-white border border-ash rounded-xl p-6 max-w-3xl space-y-4">
              <p className="text-xs text-glacier mb-2">
                {L("Ces valeurs décrivent votre site dans Google et sur les réseaux sociaux (page d'accueil et partages génériques).",
                  "These describe your site in Google and on social media (home page and generic shares).")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label={L("Titre du site (FR)", "Site title (FR)")} value={settings.site_title_fr} onChange={(v) => setSettings({ ...settings, site_title_fr: v })} />
                <Field label={L("Titre du site (EN)", "Site title (EN)")} value={settings.site_title_en} onChange={(v) => setSettings({ ...settings, site_title_en: v })} />
              </div>
              <TextArea label={L("Description (FR)", "Description (FR)")} value={settings.site_description_fr}
                onChange={(v) => setSettings({ ...settings, site_description_fr: v })} hint={L("≤ 155 caractères idéalement", "≤ 155 chars ideally")} />
              <TextArea label={L("Description (EN)", "Description (EN)")} value={settings.site_description_en}
                onChange={(v) => setSettings({ ...settings, site_description_en: v })} hint={L("≤ 155 caractères idéalement", "≤ 155 chars ideally")} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label={L("Mots-clés (FR)", "Keywords (FR)")} value={settings.keywords_fr}
                  onChange={(v) => setSettings({ ...settings, keywords_fr: v })} />
                <Field label={L("Mots-clés (EN)", "Keywords (EN)")} value={settings.keywords_en}
                  onChange={(v) => setSettings({ ...settings, keywords_en: v })} />
              </div>
              <Field label={L("Image de partage par défaut (URL)", "Default share image (URL)")} value={settings.default_og_image}
                onChange={(v) => setSettings({ ...settings, default_og_image: v })}
                hint={L("Affichée quand on partage un lien sans image propre", "Shown when a link is shared without its own image")} />

              {/* Aperçu Google */}
              <div className="mt-4 rounded-lg border border-ash bg-clinical p-4">
                <p className="font-data text-[10px] uppercase tracking-[0.2em] text-glacier mb-2">{L("Aperçu Google", "Google preview")}</p>
                <p className="text-[#1a0dab] text-lg leading-tight truncate">{(lang === "fr" ? settings.site_title_fr : settings.site_title_en) || "—"}</p>
                <p className="text-[#006621] text-xs">https://fironova.com</p>
                <p className="text-[#545454] text-sm mt-0.5 line-clamp-2">{(lang === "fr" ? settings.site_description_fr : settings.site_description_en) || "—"}</p>
              </div>
              <button
                onClick={saveSettings}
                data-testid="seo-save-global"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-nordfjord text-white text-sm font-medium hover:bg-foreground/80 transition"
              >
                <Save size={15} /> {L("Enregistrer", "Save")}
              </button>
            </div>
          )}

          {/* PRODUITS */}
          {tab === "products" && (
            <div>
              <div className="flex items-center gap-2 mb-4 max-w-sm">
                <div className="relative flex-1">
                  <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-glacier/70" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={L("Rechercher un produit…", "Search a product…")}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-ash text-sm outline-none focus:border-nova"
                  />
                </div>
              </div>

              <div className="bg-white border border-ash rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-glacier border-b border-ash bg-clinical">
                      <Th>{L("Produit", "Product")}</Th>
                      <Th>{L("Meta titre", "Meta title")}</Th>
                      <Th align="center">{L("État", "Status")}</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.slug} className="border-b border-ash/50 hover:bg-clinical/60">
                        <td className="px-4 py-3">
                          <p className="font-medium">{lang === "fr" ? p.name_fr : p.name_en}</p>
                          <p className="text-xs text-glacier font-data">
                            {p.slug}
                            {!p.active && ` · ${L("inactif", "inactive")}`}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-glacier max-w-xs truncate">
                          {(lang === "fr" ? p.meta_title_fr : p.meta_title_en) || <span className="text-glacier/50 italic">{L("défaut", "default")}</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.optimized ? <Check size={16} className="inline text-green-600" /> : <AlertTriangle size={16} className="inline text-amber-500" />}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setEditing(p)} className="px-3 py-1.5 rounded-md border border-ash text-xs hover:bg-clinical transition">
                            {L("Éditer", "Edit")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <p className="text-sm text-glacier/70 py-10 text-center">{L("Aucun produit.", "No products.")}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {editing && <ProductSeoModal product={editing} L={L} lang={lang} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function HealthCard({ label, value, warn }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-amber-300 bg-amber-50" : "border-ash bg-white"}`}>
      <p className="text-[10px] uppercase tracking-wider text-glacier mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${warn ? "text-amber-700" : "text-nordfjord"}`}>{value}</p>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
        active ? "border-nova text-nordfjord" : "border-transparent text-glacier hover:text-nordfjord"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange, hint }) {
  return (
    <label className="block">
      <span className="block font-data text-[10px] uppercase tracking-[0.2em] mb-1 text-glacier">{label}</span>
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-ash px-3 py-2 text-sm outline-none focus:border-nova" />
      {hint && <span className="block text-[11px] text-glacier/70 mt-1">{hint}</span>}
    </label>
  );
}

function TextArea({ label, value, onChange, hint }) {
  const len = (value || "").length;
  return (
    <label className="block">
      <span className="block font-data text-[10px] uppercase tracking-[0.2em] mb-1 text-glacier">
        {label} <span className={len > 158 ? "text-amber-600" : "text-glacier/50"}>({len})</span>
      </span>
      <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full rounded-lg border border-ash px-3 py-2 text-sm outline-none focus:border-nova resize-none" />
      {hint && <span className="block text-[11px] text-glacier/70 mt-1">{hint}</span>}
    </label>
  );
}

function ProductSeoModal({ product, L, lang, onClose, onSaved }) {
  const [form, setForm] = useState({
    meta_title_en: product.meta_title_en || "",
    meta_title_fr: product.meta_title_fr || "",
    meta_description_en: product.meta_description_en || "",
    meta_description_fr: product.meta_description_fr || "",
    og_image_url: product.og_image_url || "",
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/admin/seo/products/${product.slug}`, form);
      toast.success(L("SEO du produit enregistré", "Product SEO saved"));
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-ash w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold">{lang === "fr" ? product.name_fr : product.name_en}</h3>
          <button onClick={onClose}>
            <X size={18} className="text-glacier" />
          </button>
        </div>
        <div className="space-y-3">
          <Field label={L("Meta titre (FR)", "Meta title (FR)")} value={form.meta_title_fr} onChange={(v) => setForm({ ...form, meta_title_fr: v })} />
          <Field label={L("Meta titre (EN)", "Meta title (EN)")} value={form.meta_title_en} onChange={(v) => setForm({ ...form, meta_title_en: v })} />
          <TextArea label={L("Meta description (FR)", "Meta description (FR)")} value={form.meta_description_fr} onChange={(v) => setForm({ ...form, meta_description_fr: v })} />
          <TextArea label={L("Meta description (EN)", "Meta description (EN)")} value={form.meta_description_en} onChange={(v) => setForm({ ...form, meta_description_en: v })} />
          <Field label={L("Image de partage (URL)", "Share image (URL)")} value={form.og_image_url} onChange={(v) => setForm({ ...form, og_image_url: v })} />
        </div>
        <button
          onClick={save}
          disabled={busy}
          data-testid="seo-save-product"
          className="w-full mt-5 px-4 py-2.5 rounded-lg bg-nordfjord text-white text-sm font-medium hover:bg-foreground/80 disabled:opacity-50 transition"
        >
          {busy ? L("Enregistrement…", "Saving…") : L("Enregistrer", "Save")}
        </button>
      </div>
    </div>
  );
}
