import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, FileCheck2, FlaskConical, MapPin, Mail } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import ProductCard from "../components/ProductCard.jsx";
import { NovaSpark } from "../components/brand";

export default function Home() {
  const { t, lang } = useLang();
  const fr = lang === "fr";
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    api.get("/products", { params: { featured: true } })
      .then((r) => { if (!cancelled) setProducts(Array.isArray(r.data) ? r.data.slice(0, 4) : []); })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [retry]);

  const subscribe = async (e) => {
    e.preventDefault();
    if (!consent) { toast.error(t("home.newsletterConsentRequired")); return; }
    setSubBusy(true);
    try {
      const { data } = await api.post("/newsletter/subscribe", { email: email.trim(), consent, lang, source: "home" });
      setDone(data.already_subscribed ? "already" : data.confirmation_required ? "pending" : "confirmed");
      setEmail("");
      setConsent(false);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || t("home.newsletterError"));
    } finally { setSubBusy(false); }
  };
  const principles = [
    { icon: FileCheck2, title: fr ? "Documentation par lot" : "Lot-specific documentation", detail: fr ? "Consultez les certificats disponibles" : "Explore available certificates" },
    { icon: MapPin, title: fr ? "Établi au Canada" : "Based in Canada", detail: fr ? "En français et en anglais" : "A store in English and French" },
    { icon: FlaskConical, title: fr ? "Pour la recherche" : "Made for research", detail: fr ? "Des spécifications claires et accessibles" : "Clear, accessible compound specifications" },
  ];
  return (
    <div data-testid="home-page" className="fn-home">
      <section className="fn-hero fn-container" data-testid="hero-section">
        <div className="fn-hero-copy">
          <p className="fn-kicker"><span className="fn-status-dot" />{fr ? "PEPTIDES DE RECHERCHE CANADIENS" : "CANADIAN RESEARCH PEPTIDES"}</p>
          <h1 data-testid="hero-title">{fr ? "La précision pour" : "Precision for"}<br /><span>{fr ? "votre recherche." : "your research."}</span></h1>
          <p className="fn-hero-description">{fr ? "Des peptides de recherche, des spécifications précises et une documentation par lot. Trouvez le composé adapté à votre prochain projet." : "Research peptides, clear specifications, and lot-specific documentation. Find the right compound for your next project."}</p>
          <div className="fn-hero-actions">
            <Link to="/catalog" data-testid="hero-cta-catalog" className="fn-button fn-button-dark">{fr ? "Explorer le catalogue" : "Explore the catalog"}<ArrowUpRight size={19} aria-hidden="true" /></Link>
            <Link to="/about" data-testid="hero-cta-lab" className="fn-text-link">{fr ? "Nos standards" : "Our standards"}<ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
          <div className="fn-hero-footnote"><span>RUO</span><p>{fr ? "Usage recherche uniquement. Aucune utilisation humaine ou vétérinaire." : "For research use only. Not for human or veterinary use."}</p></div>
        </div>
        <div className="fn-hero-visual">
          <img src="/images/research-vials.webp" width="1122" height="1402" fetchPriority="high" alt={fr ? "Flacons de laboratoire en verre transparent dans une lumière bleue" : "Clear laboratory glass vials in cool blue light"} />
          <div className="fn-visual-top"><span>FIRONOVA / {fr ? "RECHERCHE" : "RESEARCH"}</span><NovaSpark size={28} /></div>
          <div className="fn-visual-bottom"><span>{fr ? "La clarté, à chaque étape." : "Clarity, at every step."}</span><span className="fn-visual-index">01 / FN</span></div>
        </div>
      </section>
      <section className="fn-principles fn-container" data-testid="trust-marquee" aria-label={fr ? "Nos principes" : "Our principles"}>
        {principles.map(({ icon: Icon, title, detail }) => <div className="fn-principle" key={title}><Icon size={25} strokeWidth={1.4} aria-hidden="true" /><div><h2>{title}</h2><p>{detail}</p></div></div>)}
      </section>
      <section className="fn-featured fn-container" data-testid="featured-products">
        <div className="fn-section-heading"><div><p className="fn-kicker">01 — {fr ? "LA SÉLECTION FIRONOVA" : "THE FIRONOVA SELECTION"}</p><h2>{fr ? "Au cœur de votre recherche." : "Your next starting point."}</h2></div><Link to="/catalog" data-testid="view-all-catalog" className="fn-text-link">{fr ? "Tout le catalogue" : "View all compounds"}<ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        {loading ? <div className="fn-product-grid" aria-busy="true" aria-label={fr ? "Chargement des composés" : "Loading compounds"} data-testid="featured-loading">{Array.from({ length: 4 }, (_, i) => <div key={i} className="fn-product-skeleton"><div /><span /><span /></div>)}</div>
          : loadError ? <div className="fn-empty" role="status" data-testid="featured-error"><p>{fr ? "Les composés ne peuvent pas être chargés pour le moment." : "We couldn’t load the compounds right now."}</p><button type="button" onClick={() => setRetry((n) => n + 1)} data-testid="featured-retry" className="fn-text-link">{fr ? "Réessayer" : "Try again"}<ArrowRight size={16} /></button></div>
          : products.length ? <div className="fn-product-grid">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>
          : <div className="fn-empty" data-testid="featured-empty"><p>{fr ? "Découvrez les composés disponibles dans notre catalogue." : "Explore the catalog for currently available compounds."}</p><Link to="/catalog" className="fn-text-link" data-testid="featured-empty-catalog">{fr ? "Voir le catalogue" : "Browse the catalog"}<ArrowRight size={16} /></Link></div>}
      </section>
      <section className="fn-newsletter fn-container" data-testid="newsletter-section">
        <div className="fn-newsletter-copy"><p className="fn-kicker">02 — {fr ? "RESTEZ INFORMÉ" : "STAY IN THE LOOP"}</p><h2>{fr ? "La suite de la recherche. Dans votre boîte courriel." : "What’s next in research. In your inbox."}</h2><p>{fr ? "Nouveaux lots, rapports et réassorts. Désabonnez-vous à tout moment." : "New lots, lot reports, and restocks. Unsubscribe at any time."}</p></div>
        <div className="fn-newsletter-form-wrap">{done ? <div className="fn-newsletter-success" role="status" data-testid="newsletter-success">{done === "pending" ? <Mail size={27} /> : <Check size={27} />}<h3>{done === "pending" ? (fr ? "Vérifiez votre boîte courriel." : "Check your inbox.") : (fr ? "Vous êtes inscrit." : "You’re on the list.")}</h3><p>{done === "pending" ? (fr ? "Cliquez sur le lien dans notre courriel pour confirmer votre inscription." : "Follow the link in our email to confirm your subscription.") : done === "already" ? t("home.newsletterAlready") : t("home.newsletterOk")}</p></div> : <form onSubmit={subscribe} data-testid="newsletter-form">
          <label htmlFor="newsletter-email" className="fn-input-label">{fr ? "Adresse courriel" : "Email address"}</label><div className="fn-newsletter-field"><input id="newsletter-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={fr ? "vous@laboratoire.ca" : "you@laboratory.ca"} data-testid="newsletter-input" /><button type="submit" disabled={subBusy} data-testid="newsletter-submit" className="fn-button fn-button-cyan">{subBusy ? (fr ? "Envoi…" : "Submitting…") : t("home.subscribe")}<ArrowRight size={18} aria-hidden="true" /></button></div>
          <label className="fn-consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="newsletter-consent" /> <span>{t("home.newsletterConsent")}</span></label>
        </form>}</div>
      </section>
    </div>
  );
}
