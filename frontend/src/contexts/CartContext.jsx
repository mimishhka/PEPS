import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

const CartContext = createContext(null);
const STORAGE_KEY = "fironova_cart_v1";

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [open, setOpen] = useState(false);
  // Pulse signal for the header cart badge — bumped on every add.
  const [pulse, setPulse] = useState(0);
  const langRef = useRef("fr");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Sync cart across tabs.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        try { setItems(JSON.parse(e.newValue || "[]")); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Let the current language reach the imperative toast (outside React tree).
  const setCartLang = useCallback((lang) => { langRef.current = lang; }, []);

  const add = useCallback((product, qty = 1, variant = null) => {
    const v = variant || (product.variants && product.variants[0]) || null;
    const variant_id = v?.id || null;
    let unit_price = v?.price ?? product.price_cad ?? 0;
    if (v) {
      const coaComing = v.coa_status === "pending" || v.badge_coming_soon;
      const isPre = v.preorder_enabled && (v.stock <= 0 || coaComing);
      if (isPre && v.preorder_price) unit_price = v.preorder_price;
      else if (v.sale_price && v.sale_price < v.price) unit_price = v.sale_price;
    }

    setItems((curr) => {
      const idx = curr.findIndex((i) => i.product_id === product.id && i.variant_id === variant_id);
      if (idx >= 0) {
        const next = [...curr];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [
        ...curr,
        {
          product_id: product.id,
          variant_id,
          variant_name: v?.name || "",
          slug: product.slug,
          name_en: product.name_en,
          name_fr: product.name_fr,
          price_cad: unit_price,
          qty,
          image_url: product.image_url,
          dosage_mg: product.dosage_mg,
        },
      ];
    });

    setPulse((p) => p + 1);

    // Rich, bilingual toast with two CTAs — no auto-open of the drawer.
    const fr = (langRef.current || "fr").startsWith("fr");
    const name = fr ? product.name_fr : product.name_en;
    const line = `${name}${v?.name ? ` · ${v.name}` : ""}`;
    toast.custom((id) => (
      <div className="w-[340px] max-w-[92vw] rounded-2xl border border-ash bg-white shadow-[0_20px_50px_-20px_rgba(11,46,79,.4)] p-4" data-testid="add-to-cart-toast">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-data text-[10px] uppercase tracking-[0.18em] text-nova mb-1">{fr ? "✓ Ajouté au panier" : "✓ Added to cart"}</p>
            <p className="font-display font-bold text-nordfjord text-sm truncate">{line}</p>
            <p className="font-data text-[12px] text-glacier mt-0.5">${unit_price.toFixed(2)} CAD</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => toast.dismiss(id)}
            className="flex-1 rounded-full border border-ash px-3 py-2 font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-nordfjord hover:border-nova hover:text-nova transition-colors"
          >
            {fr ? "Continuer" : "Keep shopping"}
          </button>
          <button
            onClick={() => { toast.dismiss(id); setOpen(true); }}
            className="flex-1 rounded-full bg-nova px-3 py-2 font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-nordfjord hover:bg-[#00A3BC] transition-colors"
          >
            {fr ? "Voir le panier" : "View cart"}
          </button>
        </div>
      </div>
    ), { duration: 5000 });
  }, []);

  const remove = useCallback((productId, variantId = null) => {
    setItems((curr) => curr.filter((i) => !(i.product_id === productId && (i.variant_id || null) === (variantId || null))));
  }, []);

  const setQty = useCallback((productId, variantId, qty) => {
    setItems((curr) => curr.map((i) => (i.product_id === productId && (i.variant_id || null) === (variantId || null) ? { ...i, qty: Math.max(1, qty) } : i)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.price_cad * i.qty, 0),
    [items]
  );

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);

  const value = useMemo(
    () => ({ items, add, remove, setQty, clear, subtotal, count, open, setOpen, pulse, setCartLang }),
    [items, add, remove, setQty, clear, subtotal, count, open, pulse, setCartLang]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
