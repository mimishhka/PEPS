import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import ProductCard from "../components/ProductCard.jsx";

const FALLBACK_CATEGORIES = ["all", "healing", "gh-secretagogues", "weight-loss", "cognitive", "longevity"];

function catLabel(c, lang, t) {
  const stored = lang === "fr" ? c.name_fr : c.name_en;
  if (stored) return stored;
  const key = `categories.${c.slug}`;
  const translated = t(key);
  return translated === key ? c.slug.replace(/-/g, " ") : translated;
}

export default function Catalog() {
  useDocumentHead({ title: "Catalog", description: "Browse Fironova research peptides. Certificate-of-analysis documentation. For Research Use Only.", path: "/catalog" });
  const { t, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("name");
  const [query, setQuery] = useState("");
  const [cats, setCats] = useState(null);

  const active = params.get("cat") || "all";

  useEffect(() => {
    let cancelled = false;
    api.get("/categories")
      .then((r) => { if (!cancelled) setCats(Array.isArray(r.data) && r.data.length ? r.data : []); })
      .catch(() => { if (!cancelled) setCats([]); });
    return () => { cancelled = true; };
  }, []);

  const chips = useMemo(() => {
    if (cats && cats.length) return [{ slug: "all", name_en: null, name_fr: null }, ...cats];
    return FALLBACK_CATEGORIES.map((c) => ({ slug: c, name_en: null, name_fr: null }));
  }, [cats]);

  useEffect(() => {
    setLoading(true);
    api.get("/products", { params: active !== "all" ? { category: active } : {} })
      .then((r) => setProducts(r.data))
      .finally(() => setLoading(false));
  }, [active]);

  const sorted = useMemo(() => {
    let arr = [...products];
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter((p) =>
        [p.name_en, p.name_fr, p.slug, p.sequence, p.cas_number]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      );
    }
    if (sort === "price-asc") arr.sort((a, b) => a.price_cad - b.price_cad);
    if (sort === "price-desc") arr.sort((a, b) => b.price_cad - a.price_cad);
    if (sort === "name") arr.sort((a, b) => a.name_en.localeCompare(b.name_en));
    return arr;
  }, [products, sort, query]);

  return (
    <div data-testid="catalog-page" className="bg-clinical min-h-screen">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-10">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-4 flex items-center gap-2">
          <span className="inline-block w-8 h-px bg-nova" /> {lang === "fr" ? "CATALOGUE" : "CATALOG"}
        </p>
        <h1 className="font-display text-[42px] sm:text-[52px] font-semibold text-nordfjord leading-tight">
          {lang === "fr" ? "La bibliothèque complète" : "The full library"}
        </h1>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 pb-24 grid lg:grid-cols-[220px_1fr] gap-10">
        <aside data-testid="catalog-sidebar">
          <ul className="space-y-1">
            {chips.map((c) => (
              <li key={c.slug}>
                <button
                  onClick={() => setParams(c.slug === "all" ? {} : { cat: c.slug })}
                  data-testid={`filter-${c.slug}`}
                  className={`w-full text-left rounded-lg px-4 py-2.5 font-data text-xs uppercase tracking-[0.16em] transition-colors ${
                    active === c.slug ? "bg-nordfjord text-white" : "text-glacier hover:bg-white hover:text-nordfjord"
                  }`}
                >
                  {catLabel(c, lang, t)}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section>
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="flex-1 flex items-center gap-2.5 bg-white border border-ash rounded-full px-5 py-3">
              <Search size={16} className="text-glacier shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lang === "fr" ? "Rechercher un composé, un SKU…" : "Search compounds, SKU…"}
                data-testid="catalog-search"
                className="flex-1 bg-transparent outline-none text-nordfjord text-[15px] placeholder:text-glacier"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSort("price-asc")}
                data-testid="catalog-sort-price-asc"
                className={`rounded-full font-data text-[11px] font-semibold uppercase tracking-[0.16em] px-4 py-2.5 border-[1.5px] transition-colors ${sort === "price-asc" ? "border-nova text-nova" : "border-ash text-glacier hover:border-nova hover:text-nova"}`}
              >
                {lang === "fr" ? "Prix ↑" : "Price ↑"}
              </button>
              <button
                onClick={() => setSort("price-desc")}
                data-testid="catalog-sort-price-desc"
                className={`rounded-full font-data text-[11px] font-semibold uppercase tracking-[0.16em] px-4 py-2.5 border-[1.5px] transition-colors ${sort === "price-desc" ? "border-nova text-nova" : "border-ash text-glacier hover:border-nova hover:text-nova"}`}
              >
                {lang === "fr" ? "Prix ↓" : "Price ↓"}
              </button>
              <button
                onClick={() => setSort("name")}
                data-testid="catalog-sort-name"
                className={`rounded-full font-data text-[11px] font-semibold uppercase tracking-[0.16em] px-4 py-2.5 border-[1.5px] transition-colors ${sort === "name" ? "border-nova text-nova" : "border-ash text-glacier hover:border-nova hover:text-nova"}`}
              >
                {lang === "fr" ? "Nom" : "Name"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-16 font-data text-xs uppercase tracking-[0.2em] text-glacier">{t("common.loading")}</div>
          ) : sorted.length === 0 ? (
            <div className="py-16 font-data text-xs uppercase tracking-[0.2em] text-glacier" data-testid="catalog-empty">{t("catalog.empty")}</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {sorted.map((p, i) => <ProductCard product={p} key={p.id} index={i} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
