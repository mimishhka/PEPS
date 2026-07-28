import { useEffect, useState } from "react";
import { X, Plus, Minus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { useLang } from "../contexts/LanguageContext";
import { VialArt } from "./brand";

function hueFor(slug = "") {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return 190 + (h % 40);
}

export default function CartDrawer() {
  const { lang, t } = useLang();
  const { items, remove, setQty, subtotal, open, setOpen } = useCart();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  // Mount/animate: keep in DOM briefly for slide-out.
  const [render, setRender] = useState(open);
  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }
    setMounted(false);
    const to = setTimeout(() => setRender(false), 260);
    return () => clearTimeout(to);
  }, [open]);

  if (!render) return null;

  const cheapestVariantPrice = (p) => {
    const vs = p.variants || [];
    if (!vs.length) return p.price_cad ?? 0;
    return vs.reduce((m, v) => {
      const sale = v.sale_price && v.sale_price < v.price ? v.sale_price : v.price;
      return sale < m ? sale : m;
    }, Infinity);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-nordfjord/40 backdrop-blur-sm transition-opacity duration-250 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={() => setOpen(false)}
        data-testid="cart-overlay"
      />
      <aside
        className={`fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] bg-clinical border-l border-ash flex flex-col transition-transform duration-250 ease-out ${mounted ? "translate-x-0" : "translate-x-full"}`}
        data-testid="cart-drawer"
      >
        <div className="flex items-center justify-between px-6 h-16 border-b border-ash shrink-0">
          <h3 className="font-display text-lg font-bold text-nordfjord">{t("cart.title")}</h3>
          <button onClick={() => setOpen(false)} data-testid="cart-close" aria-label="Close cart" className="w-11 h-11 -mr-2 flex items-center justify-center text-nordfjord hover:text-nova transition-colors">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 p-8 text-center" data-testid="cart-empty">
              <p className="text-glacier">{t("cart.empty")}</p>
              <button
                onClick={() => { setOpen(false); navigate("/catalog"); }}
                className="btn-pill btn-nova"
              >
                {lang === "fr" ? "Parcourir les composés" : "Browse compounds"}
              </button>
            </div>
          ) : (
            <>
              <ul>
                {items.map((it) => {
                  const name = lang === "fr" ? it.name_fr : it.name_en;
                  return (
                    <li
                      key={`${it.product_id}-${it.variant_id || "default"}`}
                      className="grid grid-cols-[80px_1fr_auto] gap-4 p-4 border-b border-ash"
                      data-testid={`cart-item-${it.slug}`}
                    >
                      <div className="aspect-square rounded-xl overflow-hidden">
                        <VialArt hue={hueFor(it.slug)} className="w-full h-full" />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance">{it.slug}</div>
                        <div className="font-display font-bold text-sm text-nordfjord truncate">{name}</div>
                        <div className="font-data text-[10px] text-glacier">
                          {(it.variant_name || `${it.dosage_mg} mg`)} · ${it.price_cad.toFixed(2)}{lang === "fr" ? "/u" : " ea"}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => setQty(it.product_id, it.variant_id, Math.max(1, it.qty - 1))}
                            className="w-11 h-11 rounded-full border border-ash flex items-center justify-center text-nordfjord hover:border-nova hover:text-nova"
                            data-testid={`cart-qty-dec-${it.slug}`}
                            aria-label="Decrease quantity"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="font-data text-sm w-7 text-center text-nordfjord" data-testid={`cart-qty-${it.slug}`}>{it.qty}</span>
                          <button
                            onClick={() => setQty(it.product_id, it.variant_id, it.qty + 1)}
                            className="w-11 h-11 rounded-full border border-ash flex items-center justify-center text-nordfjord hover:border-nova hover:text-nova"
                            data-testid={`cart-qty-inc-${it.slug}`}
                            aria-label="Increase quantity"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between">
                        <button onClick={() => remove(it.product_id, it.variant_id)} data-testid={`cart-remove-${it.slug}`} aria-label="Remove" className="w-11 h-11 -mt-2 -mr-2 flex items-center justify-center text-glacier hover:text-error transition-colors">
                          <Trash2 size={16} strokeWidth={1.5} />
                        </button>
                        <div className="font-data font-bold text-nordfjord">${(it.price_cad * it.qty).toFixed(2)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>

            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-ash p-5 space-y-3 shrink-0">
            <div className="flex justify-between items-baseline">
              <span className="font-data text-xs uppercase tracking-[0.16em] text-glacier">{t("common.subtotal")}</span>
              <span className="font-display font-bold text-xl text-nordfjord" data-testid="cart-subtotal">${subtotal.toFixed(2)} CAD</span>
            </div>
            <p className="font-data text-[10px] uppercase tracking-[0.16em] text-compliance">
              {lang === "fr" ? "TAXES ET LIVRAISON CALCULÉES AU PAIEMENT" : "TAXES & SHIPPING CALCULATED AT CHECKOUT"}
            </p>

            <div className="flex gap-2.5">
              <button
                onClick={() => { setOpen(false); navigate("/catalog"); }}
                data-testid="cart-keep-shopping"
                className="flex-1 rounded-xl border-[1.5px] border-ash px-4 py-3 font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-nordfjord hover:border-nova hover:text-nova transition-colors"
              >
                {t("cart.keepShopping")}
              </button>
              <button
                data-testid="cart-checkout-btn"
                onClick={() => { setOpen(false); navigate("/checkout"); }}
                className="flex-1 rounded-xl bg-nova px-4 py-3 font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-nordfjord hover:bg-[#00A3BC] transition-colors"
              >
                {t("cart.proceed")} →
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
