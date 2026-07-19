import { Link } from "react-router-dom";
import { useLang } from "@/lib/i18n";
import { useCart, fmtCAD } from "@/lib/cart";
import { VialArt } from "./brand";

/* ============================================================================
 * ProductCard — FIRONOVA
 * Expects a `p` (product) shaped like:
 *   {
 *     id, slug, sku, nameEn, nameFr, dosage, form, hue, status, stock, priceCents,
 *     variants: [{ id, name, sku, priceCents, effectivePriceCents, onSale }]
 *   }
 * `status` is "active" | "preorder" | "archived". Map your REST payload to this
 * shape at the fetch boundary so the component stays presentation-only.
 * ==========================================================================*/

export function firstVariant(p) {
  return p.variants?.[0];
}

export function stockState(p) {
  if (p.status === "preorder") return "preorder";
  if (p.stock <= 0) return "out";
  if (p.stock < 10) return "low";
  return "in";
}

export default function ProductCard({ p }) {
  const { lang, t } = useLang();
  const { add } = useCart();
  const st = stockState(p);
  const canBuy = st === "in" || st === "low" || st === "preorder";
  const v = firstVariant(p);
  const price = v?.effectivePriceCents ?? p.priceCents;
  const was = v?.onSale ? v.priceCents : null;
  const multi = (p.variants?.length ?? 0) > 1;

  const dotClass =
    st === "in" ? "bg-success" : st === "low" ? "bg-warning" : st === "preorder" ? "bg-compliance" : "bg-error";
  const textClass =
    st === "in" ? "text-success" : st === "low" ? "text-warning" : st === "preorder" ? "text-compliance" : "text-error";

  return (
    <div
      data-testid={`product-card-${p.slug}`}
      className="group bg-white border border-ash rounded-2xl overflow-hidden card-hover flex flex-col"
    >
      <Link to={`/product/${p.slug}`} aria-label={lang === "fr" ? p.nameFr : p.nameEn}>
        <VialArt hue={p.hue} className="h-48" />
      </Link>

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-compliance">
            {t("card.ruo")}
          </span>
          {v?.onSale && (
            <span className="rounded-full bg-nova/10 text-nova text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
              {t("card.sale")}
            </span>
          )}
          {st === "preorder" && (
            <span className="rounded-full bg-compliance/10 text-compliance text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
              {t("card.preorder")}
            </span>
          )}
        </div>

        <Link to={`/product/${p.slug}`} className="hover:text-nova transition-colors">
          <h4 className="font-display text-xl font-semibold text-nordfjord">
            {lang === "fr" ? p.nameFr : p.nameEn}
          </h4>
        </Link>

        <div className="text-[13px] text-glacier mt-1 mb-4">
          {v?.name}
          {multi ? ` · +${p.variants.length - 1}` : ""} · {p.form} · {t("card.coa")}
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline gap-2.5 mb-4">
            <span className="font-display text-[22px] font-bold text-nordfjord">{fmtCAD(price)}</span>
            {was && <span className="font-data text-sm text-glacier line-through">{fmtCAD(was)}</span>}
            {multi && <span className="font-data text-[11px] text-glacier">{t("card.from")}</span>}
            <span className={`ml-auto text-xs font-semibold inline-flex items-center gap-1.5 ${textClass}`}>
              <span className={`w-[7px] h-[7px] rounded-full ${dotClass}`} />
              {st === "in"
                ? t("card.instock")
                : st === "low"
                ? t("card.low")
                : st === "preorder"
                ? t("card.preorder")
                : t("card.out")}
            </span>
          </div>

          <button
            data-testid={`add-to-cart-${p.slug}`}
            disabled={!canBuy}
            onClick={() =>
              add({
                productId: p.id,
                variantId: v?.id,
                sku: v?.sku ?? p.sku,
                slug: p.slug,
                nameEn: p.nameEn,
                nameFr: p.nameFr,
                dosage: v?.name ?? p.dosage,
                priceCents: price,
                hue: p.hue,
              })
            }
            className="btn-pill btn-nova w-full !py-3 disabled:opacity-40 disabled:pointer-events-none"
          >
            {t("card.add")}
          </button>

          <Link
            to={`/product/${p.slug}`}
            className="btn-pill btn-outline w-full !py-3 !px-3 mt-2.5 whitespace-nowrap !text-[12px]"
          >
            {t("card.docs")}
          </Link>
        </div>
      </div>
    </div>
  );
}
