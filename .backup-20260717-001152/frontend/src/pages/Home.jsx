import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, MapPin, FlaskConical, Package } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import ProductCard from "../components/ProductCard";

/* Chromatogramme HPLC — LA LIGNE. Signature visuelle FIRONOVA : c'est la
   donnee elle-meme qui fait l'image de marque, pas une photo d'archive. */
function Chromatogram() {
  return (
    <svg viewBox="0 0 520 400" className="absolute inset-0 w-full h-full" role="img" aria-label="HPLC chromatogram">
      <defs>
        <linearGradient id="fn-hero-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6B0504" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#3A0A08" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <rect width="520" height="400" fill="url(#fn-hero-wash)" />
      {[80, 140, 200, 260, 320].map((y) => (
        <line key={y} x1="40" y1={y} x2="480" y2={y} stroke="#E9DED4" strokeWidth="1" />
      ))}
      <line x1="40" y1="320" x2="480" y2="320" stroke="#B06C49" strokeWidth="1.5" />
      <path
        className="hplc-trace"
        d="M40 318 L120 316 L150 314 L168 300 L180 96 L196 306 L214 314 L262 312 L280 232 L296 310 L340 313 L356 268 L372 312 L440 315 L480 316"
        fill="none"
        stroke="#C20114"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="180" cy="96" r="3.5" fill="#C20114" className="fn-dot-live" />
      <text x="192" y="92" fontFamily="'JetBrains Mono', monospace" fontSize="11" fill="#B06C49">99.4%</text>
      <text x="40" y="344" fontFamily="'JetBrains Mono', monospace" fontSize="10" fill="#B06C49" letterSpacing="1.6">RT 0.0</text>
      <text x="428" y="344" fontFamily="'JetBrains Mono', monospace" fontSize="10" fill="#B06C49" letterSpacing="1.6">12.0 MIN</text>
    </svg>
  );
}

