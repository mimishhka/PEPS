import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { ShoppingBag, User, Menu, X, Lock } from "lucide-react";
import { useState, useEffect } from "react";
import api from "../lib/api";
import { useLang } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { useSiteConfig } from "../contexts/SiteConfigContext";
import { FnMark, Wordmark } from "./brand";
import { hrefConnexion } from "../lib/redirects";

export default function Header() {
  const { lang, setLang, t } = useLang();
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

  // Voir hrefConnexion : la page courante servait de destination, y compris
  // quand c'etait la page de connexion elle-meme ou une page d'OPS.
  const loginHref = hrefConnexion(
    `${location.pathname}${location.search || ""}${location.hash || ""}`,
    ADMIN_PATH,
  );

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
          fond blanc. La nuit, le texte passe donc à l'encre sombre : c'est la
          paire fond/texte qui porte le contraste, pas la valeur. */}
      <div className="bg-nordfjord text-center py-2 px-4 font-data text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9FD9E8] dark:text-clinical">
        <span data-testid="header-compliance-band">{t("footer.compliance")}</span>
      </div>
      <header className="sticky top-0 z-40 bg-clinical/85 backdrop-blur border-b border-ash/70">
        {/* LE BUDGET HORIZONTAL DE L'EN-TETE, MESURE PLUTOT QU'ESTIME.
            Mesure du 09/10/2026, polices réelles (Space Grotesk 19 px /
            0,14 em) : le mot « FIRONOVA » fait 109,5 px, et le logo entier
            151,5 px avec sa marque et sa gouttière.
            Les cibles tactiles du point 4 de l'audit en réclament 186 de
            plus (deux boutons de langue à 44, le panier à 48, le menu à 48).
            Total : 337,5 px, sans compter une seule gouttière.
            Or un téléphone de 360 px n'offre que 312 px entre les marges
            `px-6`. La rangée débordait de 23,5 px — et de 8,5 px encore sur
            un iPhone de 375.
            D'où les deux cessions, dans cet ordre : la marge passe à 16 px
            sous `sm`, et le MOT se retire sous 430 px (voir plus bas). */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          {/* Le symbole et le mot étaient peints en Nordfjord codé en dur. Sur
              les pages de compte en mode nuit, le fond passe au sombre et le
              logo devenait un bleu marine sur du presque noir : pratiquement
              invisible. currentColor le fait suivre `text-nordfjord`, dont la
              valeur s'inverse. L'étoile garde son Nova Cyan : c'est l'accent
              unique, et il tient sur les deux fonds. */}
          <Link to="/" data-testid="header-logo" className="flex items-center gap-2 sm:gap-3 group text-nordfjord shrink-0" aria-label="FIRONOVA">
            <FnMark size={30} frame="currentColor" spark="#00B8D4" className="transition-transform duration-500 group-hover:rotate-[30deg]" />
            {/* SOUS 430 PX, LA MARQUE PORTE SEULE LE LOGO.
                430 px est la largeur du plus grand téléphone courant en
                portrait : au-delà on est sur une tablette ou un ordinateur,
                et les 109,5 px du mot rentrent sans serrer personne.
                En dessous, c'est le mot ou les cibles tactiles — et un mot
                de marque ne vaut pas qu'on rate le bouton du panier. La
                marque FN reste, elle ramène à l'accueil, et le lien porte
                déjà `aria-label="FIRONOVA"` : rien n'est perdu pour qui
                n'y voit pas. */}
            <span className="hidden min-[430px]:inline" data-testid="header-wordmark">
              <Wordmark size={19} color="currentColor" />
            </span>
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
          {/* LES GOUTTIÈRES RÉTRÉCISSENT PARCE QUE LES CIBLES GROSSISSENT.
              Une cible de 48 px autour d'une icône de 20 laisse déjà 28 px
              de vide de chaque côté : ajouter 12 px de gouttière par-dessus
              ne sépare plus rien visuellement, et coûte 24 px au budget
              mesuré plus haut. */}
          <div className="flex items-center gap-0.5 sm:gap-3">
            <button
              data-testid="admin-quick-access"
              onClick={enterAdmin}
              className="hidden sm:inline-flex items-center gap-1.5 font-data text-[11px] font-semibold uppercase tracking-[0.2em] bg-nordfjord text-white px-3.5 py-1.5 hover:bg-glacier transition-colors" style={{ borderRadius: "var(--r-m)" }}
              aria-label="Ops"
            >
              <Lock size={11} strokeWidth={2} />
              OPS
            </button>
            {/* DEUX CIBLES, PAS UNE BASCULE.

                Mesure sur un écran de 375 px : 84 × 29, et le pseudo-élément
                qui tenait lieu de rustine n'y ajoutait que 16 px de hauteur,
                pour 45 — sous le minimum, et seulement en hauteur.

                Audit du 06/10/2026, section 1 : « Sélecteur FR · EN : 29 px.
                Pour FR/EN, deux boutons séparés de 44 × 44 px au lieu d'un
                seul bloc. » Le rapport a raison sur le fond autant que sur la
                taille : un bloc « FR · EN » qui bascule ne dit pas ce qui va
                se passer quand on le touche. On touche maintenant la langue
                qu'on veut, et celle où l'on est se voit.

                Le cadre reste un seul objet — un contrôle segmenté, pas deux
                boutons flottants — pour que l'en-tête ne gagne pas une
                deuxième bordure. C'est la SORTIE DE SECOURS de qui arrive
                dans la mauvaise langue : elle doit se voir et s'atteindre. */}
            <div
              data-testid="lang-toggle"
              role="group"
              aria-label={lang === "fr" ? "Langue du site" : "Site language"}
              className="inline-flex items-center border border-ash overflow-hidden"
              style={{ borderRadius: "var(--r-m)" }}
            >
              {[{ code: "fr", libelle: "FR" }, { code: "en", libelle: "EN" }].map(({ code, libelle }) => (
                <button
                  key={code}
                  data-testid={`lang-${code}`}
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  aria-label={code === "fr" ? "Français" : "English"}
                  title={code === "fr" ? "Français" : "English"}
                  className={`font-data text-xs font-semibold uppercase tracking-[0.18em] min-w-[44px] min-h-[44px] inline-flex items-center justify-center transition-colors ${
                    lang === code ? "text-nordfjord bg-ash/40" : "text-glacier hover:text-nordfjord"
                  }`}
                >
                  {libelle}
                </button>
              ))}
            </div>
            {/* L'ICÔNE RESTE À 18, LA ZONE PASSE À 48.
                Audit, section 1 : « Icône Panier : 18 × 18 px. Zones 2 à 2,5
                fois trop petites. Le client rate son tap ou ouvre le mauvais
                élément, surtout d'une main. Garder l'icône à 20–24 px mais
                agrandir la zone cliquable. »
                L'en-tête fait 64 px de haut et centre son contenu : un bouton
                de 48 y tient sans la rallonger d'un pixel. C'est pour cela
                qu'on agrandit la BOÎTE et non le remplissage — un
                remplissage, lui, aurait repoussé toute la barre vers le bas.
                `min-w` et non `w` : sur `sm` le libellé « Panier » revient et
                le bouton s'élargit pour lui. */}
            <button
              data-testid="cart-button"
              onClick={() => setOpen(true)}
              aria-label={t("nav.cart")}
              className="relative font-data text-xs font-semibold uppercase tracking-[0.18em] flex items-center justify-center gap-2 min-w-[48px] min-h-[48px] text-nordfjord hover:text-nova-texte transition-colors"
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
                <Link to="/account" data-testid="nav-account" className="font-data text-xs font-semibold uppercase tracking-[0.18em] flex items-center gap-1.5 min-h-[48px] text-nordfjord hover:text-nova-texte transition-colors">
                  <User size={16} strokeWidth={1.5} /> {user.name?.split(" ")[0] || t("nav.account")}
                </Link>
                <button
                  onClick={logout}
                  data-testid="nav-logout"
                  className="font-data text-xs font-semibold uppercase tracking-[0.18em] min-h-[48px] text-glacier hover:text-nordfjord transition-colors"
                >
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <Link
                to={loginHref}
                data-testid="nav-login"
                aria-label={t("nav.login")}
                className="hidden md:inline-flex items-center justify-center gap-1.5 min-w-[48px] min-h-[48px] font-data text-xs font-semibold uppercase tracking-[0.18em] text-nordfjord hover:text-nova-texte transition-colors"
              >
                <User size={16} strokeWidth={1.5} />
              </Link>
            )}
            <button
              className="md:hidden text-nordfjord grid place-items-center min-w-[48px] min-h-[48px]"
              data-testid="mobile-menu-toggle"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
              aria-expanded={mobileOpen}
              aria-controls="menu-mobile"
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div id="menu-mobile" className="md:hidden border-t border-ash/70 bg-clinical px-5 py-2" data-testid="mobile-menu">
            <nav className="flex flex-col gap-0.5">
              {navItems.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setMobileOpen(false)}
                  className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-3.5 block text-nordfjord"
                >
                  {n.label}
                </Link>
              ))}
              <button
                onClick={() => { setMobileOpen(false); enterAdmin(); }}
                data-testid="admin-quick-access-mobile"
                className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-3.5 mt-2 text-left bg-nordfjord text-white px-4 inline-flex items-center gap-2 w-fit" style={{ borderRadius: "var(--r-m)" }}
              >
                <Lock size={11} strokeWidth={2} /> OPS
              </button>
              {user ? (
                <>
                  <Link to="/account" onClick={() => setMobileOpen(false)} className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-3.5 block text-nordfjord">
                    {t("nav.account")}
                  </Link>
                  <button onClick={() => { logout(); setMobileOpen(false); }} className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-3.5 text-left w-full text-nordfjord">
                    {t("nav.logout")}
                  </button>
                </>
              ) : (
                <Link to={loginHref} onClick={() => setMobileOpen(false)} className="font-data text-xs font-semibold uppercase tracking-[0.18em] py-3.5 block text-nordfjord">
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
