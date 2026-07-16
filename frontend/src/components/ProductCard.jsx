import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";

export default function ProductCard({ product, index = 0 }) {
  const { lang, t } = useLang();
  const { add } = useCart();
  const name = lang === "fr" ? product.name_fr : product.name_en;

  const variants = product.variants || [];
  const priced = variants.map((v) => {
    const coaComing = v.badge_coa_pending || v.badge_coming_soon;
    const isPre = v.preorder_enabled && (v.stock <= 0 || coaComing);
    const sale = v.sale_price && v.sale_price < v.price;
    const eff = isPre && v.preorder_price ? v.preorder_price : sale ? v.sale_price : v.price;
    return { ...v, eff, isPre, sale };
  });
  const cheapest = priced.length ? priced.reduce((m, v) => (v.eff < m.eff ? v : m), priced[0]) : null;
  const displayPrice = cheapest ? cheapest.eff : product.price_cad;
  const displayOriginal = cheapest && cheapest.eff < cheapest.price ? cheapest.price : null;
  const anyPreorder = priced.some((v) => v.isPre);
  const anySale = priced.some((v) => v.sale && !v.isPre);

  return (
    <div
      className="group bg-paper border border-faint rounded-lg overflow-hidden flex flex-col card-hover"
      data-testid={`product-card-${product.slug}`}
    >
      <Link to={`/product/${product.slug}`} className="block relative bg-secondary aspect-[4/5] overflow-hidden">
        <img
          src={product.image_url}
          alt={name}
          loading={index < 4 ? "eager" : "lazy"}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute top-3 left-3 rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-paper/90 backdrop-blur border border-faint px-3 py-1.5 text-copper">
          {product.dosage_mg}MG
        </div>
        {product.lab_tested && (
          <div className="absolute top-3 right-3 rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-garnet text-paper px-3 py-1.5">
            COA ✓
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {anySale && (
            <span
              className="rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-signal text-paper px-3 py-1.5"
              data-testid={`sale-badge-${product.slug}`}
            >
              {lang === "fr" ? "PROMO" : "SALE"}
            </span>
          )}
          {anyPreorder && (
            <span
              className="rounded-full font-mono text-[10px] uppercase tracking-[0.2em] bg-paper/90 backdrop-blur border border-copper text-copper px-3 py-1.5"
              data-testid={`preorder-badge-${product.slug}`}
            >
              {lang === "fr" ? "PRÉCOMMANDE" : "PRE-ORDER"}
            </span>
          )}
        </div>
      </Link>
      <div className="p-5 flex flex-col gap-2.5 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-copper">
          {product.slug}
        </div>
        <Link
          to={`/product/${product.slug}`}
          className="font-display text-xl font-bold tracking-[-0.01em] text-ink hover:text-garnet transition-colors"
        >
          {name}
        </Link>
        {product.sequence && (
          <div className="font-mono text-[10px] text-inkmuted line-clamp-1">{product.sequence}</div>
        )}
        <div className="flex items-end justify-between pt-2 mt-auto">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-inkmuted">
              {variants.length > 1 ? (lang === "fr" ? "DÈS · CAD" : "FROM · CAD") : "CAD"}
            </div>
            <div className="flex items-baseline gap-2">
              {displayOriginal && (
                <span
                  className="font-mono text-sm line-through text-inkmuted"
                  data-testid={`card-original-price-${product.slug}`}
                >
                  ${displayOriginal.toFixed(2)}
                </span>
              )}
              <span
                className={`font-mono text-2xl font-bold tabular-nums ${displayOriginal ? "text-signal" : "text-ink"}`}
                data-testid={`card-price-${product.slug}`}
              >
                ${(displayPrice ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-copper">
            {product.purity}
          </div>
        </div>
      </div>
      <div className="p-4 pt-0">
        <button
          data-testid={`add-to-cart-${product.slug}`}
          onClick={() => add(product)}
          className="w-full rounded-full bg-ink text-paper font-mono text-xs uppercase tracking-[0.25em] py-3.5 hover:bg-garnet transition-colors"
        >
          {t("common.addToCart")} +
        </button>
      </div>
    </div>
  );
}
