import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { ShoppingBag, User, Menu, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import { FnMark, Wordmark } from "./brand";

export default function Header() {
  const { lang, toggle, t } = useLang();
  const { user, logout } = useAuth();
  const { count, setOpen } = useCart();
  const { coaPageEnabled } = useSiteConfig();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuNav, setMenuNav] = useState(null);
  const menuButton = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const fr = lang === "fr";
  const ADMIN_PATH = "/ops-portal-fn7k2q";
  const enterAdmin = () => navigate(user?.role === "admin" ? ADMIN_PATH : "/login?next=" + encodeURIComponent(ADMIN_PATH));
  const loginHref = "/login?next=" + encodeURIComponent(location.pathname + (location.search || "") + (location.hash || ""));

  useEffect(() => {
    let cancelled = false;
    api.get("/menus", { params: { location: "header" } })
      .then((r) => { if (!cancelled) setMenuNav(Array.isArray(r.data) ? r.data[0]?.items || [] : []); })
      .catch(() => { if (!cancelled) setMenuNav([]); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const close = (e) => { if (e.key === "Escape") { setMobileOpen(false); menuButton.current?.focus(); } };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobileOpen]);

  const fallbackNav = [{ to: "/catalog", label: t("nav.catalog") }, ...(coaPageEnabled ? [{ to: "/lab", label: t("nav.lab") }] : []), { to: "/about", label: t("nav.about") }];
  const navItems = menuNav?.length ? menuNav.filter((it) => it.url !== "/lab" || coaPageEnabled).map((it) => ({ to: it.url, label: fr ? it.label_fr : it.label_en, newTab: it.open_new_tab })) : fallbackNav;
  const renderNav = (n, mobile = false) => n.newTab || /^https?:/.test(n.to)
    ? <a key={n.to} href={n.to} target={n.newTab ? "_blank" : undefined} rel={n.newTab ? "noopener noreferrer" : undefined} onClick={() => setMobileOpen(false)} className="fn-nav-link" data-testid={(mobile ? "mobile-" : "") + "nav-link-" + n.to.slice(1)}>{n.label}</a>
    : <NavLink key={n.to} to={n.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => "fn-nav-link" + (isActive ? " is-active" : "")} data-testid={(mobile ? "mobile-" : "") + "nav-link-" + n.to.slice(1)}>{n.label}</NavLink>;

  return <>
    <a href="#main-content" className="fn-skip-link" data-testid="skip-to-content">{fr ? "Aller au contenu" : "Skip to content"}</a>
    <div className="fn-compliance-band"><span data-testid="header-compliance-band">{t("footer.compliance")}</span></div>
    <header className="fn-header">
      <div className="fn-header-inner fn-container">
        <Link to="/" data-testid="header-logo" className="fn-logo" aria-label={fr ? "FIRONOVA — Accueil" : "FIRONOVA — Home"}><FnMark size={32} frame="currentColor" spark="#00B8D4" /><Wordmark size={20} color="currentColor" /></Link>
        <nav className="fn-desktop-nav" aria-label={fr ? "Navigation principale" : "Main navigation"}>{navItems.map((n) => renderNav(n))}</nav>
        <div className="fn-header-actions">
          <button data-testid="admin-quick-access" onClick={enterAdmin} className="fn-ops" aria-label={fr ? "Portail des opérations" : "Operations portal"}>OPS</button>
          <button data-testid="lang-toggle" onClick={toggle} className="fn-language" aria-label={fr ? "Passer à l’anglais" : "Switch to French"}><span className={fr ? "selected" : ""} data-testid="lang-fr">FR</span><span aria-hidden="true">/</span><span className={!fr ? "selected" : ""} data-testid="lang-en">EN</span></button>
          <div className="fn-account-actions"><Link to={user ? "/account" : loginHref} data-testid={user ? "nav-account" : "nav-login"} className="fn-icon-button" aria-label={t(user ? "nav.account" : "nav.login")}><User size={19} strokeWidth={1.5} /></Link>{user && <button onClick={logout} data-testid="nav-logout" className="fn-logout">{t("nav.logout")}</button>}</div>
          <button data-testid="cart-button" onClick={() => setOpen(true)} className="fn-icon-button" aria-label={t("nav.cart") + " (" + count + ")"}><ShoppingBag size={20} strokeWidth={1.5} /><span className="fn-cart-count" data-testid={count > 0 ? "cart-count-badge" : undefined}>{count}</span></button>
          <button ref={menuButton} className="fn-icon-button fn-mobile-toggle" data-testid="mobile-menu-toggle" onClick={() => setMobileOpen((v) => !v)} aria-label={mobileOpen ? (fr ? "Fermer le menu" : "Close menu") : (fr ? "Ouvrir le menu" : "Open menu")} aria-expanded={mobileOpen} aria-controls="mobile-navigation">{mobileOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </div>
      {mobileOpen && <div id="mobile-navigation" className="fn-mobile-menu fn-container" data-testid="mobile-menu"><nav aria-label={fr ? "Navigation mobile" : "Mobile navigation"}>{navItems.map((n) => renderNav(n, true))}<Link to={user ? "/account" : loginHref} onClick={() => setMobileOpen(false)} data-testid="mobile-account-link">{t(user ? "nav.account" : "nav.login")}</Link>{user && <button onClick={() => { logout(); setMobileOpen(false); }} data-testid="mobile-logout">{t("nav.logout")}</button>}<button onClick={() => { setMobileOpen(false); enterAdmin(); }} data-testid="admin-quick-access-mobile">OPS</button></nav></div>}
    </header>
  </>;
}
