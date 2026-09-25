import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import ProductCard from "../components/ProductCard.jsx";
import { MolecularMesh, NovaSpark, Reveal } from "../components/brand";
import ProductImage from "../components/ProductImage";


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
  // GRAPHIQUE : la palette s'appelle nordfjord, glacier, nova : et il
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
  // « 01 : » numerotait une liste d'UN SEUL element : il n'y avait ni 02
  // ni 03. De la structure decorative, qui imite un sommaire sans en etre
  // un.
  //
  // « Une purete documentee » ne titrait pas ce qu'il surplombait : une
  // GRILLE DE PRODUITS. Quelqu'un qui balaie la page veut savoir ce qu'il
  // regarde, et lisait une qualite abstraite.
  //
  // « Aucun bruit » est du vocabulaire de design : pas de bruit VISUEL.
  // Dans un catalogue de peptides, quel bruit ? Et « chaque compose gagne
  // sa place » personnifie ce qui ne gagne rien.
  //
  // Surtout : la section REPETAIT le hero, qui annonce deja HPLC,
  // laboratoire independant et certificat par lot. La meme affirmation
  // deux fois dans le meme ecran de defilement n'ajoute pas, elle affaiblit
  // la premiere : on comprend que c'est du remplissage.
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
  // rassure le plus : et celle qu'on regrette le plus tot : le mois ou il y a
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
  const newsDone = lang === "fr" ? "Confirmé : vous êtes inscrit." : "Confirmed : you're on the list.";

  return (
    <div data-testid="home-page">
      {/* HERO : « image d'abord » : la photo du produit vedette porte la
          page, le texte est pose dessus, discret. Sans image disponible, la
          maille moleculaire de la marque prend le relais. */}
      <section className="relative overflow-hidden texture-bruit" data-testid="hero-section" style={{ minHeight: "min(78vh, 640px)" }}>
        <div className="absolute inset-0">
          {products[0] ? (
            <ProductImage
              src={products[0].image_url}
              slug={products[0].slug}
              alt={products[0].name_fr || "FIRONOVA"}
              className="w-full h-full"
              imgClassName="w-full h-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
          ) : (
            <MolecularMesh opacity={0.4} />
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(11,46,79,.38) 0%, rgba(11,46,79,.08) 45%, rgba(11,46,79,.72) 100%)" }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 flex flex-col justify-end" style={{ minHeight: "inherit" }}>
          <div className="pt-14 lg:pt-20 pb-16 lg:pb-24">
            <Reveal>
              <p className="font-data text-[10.5px] uppercase tracking-[0.26em] text-nova mb-4">
                {heroEyebrow}
              </p>
              <h1 className="font-display font-medium leading-[1.2] tracking-[-0.01em] max-w-[26ch]" style={{ fontSize: "clamp(24px,3.4vw,34px)", color: "#F7FAFC" }} data-testid="hero-title">
                {heroTitle.a}{" "}
                <span className="text-nova">{heroTitle.b}</span>
              </h1>
              <p className="text-sm max-w-[44ch] leading-relaxed mt-3" style={{ color: "rgba(247,250,252,.8)" }}>{heroLede}</p>
              <div className="mt-5 flex items-center gap-5">
                <Link to="/catalog" data-testid="hero-cta-catalog"
                  className="inline-block bg-white text-nordfjord text-[13px] font-medium tracking-[0.04em] px-6 py-3 hover:bg-nova hover:text-white transition-colors" style={{ borderRadius: "var(--r-m)" }}>
                  {ctaPrimary}
                </Link>
                {/* Le second geste reste, mais comme un lien discret : le hero
                    n'a qu'un bouton, le texte porte le reste. */}
                <Link to="/about" data-testid="hero-cta-lab"
                  className="text-white/70 text-[13px] hover:text-nova transition-colors">
                  {ctaSecondary}
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* BANDE DE CONFIANCE : statique, chaque affirmation une fois. Le
          defilement perpetuel de 24 items violait WCAG 2.2.2 (mouvement non
          controlable) et le monde (un seul geste de mouvement par page). */}
      <section className="border-y border-ash" data-testid="trust-marquee">
        <div className="max-w-7xl mx-auto py-4 flex flex-wrap gap-x-10 gap-y-2">
          {trustItems.map((it, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--glacier)", whiteSpace: "nowrap" }}>
              <NovaSpark size={13} /> {it}
            </span>
          ))}
        </div>
      </section>

      {/* PRODUITS EN VEDETTE : un seul message, pas d etiquette au-dessus. */}
      <section className="py-20 lg:py-32" data-testid="featured-products">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6 mb-12">
            <h2 className="font-display text-[22px] sm:text-[26px] font-semibold text-nordfjord leading-[1.1] tracking-[-0.01em]">{featTitle}</h2>
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

      {/* INFOLETTRE : section claire a filet : une page, un theme. Le
          bandeau sombre isole etait une rupture de theme que le skill
          interdit ; le contenu, lui, ne change pas. */}
      <section className="py-20 lg:py-28 border-t border-ash" data-testid="newsletter-section">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="relative max-w-2xl">
            <p className="absolute top-0 right-0 font-data text-[10px] uppercase tracking-[0.24em] text-nova-texte">{newsEyebrow}</p>
            <h2 className="font-display text-[22px] sm:text-[26px] font-semibold text-nordfjord mb-3 tracking-[-0.01em]">{newsTitle}</h2>
            <p className="text-glacier text-[14px] mb-8 max-w-[52ch]">{newsLede}</p>
            {done ? (
              <p className="inline-flex items-center gap-2.5 text-nova-texte font-semibold"><Check size={18} /> {newsDone}</p>
            ) : (
              <form onSubmit={subscribe} className="space-y-4" data-testid="newsletter-form">
                <div>
                  <label htmlFor="newsletter-email" className="block text-[13px] font-semibold text-nordfjord mb-2">
                    {newsLabel}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("home.newsletterPlaceholder")}
                      className="flex-1 bg-white border border-ash text-nordfjord px-5 py-3 outline-none text-[15px]"
                      style={{ borderRadius: "var(--r-m)" }}
                      id="newsletter-email" data-testid="newsletter-input" />
                    <button type="submit" disabled={subBusy}
                      className="btn-pill btn-nova disabled:opacity-40 disabled:pointer-events-none"
                      data-testid="newsletter-submit">{t("home.subscribe")}</button>
                  </div>
                </div>
                <label className="flex items-start gap-3 text-[12px] text-glacier cursor-pointer select-none">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 accent-[#00B8D4] w-4 h-4" data-testid="newsletter-consent" />
                  {t("home.newsletterConsent")}
                </label>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}