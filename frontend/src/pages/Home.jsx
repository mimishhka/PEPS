import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
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
  // `coaPageEnabled` n'est PAS lu ici : la page d'accueil ne renvoie jamais
  // vers /lab. Seul Header.jsx en a besoin, pour masquer l'entree de menu.
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
        consent,
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


  const heroTitle = lang === "fr"
    ? { a: "Peptides de précision", b: "pour la recherche." }
    : { a: "Precision peptides", b: "for research." };
  const heroEyebrow = lang === "fr" ? "PEPTIDES DE RECHERCHE CANADIENS" : "CANADIAN RESEARCH PEPTIDES";
  // La phrase « Sobriete nordique, conformite bilingue complete » a ete
  // retiree le 2026-09-22. « Sobriete nordique » est un mot de CHARTE
  // GRAPHIQUE — la palette s'appelle nordfjord, glacier, nova — et il
  // decrivait donc a quoi ressemble le site, a quelqu'un qui est deja en
  // train de le regarder. Il ne disait rien du produit.
  //
  // « Conformite bilingue » est une obligation legale au Quebec : tous les
  // concurrents y sont tenus, ce n'est pas une raison d'acheter ici.
  //
  // Restent deux affirmations verifiables, que la troisieme diluait.
  const heroLede = lang === "fr"
    ? "Testés par HPLC en laboratoire indépendant. Certificat d'analyse fourni pour les lots documentés."
    : "HPLC-tested by an independent lab. Certificate of analysis provided for documented lots.";
  const ctaPrimary = lang === "fr" ? "Voir le catalogue" : "Browse the catalog";
  const ctaSecondary = lang === "fr" ? "Nos standards" : "Our standards";

  // CINQ CHOSES EMPILEES, RETIREES ENSEMBLE le 2026-09-22.
  //
  // « 01 — » numerotait une liste d'UN SEUL element : il n'y avait ni 02
  // ni 03. De la structure decorative, qui imite un sommaire sans en etre
  // un.
  //
  // « Une purete documentee » ne titrait pas ce qu'il surplombait : une
  // GRILLE DE PRODUITS. Quelqu'un qui balaie la page veut savoir ce qu'il
  // regarde, et lisait une qualite abstraite.
  //
  // « Aucun bruit » est du vocabulaire de design — pas de bruit VISUEL.
  // Dans un catalogue de peptides, quel bruit ? Et « chaque compose gagne
  // sa place » personnifie ce qui ne gagne rien.
  //
  // Surtout : la section REPETAIT le hero, qui annonce deja HPLC,
  // laboratoire independant et certificat par lot. La meme affirmation
  // deux fois dans le meme ecran de defilement n'ajoute pas, elle affaiblit
  // la premiere — on comprend que c'est du remplissage.
  //
  // Reste l'intitule. Les produits se lisent tout seuls.
  const featTitle = lang === "fr" ? "Composés en vedette" : "Featured compounds";
  const featAll = lang === "fr" ? "Voir tout le catalogue" : "View full catalog";
  // L'en-tete etait ecrit EN DUR en anglais : « Newsletter » s'affichait tel
  // quel sur la version francaise, sur un commerce quebecois bilingue.
  const newsEyebrow = lang === "fr" ? "INFOLETTRE" : "NEWSLETTER";
  const newsTitle = lang === "fr" ? "Sorties de lots & notes de recherche" : "Lot releases & research notes";
  // AUCUNE FREQUENCE N'EST PROMISE.
  //
  // Le texte annoncait « un courriel precis par mois ». C'est la phrase qui
  // rassure le plus — et celle qu'on regrette le plus tot : le mois ou il y a
  // trois lots a annoncer, ou le mois ou il n'y a rien, la promesse est
  // rompue. Une promesse tenue au hasard vaut moins que pas de promesse.
  //
  // « Conforme a la LCAP » est parti aussi : la case de consentement porte
  // deja toute l'obligation legale, et l'acronyme rassure un juriste, pas une
  // acheteuse.
  //
  // « rapports de lots » devient « certificats d'analyse » : c'est le mot que
  // le reste du site emploie. Deux mots pour la meme chose sur une page, c'en
  // est un de trop.
  const newsLede = lang === "fr"
    ? "Nouveaux lots, certificats d'analyse, r\u00e9assorts. D\u00e9sabonnez-vous \u00e0 tout moment."
    : "New lots, certificates of analysis, restocks. Unsubscribe at any time.";
  const newsLabel = lang === "fr" ? "Adresse courriel" : "Email address";
  const newsDone = lang === "fr" ? "Confirmé — vous êtes inscrit." : "Confirmed — you're on the list.";

  return (
    <div data-testid="home-page">
      {/* HERO — un seul moment. Regles du brief : quatre elements texte au
          plus, deux lignes de titre, sous-texte de vingt mots au plus, le
          hero tient dans le premier ecran, pas de halo deco. La carte du
          certificat porte les donnees de lot : les trois puces qui les
          dupliquaient sous les boutons disparaissent. */}
      <section className="relative bg-nordfjord text-clinical overflow-hidden texture-bruit" data-testid="hero-section">
        <MolecularMesh opacity={0.18} />
        <div className="relative max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 pt-14 lg:pt-20 pb-16 lg:pb-24 grid lg:grid-cols-[1.05fr_.95fr] gap-12 lg:gap-16 items-center lg:min-h-[82svh]">
          <div>
            <Reveal>
              <p className="font-data text-[11px] font-semibold uppercase tracking-[0.22em] text-nova mb-7">
                {heroEyebrow}
              </p>
              <h1 className="font-display font-bold leading-[0.98] tracking-[-0.035em] mb-7 text-clinical" style={{ fontSize: "clamp(40px,7.5vw,92px)", maxWidth: "12ch" }} data-testid="hero-title">
                {heroTitle.a}{" "}
                <span className="text-nova">{heroTitle.b}</span>
              </h1>
              <p className="text-base lg:text-lg text-mist max-w-[52ch] leading-relaxed mb-10">{heroLede}</p>
              <div className="flex flex-wrap items-center gap-4">
                <Link to="/catalog" data-testid="hero-cta-catalog" className="btn-pill btn-nova">{ctaPrimary}</Link>
                <Link to="/about" data-testid="hero-cta-lab" className="btn-pill btn-outline border-mist text-mist hover:border-nova hover:text-nova">{ctaSecondary}</Link>
              </div>
            </Reveal>
          </div>
          <Reveal delay={220} className="relative hidden lg:block">
            <div className="relative bg-abyss/80 border border-abyss p-8" style={{ borderRadius: "var(--r-l)" }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="font-data text-[10px] uppercase tracking-[0.22em] text-nova mb-1.5">Certificate of Analysis</p>
                  <p className="font-display text-lg font-semibold text-white">BPC-157 · 5 mg</p>
                </div>
                <NovaSpark size={26} />
              </div>
              <PurityTrace />
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-abyss font-data text-center">
                {[["LOT", "FN-26005"], ["PURITY", "99.42%"], ["EXP", "2028-06"]].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-mist mb-1">{k}</p>
                    <p className="text-sm text-nova font-semibold">{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-14 -left-16"><Seal size={120} /></div>
          </Reveal>
        </div>
      </section>

      {/* BANDE DE CONFIANCE — sous le hero, jamais dedans. Un defilement
          lent, seul mouvement de la page en dehors de l entree du hero. */}
      <section className="border-y border-ash" data-testid="trust-marquee">
        <div className="max-w-7xl mx-auto overflow-hidden py-5">
          <div style={{
            display: "flex",
            width: "max-content",
            animation: "trust-scroll 22s linear infinite",
          }}>
            {[...trustItems, ...trustItems, ...trustItems, ...trustItems, ...trustItems, ...trustItems].map((it, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "0 40px", fontSize: "12px", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#3E5C76", whiteSpace: "nowrap" }}>
                <NovaSpark size={13} /> {it}
              </span>
            ))}
          </div>
          <style>{`@keyframes trust-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
        </div>
      </section>

      {/* PRODUITS EN VEDETTE — un seul message, pas d etiquette au-dessus. */}
      <section className="py-20 lg:py-32" data-testid="featured-products">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
            <h2 className="font-display text-[36px] sm:text-[48px] font-bold text-nordfjord leading-[1.05] tracking-[-0.02em]">{featTitle}</h2>
            <Link to="/catalog" data-testid="view-all-catalog" className="btn-pill btn-outline group">
              {featAll} <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-5 lg:gap-6">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* INFOLETTRE — le libelle devient une marque de coin, le titre porte
          seul. Le bandeau sombre est une signature de la marque, pas un
          accident de page. */}
      <section className="py-20 lg:py-28" data-testid="newsletter-section">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="relative bg-nordfjord text-clinical px-8 lg:px-16 py-16 overflow-hidden" style={{ borderRadius: "var(--r-l)" }}>
            <div className="absolute -right-16 -top-16 opacity-25"><FnMark size={260} frame="#00B8D4" spark="#00B8D4" /></div>
            <p className="absolute top-8 right-8 font-data text-[10px] uppercase tracking-[0.24em] text-nova">{newsEyebrow}</p>
            <div className="relative max-w-2xl">
              <h2 className="font-display text-[32px] sm:text-[40px] font-bold text-white mb-4 tracking-[-0.02em]">{newsTitle}</h2>
              <p className="text-mist mb-9 leading-relaxed">{newsLede}</p>
              {done ? (
                <p className="inline-flex items-center gap-2.5 text-nova font-semibold"><Check size={18} /> {newsDone}</p>
              ) : (
                <form onSubmit={subscribe} className="space-y-4" data-testid="newsletter-form">
                  <div>
                    <label htmlFor="newsletter-email" className="block text-[13px] font-semibold text-white mb-2">
                      {newsLabel}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder={t("home.newsletterPlaceholder")}
                        className="flex-1 bg-clinical text-nordfjord px-5 py-3.5 outline-none text-[15px]"
                        style={{ borderRadius: "var(--r-m)" }}
                        id="newsletter-email" data-testid="newsletter-input" />
                      <button type="submit" disabled={subBusy}
                        className="btn-pill btn-nova disabled:opacity-40 disabled:pointer-events-none"
                        data-testid="newsletter-submit">{t("home.subscribe")}</button>
                    </div>
                  </div>
                  <label className="flex items-start gap-3 text-[12px] text-mist cursor-pointer select-none">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 accent-[#00B8D4] w-4 h-4" data-testid="newsletter-consent" />
                    {t("home.newsletterConsent")}
                  </label>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}