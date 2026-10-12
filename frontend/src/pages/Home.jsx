import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import ProductCard from "../components/ProductCard.jsx";
import { MolecularMesh, NovaSpark, Reveal } from "../components/brand";
import { GHK } from "../lib/certificat";
import ProductImage from "../components/ProductImage";
import { TAILLES } from "../lib/derivees";


export default function Home() {
  const { t, lang } = useLang();
  // L'ACCUEIL RENVOIE MAINTENANT VERS /lab, donc il lit le drapeau comme
  // Header.jsx. Le commentaire qui vivait ici disait le contraire, et il
  // datait d'avant le bloc de preuve : un lien y avait ete ajoute sans que
  // personne ne revienne corriger la phrase qui jurait qu'il n'y en avait pas.
  const { coaPageEnabled } = useSiteConfig();
  const [products, setProducts] = useState([]);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get("/products", { params: { featured: true } })
      // L'ACCUEIL MONTRE CE QUE L'ADMIN A MARQUE (rapport E2E #20). Une
      // coupe a quatre ignorait deux des six produits vedettes : le site
      // contredisait la configuration sans le dire. La borne a huit reste
      // par prudence — deux rangees pleines sur grand ecran — pour qu'un
      // marquage massif ne transforme pas l'accueil en catalogue.
      .then((r) => setProducts(r.data.slice(0, 8)))
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
  // E2E AU-015 : le message laissait croire que l'inscription etait deja
  // confirmee, alors que la regle est le double opt-in : la confirmation
  // arrive PAR COURRIEL.
  const newsDone = lang === "fr"
    ? "Vérifiez votre courriel pour confirmer votre inscription."
    : "Check your inbox to confirm your subscription.";

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
              sizes={TAILLES.hero}
            />
          ) : (
            <MolecularMesh opacity={0.4} />
          )}
          {/* LE VOILE, ET POURQUOI IL EST PLUS APPUYE EN BAS.
              MIREILLE, 11/10/2026 : « ici le texte n'est pas lisible ».
              Le texte est pose en BAS du hero (`justify-end`), mais le voile
              n'y montait qu'a 0,72 et restait a 0,08 au milieu : sur une
              photo claire, le blanc du texte se posait sur du presque blanc.
              Le degrade garde le haut aere — la photo du flacon doit se voir
              — et descend franchement sur le tiers bas, la ou la copie vit.
              Audit du 06/10, point 8 : « voile sous le hero ». */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(11,46,79,.40) 0%, rgba(11,46,79,.14) 30%, rgba(11,46,79,.62) 68%, rgba(11,46,79,.90) 100%)" }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 flex flex-col justify-end" style={{ minHeight: "inherit" }}>
          <div className="pt-14 lg:pt-20 pb-16 lg:pb-24">
            <Reveal>
              {/* LE CYAN DE L'ACCROCHE N'EST PAS CELUI DU TITRE, ET C'EST
                  VOULU. Nova pur (#00B8D4) sur le voile donne environ 3:1 :
                  cela suffit pour le titre, qui fait 34 px — les grandes
                  tailles demandent 3:1 — mais pas pour ces 10,5 px en
                  capitales, qui en demandent 4,5. Le cyan pale du bandeau de
                  conformite, deja employe sur fond marine, en donne 5. La
                  couleur d'accent se module donc selon la TAILLE du texte,
                  ce qui est exactement ce que la regle de contraste dit. */}
              <p className="font-data text-[10.5px] uppercase tracking-[0.26em] mb-4 sur-voile-accent">
                {heroEyebrow}
              </p>
              {/* LE TITRE ETAIT LE SEUL TEXTE SOMBRE PARMI DES TEXTES CLAIRS.
                  Sans classe de couleur, il heritait du bleu marine du corps
                  de page pendant que l'accroche, le texte et le lien second
                  etaient en blanc. Sur fond clair le titre se lisait et le
                  reste disparaissait ; sur fond sombre, l'inverse. Aucune
                  photo ne pouvait rendre les quatre lisibles ensemble. */}
              <h1 className="font-display font-medium leading-[1.2] tracking-[-0.01em] max-w-[26ch] sur-voile" style={{ fontSize: "clamp(24px,3.4vw,34px)" }} data-testid="hero-title">
                {heroTitle.a}{" "}
                <span className="text-nova">{heroTitle.b}</span>
              </h1>
              <p className="text-sm max-w-[44ch] leading-relaxed mt-3 sur-voile-doux">{heroLede}</p>
              <div className="mt-5 flex items-center gap-5">
                <Link to="/catalog" data-testid="hero-cta-catalog"
                  className="inline-block bg-white text-nordfjord text-[13px] font-medium tracking-[0.04em] px-6 py-3 hover:bg-nova hover:text-white transition-colors" style={{ borderRadius: "var(--r-m)" }}>
                  {ctaPrimary}
                </Link>
                {/* Le second geste reste, mais comme un lien discret : le hero
                    n'a qu'un bouton, le texte porte le reste. */}
                <Link to="/about" data-testid="hero-cta-lab"
                  className="text-white/90 text-[13px] hover:text-nova transition-colors">
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
            <h2 className="titre-section text-nordfjord">{featTitle}</h2>
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

      {/* LA PREUVE PART AVEC LE COLIS.
          MIREILLE, 11/10/2026 : « regarde ce site après les produits en
          vedette, est-ce qu'on peut avoir quelque chose de similaire ».
          Align pose à cet endroit un bloc « QUALITY ASSURANCE — The paperwork
          ships with it », dont la phrase dit tout : la qualité se démontre
          par l'analyse, la traçabilité et les certificats, « not implied
          outcomes or marketing language ».
          C'est exactement la position qu'elle tient depuis le début, et elle
          n'était écrite nulle part. Ce bloc ne promet rien : il ROUTE vers ce
          qui se vérifie — la page qui explique un certificat, et le
          laboratoire où l'on contrôle un lot. */}
      <section className="py-20 lg:py-28" data-testid="preuve-section">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-5 lg:gap-6 items-stretch">

            <div className="relative overflow-hidden bg-nordfjord text-clinical p-8 sm:p-10 lg:p-12 flex flex-col"
                 style={{ borderRadius: "var(--r-l)" }} data-testid="preuve-panneau">
              {/* La maille de la marque, comme sur le hero sans photo : elle
                  donne de la profondeur au panneau sans rien raconter. */}
              <MolecularMesh opacity={0.22} animated={false} />
              {/* ÉCRIT DANS SES MOTS, PAS DANS CEUX D'ALIGN.
                  La première version de ce bloc était une traduction : leur
                  « QUALITY ASSURANCE » devenait « ASSURANCE QUALITÉ », leur
                  « The paperwork ships with it » devenait « Le certificat
                  part avec le colis », et leur phrase sur « not implied
                  outcomes or marketing language » passait en français presque
                  mot pour mot.
                  MIREILLE, 11/10/2026 : « pourquoi tu as reproduit mot à mot
                  ce qui était sur la page d'Align ». Aucune bonne raison —
                  et je lui avais explique deux heures plus tôt pourquoi on ne
                  copiait pas le texte d'un autre site.
                  Ce qu'on garde d'eux est la POSITION dans la page et le
                  principe : router vers la preuve au lieu de la promettre.
                  Les mots sont les siens, et ils disent quelque chose
                  qu'eux ne disent pas — le numéro de lot, qui est ce qui
                  relie le papier au flacon. */}
              <p className="relative font-data text-[10px] uppercase tracking-[0.24em] mb-4"
                 style={{ color: "var(--sur-voile-accent)" }}>
                {lang === "fr" ? "CHAQUE LOT, SON RAPPORT" : "EVERY BATCH, ITS REPORT"}
              </p>
              <h2 className="relative font-display font-semibold leading-[1.12] tracking-[-0.01em] max-w-[20ch]"
                  style={{ fontSize: "clamp(26px,3.2vw,36px)" }}>
                {lang === "fr" ? "Un numéro sur le flacon, un rapport qui lui répond." : "A number on the vial, a report that answers to it."}
              </h2>
              <p className="relative mt-5 text-[15px] leading-relaxed max-w-[48ch]"
                 style={{ color: "var(--sur-voile-doux)" }}>
                {lang === "fr"
                  ? "Nous n'avons rien à vous dire sur ce que font ces composés. Nous avons un rapport de laboratoire par lot, le numéro de ce lot sur l'étiquette, et de quoi vérifier que les deux concordent."
                  : "We have nothing to tell you about what these compounds do. We have one laboratory report per batch, that batch number on the label, and a way to check the two match."}
              </p>
              <div className="relative mt-8 flex flex-wrap items-center gap-4">
                <Link to="/certificats" data-testid="preuve-vers-certificats"
                      className="inline-flex items-center gap-2 bg-white text-nordfjord text-[13px] font-medium tracking-[0.04em] px-6 py-3 hover:bg-nova hover:text-white transition-colors"
                      style={{ borderRadius: "var(--r-m)" }}>
                  {lang === "fr" ? "Lire un certificat" : "Read a certificate"}
                </Link>
                {/* CE LIEN NE S'AFFICHE QUE SI LA PAGE EXISTE. /lab est
                    servie derrière COA_PAGE_ENABLED, et la route renvoie à
                    l'accueil quand le drapeau est à `false` : un lien visible
                    vers une page qui ramène à celle qu'on quitte est pire
                    qu'un lien absent. */}
                {coaPageEnabled && (
                  <Link to="/lab" data-testid="preuve-vers-lab"
                        className="text-[13px] hover:text-nova transition-colors"
                        style={{ color: "var(--sur-voile-doux)" }}>
                    {lang === "fr" ? "Vérifier un lot →" : "Check a lot →"}
                  </Link>
                )}
              </div>
            </div>

            {/* L'IMAGE QUI MANQUAIT ÉTAIT SOUS MON NEZ : LE CERTIFICAT.
                MIREILLE, 11/10/2026 : « pourquoi le design est simpliste.
                zéro image, zéro beauté, rien qu'un bloc ». Le panneau de
                droite était une liste à puces dans un cadre blanc.
                Elle a raison, et la réponse n'était pas d'aller chercher une
                photo : le document EST l'objet dont le bloc parle. Deux
                feuilles empilées, légèrement décalées — une par lot —, avec
                les vrais chiffres du lot FN-OLW8W et sa trace
                chromatographique. Rien n'est inventé, rien n'est promis, et
                l'objet se regarde.
                `aria-hidden` : les mêmes chiffres se lisent en toutes lettres
                sur /certificats, et une feuille décorative n'a pas à être
                épelée par un lecteur d'écran. */}
            <div className="relative flex items-center justify-center py-6 lg:py-0"
                 data-testid="preuve-certificat" aria-hidden="true">

              <div className="absolute w-[82%] max-w-[300px] h-[86%] bg-white border border-ash"
                   style={{ borderRadius: "var(--r-m)", transform: "rotate(-5deg) translate(-10px, 8px)", opacity: 0.55 }} />
              <div className="absolute w-[84%] max-w-[310px] h-[90%] bg-white border border-ash"
                   style={{ borderRadius: "var(--r-m)", transform: "rotate(-2.5deg) translate(-4px, 4px)", opacity: 0.8 }} />

              <div className="relative w-[88%] max-w-[324px] bg-white border border-ash overflow-hidden"
                   style={{ borderRadius: "var(--r-m)", boxShadow: "var(--ombre)" }}>
                <div className="bg-nordfjord px-4 py-3 flex items-center justify-between gap-3">
                  <span className="font-data text-[8.5px] uppercase tracking-[0.2em] text-clinical/80">
                    {lang === "fr" ? "Certificat d'analyse" : "Certificate of analysis"}
                  </span>
                  <NovaSpark size={11} />
                </div>

                <div className="px-4 pt-4 pb-1">
                  <div className="font-data text-[8.5px] uppercase tracking-[0.18em] text-compliance">
                    {lang === "fr" ? "Numéro de lot" : "Lot number"}
                  </div>
                  <div className="font-display text-[22px] font-bold text-nordfjord tracking-[-0.01em] leading-none mt-1">
                    {GHK.lot}
                  </div>
                </div>

                <svg viewBox="0 0 300 58" className="w-full h-auto px-4 mt-3" aria-hidden="true">
                  <line x1="2" y1="50" x2="298" y2="50" stroke="currentColor" strokeWidth="0.5" className="text-ash" />
                  <path d="M2 50 L46 49 L54 8 L62 49 L140 48 L152 39 L162 48 L240 47 L254 42 L264 47 L298 46"
                        fill="none" stroke="currentColor" strokeWidth="1.2" className="text-nova-texte" />
                  <path d="M46 49 L54 8 L62 49 Z" fill="currentColor" className="text-nova" opacity="0.22" />
                </svg>

                <dl className="px-4 pb-4 pt-2">
                  {[
                    [lang === "fr" ? "Pureté" : "Purity", lang === "fr" ? GHK.purete.res.fr : GHK.purete.res.en],
                    [lang === "fr" ? "Teneur nette" : "Net content", lang === "fr" ? GHK.teneur.res.fr : GHK.teneur.res.en],
                    [lang === "fr" ? "Identité" : "Identity", lang === "fr" ? "Confirmée" : "Confirmed"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 py-1.5 border-b border-ash last:border-0">
                      <dt className="font-data text-[9px] uppercase tracking-[0.14em] text-glacier">{k}</dt>
                      <dd className="font-data text-[11px] text-nordfjord">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* INFOLETTRE : section claire a filet : une page, un theme. Le
          bandeau sombre isole etait une rupture de theme que le skill
          interdit ; le contenu, lui, ne change pas. */}
      <section className="py-20 lg:py-28 border-t border-ash" data-testid="newsletter-section">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          {/* POURQUOI CE BLOC PARAISSAIT COLLÉ À GAUCHE.
              MIREILLE, 11/10/2026 : « tout ce qui est du côté gauche de la
              page n'a pas été modifié ».
              Mesuré sur un écran de 1920 : le bloc faisait 672 px dans un
              conteneur de 1280. 576 px de vide à sa droite — plus de place
              perdue que de place occupée. Et ce n'était pas un paragraphe
              qu'on laisse respirer, c'était un FORMULAIRE : une boîte de
              saisie posée dans le coin supérieur gauche d'une bande vide se
              lit comme une page inachevée.
              Le texte et le formulaire sont désormais deux colonnes qui
              remplissent la bande. Rien n'est retiré. */}
          <div className="grid lg:grid-cols-[1fr_minmax(0,34rem)] gap-8 lg:gap-16 items-center" data-testid="newsletter-grille">
            <div>
            <p className="font-data text-[10px] uppercase tracking-[0.24em] text-nova-texte mb-2">{newsEyebrow}</p>
            <h2 className="titre-section text-nordfjord mb-3">{newsTitle}</h2>
            <p className="text-glacier text-[14px] max-w-[52ch]">{newsLede}</p>
            </div>
            <div>
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
                {/* LA CASE DE CONSENTEMENT : 18 PX, ET LA LIGNE ENTIÈRE RESTE
                    CLIQUABLE.
                    Elle faisait 16 px, puis je l'ai portée à 24 pour tenir la
                    cible tactile de l'audit. MIREILLE, 11/10/2026 : « la case
                    à cocher de l'infolettre est trop grosse ». Elle a raison :
                    à 24 px, la case pesait plus lourd que la phrase de
                    consentement qu'elle accompagne — un contrôle secondaire
                    qui crie plus fort que son propre libellé.
                    La cible tactile n'est pas perdue pour autant : le
                    `<label>` englobe la case ET le texte, donc toute la
                    rangée reste cliquable sur sa largeur. C'est le texte qui
                    porte la surface, pas la case. */}
                <label className="flex items-center gap-3 py-2 text-[12px] text-glacier cursor-pointer select-none">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                    className="shrink-0 accent-[#00B8D4] w-[18px] h-[18px]" data-testid="newsletter-consent" />
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