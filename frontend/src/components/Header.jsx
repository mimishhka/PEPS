import { Link, NavLink } from "react-router-dom";
import { ShoppingBag, User, Menu, X } from "lucide-react";
import { useState } from "react";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";

export default function Header() {
  const { lang, toggle, t } = useLang();
  const { user, logout } = useAuth();
  const { count, setOpen } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: "/catalog", label: t("nav.catalog") },
    { to: "/lab", label: t("nav.lab") },
    { to: "/about", label: t("nav.about") },
    { to: "/compliance", label: t("nav.compliance") },
  ];

  return (
    <>
      <div className="compliance-band font-mono uppercase tracking-[0.25em] text-center py-2 px-4">
        <span data-testid="header-compliance-band">{t("footer.compliance")}</span>
      </div>
      <header className="sticky top-0 z-40 bg-white border-b border-ink/15">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" data-testid="header-logo" className="font-display font-extrabold text-xl tracking-tight">
            NORDPEP<span className="text-signal" style={{ color: "#E51919" }}>.</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                data-testid={`nav-link-${n.to.slice(1)}`}
                className={({ isActive }) =>
                  `font-mono text-xs uppercase tracking-[0.2em] link-underline ${
                    isActive ? "text-ink" : "text-foreground/70 hover:text-ink"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 sm:gap-5">
            <button
              data-testid="lang-toggle"
              onClick={toggle}
              className="font-mono text-xs uppercase tracking-[0.25em] border border-ink/30 px-2.5 py-1.5 hover:bg-ink hover:text-white transition-colors"
              aria-label="Toggle language"
            >
              {lang === "en" ? "EN · FR" : "FR · EN"}
            </button>
            <button
              data-testid="cart-button"
              onClick={() => setOpen(true)}
              className="relative font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-2 hover:text-ink/70"
            >
              <ShoppingBag size={18} strokeWidth={1.5} />
              <span className="hidden sm:inline">{t("nav.cart")}</span>
              {count > 0 && (
                <span
                  data-testid="cart-count-badge"
                  className="absolute -top-2 -right-3 bg-ink text-white text-[10px] font-mono px-1.5 py-0.5 min-w-[18px] text-center"
                >
                  {count}
                </span>
              )}
            </button>
            {user ? (
              <div className="hidden md:flex items-center gap-3">
                {user.role === "admin" && (
                  <Link
                    to="/admin"
                    data-testid="nav-admin"
                    className="font-mono text-[11px] uppercase tracking-[0.2em] bg-ink text-white px-3 py-1.5"
                  >
                    {t("nav.admin")}
                  </Link>
                )}
                <Link to="/account" data-testid="nav-account" className="font-mono text-xs uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <User size={16} strokeWidth={1.5} /> {user.name?.split(" ")[0] || t("nav.account")}
                </Link>
                <button
                  onClick={logout}
                  data-testid="nav-logout"
                  className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 hover:text-ink"
                >
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                data-testid="nav-login"
                className="hidden md:inline font-mono text-xs uppercase tracking-[0.2em] hover:text-ink/70"
              >
                {t("nav.login")} →
              </Link>
            )}
            <button
              className="md:hidden"
              data-testid="mobile-menu-toggle"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-ink/15 bg-white px-6 py-4" data-testid="mobile-menu">
            <nav className="flex flex-col gap-3">
              {navItems.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMobileOpen(false)}
                  className="font-mono text-xs uppercase tracking-[0.2em] py-2"
                >
                  {n.label}
                </Link>
              ))}
              {user ? (
                <>
                  {user.role === "admin" && (
                    <Link to="/admin" onClick={() => setMobileOpen(false)} className="font-mono text-xs uppercase tracking-[0.2em] py-2">
                      {t("nav.admin")}
                    </Link>
                  )}
                  <Link to="/account" onClick={() => setMobileOpen(false)} className="font-mono text-xs uppercase tracking-[0.2em] py-2">
                    {t("nav.account")}
                  </Link>
                  <button onClick={() => { logout(); setMobileOpen(false); }} className="font-mono text-xs uppercase tracking-[0.2em] py-2 text-left">
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <Link to="/login" onClick={() => setMobileOpen(false)} className="font-mono text-xs uppercase tracking-[0.2em] py-2">
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
