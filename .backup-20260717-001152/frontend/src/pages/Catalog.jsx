import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import ProductCard from "../components/ProductCard";

// Repli : si GET /categories échoue ou ne renvoie rien, on garde exactement
// la liste historique — le catalogue ne doit jamais perdre ses filtres.
const FALLBACK_CATEGORIES = ["all", "healing", "gh-secretagogues", "weight-loss", "cognitive", "longevity"];

// Libellé : nom stocké en base d'abord, puis clé i18n historique en repli
// (on ne supprime pas les clés i18n : elles servent aux slugs d'origine).
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
  const [cats, setCats] = useState(null); // null = pas encore chargé

  const active = params.get("cat") || "all";

  // Catégories pilotées par l'admin. Masquer une catégorie la retire d'ici.
  useEffect(() => {
    let cancelled = false;
    api.get("/categories")
      .then((r) => { if (!cancelled) setCats(Array.isArray(r.data) && r.data.length ? r.data : []); })
      .catch(() => { if (!cancelled) setCats([]); });
    return () => { cancelled = true; };
  }, []);

  // Chips affichés : "all" synthétique + catégories publiées, ou repli.
  const chips = useMemo(() => {
    if (cats && cats.length) {
      return [{ slug: "all", name_en: null, name_fr: null }, ...cats];
    }
    return FALLBACK_CATEGORIES.map((c) => ({ slug: c, name_en: null, name_fr: null }));
  }, [cats]);

  useEffect(() => {
    setLoading(true);
    api.get("/products", { params: active !== "all" ? { category: active } : {} })
      .then((r) => setProducts(r.data))
      .finally(() => setLoading(false));
  }, [active]);

  const sorted = useMemo(() => {
    const arr = [...products];
    if (sort === "price-asc") arr.sort((a, b) => a.price_cad - b.price_cad);
    if (sort === "price-desc") arr.sort((a, b) => b.price_cad - a.price_cad);
    if (sort === "name") arr.sort((a, b) => a.name_en.localeCompare(b.name_en));
    return arr;
  }, [products, sort]);

  return (
    <div data-testid="catalog-page">
      <div className="border-b border-ink px-6 lg:px-12 py-16">
        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">// CATALOG</div>
        <h1 className="font-display text-5xl sm:text-7xl font-extrabold uppercase tracking-tight mt-3">
          {t("catalog.title")}
        </h1>
        <p className="mt-4 max-w-xl text-foreground/70">{t("catalog.sub")}</p>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-ink p-6 lg:p-8" data-testid="catalog-sidebar">
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50 mb-4">
            {t("common.filter")}
          </div>
          <ul className="space-y-2">
            {chips.map((c) => (
              <li key={c.slug}>
                <button
                  onClick={() => setParams(c.slug === "all" ? {} : { cat: c.slug })}
                  data-testid={`filter-${c.slug}`}
                  className={`text-left w-full font-mono text-xs uppercase tracking-[0.2em] py-2 border-b border-transparent ${
                    active === c.slug ? "border-ink font-bold" : "text-foreground/70 hover:text-ink"
                  }`}
                >
                  {catLabel(c, lang, t)}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50 mb-3">
              {t("catalog.sortBy")}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              data-testid="catalog-sort"
              className="w-full border border-ink px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] bg-white"
            >
              <option value="name">{t("catalog.sortName")}</option>
              <option value="price-asc">{t("catalog.sortPriceAsc")}</option>
              <option value="price-desc">{t("catalog.sortPriceDesc")}</option>
            </select>
          </div>
        </aside>
        <section>
          {loading ? (
            <div className="p-16 font-mono text-xs uppercase tracking-[0.25em] text-foreground/60">
              {t("common.loading")}
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-16 font-mono text-xs uppercase tracking-[0.25em] text-foreground/60" data-testid="catalog-empty">
              {t("catalog.empty")}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-l border-ink/15">
              {sorted.map((p, i) => <ProductCard product={p} key={p.id} index={i} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
