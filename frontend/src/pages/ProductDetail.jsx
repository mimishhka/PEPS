import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, Minus, AlertTriangle, BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";

export default function ProductDetail() {
  const { slug } = useParams();
  const { lang, t } = useLang();
  const { add } = useCart();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySubmitting, setNotifySubmitting] = useState(false);
  const [notifyDone, setNotifyDone] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/products/${slug}`)
      .then((r) => {
        setProduct(r.data);
        const firstAvailable = (r.data.variants || []).find((v) => !v.badge_coming_soon || v.preorder_enabled) || r.data.variants?.[0];
        setVariantId(firstAvailable?.id || null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    setNotifyDone(false);
    setNotifyEmail("");
  }, [variantId, slug]);

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
  const variants = product.variants || [];
  const selectedVariant = variants.find((v) => v.id === variantId) || variants[0] || null;
  const coaComing = !!(selectedVariant && (selectedVariant.badge_coa_pending || selectedVariant.badge_coming_soon));
  const isVariantPreorder = !!(selectedVariant && selectedVariant.preorder_enabled && (selectedVariant.stock <= 0 || coaComing));
  const hasSale = !!(selectedVariant && selectedVariant.sale_price && selectedVariant.sale_price < selectedVariant.price);
  const effectivePrice = selectedVariant
    ? (isVariantPreorder && selectedVariant.preorder_price
        ? selectedVariant.preorder_price
        : hasSale ? selectedVariant.sale_price : selectedVariant.price)
    : product.price_cad;
  const showOriginal = !!(selectedVariant && effectivePrice < selectedVariant.price);
  const isComingSoon = !!(selectedVariant && selectedVariant.badge_coming_soon && !selectedVariant.preorder_enabled);
  const isOutOfStock = !!(selectedVariant && selectedVariant.stock <= 0 && !selectedVariant.preorder_enabled && !coaComing);

  const submitNotify = async () => {
    if (!/^\S+@\S+\.\S+$/.test(notifyEmail)) {
      toast.error(lang === "fr" ? "Adresse courriel invalide" : "Invalid email address");
      return;
    }
    setNotifySubmitting(true);
    try {
      await api.post("/notify-stock", {
        email: notifyEmail,
        product_id: product.id,
        variant_id: selectedVariant && selectedVariant.id !== "_default" ? selectedVariant.id : null,
      });
      setNotifyDone(true);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setNotifySubmitting(false);
    }
  };

  return (
    <div data-testid="product-detail-page" className="grid lg:grid-cols-2 border-b border-ink">
      <div className="lg:sticky lg:top-32 self-start aspect-square bg-secondary border-r border-ink relative">
        <img src={product.image_url} alt={name} className="absolute inset-0 w-full h-full object-cover" style={{ filter: "grayscale(0.4) contrast(1.05)" }} />
        <div className="absolute top-5 left-5 font-mono text-[10px] uppercase tracking-[0.25em] bg-white px-3 py-1.5 border border-ink">
          {product.dosage_mg}MG · VIAL
        </div>
        {product.coa_url ? (
          <a href={product.coa_url} target="_blank" rel="noopener noreferrer" data-testid="coa-badge-verified" className="absolute bottom-5 left-5 font-mono text-[10px] uppercase tracking-[0.25em] bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700">
            COA · VERIFIED ✓
          </a>
        ) : (
          <div data-testid="coa-badge-pending" className="absolute bottom-5 left-5 font-mono text-[10px] uppercase tracking-[0.25em] bg-orange-500 text-white px-3 py-1.5">
            COA · PENDING
          </div>
        )}
        {product.stock <= 0 && product.preorder_allowed && (
          <div data-testid="preorder-badge" className="absolute top-5 right-5 font-mono text-[10px] uppercase tracking-[0.25em] bg-orange-500 text-white px-3 py-1.5">
            PRE-ORDER
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
              <td className="py-3">{selectedVariant?.sku || product.slug.toUpperCase()}</td>
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
              <td className="py-3">{selectedVariant?.name || `${product.dosage_mg} mg`} · single vial</td>
            </tr>
            <tr className="border-b border-ink/20">
              <td className="py-3 uppercase tracking-[0.2em] text-foreground/60">{t("product.stock")}</td>
              <td className="py-3">
                {isComingSoon ? "Coming soon"
                  : isVariantPreorder ? (selectedVariant.preorder_delay_message || "Pre-order available")
                  : (selectedVariant?.stock ?? 0) > 0 ? `${selectedVariant.stock} units`
                  : t("product.outOfStock")}
              </td>
            </tr>
          </tbody>
        </table>

        {variants.length > 1 && (
          <div data-testid="variant-selector">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mb-2">Choose a size / dosage</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {variants.map((v) => {
                const active = v.id === variantId;
                const vCoaComing = v.badge_coa_pending || v.badge_coming_soon;
                const vPre = v.preorder_enabled && (v.stock <= 0 || vCoaComing);
                const vSale = v.sale_price && v.sale_price < v.price;
                const vPrice = vPre && v.preorder_price ? v.preorder_price : vSale ? v.sale_price : v.price;
                const outNoPre = v.stock <= 0 && !v.preorder_enabled && !v.badge_coming_soon;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    disabled={(v.badge_coming_soon && !v.preorder_enabled) || outNoPre}
                    data-testid={`variant-${v.name}`}
                    className={`p-3 border text-left transition-colors ${active ? "border-ink bg-ink text-white" : "border-ink/30 hover:border-ink"} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <div className="font-display font-bold">{v.name}</div>
                    <div className="font-mono text-[10px] mt-0.5 opacity-80">
                      {vPrice < v.price && <span className="line-through mr-1 opacity-60">${v.price?.toFixed(2)}</span>}
                      <span className={vPrice < v.price ? "text-red-500 font-bold" : ""}>${vPrice?.toFixed(2)} CAD</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {v.badge_coa_available && <span className="text-[9px] font-mono bg-emerald-600 text-white px-1.5 py-0.5">COA</span>}
                      {v.badge_coa_pending && <span className="text-[9px] font-mono bg-orange-500 text-white px-1.5 py-0.5">COA…</span>}
                      {v.badge_coming_soon && <span className="text-[9px] font-mono bg-blue-600 text-white px-1.5 py-0.5">SOON</span>}
                      {vPre && <span className="text-[9px] font-mono bg-orange-500 text-white px-1.5 py-0.5">PRE</span>}
                      {vSale && !vPre && <span className="text-[9px] font-mono bg-red-600 text-white px-1.5 py-0.5">SALE</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="border-t border-ink pt-8 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/50">CAD</div>
            <div className="flex items-baseline gap-3 flex-wrap">
              {showOriginal && (
                <span className="font-display text-2xl font-bold line-through text-foreground/40" data-testid="product-original-price">
                  ${selectedVariant.price.toFixed(2)}
                </span>
              )}
              <span className={`font-display text-5xl font-extrabold ${showOriginal ? "text-red-600" : ""}`} data-testid="product-price">
                ${effectivePrice.toFixed(2)}
              </span>
              {showOriginal && (
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] bg-red-600 text-white px-2 py-1" data-testid="product-discount-badge">
                  {isVariantPreorder && selectedVariant.preorder_price
                    ? (lang === "fr" ? "PRIX PRÉCOMMANDE" : "PRE-ORDER PRICE")
                    : (lang === "fr" ? "PRIX SPÉCIAL" : "SPECIAL PRICE")}
                  {" "}−{Math.round((1 - effectivePrice / selectedVariant.price) * 100)}%
                </span>
              )}
            </div>
            {isVariantPreorder && selectedVariant.preorder_note && (
              <div className="font-mono text-[11px] text-orange-600 mt-1" data-testid="preorder-note">{selectedVariant.preorder_note}</div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-10 h-10 border border-ink flex items-center justify-center hover:bg-ink hover:text-white" data-testid="product-qty-dec"><Minus size={14} /></button>
            <span className="font-mono font-bold w-8 text-center" data-testid="product-qty">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} className="w-10 h-10 border border-ink flex items-center justify-center hover:bg-ink hover:text-white" data-testid="product-qty-inc"><Plus size={14} /></button>
          </div>
        </div>

        <button
          onClick={() => add(product, qty, selectedVariant)}
          data-testid="product-add-to-cart"
          disabled={isOutOfStock || isComingSoon}
          className="w-full bg-ink text-white font-mono text-sm uppercase tracking-[0.3em] py-5 hover:bg-foreground/85 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isComingSoon ? "COMING SOON"
            : isVariantPreorder ? `PRE-ORDER · $${(effectivePrice * qty).toFixed(2)} CAD`
            : isOutOfStock ? "OUT OF STOCK"
            : `${t("common.addToCart")} — $${(effectivePrice * qty).toFixed(2)} CAD`}
        </button>

        {isOutOfStock && (
          <div className="border border-ink/20 bg-secondary/40 p-4" data-testid="notify-stock-block">
            {notifyDone ? (
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-emerald-700">
                <Check size={14} />
                {lang === "fr" ? "Nous vous écrirons dès le retour en stock." : "We'll email you when it's back."}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] mb-2">
                  <BellRing size={14} />
                  {lang === "fr" ? "M'avertir du retour en stock" : "Notify me when back in stock"}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.value)}
                    placeholder={lang === "fr" ? "votre@courriel.com" : "you@email.com"}
                    data-testid="notify-stock-email"
                    className="flex-1 border border-ink/20 px-3 py-2 text-sm bg-white"
                  />
                  <button
                    onClick={submitNotify}
                    disabled={notifySubmitting}
                    data-testid="notify-stock-submit"
                    className="border border-ink font-mono text-xs uppercase tracking-[0.2em] px-4 py-2 hover:bg-ink hover:text-white disabled:opacity-40"
                  >
                    {notifySubmitting ? "…" : lang === "fr" ? "M'avertir" : "Notify me"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {(selectedVariant?.coa_url || product.coa_url) ? (
          <a
            href={selectedVariant?.coa_url || product.coa_url}
            target="_blank" rel="noopener noreferrer"
            data-testid="download-coa"
            className="block text-center border border-emerald-600 text-emerald-700 font-mono text-xs uppercase tracking-[0.25em] py-4 hover:bg-emerald-600 hover:text-white"
          >
            {t("product.labReport")}{selectedVariant?.coa_url && selectedVariant?.name ? ` · ${selectedVariant.name}` : ` · Lot ${product.coa_lot || "—"}`} ↓
          </a>
        ) : (
          <button
            data-testid="download-coa"
            disabled
            className="w-full border border-orange-400 text-orange-700 font-mono text-xs uppercase tracking-[0.25em] py-4 opacity-70"
          >
            COA PENDING — {t("product.labReport")}
          </button>
        )}
      </div>
    </div>
  );
}
