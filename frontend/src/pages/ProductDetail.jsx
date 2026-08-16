import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, Minus, BellRing, Check, FileText, Share2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError, resolveAssetUrl } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import useAffiliate from "../hooks/useAffiliate";
import { useCart } from "../contexts/CartContext";
import { VialArt, Seal } from "../components/brand";
import ProductImage from "../components/ProductImage";
import { ProductDetailSkeleton } from "../components/LoadingSkeletons";

function hueFor(slug = "") {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return 190 + (h % 40);
}

export default function ProductDetail() {
  const { slug } = useParams();
  const { lang, t } = useLang();
  const { add } = useCart();
  const { affiliate } = useAffiliate();

  const copyAffiliateLink = async () => {
    if (!affiliate?.code || !product?.slug) return;
    const url = `${window.location.origin}/product/${product.slug}?ref=${affiliate.code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(lang === "fr" ? "Lien affilié copié" : "Affiliate link copied", { description: url });
    } catch {
      toast.error(lang === "fr" ? "Impossible de copier" : "Copy failed");
    }
  };
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySubmitting, setNotifySubmitting] = useState(false);
  const [notifyDone, setNotifyDone] = useState(false);

  const _ogImage = product
    ? (product.og_image_url || product.image_url || "")
    : "";
  const _jsonLd = product ? (() => {
    const prices = (product.variants || []).map((v) => Number(v.price)).filter(Boolean);
    const low = prices.length ? Math.min(...prices) : Number(product.price_cad || 0);
    const inStock = (product.variants || []).some((v) => Number(v.stock) > 0) || Number(product.stock) > 0;
    const ld = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name_en || product.slug,
      description: (product.description_en || "").slice(0, 300),
      sku: product.slug,
      brand: { "@type": "Brand", name: "Fironova" },
      category: product.category || "",
    };
    if (_ogImage) ld.image = _ogImage;
    if (low > 0) ld.offers = {
      "@type": "Offer", priceCurrency: "CAD", price: Number(low.toFixed(2)),
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `https://fironova.com/product/${slug}`,
    };
    return ld;
  })() : null;

  useDocumentHead({
    title: product ? (lang === "fr" ? product.name_fr : product.name_en) : "Product",
    description: product ? ((lang === "fr" ? product.meta_description_fr || product.description_fr : product.meta_description_en || product.description_en) || "").slice(0, 155) : undefined,
    path: `/product/${slug}`,
    image: _ogImage || undefined,
    jsonLd: _jsonLd || undefined,
  });

  useEffect(() => {
    setLoading(true);
    api.get(`/products/${slug}`)
      .then((r) => {
        setProduct(r.data);
        const firstAvailable = (r.data.variants || []).find((v) => !v.badge_coming_soon || v.preorder_enabled) || r.data.variants?.[0];
        setVariantId(firstAvailable?.id || null);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    setRelated([]);
    api.get(`/products/${slug}/related?limit=4`).then((r) => setRelated(r.data || [])).catch(() => {});
  }, [slug]);

  useEffect(() => { setNotifyDone(false); setNotifyEmail(""); }, [variantId, slug]);

  if (loading) {
    return <ProductDetailSkeleton />;
  }
  if (!product) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6" data-testid="product-not-found">
        <div className="text-center">
          <p className="font-display text-2xl font-semibold text-nordfjord mb-2">
            {lang === "fr" ? "Produit introuvable" : "Product not found"}
          </p>
          <p className="text-glacier text-sm mb-6">
            {lang === "fr"
              ? "Ce composé n'existe plus ou l'adresse est incorrecte."
              : "This compound no longer exists or the address is incorrect."}
          </p>
          <Link to="/catalog" className="btn-pill btn-nova">
            {lang === "fr" ? "Retour au catalogue" : "Back to catalog"}
          </Link>
        </div>
      </div>
    );
  }

  const name = lang === "fr" ? product.name_fr : product.name_en;
  const desc = lang === "fr" ? product.description_fr : product.description_en;
  const variants = product.variants || [];
  const selectedVariant = variants.find((v) => v.id === variantId) || variants[0] || null;
  const coaComing = !!(selectedVariant && (selectedVariant.badge_coa_pending || selectedVariant.badge_coming_soon));
  const isVariantPreorder = !!(selectedVariant && selectedVariant.preorder_enabled && (coaComing || selectedVariant.stock < qty));
  const hasSale = !!(selectedVariant && selectedVariant.sale_price && selectedVariant.sale_price < selectedVariant.price);
  const effectivePrice = selectedVariant
    ? (isVariantPreorder && selectedVariant.preorder_price ? selectedVariant.preorder_price : hasSale ? selectedVariant.sale_price : selectedVariant.price)
    : product.price_cad;
  const showOriginal = !!(selectedVariant && effectivePrice < selectedVariant.price);
  const isComingSoon = !!(selectedVariant && selectedVariant.badge_coming_soon && !selectedVariant.preorder_enabled);
  const isOutOfStock = !!(selectedVariant && selectedVariant.stock <= 0 && !selectedVariant.preorder_enabled && !coaComing);
  const stockN = selectedVariant?.stock ?? product.stock ?? 0;

  const submitNotify = async () => {
    if (!/^\S+@\S+\.\S+$/.test(notifyEmail)) {
      toast.error(lang === "fr" ? "Adresse courriel invalide" : "Invalid email address");
      return;
    }
    setNotifySubmitting(true);
    try {
      await api.post("/notify-stock", {
        email: notifyEmail,
        product_id: product.id,
        variant_id: selectedVariant && selectedVariant.id !== "_default" ? selectedVariant.id : null,
      });
      setNotifyDone(true);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setNotifySubmitting(false);
    }
  };

  // COA strictement au niveau variante — source de vérité unique : coa_status.
  const coaStatus = selectedVariant?.coa_status || "none";
  // Les COA sont stockés en chemin relatif (/uploads/coa/…) : sans resolveAssetUrl
  // le lien viserait l'origine du frontend et renverrait 404 hors reverse proxy.
  const coaUrl = selectedVariant?.coa_url ? resolveAssetUrl(selectedVariant.coa_url) : "";
  const coaAvailable = coaStatus === "available" && !!coaUrl;
  const coaPending = coaStatus === "pending";
  const imageSrc = resolveAssetUrl(product.image_url);

  const specs = [
    { k: lang === "fr" ? "PURETÉ (HPLC)" : "PURITY (HPLC)", v: product.purity },
    { k: lang === "fr" ? "LOT ACTUEL" : "CURRENT LOT", v: selectedVariant?.coa_lot || product.coa_lot || "—" },
    { k: lang === "fr" ? "MASSE MOLAIRE" : "MOLAR MASS", v: product.molecular_weight ? `${product.molecular_weight} g/mol` : "—" },
    { k: "SKU", v: selectedVariant?.sku || product.slug.toUpperCase() },
    { k: lang === "fr" ? "FORME" : "FORM", v: "Lyophilized" },
    { k: "CAS", v: product.cas_number || "—" },
  ];

  return (
    <div data-testid="product-detail-page" className="bg-clinical min-h-screen">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        <Link to="/catalog" data-testid="back-to-catalog" className="inline-flex items-center gap-2 font-data text-[12px] uppercase tracking-[0.16em] text-glacier hover:text-nordfjord transition-colors mb-8">
          ← {lang === "fr" ? "Retour au catalogue" : "Back to catalog"}
        </Link>

        <div className="grid lg:grid-cols-2 gap-12">
          <div className="relative">
            <div className="rounded-2xl overflow-hidden aspect-square relative">
              <ProductImage
                src={product.image_url}
                slug={product.slug}
                alt={name}
                width={1000}
                height={1000}
                loading="eager"
                fetchPriority="high"
                className="w-full h-full"
                imgClassName="w-full h-full object-cover"
              />
              <div className="absolute bottom-5 right-5"><Seal size={92} /></div>
            </div>
            {coaAvailable ? (
              <div data-testid="coa-badge-verified" className="mt-4 inline-flex items-center gap-2 rounded-full border border-ash bg-white px-4 py-2 font-data text-[11px] uppercase tracking-[0.16em] text-nordfjord">
                <FileText size={13} /> {lang === "fr" ? "Certificat d'analyse disponible" : "Certificate of Analysis available"}
              </div>
            ) : coaPending ? (
              <div data-testid="coa-badge-pending" className="mt-4 inline-flex items-center gap-2 rounded-full border border-ash bg-white px-4 py-2 font-data text-[11px] uppercase tracking-[0.16em] text-warning">
                <FileText size={13} /> COA · {lang === "fr" ? "À VENIR" : "PENDING"}
              </div>
            ) : null}
          </div>

          <div>
            <p className="font-data text-[11px] uppercase tracking-[0.22em] text-compliance mb-3">
              {lang === "fr" ? "USAGE RECHERCHE UNIQUEMENT" : "FOR RESEARCH USE ONLY"}
            </p>
            <h1 className="font-display text-[44px] font-bold text-nordfjord leading-none mb-5" data-testid="product-name">{name}</h1>
            <p className="text-base leading-relaxed text-glacier mb-7">{desc}</p>

            {variants.length > 1 && (
              <div data-testid="variant-selector" className="mb-6">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">{lang === "fr" ? "DOSAGE" : "DOSAGE"}</div>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isActive = v.id === variantId;
                    const vCoaComing = v.badge_coa_pending || v.badge_coming_soon;
                    const vPre = v.preorder_enabled && (vCoaComing || v.stock < qty);
                    const vSale = v.sale_price && v.sale_price < v.price;
                    const vPrice = vPre && v.preorder_price ? v.preorder_price : vSale ? v.sale_price : v.price;
                    const outNoPre = v.stock <= 0 && !v.preorder_enabled && !v.badge_coming_soon;
                    return (
                      <button key={v.id} type="button" onClick={() => setVariantId(v.id)}
                        disabled={(v.badge_coming_soon && !v.preorder_enabled) || outNoPre}
                        data-testid={`variant-${v.name}`}
                        className={`rounded-xl border-[1.5px] px-4 py-2.5 text-left transition-colors ${isActive ? "border-nova bg-nova/5" : "border-ash hover:border-nova"} disabled:opacity-40 disabled:cursor-not-allowed`}>
                        <span className="font-display font-bold text-nordfjord">{v.name}</span>
                        <span className="font-data text-[11px] text-glacier ml-2">${vPrice?.toFixed(2)}</span>
                        {v.coa_status === "pending" && (
                          <span className="block font-data text-[9px] uppercase tracking-[0.14em] text-warning mt-0.5">{lang === "fr" ? "COA à venir" : "COA pending"}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {product.sequence && (
              <div className="rounded-xl border border-ash bg-white px-5 py-4 mb-4">
                <div className="font-data text-[10px] uppercase tracking-[0.2em] text-compliance mb-1.5">{lang === "fr" ? "SÉQUENCE" : "SEQUENCE"}</div>
                <div className="font-data text-sm text-nordfjord break-all">{product.sequence}</div>
              </div>
            )}

            <div className="rounded-xl border border-ash bg-white overflow-hidden grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-ash mb-8">
              {specs.map((s) => (
                <div key={s.k} className="p-4">
                  <div className="font-data text-[10px] uppercase tracking-[0.16em] text-compliance mb-1">{s.k}</div>
                  <div className="font-data text-sm text-nordfjord break-all">{s.v}</div>
                </div>
              ))}
            </div>

            <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
              <div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  {showOriginal && (
                    <span className="font-display text-2xl font-bold line-through text-glacier" data-testid="product-original-price">
                      ${selectedVariant.price.toFixed(2)}
                    </span>
                  )}
                  <span className={`font-display text-[40px] font-bold leading-none ${showOriginal ? "text-nova" : "text-nordfjord"}`} data-testid="product-price">
                    ${effectivePrice.toFixed(2)}
                  </span>
                  <span className="font-data text-sm text-glacier">CAD</span>
                </div>
                {isVariantPreorder && selectedVariant.preorder_note && (
                  <div className="font-data text-[11px] text-warning mt-1" data-testid="preorder-note">{selectedVariant.preorder_note}</div>
                )}
              </div>
              <span className={`font-data text-[12px] uppercase tracking-[0.14em] flex items-center gap-2 ${stockN > 0 ? "text-success" : "text-warning"}`}>
                <span className={`w-2 h-2 rounded-full ${stockN > 0 ? "bg-success" : "bg-warning"}`} />
                {isComingSoon ? (lang === "fr" ? "À venir" : "Coming soon")
                  : isVariantPreorder ? (lang === "fr" ? "Précommande" : "Pre-order")
                  : stockN > 0 ? (lang === "fr" ? "En stock" : "In stock")
                  : (lang === "fr" ? "Rupture" : "Out of stock")}
              </span>
            </div>

            <div className="flex items-stretch gap-3 mb-4">
              <div className="flex items-center gap-1 rounded-full border border-ash bg-white px-2">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center text-nordfjord hover:text-nova" data-testid="product-qty-dec"><Minus size={15} /></button>
                <span className="font-data font-semibold w-8 text-center text-nordfjord" data-testid="product-qty">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} className="w-9 h-9 flex items-center justify-center text-nordfjord hover:text-nova" data-testid="product-qty-inc"><Plus size={15} /></button>
              </div>
              <button
                onClick={() => add(product, qty, selectedVariant)}
                data-testid="product-add-to-cart"
                disabled={isOutOfStock || isComingSoon}
                className="flex-1 btn-pill btn-nova disabled:opacity-40 disabled:pointer-events-none"
              >
                {isComingSoon ? (lang === "fr" ? "À VENIR" : "COMING SOON")
                  : isVariantPreorder ? `${lang === "fr" ? "PRÉCOMMANDE" : "PRE-ORDER"} · $${(effectivePrice * qty).toFixed(2)}`
                  : isOutOfStock ? (lang === "fr" ? "RUPTURE" : "OUT OF STOCK")
                  : `${lang === "fr" ? "Ajouter à la commande" : "Add to order"} · $${(effectivePrice * qty).toFixed(2)}`}
              </button>
            </div>

            <div className="rounded-xl bg-nordfjord text-clinical px-5 py-4 font-data text-[11px] uppercase tracking-[0.16em] leading-relaxed" data-testid="research-only-banner">
              {lang === "fr" ? "USAGE RECHERCHE UNIQUEMENT — NON DESTINÉ À LA CONSOMMATION HUMAINE" : "FOR RESEARCH USE ONLY — NOT INTENDED FOR HUMAN CONSUMPTION"}
            </div>

            {affiliate?.code && (
              <button
                onClick={copyAffiliateLink}
                data-testid="copy-affiliate-link"
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-nova bg-nova/5 hover:bg-nova/10 px-4 py-3 font-data text-[11px] uppercase tracking-[0.18em] text-nova transition-colors"
                title={lang === "fr"
                  ? `Copie l'URL avec votre code ${affiliate.code}`
                  : `Copies the URL with your code ${affiliate.code}`}
              >
                <Share2 size={14} strokeWidth={2} />
                {lang === "fr" ? "Copier mon lien affilié" : "Copy my affiliate link"}
                <span className="font-mono text-[10px] text-nova/70 ml-1">?ref={affiliate.code}</span>
              </button>
            )}

            {coaPending && (
              <div data-testid="coa-pending-warning" className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
                <FileText size={15} className="text-warning mt-0.5 shrink-0" />
                <p className="font-data text-[11px] uppercase tracking-[0.14em] text-nordfjord leading-relaxed">
                  {lang === "fr"
                    ? "Le certificat d'analyse de ce lot est à venir. Vous pouvez commander dès maintenant — le COA sera publié dès sa réception."
                    : "The certificate of analysis for this lot is coming. You can order now — the COA will be published as soon as it's received."}
                </p>
              </div>
            )}

            {coaAvailable && (
              <a href={coaUrl} target="_blank" rel="noopener noreferrer" data-testid="download-coa"
                className="mt-4 flex items-center justify-center gap-2 btn-pill btn-outline w-full">
                <FileText size={14} /> {t("product.labReport")} ↓
              </a>
            )}

            {isOutOfStock && (
              <div className="mt-6 rounded-xl border border-ash bg-white p-4" data-testid="notify-stock-block">
                {notifyDone ? (
                  <div className="flex items-center gap-2 font-data text-xs uppercase tracking-[0.16em] text-success">
                    <Check size={14} /> {lang === "fr" ? "Nous vous écrirons dès le retour en stock." : "We'll email you when it's back."}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 font-data text-xs uppercase tracking-[0.16em] text-nordfjord mb-2">
                      <BellRing size={14} /> {lang === "fr" ? "M'avertir du retour en stock" : "Notify me when back in stock"}
                    </div>
                    <div className="flex gap-2">
                      <input type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)}
                        placeholder={lang === "fr" ? "votre@courriel.com" : "you@email.com"}
                        data-testid="notify-stock-email"
                        className="flex-1 rounded-full border border-ash px-4 py-2 text-sm bg-white outline-none focus:border-nova" />
                      <button onClick={submitNotify} disabled={notifySubmitting} data-testid="notify-stock-submit"
                        className="btn-pill btn-outline disabled:opacity-40">
                        {notifySubmitting ? "…" : lang === "fr" ? "M'avertir" : "Notify me"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-16 border-t border-ash pt-10" data-testid="related-products">
            <h2 className="font-display text-xl font-extrabold text-nordfjord tracking-tight mb-6">
              {lang === "fr" ? "Souvent recherché avec" : "Often researched with"}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {related.map((p) => {
                const rvars = p.variants || [];
                const rprice = rvars.map((v) => Number(v.sale_price || v.price)).filter(Boolean).sort((a, b) => a - b)[0];
                const rstock = rvars.some((v) => Number(v.stock) > 0) || Number(p.stock) > 0;
                return (
                  <Link key={p.id} to={`/product/${p.slug}`} data-testid="related-card"
                    className="group rounded-2xl border border-ash bg-white p-4 hover:border-nova transition">
                    <div className="aspect-square rounded-xl mb-3 flex items-center justify-center overflow-hidden"
                      style={{ background: `hsl(${hueFor(p.slug)} 70% 96%)` }}>
                      <ProductImage
                        src={p.image_url}
                        slug={p.slug}
                        alt=""
                        width={480}
                        height={480}
                        loading="lazy"
                        className="w-full h-full"
                        imgClassName="w-full h-full object-cover"
                      />
                    </div>
                    <div className="font-display font-bold text-sm text-nordfjord leading-tight group-hover:text-nova transition">
                      {lang === "fr" ? p.name_fr : p.name_en}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-data text-[13px] text-nordfjord">
                        {rprice ? `$${rprice.toFixed(2)}` : "—"}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${rstock ? "bg-success" : "bg-warning"}`} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
