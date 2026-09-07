import { getVariantPricing, getProductPricing, canOrderVariant } from "./productPricing";

describe("storefront pricing", () => {
  const regular = { id: "5mg", name: "5 mg", price: 80, stock: 5 };
  it("uses the sale price for in-stock stock", () => {
    expect(getVariantPricing({ ...regular, sale_price: 65 })).toMatchObject({ price: 65, originalPrice: 80, isPreorder: false, isSale: true });
  });
  it("prioritizes preorder pricing when stock runs out", () => {
    expect(getVariantPricing({ ...regular, stock: 0, sale_price: 65, preorder_enabled: true, preorder_price: 50 })).toMatchObject({ price: 50, isPreorder: true, isSale: false });
  });
  it("uses preorder pricing for pending documentation even with stock", () => {
    expect(getVariantPricing({ ...regular, badge_coa_pending: true, preorder_enabled: true, preorder_price: 60 }).price).toBe(60);
  });
  it("falls back to sale pricing when a preorder price is unset", () => {
    expect(getVariantPricing({ ...regular, stock: 0, sale_price: 65, preorder_enabled: true }).price).toBe(65);
  });
  it("uses the lowest effective variant price instead of the first or base price", () => {
    const product = { price_cad: 1, variants: [regular, { id: "10mg", price: 100, stock: 4, sale_price: 55 }] };
    expect(getProductPricing(product)).toMatchObject({ variant: { id: "10mg" }, price: 55, originalPrice: 100 });
  });
  it("falls back to base price on products without variants", () => {
    expect(getProductPricing({ price_cad: 42 })).toMatchObject({ variant: null, price: 42 });
  });
  it("prevents quick add for sold-out and coming-soon stock", () => {
    expect(canOrderVariant({}, { ...regular, stock: 0 })).toBe(false);
    expect(canOrderVariant({}, { ...regular, badge_coming_soon: true })).toBe(false);
    expect(canOrderVariant({ stock: 0 }, null)).toBe(false);
  });
  it("permits explicitly enabled preorders and stocked products", () => {
    expect(canOrderVariant({}, { ...regular, stock: 0, preorder_enabled: true })).toBe(true);
    expect(canOrderVariant({}, regular)).toBe(true);
    expect(canOrderVariant({}, { ...regular, badge_coa_pending: true })).toBe(true);
    expect(canOrderVariant({ stock: 2 }, null)).toBe(true);
  });
});