export default function Home() {
  const { t, lang } = useLang();
  const { coaPageEnabled } = useSiteConfig();
  const [products, setProducts] = useState([]);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [subBusy, setSubBusy] = useState(false);

  useEffect(() => {
    api.get("/products", { params: { featured: true } })
      .then((r) => setProducts(r.data.slice(0, 6)))
      .catch(() => {});
  }, []);

  /* LCAP/CASL : consentement expres obligatoire, case jamais pre-cochee. */
  const subscribe = async (e) => {
    e.preventDefault();
    if (!consent) {
      toast.error(t("home.newsletterConsentRequired"));
      return;
    }
    setSubBusy(true);
    try {
      const { data } = await api.post("/newsletter/subscribe", {
        email: email.trim(),
        lang,
        source: "home",
      });
      toast.success(data.already_subscribed ? t("home.newsletterAlready") : t("home.newsletterOk"));
      setEmail("");
      setConsent(false);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || t("home.newsletterError"));
    } finally {
      setSubBusy(false);
    }
  };

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
      <section className="relative overflow-hidden grain" data-testid="hero-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-14 lg:pt-20 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-faint bg-paper px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-copper">
              <span className="w-1.5 h-1.5 rounded-full bg-signal fn-dot-live" />
              {t("home.heroOverline")}
            </div>
            <h1
              className="mt-8 font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.02em] leading-[1.02] text-ink"
              data-testid="hero-title"
            >
              {lang === "fr" ? (
                <>Peptides de précision <span className="text-copper">pour la recherche.</span></>
              ) : (
                <>Precision peptides <span className="text-copper">for research.</span></>
              )}
            </h1>
            <p className="mt-6 text-base sm:text-lg max-w-md text-inkmuted leading-relaxed">
              {t("home.heroSub")}
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                to="/catalog"
                data-testid="hero-cta-catalog"
                className="rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.25em] px-7 py-4 inline-flex items-center gap-3 shadow-luxe hover:shadow-luxe-lg transition-shadow"
              >
                {t("home.heroCta")} <ArrowRight size={14} strokeWidth={1.5} />
              </Link>
              {coaPageEnabled && (
                <Link
                  to="/lab"
                  data-testid="hero-cta-lab"
                  className="rounded-full border border-faint bg-paper font-mono text-xs uppercase tracking-[0.25em] px-7 py-4 inline-flex items-center gap-3 text-ink hover:border-copper transition-colors"
                >
                  {t("home.heroCta2")}
                </Link>
              )}
            </div>
            <div className="mt-12 grid grid-cols-3 gap-3 max-w-md">
              {["LOT · 2026Q1", "≥ 99% PURITY", "BIO-RX-CA"].map((s) => (
                <div
                  key={s}
                  className="rounded-md border border-faint bg-paper px-3 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-copper text-center"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>

          {/* Le COA est la piece hero — pas une note de bas de page. */}
          <div className="relative animate-fade-up-delay-1">
            <div className="relative rounded-lg overflow-hidden aspect-[4/5] lg:aspect-[5/6] bg-paper border border-faint shadow-luxe-lg">
              <Chromatogram />
              <div className="absolute top-5 left-5 rounded-full font-mono text-[10px] uppercase tracking-[0.25em] bg-paper/90 backdrop-blur border border-faint px-4 py-2 text-copper">
                HPLC · LOT 2026Q1-004
              </div>
              <div className="absolute bottom-5 right-5 rounded-full font-mono text-[10px] uppercase tracking-[0.25em] bg-garnet text-paper px-4 py-2">
                MADE IN CANADA
              </div>
              <svg viewBox="0 0 120 120" className="absolute bottom-5 left-5 w-16 h-16 animate-seal" aria-hidden="true">
                <defs>
                  <path id="fn-seal-path" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
                </defs>
                <circle cx="60" cy="60" r="52" fill="none" stroke="#B06C49" strokeWidth="1" opacity="0.5" />
                <text fontFamily="'JetBrains Mono', monospace" fontSize="11" fill="#B06C49" letterSpacing="2.4">
                  <textPath href="#fn-seal-path">THIRD-PARTY VERIFIED · ANALYSÉ EN LABO TIERS · </textPath>
                </text>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST MARQUEE */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8" data-testid="trust-marquee">
        <div className="rounded-lg bg-garnet text-paper overflow-hidden shadow-luxe">
          <div className="marquee-track py-5">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex items-center gap-16 pr-16 font-mono text-xs uppercase tracking-[0.3em]">
                {trustItems.map((it, i) => (
                  <span key={i} className="flex items-center gap-3 whitespace-nowrap">
                    <it.icon size={14} strokeWidth={1.5} /> {it.label}
                    <span className="text-copperlight/50">/</span>
                  </span>
                ))}
                {trustItems.map((it, i) => (
                  <span key={`b-${i}`} className="flex items-center gap-3 whitespace-nowrap">
                    <it.icon size={14} strokeWidth={1.5} /> {it.label}
                    <span className="text-copperlight/50">/</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8" data-testid="featured-products">
        <div className="pt-24 pb-12 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-copper">02 — FEATURED</div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.01em] mt-3 text-ink">
              {t("home.featuredTitle")}
            </h2>
            <div className="rule-copper mt-5 w-24" />
            <p className="mt-4 max-w-xl text-inkmuted">{t("home.featuredSub")}</p>
          </div>
          <Link
            to="/catalog"
            data-testid="view-all-catalog"
            className="font-mono text-xs uppercase tracking-[0.25em] link-underline text-ink"
          >
            {t("common.viewAll")} →
          </Link>
        </div>
        <div className="pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((p, i) => (
              <ProductCard product={p} key={p.id} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8" data-testid="categories-section">
        <div className="pb-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-copper">03 — CATEGORIES</div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.01em] mt-3 text-ink">
            {t("home.categoriesTitle")}
          </h2>
          <div className="rule-copper mt-5 w-24" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {categories.map((c, idx) => (
            <Link
              key={c.key}
              to={`/catalog?cat=${c.key}`}
              data-testid={`category-${c.key}`}
              className="relative aspect-[3/4] rounded-lg group overflow-hidden card-hover border border-faint"
            >
              <img
                src={c.img}
                alt={c.label}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-garnet/85 via-garnet/35 to-garnet/10 group-hover:from-garnet/75 transition-colors" />
              <div className="relative h-full p-5 flex flex-col justify-between text-paper">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] bg-paper/15 backdrop-blur rounded-full w-fit px-3 py-1">
                  0{idx + 1}
                </div>
                <div>
                  <div className="font-display text-xl sm:text-2xl font-bold tracking-[-0.01em] leading-tight">{c.label}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.25em] mt-2 text-copperlight">EXPLORE →</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* NEWSLETTER — LCAP/CASL */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-24" data-testid="newsletter-section">
        <div className="rounded-lg bg-garnet text-paper px-8 lg:px-14 py-14 grid lg:grid-cols-2 gap-12 items-start overflow-hidden relative shadow-luxe-lg">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-paper/5 pointer-events-none" />
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-copperlight">04 — RESEARCH NOTES</div>
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.01em] mt-3">
              {t("home.newsletterTitle")}
            </h2>
            <p className="mt-4 max-w-md text-paper/70">{t("home.newsletterSub")}</p>
          </div>
          <form onSubmit={subscribe} className="relative" data-testid="newsletter-form">
            <div className="flex rounded-full bg-paper p-1.5 shadow-luxe">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("home.newsletterPlaceholder")}
                className="flex-1 px-5 py-3 bg-transparent font-mono text-sm text-ink focus:outline-none min-w-0 rounded-full"
                data-testid="newsletter-input"
              />
              <button
                type="submit"
                disabled={subBusy}
                className="rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-60 whitespace-nowrap"
                data-testid="newsletter-submit"
              >
                {t("home.subscribe")} →
              </button>
            </div>
            {/* Case JAMAIS pre-cochee — exigence LCAP (consentement expres). */}
            <label className="mt-4 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                data-testid="newsletter-consent"
                className="mt-0.5 w-4 h-4 shrink-0 accent-[#C20114]"
              />
              <span className="text-[11px] leading-relaxed text-paper/70">{t("home.newsletterConsent")}</span>
            </label>
          </form>
        </div>
      </section>
    </div>
  );
}
