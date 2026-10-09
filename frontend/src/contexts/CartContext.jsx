import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import api from "../lib/api";
import ProductImage from "../components/ProductImage";
import { TAILLES } from "../lib/derivees";

const CartContext = createContext(null);

const STORAGE_KEY = "fironova_cart_v1";
const SAVED_BY_USER_KEY = "fironova_cart_saved_by_user_v1";

function loadSavedByUser() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SAVED_BY_USER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSavedByUser(map) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_BY_USER_KEY, JSON.stringify(map || {}));
  } catch {
    // Ignore storage failures.
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [open, setOpen] = useState(false);
  // Le courriel de la session en cours, retenu à la volée : `clear()` en a
  // besoin pour effacer LA bonne sauvegarde, et pas celles des autres comptes
  // qui se sont connectés sur ce navigateur.
  const courrielConnu = useRef(null);

  // Le contenu courant, lisible par une fonction memorisee sans la faire
  // dependre de `items` — sinon la revalidation se recreerait a chaque
  // changement et relancerait une requete en boucle.
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    // Le panier mis de côté à la déconnexion est un PASSAGE DE MAIN, pas une
    // archive : il se dépose une fois, se reprend une fois, et disparaît.
    //
    // Il ne disparaissait jamais. Se déconnecter avec un panier vide ne
    // touchait pas à l'ancienne sauvegarde (on sortait avant), et la reprise
    // ne l'effaçait pas davantage. Or `refresh()` rejoue « session rétablie »
    // à CHAQUE chargement de page : on retirait l'article, on rechargeait, il
    // revenait. Indéfiniment, quoi qu'on fasse.
    const onBeforeSessionClear = (event) => {
      const email = (event?.detail?.email || "").toLowerCase().trim();
      if (!email) return;
      const byUser = loadSavedByUser();
      if (Array.isArray(items) && items.length > 0) {
        byUser[email] = items;
      } else {
        // Panier vidé volontairement : la sauvegarde doit partir avec lui.
        delete byUser[email];
      }
      saveSavedByUser(byUser);
    };

    const onSessionCleared = () => {
      setItems([]);
      setOpen(false);
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    };

    const onSessionRestored = (event) => {
      const email = (event?.detail?.email || "").toLowerCase().trim();
      if (!email) return;
      courrielConnu.current = email;
      const byUser = loadSavedByUser();
      const saved = byUser[email];
      if (saved === undefined) return;
      // Reprise UNIQUE : on consomme la sauvegarde, qu'on s'en serve ou non.
      // Sans cela elle se réapplique à chaque chargement de page.
      delete byUser[email];
      saveSavedByUser(byUser);
      if (Array.isArray(items) && items.length > 0) return;   // panier en cours : on n'écrase rien
      if (Array.isArray(saved) && saved.length > 0) setItems(saved);
    };

    window.addEventListener("fironova:before-session-clear", onBeforeSessionClear);
    window.addEventListener("fironova:session-cleared", onSessionCleared);
    window.addEventListener("fironova:session-restored", onSessionRestored);
    return () => {
      window.removeEventListener("fironova:before-session-clear", onBeforeSessionClear);
      window.removeEventListener("fironova:session-cleared", onSessionCleared);
      window.removeEventListener("fironova:session-restored", onSessionRestored);
    };
  }, [items]);

  const add = useCallback((product, qty = 1, variant = null) => {
    const v = variant || (product.variants && product.variants[0]) || null;
    const variant_id = v?.id || null;
    let unit_price = v?.price ?? product.price_cad ?? 0;
    // Preorder/sale price is computed inside setItems where merged qty is known.
    setItems((curr) => {
      const idx = curr.findIndex((i) => i.product_id === product.id && i.variant_id === variant_id);
      const mergedQty = idx >= 0 ? curr[idx].qty + qty : qty;
      /* LE PANIER SE SOUVIENT QU'UNE LIGNE EST UNE PRECOMMANDE.
       *
       * MIREILLE, 30/09/2026 : « lors de l'ajout d'un produit en precommande
       * il n'y a pas de notification pour le client ».
       *
       * `isPre` n'existait que le temps de calculer un prix, et rien ne le
       * conservait sur la ligne. Le tiroir du panier et la caisse ne POUVAIENT
       * donc pas en parler, meme s'ils l'avaient voulu : l'information etait
       * jetee aussitot calculee.
       *
       * Le drapeau ne decide de rien : le serveur retranche la precommande a
       * la caisse (`_build_order_totals`) en relisant le stock reel. Il sert a
       * le DIRE.
       */
      let isPre = false;
      if (v) {
        const coaComing = v.badge_coa_pending || v.badge_coming_soon;
        isPre = !!(v.preorder_enabled && (coaComing || v.stock < mergedQty));
        unit_price = isPre && v.preorder_price ? v.preorder_price
          : (v.sale_price && v.sale_price < v.price ? v.sale_price : unit_price);
      }
      if (idx >= 0) {
        const next = [...curr];
        // Le prix ET le drapeau sont recalcules sur la quantite FUSIONNEE.
        // Sans cela, ajouter une unite de plus que le stock basculait la ligne
        // en precommande cote serveur, tandis que le panier continuait
        // d'afficher le prix et le statut d'un article disponible : le client
        // decouvrait l'ecart sur sa facture.
        next[idx] = { ...next[idx], qty: mergedQty, price_cad: unit_price, preorder: isPre };
        return next;
      }
      return [
        ...curr,
        {
          product_id: product.id,
          variant_id,
          variant_name: (v?.name && v.name !== "Default") ? v.name : "",
          // LE SKU DE LA VARIANTE CHOISIE (rapport E2E PA-001). Le panier
          // affichait le slug du PRODUIT : « BPC-157-5MG » restait sous la
          // variante 10 mg, donc l'article annonce n'etait pas celui commande.
          variant_sku: v?.sku || "",
          slug: product.slug,
          name_en: product.name_en,
          name_fr: product.name_fr,
          price_cad: unit_price,
          preorder: isPre,
          qty,
          image_url: product.image_url,
          dosage_mg: product.dosage_mg,
        },
      ];
    });
    // Feedback: toast riche bilingue avec image + 2 CTA. Le drawer NE s'ouvre PAS automatiquement.
    const fr = ((typeof window !== "undefined" && localStorage.getItem("fironova_lang")) || "en").startsWith("fr");
    const name = fr ? (product.name_fr || product.name_en) : (product.name_en || product.name_fr);
    const line = `${name}${v?.name ? ` · ${v.name}` : ""}`;
    toast.custom((id) => (
      <div className="w-[340px] max-w-[92vw] rounded-xl border border-ash bg-white shadow-[0_20px_50px_-20px_rgba(11,46,79,.4)] p-4" data-testid="add-to-cart-toast">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg object-cover border border-ash shrink-0 overflow-hidden">
            <ProductImage
              src={product.image_url}
              slug={product.slug}
              alt=""
              sizes={TAILLES.vignette}
              className="w-full h-full"
              imgClassName="w-full h-full object-cover"
            />
          </div>
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
            className="flex-1 rounded-full bg-nova px-3 py-2 font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-nordfjord hover:bg-nova-hover transition-colors"
          >
            {fr ? "Voir le panier" : "View cart"}
          </button>
        </div>
      </div>
    ), { duration: 4000 });
  }, []);

  const remove = useCallback((productId, variantId = null) => {
    setItems((curr) => curr.filter((i) => !(i.product_id === productId && (i.variant_id || null) === (variantId || null))));
  }, []);

  const setQty = useCallback((productId, variantId, qty) => {
    setItems((curr) => curr.map((i) => (i.product_id === productId && (i.variant_id || null) === (variantId || null) ? { ...i, qty: Math.max(1, qty) } : i)));
  }, []);

  // Vider le panier : ou terminer une commande, qui appelle ceci : doit aussi
  // emporter la sauvegarde. Sans cela, l'article revenait APRÈS le paiement :
  // le panier repartait vide, puis le rechargement suivant le remplissait de
  // nouveau avec l'ancien contenu.
  const clear = useCallback(() => {
    setItems([]);
    const email = courrielConnu.current;
    if (!email) return;
    const byUser = loadSavedByUser();
    if (email in byUser) {
      delete byUser[email];
      saveSavedByUser(byUser);
    }
  }, []);

  // E2E PA-019 : le panier gardait des prix vieillis dans localStorage, et le
  // resume affichait un montant que le serveur ne facturerait pas. Le checkout
  // rappelle les prix reels et les injecte ici, article par article.
  const syncPrices = useCallback((frais) => {
    if (!Array.isArray(frais) || frais.length === 0) return;
    setItems((curr) => curr.map((it) => {
      const m = frais.find((f) =>
        f.product_id === it.product_id
        && String(f.variant_id || "") === String(it.variant_id || ""));
      if (!m || m.found === false) return it;
      // Le SKU suit le prix : une ligne ajoutee avant le correctif du SKU
      // se repare d'elle-meme a la premiere revalidation.
      //
      // Le drapeau de precommande suit AUSSI, quand le serveur le donne. Le
      // stock a pu bouger depuis l'ajout : un article precommande peut etre
      // arrive, et un article disponible peut s'etre epuise. La reponse du
      // serveur fait foi ; en son absence on garde ce qu'on avait, plutot que
      // d'effacer une information juste.
      return { ...it, price_cad: m.price_cad,
               variant_sku: it.variant_sku || m.variant_sku || "",
               preorder: typeof m.preorder === "boolean" ? m.preorder : it.preorder };
    }));
  }, []);

  // LE PANIER SE RELIT AUPRES DU SERVEUR (rapport E2E PA-019).
  //
  // Les prix vivaient dans localStorage : un prix vieilli — ou modifie a la
  // main — s'affichait jusqu'au paiement, alors que le serveur facturait le
  // vrai. Le serveur refusait la fraude, mais l'ecran mentait. A chaque
  // ouverture du panier, on redemande les valeurs qui font foi.
  const revaliderPanier = useCallback(async () => {
    const lignes = itemsRef.current;
    if (!Array.isArray(lignes) || lignes.length === 0) return;
    try {
      const { data } = await api.post("/cart/revalidate", {
        // La quantite part avec la ligne : c'est elle qui decide si la
        // demande depasse le stock, donc s'il s'agit d'une precommande.
        items: lignes.map((i) => ({ product_id: i.product_id,
                                    variant_id: i.variant_id || null,
                                    qty: Number(i.qty) || 1 })),
      });
      syncPrices(data?.items || []);
    } catch {
      // Une panne reseau ne doit pas vider le panier : on garde l'affichage
      // en place, le serveur reste de toute facon la source de verite au
      // moment de payer.
    }
  }, [syncPrices]);

  useEffect(() => {
    if (open) revaliderPanier();
  }, [open, revaliderPanier]);

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.price_cad * i.qty, 0),
    [items]
  );

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);

  const value = useMemo(
    () => ({ items, add, remove, setQty, clear, subtotal, count, open, setOpen,
             syncPrices, revaliderPanier }),
    [items, add, remove, setQty, clear, subtotal, count, open, syncPrices, revaliderPanier]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
