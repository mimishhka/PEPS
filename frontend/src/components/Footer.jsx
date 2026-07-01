import { Link, useNavigate } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";

export default function Footer() {
  const { t } = useLang();
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const adminBypass = async () => {
    // If already admin, just go.
    if (user?.role === "admin") {
      navigate("/admin");
      return;
    }
    // Hidden admin entry — auto-login with seeded credentials (defined in backend/.env).
    const res = await login("admin@nordpep.ca", "NordpepAdmin2026!");
    if (res.ok) navigate("/admin");
  };

  return (
    <footer className="border-t border-ink mt-32" data-testid="footer">
      <div className="bg-ink text-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
          <p className="font-display text-2xl sm:text-4xl font-extrabold uppercase tracking-tight leading-[1.05]" data-testid="footer-disclaimer">
            FOR LABORATORY RESEARCH USE ONLY · NOT FOR HUMAN OR VETERINARY CONSUMPTION · 19+ ONLY
          </p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white/60 max-w-3xl">
            By accessing this website you confirm you are a qualified researcher and assume full responsibility for the proper handling, storage, and disposal of these compounds in accordance with all applicable provincial and federal regulations.
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2">
          <div className="font-display font-extrabold text-xl">NORDPEP<span style={{ color: "#E51919" }}>.</span></div>
          <p className="mt-4 text-sm text-foreground/70 max-w-sm">{t("footer.tagline")}</p>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] mb-4 text-foreground/50">{t("footer.shop")}</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/catalog" className="link-underline">{t("nav.catalog")}</Link></li>
            <li><Link to="/catalog?cat=healing" className="link-underline">{t("categories.healing")}</Link></li>
            <li><Link to="/catalog?cat=weight-loss" className="link-underline">{t("categories.weight-loss")}</Link></li>
            <li><Link to="/catalog?cat=cognitive" className="link-underline">{t("categories.cognitive")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] mb-4 text-foreground/50">{t("footer.legal")}</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/compliance" className="link-underline">{t("footer.terms")}</Link></li>
            <li><Link to="/privacy" className="link-underline">{t("footer.privacy")}</Link></li>
            <li><Link to="/compliance#shipping" className="link-underline">{t("footer.shipping")}</Link></li>
            <li><Link to="/compliance#faq" className="link-underline">{t("footer.faq")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink/15">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60">
            © {new Date().getFullYear()} NORDPEP · {t("footer.rights")}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/60 flex items-center gap-2">
            CAD · Canada ·
            <button
              onClick={adminBypass}
              aria-label="•"
              title=""
              data-testid="hidden-admin-trigger"
              className="inline-block w-2 h-2 bg-foreground/30 hover:bg-signal transition-colors"
              style={{ background: undefined }}
            />
            BIO-RX-CA-2026
          </p>
        </div>
      </div>
    </footer>
  );
}
