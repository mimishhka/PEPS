import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";

export default function ProductCard({ product, index = 0 }) {
  const { lang, t } = useLang();
  const { add } = useCart();
  const name = lang === "fr" ? product.name_fr : product.name_en;

  return (
    <div
      className="group bg-white border-r border-b border-ink/15 flex flex-col"
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
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">CAD</div>
            <div className="font-display text-2xl font-bold">${product.price_cad.toFixed(2)}</div>
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
