import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import ProductCard from "../components/ProductCard.jsx";
import { MolecularMesh, Seal, NovaSpark, Reveal, FnMark } from "../components/brand";

/* ============================================================================
 * FIRONOVA — Home
 * Positionnement : traçabilité par lot + clarté, PAS emphase pureté/tests.
 * Aucun chiffre de pureté ni chromatogramme en dur (non sourcés).
 * La preuve de pureté vit au niveau du lot, sur la fiche produit, quand un COA existe.
 * ==========================================================================*/

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

  /* ---------- Textes FR/EN (inline, cohérent avec le reste du fichier) ---------- */
  const heroEyebrow = "FIRONOVA · CANADA";
  const heroTitle = lang === "fr"
    ? { a: "Peptides de recherche.", b: "Traçables par lot, expédiés du Canada." }
    : { a: "Research peptides.", b: "Lot-traceable, shipped from Canada." };
  const heroLede = lang === "fr"
    ? "Chaque variante affiche le statut de son certificat d'analyse. Vous voyez ce qui est documenté — et ce qui ne l'est pas encore."
    : "Every variant shows the status of its certificate of analysis. You see what's documented — and what isn't yet.";
  const ctaPrimary = lang === "fr" ? "Voir le catalogue" : "Browse the catalog";
  const ctaSecondary = lang === "fr" ? "Notre approche des tests" : "Our testing approach";

  // Trois piliers — aucune promesse de pureté ni de résultat.
  const pillars = lang === "fr"
    ? [
        { tag: "01", title: "Traçable par lot", body: "Chaque lot porte un numéro. Quand un COA existe, il est rattaché à ce lot précis — pas à une moyenne." },
        { tag: "02", title: "Basé au Canada", body: "Expédition depuis le Canada. Usage recherche uniquement, accès 19+, conformité Loi 25 / PIPEDA." },
        { tag: "03", title: "Statuts transparents", body: "Disponible, à venir, ou absent : le statut affiché correspond toujours à l'état réel du lot." },
      ]
    : [
        { tag: "01", title: "Lot-traceable", body: "Every lot carries a number. When a COA exists, it's tied to that specific lot — not to an average." },
        { tag: "02", title: "Canada-based", body: "Shipped from Canada. Research use only, 19+ access, Loi 25 / PIPEDA compliant." },
        { tag: "03", title: "Transparent statuses", body: "Available, pending, or none: the status shown always reflects the real state of the lot." },
      ];

  const howEyebrow = lang === "fr" ? "COMMENT ÇA MARCHE" : "HOW IT WORKS";
  const howTitle = lang === "fr" ? "Comment lire nos fiches produits" : "How to read our product pages";
  const howBody = lang === "fr"
    ? "Sur chaque produit, vous choisissez une variante. Le statut de son certificat d'analyse s'affiche directement : COA disponible (rapport téléchargeable), COA à venir (en attente), ou sans COA (aucun rapport publié pour ce lot). Nous n'affirmons que ce que nous pouvons documenter."
    : "On each product, you pick a variant. Its certificate-of-analysis status shows directly: COA available (downloadable report), COA pending (awaiting report), or no COA (no report published for this lot). We state only what we can document.";
  const howLink = lang === "fr" ? "Lire notre approche complète des tests" : "Read our full testing approach";

  const featEyebrow = lang === "fr" ? "01 — CATALOGUE" : "01 — CATALOG";
  const featTitle = lang === "fr" ? "Nos peptides de recherche" : "Our research peptides";
  const featLede = lang === "fr" ? "Un catalogue restreint et clair. Chaque variante affiche son statut COA." : "A tight, clear catalog. Each variant shows its COA status.";
  const featAll = lang === "fr" ? "Voir tout le catalogue" : "View full catalog";

  const ruoStrip = lang === "fr"
    ? "USAGE RECHERCHE UNIQUEMENT · NON DESTINÉ À UN USAGE HUMAIN OU VÉTÉRINAIRE · ACCÈS 19+"
    : "FOR RESEARCH USE ONLY · NOT FOR HUMAN OR VETERINARY USE · 19+ ACCESS";

  const newsTitle = lang === "fr" ? "Sorties de lots & mises à jour" : "Lot releases & updates";
  const newsLede = lang === "fr" ? "Un courriel par mois. Nouveaux lots, mises à jour de statut COA, réassorts. Conforme à la LCAP, désabonnement en tout temps." : "One email per month. New lots, COA status updates, restocks. CASL-compliant, unsubscribe anytime.";
  const newsDone = lang === "fr" ? "Confirmé — vous êtes inscrit." : "Confirmed — you're on the list.";

  return (
    <div data-testid="home-page">
      {/* HERO — visuel de marque, aucune donnée de pureté */}
      <section className="relative bg-nordfjord text-clinical overflow-hidden" data-testid="hero-section">
        <MolecularMesh opacity={0.28} />
        <div className="absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(0,184,212,.16), transparent 65%)" }} />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-20 pb-24 grid lg:grid-cols-[1.05fr_.95fr] gap-16 items-center min-h-[70vh]">
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
              <div className="flex flex-wrap items-center gap-4">
                <Link to="/catalog" data-testid="hero-cta-catalog" className="btn-pill btn-nova">{ctaPrimary}</Link>
                <Link to="/testing" data-testid="hero-cta-testing" className="btn-pill border-[1.5px] border-[#3E5C76] text-clinical hover:border-nova hover:text-nova">{ctaSecondary}</Link>
              </div>
            </Reveal>
          </div>
          {/* Visuel de marque abstrait — remplace la fausse carte COA */}
          <Reveal delay={300} className="relative hidden lg:block">
            <div className="relative flex items-center justify-center h-[380px]">
              <div className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(0,184,212,.10), transparent 68%)" }} />
              <FnMark size={280} frame="#1E4A73" spark="#00B8D4" />
              <div className="absolute -bottom-6 -left-6"><Seal size={120} /></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* TROIS PILIERS — remplace le trust ticker "pureté vérifiée" */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 -mt-12 relative z-10" data-testid="pillars-section">
        <div className="grid md:grid-cols-3 gap-5">
          {pillars.map((p, i) => (
            <Reveal key={p.tag} delay={i * 90}>
              <div className="h-full rounded-2xl bg-white border border-ash/60 p-7 shadow-[0_24px_48px_-30px_rgba(11,46,79,.35)]">
                <div className="flex items-center gap-3 mb-4">
                  <NovaSpark size={16} />
                  <span className="font-data text-[11px] uppercase tracking-[0.2em] text-glacier">{p.tag}</span>
                </div>
                <h3 className="font-display text-[21px] font-semibold text-nordfjord mb-2 leading-snug">{p.title}</h3>
                <p className="text-[15px] text-glacier leading-relaxed">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* COMMENT ÇA MARCHE — pédagogie COA, honnête */}
      <section className="py-24 lg:py-28" data-testid="how-it-works">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <Reveal><p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova mb-5">{howEyebrow}</p></Reveal>
          <Reveal delay={60}><h2 className="font-display text-[34px] lg:text-[42px] font-semibold text-nordfjord leading-tight mb-6">{howTitle}</h2></Reveal>
          <Reveal delay={120}><p className="text-lg text-glacier leading-relaxed mb-8">{howBody}</p></Reveal>
          <Reveal delay={180}>
            <Link to="/testing" data-testid="how-testing-link" className="btn-pill btn-outline group inline-flex">
              {howLink} <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="pb-24 lg:pb-32" data-testid="featured-products">
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

      {/* BANDEAU RUO */}
      <section className="bg-nordfjord" data-testid="ruo-strip">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4">
          <p className="font-data text-[11px] text-center uppercase tracking-[0.16em] text-[#8FB3C9]">{ruoStrip}</p>
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
