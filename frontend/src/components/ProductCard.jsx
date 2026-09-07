import { Link } from "react-router-dom";
import { ArrowUpRight, Plus } from "lucide-react";
import { useLang } from "../contexts/LanguageContext";
import { useCart } from "../contexts/CartContext";
import { getProductPricing, canOrderVariant } from "../lib/productPricing";
import ProductImage from "./ProductImage";

export default function ProductCard({ product }) {
  const { lang } = useLang();
  const { add } = useCart();
  const fr = lang === "fr";
  const name = (fr ? product.name_fr : product.name_en) || product.name_en || product.name_fr || product.slug;
  const variants = product.variants || [];
  const offer = getProductPricing(product);
  const hasOptions = variants.length > 1;
  const canOrder = canOrderVariant(product, offer.variant);
  const anyAvailable = variants.length ? variants.some((v) => canOrderVariant(product, v)) : canOrder;
  const stock = offer.variant?.stock ?? product.stock ?? 0;
  const href = "/product/" + product.slug;
  const status = !anyAvailable ? (fr ? "Indisponible" : "Unavailable")
    : offer.isPreorder ? (fr ? "Précommande" : "Pre-order")
    : stock > 0 ? (fr ? "En stock" : "In stock") : (fr ? "Voir les options" : "See options");
  return <article className="fn-product-card" data-testid={"product-card-" + product.slug}>
    <Link to={href} className="fn-product-image" data-testid={"product-image-" + product.slug} aria-label={name}>
      <ProductImage src={product.image_url} slug={product.slug} alt={name} width={800} height={600} loading="lazy" className="w-full h-full" imgClassName="w-full h-full object-cover" />
      <span className="fn-product-arrow" aria-hidden="true"><ArrowUpRight size={19} /></span>
      {(offer.isSale || offer.isPreorder) && <span className="fn-product-badge" data-testid={(offer.isPreorder ? "preorder-badge-" : "sale-badge-") + product.slug}>{offer.isPreorder ? (fr ? "PRÉCOMMANDE" : "PRE-ORDER") : (fr ? "PROMO" : "SALE")}</span>}
    </Link>
    <div className="fn-product-info">
      <p className="fn-product-ruo">{fr ? "USAGE RECHERCHE UNIQUEMENT" : "FOR RESEARCH USE ONLY"}</p>
      <Link to={href} className="fn-product-name" data-testid={"product-name-" + product.slug}>{name}</Link>
      <p className="fn-product-spec">{[product.dosage_mg ? product.dosage_mg + " mg" : null, fr ? "Lyophilisé" : "Lyophilized"].filter(Boolean).join(" · ")}</p>
      <div className="fn-product-price-row"><div className="fn-product-price">
        {hasOptions && <span className="fn-price-from">{fr ? "Dès" : "From"}</span>}
        {offer.originalPrice && <del data-testid={"card-original-price-" + product.slug}>${offer.originalPrice.toFixed(2)}</del>}
        <strong data-testid={"card-price-" + product.slug}>${offer.price.toFixed(2)}</strong><span>CAD</span>
      </div><span className={"fn-product-stock" + (anyAvailable ? " is-available" : "")} data-testid={"card-stock-" + product.slug}>{status}</span></div>
    </div>
    {hasOptions || !canOrder ? <Link to={href} className="fn-product-cta" data-testid={"product-options-" + product.slug}>{hasOptions ? (fr ? "Choisir les options" : "Choose options") : (fr ? "Voir le composé" : "View compound")}<ArrowRightIcon /></Link>
      : <button type="button" onClick={() => add(product, 1, offer.variant)} className="fn-product-cta" data-testid={"add-to-cart-" + product.slug}>{fr ? "Ajouter à la commande" : "Add to order"}<Plus size={17} aria-hidden="true" /></button>}
  </article>;
}
function ArrowRightIcon() { return <ArrowUpRight size={17} aria-hidden="true" />; }
