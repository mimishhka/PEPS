import { useEffect, useState } from "react";
import { X, Plus, Minus, Trash2, ShieldCheck, PackageOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
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
  const { items, add, remove, setQty, subtotal, open, setOpen } = useCart();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

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

  // Cross-sell: featured products not already in the cart.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.get("/products", { params: { featured: true } })
      .then((r) => {
        if (cancelled) return;
        const inCart = new Set(items.map((i) => i.product_id));
        setSuggestions((r.data || []).filter((p) => !inCart.has(p.id)).slice(0, 3));
      })
      .catch(() => { if (!cancelled) setSuggestions([]); });
    return () => { cancelled = true; };
  }, [open, items]);

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

              {suggestions.length > 0 && (
                <div className="p-4 border-t border-ash bg-white/50" data-testid="cart-cross-sell">
                  <p className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-3">
                    {lang === "fr" ? "Pourrait aussi vous intéresser" : "You might also like"}
                  </p>
                  <div className="space-y-2">
                    {suggestions.map((p) => {
                      const pname = lang === "fr" ? p.name_fr : p.name_en;
                      const price = cheapestVariantPrice(p);
                      return (
                        <div key={p.id} className="flex items-center gap-3" data-testid={`cross-sell-${p.slug}`}>
                          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                            <VialArt hue={hueFor(p.slug)} className="w-full h-full" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => { setOpen(false); navigate(`/product/${p.slug}`); }}
                              className="font-display font-bold text-sm text-nordfjord hover:text-nova transition-colors truncate block text-left w-full"
                            >
                              {pname}
                            </button>
                            <div className="font-data text-[11px] text-glacier">
                              {lang === "fr" ? "dès" : "from"} ${price.toFixed(2)}
                            </div>
                          </div>
                          <button
                            onClick={() => add(p)}
                            data-testid={`cross-sell-add-${p.slug}`}
                            className="shrink-0 rounded-full border border-ash w-11 h-11 flex items-center justify-center text-nordfjord hover:border-nova hover:text-nova transition-colors"
                            aria-label={lang === "fr" ? "Ajouter" : "Add"}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-ash p-6 space-y-4 shrink-0">
            <div className="flex justify-between items-baseline">
              <span className="font-data text-xs uppercase tracking-[0.16em] text-glacier">{t("common.subtotal")}</span>
              <span className="font-display font-bold text-xl text-nordfjord" data-testid="cart-subtotal">${subtotal.toFixed(2)} CAD</span>
            </div>
            <p className="font-data text-[10px] uppercase tracking-[0.16em] text-compliance">
              {lang === "fr" ? "TAXES ET LIVRAISON CALCULÉES AU PAIEMENT" : "TAXES & SHIPPING CALCULATED AT CHECKOUT"}
            </p>

            <div className="flex items-center justify-center gap-4 py-1 font-data text-[10px] uppercase tracking-[0.14em] text-glacier">
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-nova" /> {lang === "fr" ? "Paiement sécurisé" : "Secure payment"}</span>
              <span className="flex items-center gap-1.5"><PackageOpen size={13} className="text-nova" /> {lang === "fr" ? "Envoi discret" : "Discreet shipping"}</span>
            </div>
            <p className="text-center font-data text-[10px] uppercase tracking-[0.14em] text-compliance">
              {lang === "fr" ? "Usage recherche uniquement · 19+" : "For Research Use Only · 19+"}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setOpen(false); navigate("/catalog"); }}
                data-testid="cart-keep-shopping"
                className="flex-1 btn-pill border-[1.5px] border-ash text-nordfjord hover:border-nova hover:text-nova"
              >
                {t("cart.keepShopping")}
              </button>
              <button
                data-testid="cart-checkout-btn"
                onClick={() => { setOpen(false); navigate("/checkout"); }}
                className="flex-1 btn-pill btn-nova"
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
