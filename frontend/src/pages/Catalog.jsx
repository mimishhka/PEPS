import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import ProductCard from "../components/ProductCard.jsx";
import { getProductPricing } from "../lib/productPricing";

// Les catégories thématiques ont été retirées de la boutique : leurs libellés
// (« Healing & Recovery », « Weight Management »…) décrivaient un effet
// physiologique, ce qui rattache un composé à un usage humain. Le catalogue
// présente désormais l'ensemble des produits, avec recherche et tri sur des
// critères objectifs (nom, séquence, CAS, prix).
export default function Catalog() {
  useDocumentHead({ title: "Catalog", description: "Browse Fironova research peptides. Certificate-of-analysis documentation. For Research Use Only.", path: "/catalog" });
  const { lang } = useLang();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeRetry, setActiveRetry] = useState(0);
  const [sort, setSort] = useState("name");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    api.get("/products")
      .then((r) => setProducts(Array.isArray(r.data) ? r.data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [activeRetry]);

  const sorted = useMemo(() => {
    let arr = [...products];
    const q = query.trim().toLowerCase();
    if (q) {
      arr = arr.filter((p) =>
        [p.name_en, p.name_fr, p.slug, p.sequence, p.cas_number, ...(p.variants || []).map((v) => v.sku)]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      );
    }
    if (sort === "price-asc") arr.sort((a, b) => getProductPricing(a).price - getProductPricing(b).price);
    if (sort === "price-desc") arr.sort((a, b) => getProductPricing(b).price - getProductPricing(a).price);
    if (sort === "name") arr.sort((a, b) => String((lang === "fr" ? a.name_fr : a.name_en) || a.name_en || a.slug).localeCompare(String((lang === "fr" ? b.name_fr : b.name_en) || b.name_en || b.slug), lang));
    return arr;
  }, [products, sort, query, lang]);

  return (
    <div data-testid="catalog-page" className="fn-catalog bg-clinical min-h-screen">
      <div className="fn-container fn-catalog-heading">
        <p className="fn-kicker mb-4">
          <span className="inline-block w-8 h-px bg-nova" /> {lang === "fr" ? "CATALOGUE" : "CATALOG"}
        </p>
        <h1 className="fn-catalog-title">
          {lang === "fr" ? "La bibliothèque complète" : "The full library"}
        </h1>
        <p className="fn-catalog-description">{lang === "fr" ? "Explorez les composés, comparez les spécifications et consultez la documentation disponible." : "Explore compounds, compare specifications, and find available documentation."}</p>
      </div>

      <div className="fn-container pb-24">
        <section>
          <div className="fn-catalog-controls">
            <div className="fn-catalog-search">
              <Search size={16} className="text-glacier shrink-0" />
              <input
                type="search"
                aria-label={lang === "fr" ? "Rechercher par nom, SKU, séquence ou CAS" : "Search by name, SKU, sequence, or CAS"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lang === "fr" ? "Rechercher un composé, un SKU…" : "Search compounds, SKU…"}
                data-testid="catalog-search"
                className="flex-1 bg-transparent outline-none text-nordfjord text-[15px] placeholder:text-glacier"
              />
            </div>
            <div className="fn-catalog-sorts" role="group" aria-label={lang === "fr" ? "Trier les composés" : "Sort compounds"}>
              <button
                onClick={() => setSort("price-asc")}
                data-testid="catalog-sort-price-asc"
                aria-pressed={sort === "price-asc"}
                className={`rounded-full font-data text-[11px] font-semibold uppercase tracking-[0.16em] px-4 py-2.5 border-[1.5px] transition-colors ${sort === "price-asc" ? "border-nova text-nova" : "border-ash text-glacier hover:border-nova hover:text-nova"}`}
              >
                {lang === "fr" ? "Prix ↑" : "Price ↑"}
              </button>
              <button
                onClick={() => setSort("price-desc")}
                data-testid="catalog-sort-price-desc"
                aria-pressed={sort === "price-desc"}
                className={`rounded-full font-data text-[11px] font-semibold uppercase tracking-[0.16em] px-4 py-2.5 border-[1.5px] transition-colors ${sort === "price-desc" ? "border-nova text-nova" : "border-ash text-glacier hover:border-nova hover:text-nova"}`}
              >
                {lang === "fr" ? "Prix ↓" : "Price ↓"}
              </button>
              <button
                onClick={() => setSort("name")}
                data-testid="catalog-sort-name"
                aria-pressed={sort === "name"}
                className={`rounded-full font-data text-[11px] font-semibold uppercase tracking-[0.16em] px-4 py-2.5 border-[1.5px] transition-colors ${sort === "name" ? "border-nova text-nova" : "border-ash text-glacier hover:border-nova hover:text-nova"}`}
              >
                {lang === "fr" ? "Nom" : "Name"}
              </button>
            </div>
          </div>

          {!loading && !loadError && <p className="fn-results-count" role="status" data-testid="catalog-results-count">{sorted.length} {lang === "fr" ? "composé(s)" : "compound(s)"}</p>}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="catalog-loading">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-ash bg-white overflow-hidden animate-pulse">
                  <div className="aspect-square bg-clinical" />
                  <div className="p-5 space-y-3">
                    <div className="h-4 bg-clinical rounded w-3/4" />
                    <div className="h-3 bg-clinical rounded w-1/2" />
                    <div className="h-6 bg-clinical rounded w-1/3 mt-4" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="py-20 text-center" data-testid="catalog-error">
              <p className="text-nordfjord font-display text-lg font-semibold mb-2">
                {lang === "fr" ? "Impossible de charger le catalogue" : "Couldn't load the catalog"}
              </p>
              <p className="text-glacier text-sm mb-6">
                {lang === "fr" ? "Vérifiez votre connexion et réessayez." : "Check your connection and try again."}
              </p>
              <button onClick={() => setActiveRetry((n) => n + 1)}
                className="btn-pill btn-nova" data-testid="catalog-retry">
                {lang === "fr" ? "Réessayer" : "Retry"}
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-20 text-center" data-testid="catalog-empty">
              <p className="text-nordfjord font-display text-lg font-semibold mb-2">
                {query.trim()
                  ? (lang === "fr" ? `Aucun résultat pour « ${query.trim()} »` : `No results for “${query.trim()}”`)
                  : (lang === "fr" ? "Aucun composé disponible" : "No compounds available")}
              </p>
              <p className="text-glacier text-sm mb-6">
                {lang === "fr" ? "Essayez un autre terme ou parcourez tout le catalogue." : "Try another term or browse the full catalog."}
              </p>
              <button
                onClick={() => setQuery("")}
                className="btn-pill btn-outline" data-testid="catalog-reset">
                {lang === "fr" ? "Effacer la recherche" : "Clear search"}
              </button>
            </div>
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
