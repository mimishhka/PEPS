// Share the displayed one-unit price between product cards and catalog sorting.
export function getVariantPricing(variant, quantity = 1) {
  const isPreorder = !!(variant.preorder_enabled && (variant.badge_coa_pending || variant.badge_coming_soon || (variant.stock ?? 0) < quantity));
  const hasSale = !!(variant.sale_price && variant.sale_price < variant.price);
  const price = Number(isPreorder && variant.preorder_price ? variant.preorder_price : hasSale ? variant.sale_price : variant.price) || 0;
  return { price, originalPrice: price < variant.price ? Number(variant.price) : null, isPreorder, isSale: hasSale && !isPreorder };
}
export function getProductPricing(product) {
  const variants = product.variants || [];
  if (!variants.length) return { variant: null, price: Number(product.price_cad) || 0, originalPrice: null, isPreorder: false, isSale: false };
  return variants.map((variant) => ({ variant, ...getVariantPricing(variant) }))
    .reduce((lowest, offer) => offer.price < lowest.price ? offer : lowest);
}
export function canOrderVariant(product, variant) {
  if (!variant) return Number(product.stock) > 0;
  if (variant.preorder_enabled) return true;
  return Number(variant.stock) > 0 && !variant.badge_coming_soon;
}
