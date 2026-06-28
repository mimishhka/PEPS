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

  const add = useCallback((product, qty = 1) => {
    setItems((curr) => {
      const idx = curr.findIndex((i) => i.product_id === product.id);
      if (idx >= 0) {
        const next = [...curr];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [
        ...curr,
        {
          product_id: product.id,
          slug: product.slug,
          name_en: product.name_en,
          name_fr: product.name_fr,
          price_cad: product.price_cad,
          qty,
          image_url: product.image_url,
          dosage_mg: product.dosage_mg,
        },
      ];
    });
    toast.success("Added to cart", { description: product.name_en, duration: 1500 });
    setOpen(true);
  }, []);

  const remove = useCallback((productId) => {
    setItems((curr) => curr.filter((i) => i.product_id !== productId));
  }, []);

  const setQty = useCallback((productId, qty) => {
    setItems((curr) => curr.map((i) => (i.product_id === productId ? { ...i, qty: Math.max(1, qty) } : i)));
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
