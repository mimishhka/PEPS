import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";
import ProductImage from "./ProductImage";
import { prix } from "../lib/prix";
import { useConfirm } from "./ConfirmDialog";

export default function ProductCard({ product, index = 0 }) {
  const { lang } = useLang();
  const { add } = useCart();
  const confirm = useConfirm();
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

  /* UNE PRECOMMANDE NE S'AJOUTE PAS EN SILENCE.
   *
   * MIREILLE, 30/09/2026 : « je constate que lors de l'ajout d'un produit en
   * precommande il n'y a pas de notification pour le client ».
   *
   * La fiche produit ouvrait bien une confirmation ; cette carte, non. Elle
   * appelait `add()` directement, sous un bouton qui disait « Ajouter a la
   * commande » exactement comme pour un article en stock. Le client repartait
   * avec une precommande au panier sans l'avoir su, et rien ne le lui disait
   * ensuite — ni le panier, ni la caisse, ni le courriel.
   *
   * On reprend la meme confirmation que la fiche produit, avec le delai
   * annonce. La pastille « Precommande » de la carte ne suffisait pas : elle
   * informe celui qui la cherche, pas celui qui clique.
   *
   * Le test porte sur `cheapest` et non sur `anyPreorder` : c'est CETTE
   * variante que le bouton ajoute. Une fiche dont une variante est en stock et
   * une autre en precommande annoncerait « En stock » tout en ajoutant la
   * precommande.
   */
  const ajoutEstUnePrecommande = !!cheapest?.isPre;

  const ajouter = async () => {
    if (!ajoutEstUnePrecommande) {
      add(product, 1, cheapest);
      return;
    }
    const delai = cheapest?.preorder_delay_message
      ? ` ${lang === "fr" ? "Délai annoncé" : "Announced delay"} : ${cheapest.preorder_delay_message}.`
      : "";
    if (await confirm({
      title: lang === "fr" ? "Précommander ce produit ?" : "Pre-order this product?",
      description: lang === "fr"
        ? `Ce produit n'est pas en stock : il partira à l'arrivée du prochain lot.${delai} Si votre commande contient aussi des articles disponibles, ceux-ci vous seront expédiés tout de suite, sans frais de livraison supplémentaires.`
        : `This product is out of stock : it ships when the next batch arrives.${delai} If your order also contains available items, those ship right away, at no extra shipping cost.`,
      confirmLabel: lang === "fr" ? "Précommander" : "Pre-order",
    })) {
      add(product, 1, cheapest);
    }
  };

  const stockN = cheapest ? (cheapest.stock ?? 0) : (product.stock ?? 0);
  const inStock = stockN > 0;
  // E2E CA-007 : le bouton restait actif quand tout est a zero sans
  // precommande. Il ne s'ouvre que s'il reste du stock quelque part, ou
  // qu'une precommande prend le relais.
  const unStock = priced.some((v) => Number(v.stock) > 0);
  const achetable = unStock || anyPreorder;
  // E2E CA-008 : aucun indicateur de stock bas. Le seuil vient de la fiche
  // (ou 10 par defaut), et le libelle devient « Stock bas · N ».
  const seuilStock = Number(product.low_stock_threshold ?? 10);
  const stockBas = inStock && stockN <= seuilStock;

  const specLine = [
    product.dosage_mg ? `${product.dosage_mg} mg` : null,
    lang === "fr" ? "Lyophilisé" : "Lyophilized",
  ].filter(Boolean).join(" · ");

  return (
    <div
      className="group flex flex-col card-hover" data-testid-carte=""
      data-testid={`product-card-${product.slug}`}
    >
      <Link to={`/product/${product.slug}`} className="block relative aspect-square overflow-hidden bg-white" style={{ borderRadius: "var(--r-m)" }}>
        <ProductImage
          src={product.image_url}
          slug={product.slug}
          alt={name}
          width={800}
          height={600}
          loading="lazy"
          className="w-full h-full"
          imgClassName="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </Link>

      <div className="pt-3 px-0.5 flex flex-col gap-1 sm:gap-1.5 flex-1">
        <div className="font-data text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.2em] text-compliance">
          {lang === "fr" ? "USAGE RECHERCHE UNIQUEMENT" : "FOR RESEARCH USE ONLY"}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/product/${product.slug}`} className="font-display text-[13.5px] font-medium text-nordfjord hover:text-nova-texte transition-colors leading-snug">
            {name}
          </Link>
          {anySale && (
            <span className="font-data text-[9.5px] font-semibold uppercase tracking-[0.14em] border border-nova text-nova-texte px-1.5 py-0.5" style={{ borderRadius: "var(--r-s)" }} data-testid={`sale-badge-${product.slug}`}>
              {lang === "fr" ? "PROMO" : "SALE"}
            </span>
          )}
          {anyPreorder && (
            /* DEBORDEMENT A 360 px (rapport E2E NF-001) : « PRÉCOMMANDE » en
               chasse large ne peut pas se couper, et poussait la grille a
               408 px. La chasse se resserre sur mobile et le mot peut passer
               a la ligne plutot que d'elargir la carte. */
            <span className="font-data text-[9.5px] font-semibold uppercase tracking-[0.06em] sm:tracking-[0.14em] border border-nova text-nova-texte px-1.5 py-0.5 break-words min-w-0" style={{ borderRadius: "var(--r-s)" }} data-testid={`preorder-badge-${product.slug}`}>
              {lang === "fr" ? "PRÉCOMMANDE" : "PRE-ORDER"}
            </span>
          )}
        </div>
        <div className="font-data text-[11px] text-glacier">{specLine}</div>

        <div className="flex items-center justify-between pt-3 mt-auto">
          <div className="flex items-baseline gap-2">
            {displayOriginal && (
              <span className="font-data text-sm line-through text-glacier" data-testid={`card-original-price-${product.slug}`}>
                {prix(displayOriginal, lang)}
              </span>
            )}
            <span className={`font-data text-[13.5px] font-medium tabular-nums ${displayOriginal ? "text-nova-texte" : "text-nordfjord"}`} data-testid={`card-price-${product.slug}`}>
              {prix(displayPrice ?? 0, lang)}
            </span>
            {variants.length > 1 && (
              <span className="font-data text-[10px] uppercase tracking-[0.16em] text-glacier">{lang === "fr" ? "dès" : "from"}</span>
            )}
          </div>
          <span className={`font-data text-[11px] uppercase tracking-[0.14em] flex items-center gap-1.5 ${inStock && !stockBas ? "text-success" : "text-warning"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${inStock && !stockBas ? "bg-success" : "bg-warning"}`} />
            {anyPreorder && !inStock ? (lang === "fr" ? "Précommande" : "Pre-order")
              : inStock ? (stockBas ? `${lang === "fr" ? "Stock bas" : "Low stock"} · ${stockN}` : (lang === "fr" ? "En stock" : "In stock"))
              : (lang === "fr" ? "Rupture" : "Out")}
          </span>
        </div>
      </div>

      <div className="pt-3 px-0.5">
        <button
          data-testid={`add-to-cart-${product.slug}`}
          onClick={ajouter}
          disabled={!achetable}
          className={`w-full btn-pill btn-nova !py-1.5 !text-[11px] !tracking-[0.06em] ${!achetable ? "opacity-45 cursor-not-allowed" : ""}`}
        >
          {!achetable
            ? (lang === "fr" ? "Rupture" : "Out of stock")
            : ajoutEstUnePrecommande
              // Le bouton dit ce qu'il fait. « Ajouter a la commande » sur une
              // precommande laissait croire a une expedition immediate.
              ? (lang === "fr" ? "Précommander" : "Pre-order")
              : (lang === "fr" ? "Ajouter à la commande" : "Add to order")}
        </button>
      </div>
    </div>
  );
}
