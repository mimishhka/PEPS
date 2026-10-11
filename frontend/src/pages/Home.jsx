import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, RotateCw } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import ProductCard from "../components/ProductCard.jsx";
import ProductImage from "../components/ProductImage";
import { TAILLES } from "../lib/derivees";

export default function Home() {
  const { t, lang } = useLang();
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);
  const [reloadFeatured, setReloadFeatured] = useState(0);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    setProductsLoading(true);
    setProductsError(false);
    api.get("/products", { params: { featured: true } })
      .then((r) => {
        if (!active) return;
        if (!Array.isArray(r.data)) throw new Error("Invalid featured products response");
        setProducts(r.data.slice(0, 8));
      })
      .catch(() => { if (active) setProductsError(true); })
      .finally(() => { if (active) setProductsLoading(false); });
    return () => { active = false; };
  }, [reloadFeatured]);

  const subscribe = async (e) => {
    e.preventDefault();
    if (!consent) { toast.error(t("home.newsletterConsentRequired")); return; }
    setSubBusy(true);
    try {
      const { data } = await api.post("/newsletter/subscribe", { email: email.trim(), consent, lang, source: "home" });
      toast.success(data.already_subscribed ? t("home.newsletterAlready") : t("home.newsletterOk"));
      setEmail(""); setConsent(false); setDone(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || t("home.newsletterError"));
    } finally { setSubBusy(false); }
  };

  const trustItems = [t("home.trustTested"), t("home.trustCanada"), t("home.trustPurity"), t("home.trustDiscreet")];
  const heroTitle = lang === "fr" ? { a: "Peptides de précision", b: "pour la recherche." } : { a: "Precision peptides", b: "for research." };
  const heroLede = lang === "fr"
    ? "Testés par HPLC en laboratoire indépendant. Certificat d'analyse fourni pour les lots documentés."
    : "HPLC-tested by an independent lab. Certificate of analysis provided for documented lots.";
  const ctaPrimary = lang === "fr" ? "Voir le catalogue" : "Browse the catalog";
  const ctaSecondary = lang === "fr" ? "Nos standards" : "Our standards";
  const featTitle = lang === "fr" ? "Composés en vedette" : "Featured compounds";
  const featAll = lang === "fr" ? "Voir tout le catalogue" : "View full catalog";
  const newsTitle = lang === "fr" ? "Notes de recherche et nouveautés" : "Research notes & new releases";
  const newsLede = lang === "fr"
    ? "Nouveaux lots, certificats d'analyse et réassorts. Désabonnez-vous à tout moment."
    : "New lots, certificates of analysis, and restocks. Unsubscribe at any time.";
  const newsLabel = lang === "fr" ? "Adresse courriel" : "Email address";
  const newsDone = lang === "fr" ? "Vérifiez votre courriel pour confirmer votre inscription." : "Check your inbox to confirm your subscription.";
  const featuredProduct = products[0];
  const featuredName = featuredProduct
    ? (lang === "fr" ? featuredProduct.name_fr || featuredProduct.name : featuredProduct.name_en || featuredProduct.name)
    : "";

  return (
    <div className="fresh-home" data-testid="home-page">
      <section className="fresh-hero" data-testid="hero-section">
        <div className="fresh-hero__copy">
          <p className="fresh-kicker">FIRONOVA <span>·</span> {lang === "fr" ? "Approvisionnement de recherche" : "Research supply"}</p>
          <h1 className="font-display" data-testid="hero-title"><span>{heroTitle.a}</span><span className="fresh-accent">{heroTitle.b}</span></h1>
          <p className="fresh-hero__lede">{heroLede}</p>
          <div className="fresh-actions">
            <Link to="/catalog" className="fresh-button" data-testid="hero-cta-catalog">{ctaPrimary}<ArrowRight size={17} aria-hidden="true" /></Link>
            <Link to="/about" className="fresh-text-link" data-testid="hero-cta-lab">{ctaSecondary}</Link>
          </div>
          <p className="fresh-hero__note">For research use only · Usage recherche uniquement</p>
        </div>
        <div className="fresh-hero__visual" aria-label={lang === "fr" ? "Produit en vedette" : "Featured product"}>
          {featuredProduct ? (
            <ProductImage src={featuredProduct.image_url} slug={featuredProduct.slug} alt={featuredProduct.name_fr || featuredProduct.name || "FIRONOVA"} className="fresh-hero__image" imgClassName="w-full h-full object-contain" loading="eager" fetchPriority="high" sizes={TAILLES.hero} />
          ) : <div className="fresh-hero__placeholder" aria-hidden="true">F</div>}
          {featuredProduct && <div className="fresh-product-label"><small>{lang === "fr" ? "En vedette" : "Featured"}</small><strong>{featuredName}</strong></div>}
        </div>
      </section>

      <section className="fresh-trust" data-testid="trust-marquee" aria-label={lang === "fr" ? "Nos engagements" : "Our standards"}>
        {trustItems.map((item, index) => <div className="fresh-trust__item" key={index + "-" + item}><Check size={17} strokeWidth={2.4} className="fresh-trust__icon" aria-hidden="true" /><span>{item}</span></div>)}
      </section>

      <section className="fresh-section" data-testid="featured-products">
        <div className="fresh-container">
          <div className="fresh-section__head">
            <div><h2>{featTitle}</h2><p>{lang === "fr" ? "Parcourez les produits actuellement mis en avant." : "Browse the products currently featured."}</p></div>
            <Link to="/catalog" className="btn-pill btn-outline group inline-flex items-center gap-2 px-5 py-3" data-testid="view-all-catalog">{featAll}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="fresh-products">
            {productsLoading ? <div className="fresh-status" role="status" data-testid="featured-loading">{lang === "fr" ? "Chargement des produits…" : "Loading products…"}</div>
              : productsError ? <div className="fresh-status" role="alert" data-testid="featured-error"><p>{lang === "fr" ? "Les produits n'ont pas pu être chargés." : "We couldn't load the products."}</p><button type="button" className="btn-pill btn-outline inline-flex items-center gap-2 px-4 py-2" onClick={() => setReloadFeatured((n) => n + 1)}><RotateCw size={15} aria-hidden="true" />{lang === "fr" ? "Réessayer" : "Try again"}</button></div>
                : products.length ? products.map((product, index) => <ProductCard key={product.id || product.slug} product={product} index={index} />)
                  : <div className="fresh-status" data-testid="featured-empty">{lang === "fr" ? "Aucun produit en vedette pour le moment." : "No featured products right now."}</div>}
          </div>
        </div>
      </section>

      <section className="fresh-newsletter" data-testid="newsletter-section">
        <div className="fresh-container">
          <div className="fresh-newsletter__panel">
            <div><p className="fresh-kicker">{lang === "fr" ? "Infolettre" : "Newsletter"}</p><h2>{newsTitle}</h2><p>{newsLede}</p></div>
            {done ? <div className="fresh-newsletter__success" role="status"><Check size={20} aria-hidden="true" /><span>{newsDone}</span></div> : (
              <form onSubmit={subscribe} data-testid="newsletter-form">
                <label htmlFor="newsletter-email">{newsLabel}</label>
                <div className="fresh-newsletter__field">
                  <input id="newsletter-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("home.newsletterPlaceholder")} data-testid="newsletter-input" />
                  <button type="submit" disabled={subBusy} data-testid="newsletter-submit">{subBusy ? (lang === "fr" ? "Envoi…" : "Sending…") : t("home.subscribe")}</button>
                </div>
                <label className="fresh-newsletter__consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="newsletter-consent" /><span>{t("home.newsletterConsent")}</span></label>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
