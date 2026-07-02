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
      className="group bg-white border border-ink/15 flex flex-col card-hover"
      data-testid={`product-card-${product.slug}`}
    >
      <Link to={`/product/${product.slug}`} className="block relative bg-secondary aspect-[4/5] overflow-hidden">
        <img
          src={product.image_url}
          alt={name}
          loading={index < 4 ? "eager" : "lazy"}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ filter: "grayscale(0.4) contrast(1.05)" }}
        />
        <div className="absolute top-3 left-3 font-mono text-[10px] uppercase tracking-[0.2em] bg-white px-2 py-1 border border-ink">
          {product.dosage_mg}MG
        </div>
        {product.lab_tested && (
          <div className="absolute top-3 right-3 font-mono text-[10px] uppercase tracking-[0.2em] bg-ink text-white px-2 py-1">
            COA ✓
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {anySale && (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] bg-red-600 text-white px-2 py-1" data-testid={`sale-badge-${product.slug}`}>
              {lang === "fr" ? "PROMO" : "SALE"}
            </span>
          )}
          {anyPreorder && (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] bg-orange-500 text-white px-2 py-1" data-testid={`preorder-badge-${product.slug}`}>
              {lang === "fr" ? "PRÉCOMMANDE" : "PRE-ORDER"}
            </span>
          )}
        </div>
      </Link>
      <div className="p-5 flex flex-col gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50">
          {product.slug}
        </div>
        <Link to={`/product/${product.slug}`} className="font-display text-xl font-bold tracking-tight hover:text-ink/70">
          {name}
        </Link>
        {product.sequence && (
          <div className="font-mono text-[10px] text-foreground/60 line-clamp-1">{product.sequence}</div>
        )}
        <div className="flex items-end justify-between pt-2">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
              {variants.length > 1 ? (lang === "fr" ? "DÈS · CAD" : "FROM · CAD") : "CAD"}
            </div>
            <div className="flex items-baseline gap-2">
              {displayOriginal && (
                <span className="font-display text-sm font-bold line-through text-foreground/40" data-testid={`card-original-price-${product.slug}`}>
                  ${displayOriginal.toFixed(2)}
                </span>
              )}
              <span className={`font-display text-2xl font-bold ${displayOriginal ? "text-red-600" : ""}`} data-testid={`card-price-${product.slug}`}>
                ${(displayPrice ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60">
            {product.purity}
          </div>
        </div>
      </div>
      <button
        data-testid={`add-to-cart-${product.slug}`}
        onClick={() => add(product)}
        className="mt-auto bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] py-4 hover:bg-foreground/85 transition-colors"
      >
        {t("common.addToCart")} +
      </button>
    </div>
  );
}
