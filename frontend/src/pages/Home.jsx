import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, MapPin, FlaskConical, Package } from "lucide-react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import useDocumentHead from "../hooks/useDocumentHead";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import ProductCard from "../components/ProductCard";

export default function Home() {
  useDocumentHead({ title: "Research Peptides", description: "Research-grade peptides for laboratory use, with certificate-of-analysis documentation. For Research Use Only.", path: "/" });
  const { t, lang } = useLang();
  const { coaPageEnabled } = useSiteConfig();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api.get("/products", { params: { featured: true } }).then((r) => setProducts(r.data.slice(0, 6))).catch(() => {});
  }, []);

  const trustItems = [
    { icon: FlaskConical, label: t("home.trustTested") },
    { icon: MapPin, label: t("home.trustCanada") },
    { icon: ShieldCheck, label: t("home.trustPurity") },
    { icon: Package, label: t("home.trustDiscreet") },
  ];

  const categories = [
    { key: "healing", label: t("categories.healing"), img: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=crop&w=600&q=80" },
    { key: "weight-loss", label: t("categories.weight-loss"), img: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=600&q=80" },
    { key: "gh-secretagogues", label: t("categories.gh-secretagogues"), img: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=600&q=80" },
    { key: "cognitive", label: t("categories.cognitive"), img: "https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=600&q=80" },
    { key: "longevity", label: t("categories.longevity"), img: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=600&q=80" },
  ];

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative border-b border-ink" data-testid="hero-section">
        <div className="grid lg:grid-cols-[1.1fr_1fr]">
          <div className="px-6 lg:px-12 py-20 lg:py-28 flex flex-col justify-between min-h-[640px]">
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/60">
              {t("home.heroOverline")}
            </div>
            <div className="mt-12">
              <h1 className="font-display text-5xl sm:text-7xl lg:text-[8rem] font-extrabold uppercase tracking-[-0.04em] leading-[0.88]" data-testid="hero-title">
                {lang === "fr" ? (
                  <>Peptides<br/>de précision<br/><span className="text-foreground/50">pour la recherche.</span></>
                ) : (
                  <>Precision<br/>peptides<br/><span className="text-foreground/50">for research.</span></>
                )}
              </h1>
              <p className="mt-8 text-base sm:text-lg max-w-md text-foreground/75 leading-relaxed">
                {t("home.heroSub")}
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  to="/catalog"
                  data-testid="hero-cta-catalog"
                  className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-4 inline-flex items-center gap-3 hover:bg-foreground/85"
                >
                  {t("home.heroCta")} <ArrowRight size={14} />
                </Link>
                {coaPageEnabled && (
                  <Link
                    to="/lab"
                    data-testid="hero-cta-lab"
                    className="border border-ink font-mono text-xs uppercase tracking-[0.25em] px-6 py-4 inline-flex items-center gap-3 hover:bg-ink hover:text-white"
                  >
                    {t("home.heroCta2")}
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-12 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 grid grid-cols-3 gap-4">
              <div>LOT · 2026Q1</div>
              <div>≥ 99% PURITY</div>
              <div>BIO-RX-CA</div>
            </div>
          </div>
          <div className="relative bg-secondary border-l border-ink min-h-[500px]">
            <img
              src="https://images.unsplash.com/photo-1721009140154-7bb3e2dce95d?auto=format&fit=crop&w=1200&q=80"
              alt="Nordic glacier"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: "grayscale(0.8) contrast(1.1)" }}
            />
            <div className="absolute inset-0 bg-ink/10" />
            <div className="absolute top-6 left-6 font-mono text-[10px] uppercase tracking-[0.25em] bg-white px-3 py-1.5 border border-ink">
              N 49° 16′ · W 123° 06′
            </div>
            <div className="absolute bottom-6 right-6 font-mono text-[10px] uppercase tracking-[0.25em] bg-ink text-white px-3 py-1.5">
              MADE IN CANADA
            </div>
          </div>
        </div>
      </section>

      {/* TRUST MARQUEE */}
      <section className="border-b border-ink overflow-hidden bg-ink text-white" data-testid="trust-marquee">
        <div className="marquee-track py-5">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex items-center gap-16 pr-16 font-mono text-xs uppercase tracking-[0.3em]">
              {trustItems.map((it, i) => (
                <span key={i} className="flex items-center gap-3 whitespace-nowrap">
                  <it.icon size={14} strokeWidth={1.5} /> {it.label}
                  <span className="text-white/30">/</span>
                </span>
              ))}
              {trustItems.map((it, i) => (
                <span key={`b-${i}`} className="flex items-center gap-3 whitespace-nowrap">
                  <it.icon size={14} strokeWidth={1.5} /> {it.label}
                  <span className="text-white/30">/</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="border-b border-ink" data-testid="featured-products">
        <div className="px-6 lg:px-16 pt-24 pb-12 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">02 — FEATURED</div>
            <h2 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-tight mt-3">
              {t("home.featuredTitle")}
            </h2>
            <p className="mt-3 max-w-xl text-foreground/70">{t("home.featuredSub")}</p>
          </div>
          <Link to="/catalog" data-testid="view-all-catalog" className="font-mono text-xs uppercase tracking-[0.25em] link-underline">
            {t("common.viewAll")} →
          </Link>
        </div>
        <div className="px-6 lg:px-16 pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            {products.map((p, i) => (
              <ProductCard product={p} key={p.id} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="border-b border-ink" data-testid="categories-section">
        <div className="px-6 lg:px-12 pt-20 pb-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">03 — CATEGORIES</div>
          <h2 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-tight mt-3">
            {t("home.categoriesTitle")}
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 border-t border-l border-ink/15">
          {categories.map((c) => (
            <Link
              key={c.key}
              to={`/catalog?cat=${c.key}`}
              data-testid={`category-${c.key}`}
              className="relative aspect-[3/4] border-r border-b border-ink/15 group overflow-hidden"
            >
              <img src={c.img} alt={c.label} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" style={{ filter: "grayscale(0.8) contrast(1.1)" }} />
              <div className="absolute inset-0 bg-ink/40 group-hover:bg-ink/20 transition-colors" />
              <div className="relative h-full p-5 flex flex-col justify-between text-white">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em]">0{categories.indexOf(c) + 1}</div>
                <div>
                  <div className="font-display text-2xl font-bold uppercase tracking-tight leading-tight">{c.label}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.25em] mt-2 opacity-80">EXPLORE →</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="px-6 lg:px-12 py-24 grid lg:grid-cols-2 gap-12 items-end border-b border-ink" data-testid="newsletter-section">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/50">04 — RESEARCH NOTES</div>
          <h2 className="font-display text-4xl sm:text-5xl font-extrabold uppercase tracking-tight mt-3">
            {t("home.newsletterTitle")}
          </h2>
          <p className="mt-3 max-w-md text-foreground/70">{t("home.newsletterSub")}</p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); }}
          className="flex border border-ink"
          data-testid="newsletter-form"
        >
          <input
            type="email"
            required
            placeholder={t("home.newsletterPlaceholder")}
            className="flex-1 px-5 py-4 bg-transparent font-mono text-sm focus:outline-none"
            data-testid="newsletter-input"
          />
          <button
            type="submit"
            className="bg-ink text-white font-mono text-xs uppercase tracking-[0.25em] px-6 hover:bg-foreground/85"
            data-testid="newsletter-submit"
          >
            {t("home.subscribe")} →
          </button>
        </form>
      </section>
    </div>
  );
}
