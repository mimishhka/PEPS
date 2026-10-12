import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import ProductCard from "../components/ProductCard.jsx";
import { MolecularMesh, NovaSpark, Reveal } from "../components/brand";
import { RET } from "../lib/certificat";
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
              <p className="etiquette mb-4 sur-voile-accent">
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

      {/* DEUX OBJETS RÉELS, UN SEUL NUMÉRO.
          MIREILLE, 12/10/2026 : « le design laisse à désirer, je crois que ça
          prend de vraies images et autre chose ».

          Elle a raison, et sa propre DESIGN.md le disait déjà : « la
          photographie porte la page, le texte murmure », et « sans photo
          disponible, le repli est la maille moléculaire de la marque, JAMAIS
          un bloc de texte décoré ». La version précédente était exactement ce
          bloc décoré — une feuille de certificat DESSINÉE en HTML, avec un
          chromatogramme inventé au tracé.

          LES VRAIES PIÈCES ÉTAIENT DANS SES PDF DEPUIS LE DÉBUT : une
          photographie de sa fiole prise par le laboratoire, étiquette
          holographique et numéro de lot imprimé, et le corps du rapport
          lui-même. Elles sortent maintenant par
          `scripts/certificats_exemples.py`.

          CE QUE LA SECTION AFFIRME TIENT EN UNE LIGNE, et les deux images la
          prouvent sans qu'on ait à y croire : « FN-ELBCJ » est lisible sur
          l'étiquette ET dans le rapport. Aucun effet, aucune promesse —
          le lecteur compare deux chaînes de caractères.

          Le panneau marine a disparu avec la feuille dessinée : DESIGN.md
          demande « un filet plutôt qu'une carte chaque fois que c'est
          possible », et l'étiquette au-dessus du titre est partie avec lui —
          le plancher de qualité l'interdit sans exception. */}
      <section className="border-y border-ash py-20 lg:py-28" data-testid="preuve-section">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          {/* PROPORTIONS MESURÉES, PAS DEVINÉES. Un premier jet donnait `30ch`
              à la colonne de texte : elle rendait 195 px sur un écran de
              1280, et le titre se cassait en trois lignes courtes. À 1 fr
              contre 2 fr elle fait 384 px — la mesure de lecture du corps —
              et le document garde 475 px, soit 0,6 de son échelle native.
              `items-center` et non `items-end` : la figure fait trois fois la
              hauteur du texte, et l'aligner par le bas laissait 480 px de
              vide au-dessus. */}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_2fr] gap-10 lg:gap-16 items-center">

            <div>
              <h2 className="titre-section text-nordfjord max-w-[24ch]">
                {lang === "fr"
                  ? "Le même numéro, sur le flacon et dans le rapport."
                  : "The same number, on the vial and in the report."}
              </h2>
              <p className="mt-5 text-[15px] leading-relaxed text-glacier max-w-[46ch]">
                {lang === "fr"
                  ? "Chaque lot part avec son analyse. Nous ne disons rien de ce que font ces composés : nous montrons ce que le laboratoire a mesuré, et vous pouvez le lire ligne par ligne."
                  : "Every batch ships with its analysis. We say nothing about what these compounds do: we show what the laboratory measured, and you can read it line by line."}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link to="/certificats" data-testid="preuve-vers-certificats"
                      className="text-[14px] font-medium text-nordfjord border-b border-nova pb-0.5 hover:text-nova-texte transition-colors">
                  {lang === "fr" ? "Comment lire un certificat" : "How to read a certificate"}
                </Link>
                <a href={RET.pieces.pdf} download data-testid="preuve-vers-pdf"
                   className="text-[14px] text-glacier hover:text-nordfjord transition-colors">
                  {lang === "fr" ? "Le rapport de ce lot (PDF)" : "This batch's report (PDF)"}
                </a>
                {/* CE LIEN N'APPARAÎT QUE SI LA PAGE EXISTE. /lab est servie
                    derrière COA_PAGE_ENABLED, et la route renvoie à l'accueil
                    quand le drapeau est à `false` : un lien visible vers une
                    page qui ramène à celle qu'on quitte est pire qu'un lien
                    absent. */}
                {coaPageEnabled && (
                  <Link to="/lab" data-testid="preuve-vers-lab"
                        className="text-[14px] text-glacier hover:text-nordfjord transition-colors">
                    {lang === "fr" ? "Vérifier un lot" : "Check a batch"}
                  </Link>
                )}
              </div>
            </div>

            {/* LES DEUX PIÈCES, CÔTE À CÔTE ET À LA MÊME BASE.
                Rien n'est dessiné ici : la photographie vient du laboratoire,
                la bande de rapport est une découpe CONTINUE du PDF. Deux
                fragments recollés feraient un montage ; une bande continue
                reste une page.
                L'EXTRAIT LARGE NE DESCEND PAS SOUS `lg`. À 340 px il
                tomberait à 0,4 de son échelle et son texte à sept pixels — un
                document illisible n'est pas une preuve, c'est une texture. La
                version resserrée sur la colonne du numéro prend le relais.
                ET ELLE EST PLAFONNÉE À SA TAILLE RÉELLE : étirée à 537 px
                depuis 392 natifs, elle devenait floue ET son texte passait
                au-dessus des titres de la page. Un document agrandi cesse
                d'être un document. */}
            <figure className="m-0" data-testid="preuve-objets">
              <div className="flex flex-col sm:flex-row sm:items-end gap-6 sm:gap-7 lg:gap-9">
                <img
                  src={RET.pieces.fiole}
                  width="375"
                  height="500"
                  loading="lazy"
                  decoding="async"
                  className="w-[56%] max-w-[210px] sm:w-[34%] sm:max-w-[240px] lg:max-w-[260px] h-auto shrink-0"
                  alt={lang === "fr"
                    ? `Fiole de ${RET.compose} photographiée par le laboratoire : étiquette FIRONOVA, numéro de lot ${RET.lot} imprimé au bas de l'étiquette.`
                    : `Vial of ${RET.compose} photographed by the laboratory: FIRONOVA label, batch number ${RET.lot} printed at the foot of the label.`}
                />
                <img
                  src={RET.pieces.extrait}
                  width="830"
                  height="700"
                  loading="lazy"
                  decoding="async"
                  className="hidden lg:block w-full h-auto border border-ash"
                  alt={lang === "fr"
                    ? `Extrait du certificat d'analyse ${RET.rapport} : identification de l'échantillon, numéro de lot ${RET.lot}, et tableau des résultats mesurés.`
                    : `Extract from certificate of analysis ${RET.rapport}: sample identification, batch number ${RET.lot}, and the table of measured results.`}
                />
                <img
                  src={RET.pieces.lotEtroit}
                  width="392"
                  height="272"
                  loading="lazy"
                  decoding="async"
                  className="lg:hidden w-full max-w-[392px] h-auto border border-ash"
                  alt={lang === "fr"
                    ? `Extrait du certificat d'analyse ${RET.rapport} : identification de l'échantillon et numéro de lot ${RET.lot}.`
                    : `Extract from certificate of analysis ${RET.rapport}: sample identification and batch number ${RET.lot}.`}
                />
              </div>
              <figcaption className="etiquette text-compliance mt-5">
                {RET.compose} · {lang === "fr" ? "lot" : "batch"} {RET.lot} · {RET.rapport} · SideChain Analytics
              </figcaption>
            </figure>

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
            <p className="etiquette text-nova-texte mb-2">{newsEyebrow}</p>
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