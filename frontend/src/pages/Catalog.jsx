import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import ProductCard from "../components/ProductCard.jsx";

export default function Catalog() {
  const { lang } = useLang();
  useDocumentHead({ title: lang === "fr" ? "Catalogue" : "Catalog", description: "Browse Fironova research peptides. Certificate-of-analysis documentation. For Research Use Only.", path: "/catalog" });
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeRetry, setActiveRetry] = useState(0);
  const [sort, setSort] = useState("name");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    api.get("/products")
      .then((r) => { if (active) setProducts(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeRetry]);

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
    // E2E CA-003 : le tri Prix ignorait la promo — GHK-Cu a 30 $ etait classe
    // apres un produit a 44,99 $. On trie sur le PRIX EFFECTIF : le moins
    // cher des prix de variante (promo, precommande, ou prix plein).
    const prixEffectif = (p) => {
      const vs = Array.isArray(p.variants) && p.variants.length ? p.variants : [];
      const prix = vs.map((v) => {
        if (v.sale_price && v.sale_price < v.price) return v.sale_price;
        if (v.preorder_price && v.price && v.preorder_price < v.price) return v.preorder_price;
        return v.price;
      }).filter((x) => typeof x === "number" && !Number.isNaN(x));
      if (prix.length) return Math.min(...prix);
      return p.price_cad ?? 0;
    };
    if (sort === "price-asc") arr.sort((a, b) => prixEffectif(a) - prixEffectif(b));
    if (sort === "price-desc") arr.sort((a, b) => prixEffectif(b) - prixEffectif(a));
    if (sort === "name") arr.sort((a, b) => a.name_en.localeCompare(b.name_en));
    return arr;
  }, [products, sort, query]);

  const resultCount = sorted.length;
  const sortOptions = [
    ["name", lang === "fr" ? "Nom" : "Name"],
    ["price-asc", lang === "fr" ? "Prix croissant" : "Price: low to high"],
    ["price-desc", lang === "fr" ? "Prix décroissant" : "Price: high to low"],
  ];

  return (
    <div className="fresh-catalog bg-clinical min-h-screen" data-testid="catalog-page">
      <div className="fresh-catalog__intro">
        <div className="fresh-container">
          <p className="fresh-kicker">{lang === "fr" ? "FIRONOVA · CATALOGUE" : "FIRONOVA · CATALOG"}</p>
          <h1 className="font-display">{lang === "fr" ? "La bibliothèque complète" : "The full library"}</h1>
          <p>{lang === "fr" ? "Recherchez par nom, séquence ou numéro CAS." : "Search by name, sequence, or CAS number."}</p>
        </div>
      </div>
      <main className="fresh-container fresh-catalog__main">
        <div className="fresh-catalog__tools">
          <label className="fresh-catalog__search" htmlFor="catalog-query"><Search size={18} aria-hidden="true" /><input id="catalog-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={lang === "fr" ? "Rechercher un composé, un SKU…" : "Search compounds, SKU…"} data-testid="catalog-search" /></label>
          <div className="fresh-catalog__sort" role="group" aria-label={lang === "fr" ? "Trier les produits" : "Sort products"}>
            <span className="fresh-catalog__sort-label"><SlidersHorizontal size={15} aria-hidden="true" />{lang === "fr" ? "Trier" : "Sort"}</span>
            {sortOptions.map(([value, label]) => <button type="button" key={value} onClick={() => setSort(value)} aria-pressed={sort === value} data-testid={value === "name" ? "catalog-sort-name" : value === "price-asc" ? "catalog-sort-price-asc" : "catalog-sort-price-desc"} className={sort === value ? "fresh-sort-button is-active" : "fresh-sort-button"}>{label}</button>)}
          </div>
        </div>
        {!loading && !loadError && <p className="fresh-catalog__count" aria-live="polite">{lang === "fr" ? resultCount + " produit" + (resultCount === 1 ? "" : "s") : resultCount + " product" + (resultCount === 1 ? "" : "s")}</p>}
        {loading ? (
          <div className="fresh-products" data-testid="catalog-loading" aria-label={lang === "fr" ? "Chargement" : "Loading"}>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="fresh-catalog__skeleton"><div /><span /><span /></div>)}</div>
        ) : loadError ? (
          <div className="fresh-catalog__message" role="alert" data-testid="catalog-error"><p className="fresh-catalog__message-title">{lang === "fr" ? "Impossible de charger le catalogue" : "Couldn't load the catalog"}</p><p>{lang === "fr" ? "Vérifiez votre connexion et réessayez." : "Check your connection and try again."}</p><button type="button" className="fresh-button" onClick={() => setActiveRetry((n) => n + 1)} data-testid="catalog-retry">{lang === "fr" ? "Réessayer" : "Retry"}<Search size={15} aria-hidden="true" /></button></div>
        ) : resultCount === 0 ? (
          <div className="fresh-catalog__message" data-testid="catalog-empty"><p className="fresh-catalog__message-title">{query.trim() ? (lang === "fr" ? "Aucun résultat pour « " + query.trim() + " »" : "No results for “" + query.trim() + "”") : (lang === "fr" ? "Aucun composé disponible" : "No compounds available")}</p><p>{lang === "fr" ? "Essayez un autre terme ou parcourez tout le catalogue." : "Try another term or browse the full catalog."}</p><button type="button" className="btn-pill btn-outline px-4 py-2" onClick={() => setQuery("")} data-testid="catalog-reset">{lang === "fr" ? "Effacer la recherche" : "Clear search"}</button></div>
        ) : (
          <div className="fresh-products" data-testid="catalog-grid">{sorted.map((product, index) => <ProductCard product={product} key={product.id || product.slug} index={index} />)}</div>
        )}
      </main>
    </div>
  );
}
