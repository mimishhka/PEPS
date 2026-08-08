import { X, Plus, Minus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { useLang } from "../contexts/LanguageContext";
import { VialArt } from "./brand";
import { resolveAssetUrl } from "../lib/api";

function hueFor(slug = "") {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return 190 + (h % 40);
}

export default function CartDrawer() {
  const { lang, t } = useLang();
  const { items, remove, setQty, subtotal, open, setOpen } = useCart();
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-nordfjord/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        data-testid="cart-overlay"
      />
      <aside
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] bg-clinical border-l border-ash flex flex-col"
        data-testid="cart-drawer"
      >
        <div className="flex items-center justify-between px-6 h-16 border-b border-ash">
          <h3 className="font-display text-lg font-bold text-nordfjord">{t("cart.title")}</h3>
          <button onClick={() => setOpen(false)} data-testid="cart-close" aria-label="Close cart" className="text-nordfjord hover:text-nova transition-colors">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-6 p-8 text-center" data-testid="cart-empty">
              <p className="text-glacier">{lang === "fr" ? "Votre panier est vide." : "Your cart is empty."}</p>
              <button
                onClick={() => { setOpen(false); navigate("/catalog"); }}
                className="btn-pill btn-nova"
              >
                {lang === "fr" ? "Parcourir les composés" : "Browse compounds"}
              </button>
            </div>
          ) : (
            <ul>
              {items.map((it) => {
                const name = lang === "fr" ? it.name_fr : it.name_en;
                return (
                  <li
                    key={`${it.product_id}-${it.variant_id || "default"}`}
                    className="grid grid-cols-[56px_1fr_auto] gap-3 p-4 border-b border-ash items-start"
                    data-testid={`cart-item-${it.slug}`}
                  >
                    <div className="aspect-square rounded-lg overflow-hidden border border-ash bg-clinical">
                      {resolveAssetUrl(it.image_url) ? (
                        <img src={resolveAssetUrl(it.image_url)} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <VialArt hue={hueFor(it.slug)} className="w-full h-full" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance">{it.slug}</div>
                      <div className="font-display font-bold text-sm text-nordfjord">{name}</div>
                      <div className="font-data text-[10px] text-glacier">{it.variant_name || `${it.dosage_mg} mg`}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => setQty(it.product_id, it.variant_id, Math.max(1, it.qty - 1))}
                          className="w-6 h-6 rounded-full border border-ash flex items-center justify-center text-nordfjord hover:border-nova hover:text-nova"
                          data-testid={`cart-qty-dec-${it.slug}`}
                        >
                          <Minus size={12} />
                        </button>
                        <span className="font-data text-xs w-6 text-center text-nordfjord" data-testid={`cart-qty-${it.slug}`}>{it.qty}</span>
                        <button
                          onClick={() => setQty(it.product_id, it.variant_id, it.qty + 1)}
                          className="w-6 h-6 rounded-full border border-ash flex items-center justify-center text-nordfjord hover:border-nova hover:text-nova"
                          data-testid={`cart-qty-inc-${it.slug}`}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <button onClick={() => remove(it.product_id, it.variant_id)} data-testid={`cart-remove-${it.slug}`} aria-label="Remove" className="text-glacier hover:text-error transition-colors">
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                      <div className="font-data font-bold text-nordfjord">${(it.price_cad * it.qty).toFixed(2)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {items.length > 0 && (
          <div className="border-t border-ash p-6 space-y-4">
            <div className="flex justify-between items-baseline">
              <span className="font-data text-xs uppercase tracking-[0.16em] text-glacier">{t("common.subtotal")}</span>
              <span className="font-display font-bold text-xl text-nordfjord" data-testid="cart-subtotal">${subtotal.toFixed(2)} CAD</span>
            </div>
            <p className="font-data text-[10px] uppercase tracking-[0.16em] text-compliance">
              {lang === "fr" ? "TAXES ET LIVRAISON CALCULÉES AU PAIEMENT" : "TAXES & SHIPPING CALCULATED AT CHECKOUT"}
            </p>
            <button
              data-testid="cart-checkout-btn"
              onClick={() => { setOpen(false); navigate("/checkout"); }}
              className="w-full btn-pill btn-nova"
            >
              {t("cart.proceed")} →
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
