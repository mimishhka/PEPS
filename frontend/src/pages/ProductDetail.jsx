import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, Minus, AlertTriangle } from "lucide-react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";

export default function ProductDetail() {
  const { slug } = useParams();
  const { lang, t } = useLang();
  const { add } = useCart();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/products/${slug}`)
      .then((r) => setProduct(r.data))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="p-16 font-mono text-xs uppercase tracking-[0.25em]">{t("common.loading")}</div>;
  }
  if (!product) {
    return (
      <div className="p-16 font-mono text-xs uppercase tracking-[0.25em]">
        Product not found. <Link to="/catalog" className="underline">Back to catalog</Link>
      </div>
    );
  }
  const name = lang === "fr" ? product.name_fr : product.name_en;
  const desc = lang === "fr" ? product.description_fr : product.description_en;

  return (
    <div data-testid="product-detail-page" className="grid lg:grid-cols-2 border-b border-ink">
      <div className="lg:sticky lg:top-32 self-start aspect-square bg-secondary border-r border-ink relative">
        <img src={product.image_url} alt={name} className="absolute inset-0 w-full h-full object-cover" style={{ filter: "grayscale(0.4) contrast(1.05)" }} />
        <div className="absolute top-5 left-5 font-mono text-[10px] uppercase tracking-[0.25em] bg-white px-3 py-1.5 border border-ink">
          {product.dosage_mg}MG · VIAL
        </div>
        {product.lab_tested && (
          <div className="absolute bottom-5 left-5 font-mono text-[10px] uppercase tracking-[0.25em] bg-ink text-white px-3 py-1.5">
            COA · LAB TESTED ✓
          </div>
        )}
      </div>
      <div className="p-8 lg:p-12 space-y-8">
        <div>
          <Link to="/catalog" data-testid="back-to-catalog" className="font-mono text-[11px] uppercase tracking-[0.25em] link-underline text-foreground/60">
            ← {t("common.back")}
          </Link>
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50 mt-6">
            {t("categories." + product.category)} · {product.slug}
          </div>
          <h1 className="font-display text-5xl sm:text-6xl font-extrabold uppercase tracking-tight mt-3" data-testid="product-name">
            {name}
          </h1>
        </div>

        <div className="border border-signal text-signal p-4 flex items-start gap-3" style={{ borderColor: "#E51919", color: "#E51919" }} data-testid="research-only-banner">
          <AlertTriangle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] leading-relaxed">
            {t("product.researchOnly")}
          </p>
        </div>

        <p className="text-base leading-relaxed text-foreground/80">{desc}</p>

        <table className="w-full border-collapse">
          <tbody className="font-mono text-xs">
            <tr className="border-t border-b border-ink/20">
              <td className="py-3 uppercase tracking-[0.2em] text-foreground/60 w-1/3">{t("product.sku")}</td>
              <td className="py-3">{product.slug.toUpperCase()}</td>
            </tr>
            {product.sequence && (
              <tr className="border-b border-ink/20">
                <td className="py-3 uppercase tracking-[0.2em] text-foreground/60">{t("product.sequence")}</td>
                <td className="py-3 break-all">{product.sequence}</td>
              </tr>
            )}
            <tr className="border-b border-ink/20">
              <td className="py-3 uppercase tracking-[0.2em] text-foreground/60">{t("product.purity")}</td>
              <td className="py-3">{product.purity}</td>
            </tr>
            <tr className="border-b border-ink/20">
              <td className="py-3 uppercase tracking-[0.2em] text-foreground/60">{t("product.dosage")}</td>
              <td className="py-3">{product.dosage_mg} mg · single vial</td>
            </tr>
            <tr className="border-b border-ink/20">
              <td className="py-3 uppercase tracking-[0.2em] text-foreground/60">{t("product.stock")}</td>
              <td className="py-3">{product.stock > 0 ? `${product.stock} units` : t("product.outOfStock")}</td>
            </tr>
          </tbody>
        </table>

        <div className="border-t border-ink pt-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50">CAD</div>
            <div className="font-display text-5xl font-extrabold" data-testid="product-price">${product.price_cad.toFixed(2)}</div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-10 h-10 border border-ink flex items-center justify-center hover:bg-ink hover:text-white" data-testid="product-qty-dec"><Minus size={14} /></button>
            <span className="font-mono font-bold w-8 text-center" data-testid="product-qty">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} className="w-10 h-10 border border-ink flex items-center justify-center hover:bg-ink hover:text-white" data-testid="product-qty-inc"><Plus size={14} /></button>
          </div>
        </div>

        <button
          onClick={() => add(product, qty)}
          data-testid="product-add-to-cart"
          className="w-full bg-ink text-white font-mono text-sm uppercase tracking-[0.3em] py-5 hover:bg-foreground/85"
        >
          {t("common.addToCart")} — ${(product.price_cad * qty).toFixed(2)} CAD
        </button>

        <button
          data-testid="download-coa"
          className="w-full border border-ink font-mono text-xs uppercase tracking-[0.25em] py-4 hover:bg-ink hover:text-white"
        >
          {t("product.labReport")} ↓ (PDF · 240KB)
        </button>
      </div>
    </div>
  );
}
