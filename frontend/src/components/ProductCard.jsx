import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";
import { useAuth } from "../contexts/AuthContext";
import { VialArt } from "./brand";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError, resolveAssetUrl } from "../lib/api";

function hueFor(slug = "") {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return 190 + (h % 40); // teal→blue band
}

function WishlistButton({ product }) {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [inWishlist, setInWishlist] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.get("/account/wishlist")
      .then((r) => { if (!cancelled) setInWishlist((r.data?.items || []).some((i) => i.product_id === product.id)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, product.id]);

  const toggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { navigate("/login"); return; }
    setBusy(true);
    try {
      if (inWishlist) {
        await api.delete(`/account/wishlist/${product.id}`);
        setInWishlist(false);
        toast.success(t("product.wishlistRemoved"));
      } else {
        await api.post("/account/wishlist", { product_id: product.id, variant_id: null });
        setInWishlist(true);
        toast.success(t("product.wishlistAdded"));
      }
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={inWishlist}
      aria-label={inWishlist ? t("product.wishlistRemove") : t("product.wishlistAdd")}
      data-testid={`wishlist-toggle-${product.slug}`}
      className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full border flex items-center justify-center transition-colors disabled:opacity-40 ${
        inWishlist ? "border-nova bg-nova/10 text-nova" : "border-ash bg-white/90 text-nordfjord hover:border-nova hover:text-nova"
      }`}
    >
      <Heart size={16} fill={inWishlist ? "currentColor" : "none"} />
    </button>
  );
}

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

  const stockN = cheapest ? (cheapest.stock ?? 0) : (product.stock ?? 0);
  const inStock = stockN > 0;
  const imageSrc = resolveAssetUrl(product.image_url);

  const specLine = [
    product.dosage_mg ? `${product.dosage_mg} mg` : null,
    "Lyophilized",
    "COA included",
  ].filter(Boolean).join(" · ");

  return (
    <div
      className="group bg-white border border-ash rounded-2xl overflow-hidden flex flex-col card-hover"
      data-testid={`product-card-${product.slug}`}
    >
      <Link to={`/product/${product.slug}`} className="block relative aspect-[4/3] overflow-hidden">
        <WishlistButton product={product} />
        {imageSrc ? (
          <img src={imageSrc} alt={name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <VialArt hue={hueFor(product.slug)} className="w-full h-full" />
        )}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          {anySale && (
            <span className="rounded-full font-data text-[10px] font-semibold uppercase tracking-[0.18em] bg-nova text-nordfjord px-3 py-1" data-testid={`sale-badge-${product.slug}`}>
              {lang === "fr" ? "PROMO" : "SALE"}
            </span>
          )}
          {anyPreorder && (
            <span className="rounded-full font-data text-[10px] font-semibold uppercase tracking-[0.18em] bg-white/90 backdrop-blur border border-nova text-nova px-3 py-1" data-testid={`preorder-badge-${product.slug}`}>
              {lang === "fr" ? "PRÉCOMMANDE" : "PRE-ORDER"}
            </span>
          )}
        </div>
      </Link>

      <div className="p-5 flex flex-col gap-1.5 flex-1">
        <div className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance">
          {lang === "fr" ? "USAGE RECHERCHE UNIQUEMENT" : "FOR RESEARCH USE ONLY"}
        </div>
        <Link to={`/product/${product.slug}`} className="font-display text-lg font-bold text-nordfjord hover:text-nova transition-colors">
          {name}
        </Link>
        <div className="font-data text-[11px] text-glacier">{specLine}</div>

        <div className="flex items-center justify-between pt-3 mt-auto">
          <div className="flex items-baseline gap-2">
            {displayOriginal && (
              <span className="font-data text-sm line-through text-glacier" data-testid={`card-original-price-${product.slug}`}>
                ${displayOriginal.toFixed(2)}
              </span>
            )}
            <span className={`font-data text-xl font-bold tabular-nums ${displayOriginal ? "text-nova" : "text-nordfjord"}`} data-testid={`card-price-${product.slug}`}>
              ${(displayPrice ?? 0).toFixed(2)}
            </span>
            {variants.length > 1 && (
              <span className="font-data text-[10px] uppercase tracking-[0.16em] text-glacier">{lang === "fr" ? "dès" : "from"}</span>
            )}
          </div>
          <span className={`font-data text-[11px] uppercase tracking-[0.14em] flex items-center gap-1.5 ${inStock ? "text-success" : "text-warning"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${inStock ? "bg-success" : "bg-warning"}`} />
            {anyPreorder && !inStock ? (lang === "fr" ? "Précommande" : "Pre-order")
              : inStock ? (lang === "fr" ? "En stock" : "In stock")
              : (lang === "fr" ? "Rupture" : "Out")}
          </span>
        </div>
      </div>

      <div className="p-4 pt-0">
        <button
          data-testid={`add-to-cart-${product.slug}`}
          onClick={() => add(product)}
          className="w-full btn-pill btn-nova !py-2.5 !text-[13px] !tracking-[0.06em]"
        >
          {lang === "fr" ? "Ajouter à la commande" : "Add to order"}
        </button>
      </div>
    </div>
  );
}
