import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { ShoppingBag, User, Menu, X, Lock } from "lucide-react";
import { useState, useEffect } from "react";
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
  const navigate = useNavigate();
  const location = useLocation();

  // NOTE: keep in sync with ADMIN_PATH in App.js
  const ADMIN_PATH = "/ops-portal-fn7k2q";

  const enterAdmin = async () => {
    if (user?.role === "admin") {
      navigate(ADMIN_PATH);
      return;
    }
    navigate(`/login?next=${encodeURIComponent(ADMIN_PATH)}`);
  };

  const fallbackNav = [
    { to: "/catalog", label: t("nav.catalog") },
    ...(coaPageEnabled ? [{ to: "/lab", label: t("nav.lab") }] : []),
    { to: "/about", label: t("nav.about") },
  ];

  const loginHref = `/login?next=${encodeURIComponent(`${location.pathname}${location.search || ""}${location.hash || ""}`)}`;

  const [menuNav, setMenuNav] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.get("/menus", { params: { location: "header" } })
      .then((r) => {
        if (cancelled) return;
        const menu = Array.isArray(r.data) ? r.data[0] : null;
        setMenuNav(menu?.items?.length ? menu.items : []);
      })
      .catch(() => { if (!cancelled) setMenuNav([]); });
    return () => { cancelled = true; };
  }, []);

  const navItems =
    menuNav && menuNav.length
      ? menuNav
          .filter((it) => (it.url === "/lab" ? coaPageEnabled : true))
          .map((it) => ({
            to: it.url,
            label: lang === "fr" ? it.label_fr : it.label_en,
            newTab: it.open_new_tab,
          }))
      : fallbackNav;

  return (
    <>
      {/* Le fond `bg-nordfjord` s'inverse la nuit et devient clair. Le cyan
          pâle écrit dessus, parfait sur bleu marine, disparaissait alors sur
          fond blanc. La nuit, le texte passe donc à l'encre sombre — c'est la
          paire fond/texte qui porte le contraste, pas la valeur. */}
      <div className="bg-nordfjord text-center py-2 px-4 font-data text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9FD9E8] dark:text-clinical">
        <span data-testid="header-compliance-band">{t("footer.compliance")}</span>
      </div>
      <header className="sticky top-0 z-40 bg-clinical/85 backdrop-blur border-b border-ash/70">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
          {/* Le symbole et le mot étaient peints en Nordfjord codé en dur. Sur
              les pages de compte en mode nuit, le fond passe au sombre et le
              logo devenait un bleu marine sur du presque noir — pratiquement
              invisible. currentColor le fait suivre `text-nordfjord`, dont la
              valeur s'inverse. L'étoile garde son Nova Cyan : c'est l'accent
              unique, et il tient sur les deux fonds. */}
          <Link to="/" data-testid="header-logo" className="flex items-center gap-3 group text-nordfjord" aria-label="FIRONOVA">
            <FnMark size={30} frame="currentColor" spark="#00B8D4" className="transition-transform duration-500 group-hover:rotate-[30deg]" />
            <Wordmark size={19} color="currentColor" />
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-link-${n.to.slice(1)}`}
                className={({ isActive }) =>
                  `font-data text-xs font-semibold uppercase tracking-[0.18em] ${
                    isActive ? "text-nordfjord" : "text-glacier hover:text-nordfjord"
                  } transition-colors`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              data-testid="admin-quick-access"
              onClick={enterAdmin}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full font-data text-[11px] font-semibold uppercase tracking-[0.2em] bg-nordfjord text-white px-3.5 py-1.5 hover:bg-glacier transition-colors"
              aria-label="Ops"
            >
              <Lock size={11} strokeWidth={2} />
              OPS
            </button>
            <button
              data-testid="lang-toggle"
              onClick={toggle}
              className="rounded-full font-data text-xs font-semibold uppercase tracking-[0.18em] border-[1.5px] border-ash px-3 py-1.5 hover:border-nova transition-colors inline-flex items-center gap-1.5"
              aria-label="Toggle language"
              title={lang === "fr" ? "Passer à l'anglais" : "Switch to French"}
            >
              <span className={lang === "fr" ? "text-nordfjord" : "text-glacier/60"} data-testid="lang-fr">FR</span>
              <span className="text-ash">·</span>
              <span className={lang === "en" ? "text-nordfjord" : "text-glacier/60"} data-testid="lang-en">EN</span>
            </button>
            <button
              data-testid="cart-button"
              onClick={() => setOpen(true)}
              className="relative font-data text-xs font-semibold uppercase tracking-[0.18em] flex items-center gap-2 text-nordfjord hover:text-nova transition-colors"
            >
              <span className="relative inline-flex">
                <ShoppingBag size={18} strokeWidth={1.5} />
                {count > 0 && (
                  <span
                    data-testid="cart-count-badge"
                    className="absolute -top-2 -right-3 rounded-full bg-nova text-nordfjord text-[10px] font-bold leading-none px-1.5 py-1 min-w-[18px] text-center"
                  >
                    {count}
                  </span>
                )}
              </span>
              <span className="hidden sm:inline">{t("nav.cart")}</span>
            </button>
            {user ? (
              <div className="hidden md:flex items-center gap-3">
                <Link to="/account" data-testid="nav-account" className="font-data text-xs font-semibold uppercase tracking-[0.18em] flex items-center gap-1.5 text-nordfjord hover:text-nova transition-colors">
                  <User size={16} strokeWidth={1.5} /> {user.name?.split(" ")[0] || t("nav.account")}
                </Link>
                <button
                  onClick={logout}
                  data-testid="nav-logout"
                  className="font-data text-xs font-semibold uppercase tracking-[0.18em] text-glacier hover:text-nordfjord transition-colors"
                >
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <Link
                to={loginHref}
                data-testid="nav-login"
                className="hidden md:inline-flex items-center gap-1.5 font-data text-xs font-semibold uppercase tracking-[0.18em] text-nordfjord hover:text-nova transition-colors"
              >
                <User size={16} strokeWidth={1.5} />
              </Link>
            )}
            <button
              className="md:hidden text-nordfjord"
              data-testid="mobile-menu-toggle"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-ash/70 bg-clinical px-6 py-4" data-testid="mobile-menu">
            <nav className="flex flex-col gap-3">
              {navItems.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMobileOpen(false)}
                  className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-2 text-nordfjord"
                >
                  {n.label}
                </Link>
              ))}
              <button
                onClick={() => { setMobileOpen(false); enterAdmin(); }}
                data-testid="admin-quick-access-mobile"
                className="rounded-full font-data text-xs font-semibold uppercase tracking-[0.18em] py-2 text-left bg-nordfjord text-white px-4 inline-flex items-center gap-2 w-fit"
              >
                <Lock size={11} strokeWidth={2} /> OPS
              </button>
              {user ? (
                <>
                  <Link to="/account" onClick={() => setMobileOpen(false)} className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-2 text-nordfjord">
                    {t("nav.account")}
                  </Link>
                  <button onClick={() => { logout(); setMobileOpen(false); }} className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-2 text-left text-nordfjord">
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <Link to={loginHref} onClick={() => setMobileOpen(false)} className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-2 text-nordfjord">
                  {t("nav.login")} →
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
