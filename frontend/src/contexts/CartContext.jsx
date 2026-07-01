import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";

const CartContext = createContext(null);

const STORAGE_KEY = "nordpep_cart_v1";

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = useCallback((product, qty = 1, variant = null) => {
    const v = variant || (product.variants && product.variants[0]) || null;
    const variant_id = v?.id || null;
    const unit_price = v?.price ?? product.price_cad ?? 0;
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
    toast.success("Added to cart", { description: `${product.name_en}${v?.name ? ` · ${v.name}` : ""}`, duration: 1500 });
    setOpen(true);
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
    () => ({ items, add, remove, setQty, clear, subtotal, count, open, setOpen }),
    [items, add, remove, setQty, clear, subtotal, count, open]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
