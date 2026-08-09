import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import ProductCard from "../components/ProductCard.jsx";
import { MolecularMesh, Seal, NovaSpark, Reveal, FnMark } from "../components/brand";

function PurityTrace() {
  return (
    <svg viewBox="0 0 520 180" className="w-full" aria-hidden="true">
      <g stroke="#1B4A73" strokeWidth="1">
        {[36, 72, 108, 144].map((y) => <line key={y} x1="0" y1={y} x2="520" y2={y} opacity=".5" />)}
      </g>
      <path
        d="M0 150 L60 150 L78 148 L92 150 L150 150 L166 142 L178 150 L250 150 L262 146 L272 150 L340 150 L352 96 L362 34 L372 20 L382 34 L392 96 L402 150 L520 150"
        fill="none" stroke="#00B8D4" strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx="372" cy="20" r="4" fill="#00B8D4" />
      <text x="404" y="30" fill="#00B8D4" fontSize="12" fontFamily="'JetBrains Mono', monospace" letterSpacing="1">99%</text>
      <text x="12" y="172" fill="#5B7A9E" fontSize="10" fontFamily="'JetBrains Mono', monospace" letterSpacing="1.5">RETENTION TIME →</text>
      <text x="420" y="60" fill="#5B7A9E" fontSize="10" fontFamily="'JetBrains Mono', monospace" letterSpacing="1.5">HPLC · λ 214nm</text>
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
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get("/products", { params: { featured: true } })
      .then((r) => setProducts(r.data.slice(0, 4)))
      .catch(() => {});
  }, []);

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
      setDone(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || t("home.newsletterError"));
    } finally {
      setSubBusy(false);
    }
  };

  const trustItems = [t("home.trustTested"), t("home.trustCanada"), t("home.trustPurity"), t("home.trustDiscreet")];

  const categories = [
    { key: "healing", label: t("categories.healing") },
    { key: "weight-loss", label: t("categories.weight-loss") },
    { key: "gh-secretagogues", label: t("categories.gh-secretagogues") },
    { key: "cognitive", label: t("categories.cognitive") },
    { key: "longevity", label: t("categories.longevity") },
  ];

  const heroTitle = lang === "fr"
    ? { a: "Peptides de précision", b: "pour la recherche." }
    : { a: "Precision peptides", b: "for research." };
  const heroEyebrow = lang === "fr" ? "PEPTIDES DE RECHERCHE CANADIENS" : "CANADIAN RESEARCH PEPTIDES";
  const heroLede = lang === "fr"
    ? "Testés par HPLC en laboratoire indépendant. Certificat d'analyse fourni pour les lots documentés. Sobriété nordique, conformité bilingue complète."
    : "HPLC-tested by an independent lab. Certificate of analysis provided for documented lots. Nordic restraint, full bilingual compliance.";
  const ctaPrimary = lang === "fr" ? "Voir le catalogue" : "Browse the catalog";
  const ctaSecondary = lang === "fr" ? "Nos standards" : "Our standards";
  const chip = lang === "fr" ? { lot: "LOT", purity: "PURETÉ", license: "LICENCE" } : { lot: "LOT", purity: "PURITY", license: "LICENSE" };

  const featEyebrow = lang === "fr" ? "01 — COMPOSÉS EN VEDETTE" : "01 — FEATURED COMPOUNDS";
  const featTitle = lang === "fr" ? "Une pureté documentée" : "Documented purity";
  const featLede = lang === "fr" ? "Un catalogue restreint et rigoureux. Aucun bruit — chaque composé gagne sa place par une vérification indépendante." : "A tight, curated catalog. No noise — each compound earns its place with third-party verification.";
  const featAll = lang === "fr" ? "Voir tout le catalogue" : "View full catalog";
  const catsEyebrow = lang === "fr" ? "02 — DOMAINES DE RECHERCHE" : "02 — RESEARCH AREAS";
  const catsTitle = lang === "fr" ? "Cinq domaines, un seul standard" : "Five fields, one standard";
  const catsProducts = lang === "fr" ? "composés" : "compounds";
  const newsTitle = lang === "fr" ? "Sorties de lots & notes de recherche" : "Lot releases & research notes";
  const newsLede = lang === "fr" ? "Un courriel précis par mois. Nouveaux lots, rapports de lots, réassorts. Conforme à la LCAP, désabonnement en tout temps." : "One precise email per month. New lots, lot reports, restocks. CASL-compliant, unsubscribe anytime.";
  const newsDone = lang === "fr" ? "Confirmé — vous êtes inscrit." : "Confirmed — you're on the list.";

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative bg-nordfjord text-clinical overflow-hidden" data-testid="hero-section">
        <MolecularMesh opacity={0.28} />
        <div className="absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(0,184,212,.16), transparent 65%)" }} />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-20 pb-24 grid lg:grid-cols-[1.05fr_.95fr] gap-16 items-center min-h-[78vh]">
          <div>
            <Reveal>
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.22em] text-nova mb-7 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-nova" />
                {heroEyebrow}
              </p>
            </Reveal>
            <Reveal delay={90}>
              <h1 className="font-display font-bold leading-[1.02] tracking-[-0.02em] mb-7" style={{ fontSize: "clamp(40px,5.6vw,76px)" }} data-testid="hero-title">
                {heroTitle.a}{" "}
                <span className="text-nova">{heroTitle.b}</span>
              </h1>
            </Reveal>
            <Reveal delay={180}>
              <p className="text-lg text-[#B7CADD] max-w-[52ch] leading-relaxed mb-10">{heroLede}</p>
            </Reveal>
            <Reveal delay={260}>
              <div className="flex flex-wrap items-center gap-4 mb-12">
                <Link to="/catalog" data-testid="hero-cta-catalog" className="btn-pill btn-nova">{ctaPrimary}</Link>
                <Link to="/about" data-testid="hero-cta-lab" className="btn-pill border-[1.5px] border-[#3E5C76] text-clinical hover:border-nova hover:text-nova">{ctaSecondary}</Link>
              </div>
            </Reveal>
            <Reveal delay={340}>
              <div className="flex flex-wrap gap-x-10 gap-y-4 font-data text-[12px] uppercase tracking-[0.16em] text-[#8FB3C9]">
                <span><span className="text-nova">{chip.lot}</span> FN-26005</span>

              </div>
            </Reveal>
          </div>
          <Reveal delay={300} className="relative hidden lg:block">
            <div className="relative bg-[#0D3560]/80 backdrop-blur border border-[#1E4A73] rounded-2xl p-8 shadow-[0_40px_80px_-30px_rgba(0,0,0,.5)]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="font-data text-[10px] uppercase tracking-[0.22em] text-nova mb-1.5">Certificate of Analysis</p>
                  <p className="font-display text-lg font-semibold text-white">BPC-157 · 5 mg</p>
                </div>
                <NovaSpark size={26} />
              </div>
              <PurityTrace />
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-[#1E4A73] font-data text-center">
                {[["LOT", "FN-26005"], ["PURITY", "99.42%"], ["EXP", "2028-06"]].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#5B7A9E] mb-1">{k}</p>
                    <p className="text-sm text-nova font-semibold">{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-14 -left-16"><Seal size={120} /></div>
          </Reveal>
        </div>
      </section>

      {/* TRUST TICKER */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 -mt-10 relative z-10" data-testid="trust-marquee">
        <div className="rounded-2xl bg-nordfjord py-5 overflow-hidden shadow-[0_24px_48px_-24px_rgba(11,46,79,.5)]">
          <div style={{
            display: "flex",
            width: "max-content",
            animation: "trust-scroll 22s linear infinite",
          }}>
            {[...trustItems, ...trustItems, ...trustItems, ...trustItems, ...trustItems, ...trustItems].map((it, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "0 40px", fontSize: "12px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#F7FAFC", whiteSpace: "nowrap" }}>
                <NovaSpark size={13} /> {it}
              </span>
            ))}
          </div>
          <style>{`@keyframes trust-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="py-24 lg:py-32" data-testid="featured-products">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <Reveal><p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-5">{featEyebrow}</p></Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6 mb-14">
            <Reveal delay={60}>
              <h2 className="font-display text-[42px] font-semibold text-nordfjord leading-tight">{featTitle}</h2>
              <p className="text-lg text-glacier max-w-xl mt-3">{featLede}</p>
            </Reveal>
            <Reveal delay={120}>
              <Link to="/catalog" data-testid="view-all-catalog" className="btn-pill btn-outline group">
                {featAll} <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </Reveal>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((p, i) => (
              <Reveal key={p.id} delay={i * 90}><ProductCard product={p} index={i} /></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="py-24 bg-white border-y border-ash/60" data-testid="categories-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <Reveal><p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-5">{catsEyebrow}</p></Reveal>
          <Reveal delay={60}><h2 className="font-display text-[42px] font-semibold text-nordfjord mb-14">{catsTitle}</h2></Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {categories.map((c, i) => (
              <Reveal key={c.key} delay={i * 80}>
                <Link to={`/catalog?cat=${c.key}`} data-testid={`category-${c.key}`}
                  className="group relative block rounded-2xl bg-nordfjord p-8 h-56 overflow-hidden card-hover">
                  <svg viewBox="0 0 300 200" className="absolute inset-0 w-full h-full opacity-20 transition-opacity duration-500 group-hover:opacity-40" aria-hidden="true">
                    <g stroke="#00B8D4" strokeWidth="1" fill="none">
                      <line x1={30 + i * 14} y1="60" x2="150" y2="110" /><line x1="150" y1="110" x2="260" y2="50" /><line x1="150" y1="110" x2="220" y2="170" />
                    </g>
                    <g fill="#00B8D4"><circle cx={30 + i * 14} cy="60" r="4" /><circle cx="150" cy="110" r="5" /><circle cx="260" cy="50" r="4" /><circle cx="220" cy="170" r="4" /></g>
                  </svg>
                  <div className="relative h-full flex flex-col">
                    <span className="font-data text-[11px] uppercase tracking-[0.2em] text-nova">0{i + 1}</span>
                    <h3 className="font-display text-[22px] font-semibold text-white mt-auto leading-snug">{c.label}</h3>
                    <p className="font-data text-[11px] uppercase tracking-[0.16em] text-[#8FB3C9] mt-2 flex items-center gap-2">
                      {catsProducts}
                      <ArrowRight size={13} className="text-nova transition-transform duration-300 group-hover:translate-x-1.5" />
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="py-24" data-testid="newsletter-section">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <Reveal>
            <div className="rounded-2xl bg-nordfjord px-8 lg:px-16 py-16 relative overflow-hidden">
              <div className="absolute -right-16 -top-16 opacity-25"><FnMark size={260} frame="#00B8D4" spark="#00B8D4" /></div>
              <div className="relative max-w-2xl">
                <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-5">Newsletter</p>
                <h2 className="font-display text-[34px] font-semibold text-white mb-4">{newsTitle}</h2>
                <p className="text-[#B7CADD] mb-9 leading-relaxed">{newsLede}</p>
                {done ? (
                  <p className="inline-flex items-center gap-2.5 text-nova font-semibold"><Check size={18} /> {newsDone}</p>
                ) : (
                  <form onSubmit={subscribe} className="space-y-4" data-testid="newsletter-form">
                    <div className="flex flex-col sm:flex-row gap-3 bg-clinical rounded-full p-2">
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder={t("home.newsletterPlaceholder")}
                        className="flex-1 bg-transparent px-5 py-3 text-nordfjord outline-none text-[15px]"
                        data-testid="newsletter-input" />
                      <button type="submit" disabled={subBusy}
                        className="btn-pill btn-nova disabled:opacity-40 disabled:pointer-events-none"
                        data-testid="newsletter-submit">{t("home.subscribe")}</button>
                    </div>
                    <label className="flex items-start gap-3 text-[13px] text-[#8FB3C9] cursor-pointer select-none">
                      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                        className="mt-0.5 accent-[#00B8D4] w-4 h-4" data-testid="newsletter-consent" />
                      {t("home.newsletterConsent")}
                    </label>
                  </form>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
