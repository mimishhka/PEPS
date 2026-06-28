import { X, Plus, Minus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../contexts/CartContext";
import { useLang } from "../contexts/LanguageContext";

export default function CartDrawer() {
  const { lang, t } = useLang();
  const { items, remove, setQty, subtotal, open, setOpen } = useCart();
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        data-testid="cart-overlay"
      />
      <aside
        className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] bg-white border-l border-ink flex flex-col"
        data-testid="cart-drawer"
      >
        <div className="flex items-center justify-between px-6 h-16 border-b border-ink">
          <h3 className="font-display text-lg font-bold uppercase tracking-tight">{t("cart.title")}</h3>
          <button onClick={() => setOpen(false)} data-testid="cart-close" aria-label="Close cart">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-foreground/60" data-testid="cart-empty">
              {t("cart.empty")}
            </div>
          ) : (
            <ul>
              {items.map((it) => {
                const name = lang === "fr" ? it.name_fr : it.name_en;
                return (
                  <li
                    key={it.product_id}
                    className="grid grid-cols-[80px_1fr_auto] gap-4 p-4 border-b border-ink/10"
                    data-testid={`cart-item-${it.slug}`}
                  >
                    <div className="aspect-square bg-secondary overflow-hidden">
                      <img src={it.image_url} alt={name} className="w-full h-full object-cover" style={{ filter: "grayscale(0.4)" }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">{it.slug}</div>
                      <div className="font-display font-bold text-sm">{name}</div>
                      <div className="font-mono text-[10px] text-foreground/60">{it.dosage_mg}MG</div>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => setQty(it.product_id, Math.max(1, it.qty - 1))}
                          className="w-6 h-6 border border-ink flex items-center justify-center hover:bg-ink hover:text-white"
                          data-testid={`cart-qty-dec-${it.slug}`}
                        >
                          <Minus size={12} />
                        </button>
                        <span className="font-mono text-xs w-6 text-center" data-testid={`cart-qty-${it.slug}`}>{it.qty}</span>
                        <button
                          onClick={() => setQty(it.product_id, it.qty + 1)}
                          className="w-6 h-6 border border-ink flex items-center justify-center hover:bg-ink hover:text-white"
                          data-testid={`cart-qty-inc-${it.slug}`}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <button onClick={() => remove(it.product_id)} data-testid={`cart-remove-${it.slug}`} aria-label="Remove">
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                      <div className="font-display font-bold">${(it.price_cad * it.qty).toFixed(2)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {items.length > 0 && (
          <div className="border-t border-ink p-6 space-y-4">
            <div className="flex justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">{t("common.subtotal")}</span>
              <span className="font-display font-bold text-xl" data-testid="cart-subtotal">${subtotal.toFixed(2)} CAD</span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50">
              TAXES &amp; SHIPPING CALCULATED AT CHECKOUT
            </p>
            <button
              data-testid="cart-checkout-btn"
              onClick={() => { setOpen(false); navigate("/checkout"); }}
              className="w-full bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] py-4 hover:bg-foreground/85"
            >
              {t("cart.proceed")} →
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
