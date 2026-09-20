import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Ticket, Users, Truck,
  LogOut, X, Trash2, CheckCircle2, AlertCircle, Clock, UserCog,
  History, FolderTree, ListTree, Mail, Handshake, Globe,
  CalendarCheck, Send, Boxes, DollarSign, Inbox,
  Link2, MessageSquare, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import api from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { useLang } from "../../contexts/LanguageContext";

import AdminDashboard from "./sections/AdminDashboard";
import AdminOrders from "./sections/AdminOrders";
import AdminProducts from "./sections/AdminProducts";
import AdminCoupons from "./sections/AdminCoupons";
import AdminCustomers from "./sections/AdminCustomers";
import AdminShipping from "./sections/AdminShipping";
import AdminFulfillment from "./sections/AdminFulfillment";
import AdminDispatch from "./sections/AdminDispatch";
import AdminBoxes from "./sections/AdminBoxes";
import AdminStaff from "./sections/AdminStaff";
import AdminTrash from "./sections/AdminTrash";
import AdminAuditLog from "./sections/AdminAuditLog";
import AdminSeo from "./sections/AdminSeo";
import AdminEmails from "./sections/AdminEmails";
import AdminEmailOutbox from "./sections/AdminEmailOutbox";
import AdminCategories from "./sections/AdminCategories";
import AdminMenus from "./sections/AdminMenus";
import AdminSubscribers from "./sections/AdminSubscribers";
import AdminAffiliates from "./sections/AdminAffiliates";
import AdminPayouts from "./sections/AdminPayouts";
import AdminTickets from "./sections/AdminTickets";
import ThemeToggle from "../../components/ThemeToggle";
import PaletteRecherche from "./PaletteRecherche";
import ClocheNotifications from "./ClocheNotifications";
import AdminReconciliation from "./sections/AdminReconciliation";
import AdminCheckoutFailures from "./sections/AdminCheckoutFailures";
import AdminRefunds from "./sections/AdminRefunds";

function hasAccess(user, area) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "staff") return (user.permissions?.[area] || "none") !== "none";
  return false;
}

export default function AdminLayout({ basePath = "/admin" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLang();
  const L = useCallback((fr, en) => (lang === "fr" ? fr : en), [lang]);
  const [signals, setSignals] = useState(null);
  const [pouls, setPouls] = useState(null);
  const voitTableauDeBord = hasAccess(user, "dashboard");

  // Un compteur d'alerte qui ment est pire que pas de compteur. Celui-ci se
  // relit donc chaque fois que l'etat a pu changer :
  //   - au changement d'ecran (on vient de traiter quelque chose) ;
  //   - au retour sur l'onglet (on a agi ailleurs, ou attendu) ;
  //   - apres un clic dans la cloche ;
  //   - et, a defaut, toutes les 60 secondes.
  // Sans le retour sur l'onglet, une situation reglee restait affichee jusqu'a
  // une minute ; sans le changement d'ecran, expedier ses commandes laissait
  // la pastille inchangee tant qu'on ne rechargeait pas la page.
  // `vivant` doit être REMIS À VRAI au montage, pas seulement mis à faux au
  // démontage. En mode strict, React monte, démonte puis remonte le composant :
  // le premier démontage laissait le drapeau à faux pour toujours, toutes les
  // réponses étaient ignorées, et la cloche affichait « rien en attente »
  // alors que le serveur annonçait six choses à traiter.
  const vivant = useRef(true);
  useEffect(() => {
    vivant.current = true;
    return () => { vivant.current = false; };
  }, []);

  const relire = useCallback(() => {
    api.get("/admin/ops/signals")
      .then((r) => { if (vivant.current) setSignals(r.data); })
      .catch(() => {});
    if (voitTableauDeBord) {
      api.get("/admin/dashboard/pulse")
        .then((r) => { if (vivant.current) setPouls(r.data); })
        .catch(() => {});
    } else {
      setPouls(null);
    }
  }, [voitTableauDeBord]);

  useEffect(() => {
    relire();
    const t = setInterval(relire, 60000);
    const auRetour = () => { if (document.visibilityState === "visible") relire(); };
    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("focus", relire);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("focus", relire);
    };
  }, [relire]);

  // Changer d'ecran, c'est presque toujours avoir termine quelque chose.
  useEffect(() => { relire(); }, [location.pathname, relire]);

  // L'administration vit SOUS l'en-tete de la boutique, qui est lui-meme
  // fige (sticky, 65 px, z-40). Une barre collee a top:0 se plaçait donc
  // DERRIERE lui : elle etait bien figee, mais invisible — ce qui revient au
  // meme pour qui regarde l'ecran.
  //
  // La hauteur est MESUREE, pas ecrite en dur : cet en-tete change de taille
  // selon la langue, la largeur et les bandeaux d'alerte qu'il porte. Un
  // nombre fige aurait laisse un filet de travers le jour ou il grandit.
  const [hautEntete, setHautEntete] = useState(0);
  useEffect(() => {
    const entete = document.querySelector("header");
    if (!entete) return undefined;
    const mesurer = () => setHautEntete(Math.round(entete.getBoundingClientRect().height));
    mesurer();
    let observateur;
    if (typeof ResizeObserver !== "undefined") {
      observateur = new ResizeObserver(mesurer);
      observateur.observe(entete);
    }
    window.addEventListener("resize", mesurer);
    return () => {
      if (observateur) observateur.disconnect();
      window.removeEventListener("resize", mesurer);
    };
  }, []);

  // La palette de recherche : Ctrl+K (ou Cmd+K), et « / » comme sur la
  // maquette. « / » ne doit PAS voler la frappe de quelqu'un en train
  // d'ecrire dans un champ — d'ou le test sur l'element actif.
  const [paletteOuverte, setPaletteOuverte] = useState(false);
  useEffect(() => {
    const auClavier = (e) => {
      const cible = e.target;
      const dansUnChamp = cible && (
        ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName) || cible.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOuverte((v) => !v);
      } else if (e.key === "/" && !dansUnChamp && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPaletteOuverte(true);
      }
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, []);

  // Pastille "stock faible" sur Produits. Endpoint distinct de ops/signals car
  // il est protégé par products:view — un 403 laisse simplement la pastille à 0.
  const [lowStock, setLowStock] = useState(0);
  const canSeeProducts = hasAccess(user, "products");
  useEffect(() => {
    if (!canSeeProducts) { setLowStock(0); return undefined; }
    let alive = true;
    const pull = () => api.get("/admin/low-stock-alerts")
      .then((r) => { if (alive) setLowStock(r.data?.count || 0); })
      .catch(() => {});
    pull();
    const t = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [canSeeProducts]);

  // Navigation groupée par intention de travail. Chaque item conserve son
  // "area" pour le filtrage de permissions ; les groupes vides sont masqués.
  const navGroups = useMemo(() => {
    const groups = [
      {
        id: "sales",
        label: L("VENTES", "SALES"),
        items: [
          { to: basePath, label: L("Tableau de bord", "Dashboard"), icon: LayoutDashboard, end: true, area: "dashboard" },
          { to: `${basePath}/orders`, label: L("Commandes", "Orders"), icon: ShoppingCart, area: "orders" },
          { to: `${basePath}/reconciliation`, label: L("Réconciliation", "Reconciliation"), icon: Link2, area: "orders" },
          { to: `${basePath}/reconciliation/checkout`, label: L("↳ Checkout failures", "↳ Checkout failures"), icon: Link2, area: "orders" },
          { to: `${basePath}/refunds`, label: L("Remboursements", "Refunds"), icon: Link2, area: "orders" },
          { to: `${basePath}/customer-tickets`, label: L("Billets clients", "Customer tickets"), icon: MessageSquare, area: "orders" },
          { to: `${basePath}/customers`, label: L("Clients", "Customers"), icon: Users, area: "customers" },
          { to: `${basePath}/coupons`, label: L("Coupons", "Coupons"), icon: Ticket, area: "coupons" },
        ],
      },
      {
        id: "catalog",
        label: L("CATALOGUE", "CATALOG"),
        items: [
          { to: `${basePath}/products`, label: L("Produits", "Products"), icon: Package, area: "products", badge: lowStock, testid: "admin-nav-products" },
          { to: `${basePath}/categories`, label: L("Catégories", "Categories"), icon: FolderTree, area: "categories" },
          { to: `${basePath}/menus`, label: L("Menus", "Menus"), icon: ListTree, area: "menus" },
        ],
      },
      {
        id: "fulfillment",
        label: L("EXPÉDITION", "FULFILLMENT"),
        items: [
          { to: `${basePath}/fulfillment`, label: L("Journée", "Today"), icon: CalendarCheck, area: "orders", signal: "fulfillment" },
          { to: `${basePath}/dispatch`, label: L("Dispatch", "Dispatch"), icon: Send, area: "orders", signal: "dispatch" },
          { to: `${basePath}/shipping`, label: L("Expédition", "Shipping"), icon: Truck, area: "shipping" },
          { to: `${basePath}/boxes`, label: L("Contenants", "Packaging"), icon: Boxes, area: "shipping" },
        ],
      },
      {
        id: "growth",
        label: L("CROISSANCE", "GROWTH"),
        items: [
          { to: `${basePath}/affiliates`, label: L("Affiliés", "Affiliates"), icon: Handshake, area: "affiliates" },
          { to: `${basePath}/payouts`, label: L("Paiements", "Payouts"), icon: DollarSign, area: "affiliates" },
          { to: `${basePath}/tickets`, label: L("Billets affiliés", "Affiliate tickets"), icon: MessageSquare, area: "affiliates" },
          { to: `${basePath}/subscribers`, label: L("Abonnés", "Subscribers"), icon: Mail, area: "subscribers" },
        ],
      },
      {
        id: "system",
        label: L("SYSTÈME", "SYSTEM"),
        items: [
          { to: `${basePath}/staff`, label: L("Équipe", "Team"), icon: UserCog, area: "staff" },
          { to: `${basePath}/audit-log`, label: L("Journal", "Activity log"), icon: History, area: "audit" },
          { to: `${basePath}/seo`, label: L("SEO", "SEO"), icon: Globe, area: "seo" },
          { to: `${basePath}/emails`, label: L("Emails", "Emails"), icon: Mail, area: "emails", end: true },
          { to: `${basePath}/emails/outbox`, label: L("File d'attente", "Outbox"), icon: Inbox, area: "orders", testid: "admin-nav-emails-outbox" },
          { to: `${basePath}/trash`, label: L("Corbeille", "Trash"), icon: Trash2, area: "trash" },
        ],
      },
    ];
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((n) =>
          (n.adminOnly ? user?.role === "admin" : true) && hasAccess(user, n.area)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [user, basePath, L, lowStock]);

  const landingPath = navGroups[0]?.items[0]?.to || basePath;

  // Le nom de l'ecran ouvert, pris dans la navigation : ajouter une entree au
  // menu suffit pour que le fil d'Ariane la connaisse.
  const titreCourant = useMemo(() => {
    const entrees = navGroups.flatMap((g) => g.items);
    const exact = entrees.find((n) => n.to === location.pathname);
    if (exact) return exact.label;
    const prefixe = entrees
      .filter((n) => location.pathname.startsWith(n.to) && n.to !== basePath)
      .sort((a, b) => b.to.length - a.to.length)[0];
    return prefixe ? prefixe.label : L("Tableau de bord", "Dashboard");
  }, [navGroups, location.pathname, basePath, L]);

  const initiales = (user?.name || user?.email || "?")
    .split(/[@\s.]+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("");

  // Menu retractable. L'etat est MEMORISE : un menu qu'il faut replier a
  // chaque visite n'est pas un confort, c'est une corvee. Sur un portable,
  // ces 240 px repris rendent les tableaux du Dispatch enfin lisibles.
  const [menuReplie, setMenuReplie] = useState(() => {
    try { return localStorage.getItem("fironova_admin_menu") === "replie"; }
    catch { return false; }
  });
  const basculerMenu = () => {
    setMenuReplie((avant) => {
      const apres = !avant;
      try { localStorage.setItem("fironova_admin_menu", apres ? "replie" : "ouvert"); }
      catch { /* navigation privee : le menu reste ouvert, sans erreur */ }
      return apres;
    });
  };

  return (
    <div className="min-h-screen bg-[#f7f7f7] -mt-px" data-testid="admin-shell">
      <div className="flex">
        <aside
          style={{ top: hautEntete, maxHeight: `calc(100vh - ${hautEntete}px)` }}
          className={`${menuReplie ? "w-16" : "w-60"} bg-white border-r border-ink/10 sticky hidden lg:flex flex-col transition-[width] duration-200`}
          id="admin-sidebar"
          data-testid="admin-sidebar"
          data-collapsed={menuReplie ? "true" : "false"}
        >
          <div className={`${menuReplie ? "px-3 py-5" : "px-6 py-6"} border-b border-ink/10`}>
            {menuReplie ? (
              <div className="font-display font-bold text-xl tracking-tight text-center" title="FIRONOVA">
                F<span style={{ color: "#00B8D4" }}>.</span>
              </div>
            ) : (
              <>
                <div className="font-display font-bold text-xl tracking-tight">
                  FIRONOVA<span style={{ color: "#00B8D4" }}>.</span>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 mt-1">// Admin</div>
              </>
            )}
          </div>
          <nav className="flex-1 py-3 overflow-y-auto">
            {navGroups.map((group, gi) => (
              <div key={group.id} className={gi > 0 ? "mt-1" : ""}>
                {menuReplie ? (
                  // Replie, l'intitule ne tiendrait pas : un filet garde la
                  // separation entre groupes, qui est l'information utile.
                  <div className="mx-3 my-2 h-px bg-ink/10" aria-hidden="true" />
                ) : (
                  <div className="px-6 pt-4 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground/40">
                    {group.label}
                  </div>
                )}
                {group.items.map((n) => {
                  const signalBadge = n.signal && signals && signals[n.signal] > 0 ? signals[n.signal] : null;
                  const badge = signalBadge ?? (n.badge > 0 ? n.badge : null);
                  return (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      data-testid={n.testid || `admin-nav-${n.label.toLowerCase()}`}
                      // Replie, le nom n'est plus lisible : il passe en
                      // infobulle native, qui suit le clavier comme la souris.
                      title={menuReplie ? n.label : undefined}
                      aria-label={menuReplie ? n.label : undefined}
                      className={({ isActive }) =>
                        `relative flex items-center text-sm transition-colors ${
                          menuReplie ? "justify-center px-0 py-3" : "gap-3 px-6 py-2.5"
                        } ${
                          isActive
                            ? "bg-ink text-white font-medium"
                            : "text-foreground/70 hover:bg-secondary"
                        }`
                      }
                    >
                      <n.icon size={16} strokeWidth={1.6} />
                      {!menuReplie && <span className="flex-1">{n.label}</span>}
                      {badge && (
                        <span
                          className={menuReplie
                            // Replie, la pastille se pose sur l'icone : un
                            // compteur d'alerte ne doit JAMAIS disparaitre
                            // parce qu'on a gagne de la place.
                            ? "absolute top-1.5 right-2 min-w-[14px] h-[14px] flex items-center justify-center bg-red-600 text-white font-mono text-[9px] px-1 rounded-full"
                            : "bg-red-600 text-white font-mono text-[10px] px-1.5 py-0.5 rounded-full"}
                          data-testid={n.signal ? `nav-badge-${n.signal}` : "sidebar-low-stock-badge"}
                        >
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className={`border-t border-ink/10 ${menuReplie ? "p-2 space-y-2" : "p-4 space-y-2"}`}>
            <div className={`flex items-center gap-2 ${menuReplie ? "justify-center" : "justify-between"}`}>
              {!menuReplie && (
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/50 truncate"
                     title={user?.email}>
                  {user?.email}
                </div>
              )}
              <ThemeToggle />
            </div>
            <button
              onClick={() => { logout(); navigate("/"); }}
              title={menuReplie ? L("Déconnexion", "Logout") : undefined}
              aria-label={L("Déconnexion", "Logout")}
              className={`w-full flex items-center justify-center gap-2 border border-ink text-xs font-mono uppercase tracking-[0.2em] hover:bg-ink hover:text-white ${
                menuReplie ? "py-2" : "py-2"}`}
              data-testid="admin-logout"
            >
              <LogOut size={12} /> {!menuReplie && L("Déconnexion", "Logout")}
            </button>
          </div>
        </aside>

        <PaletteRecherche ouvert={paletteOuverte} setOuvert={setPaletteOuverte}
          groupes={navGroups} L={L} lang={lang} />

        <main className="flex-1 min-w-0">
          {/* Figee SOUS l'en-tete de la boutique : sur un ecran de commandes
              qui descend loin, la recherche, la cloche et le nom de l'ecran
              restent a portee de regard sans remonter. z-30 passe devant le
              contenu, mais derriere l'en-tete (z-40), la palette de recherche
              et les dialogues. */}
          <div style={{ top: hautEntete }}
               className="sticky z-30 bg-white border-b border-ink/10 px-8 py-4 flex items-center justify-between gap-4"
               data-testid="admin-topbar">
            <div className="flex items-center gap-4 min-w-0">
              <button
                type="button"
                onClick={basculerMenu}
                data-testid="sidebar-toggle"
                aria-expanded={!menuReplie}
                aria-controls="admin-sidebar"
                title={menuReplie ? L("Déplier le menu", "Expand menu") : L("Replier le menu", "Collapse menu")}
                aria-label={menuReplie ? L("Déplier le menu", "Expand menu") : L("Replier le menu", "Collapse menu")}
                className="hidden lg:flex items-center justify-center w-8 h-8 rounded-md border border-ink/15 text-foreground/60 hover:bg-secondary hover:text-foreground transition-colors shrink-0"
              >
                {menuReplie ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
              {/* Fil d'Ariane : ou suis-je. Il remplace la mention
                  reglementaire, qui figure deja sur la boutique et sur chaque
                  facture, et qui ne renseignait personne ici. */}
              <nav aria-label={L("Fil d'Ariane", "Breadcrumb")} className="min-w-0">
                <span className="text-sm font-medium text-foreground truncate block"
                      data-testid="admin-breadcrumb">
                  {titreCourant}
                </span>
              </nav>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* La loupe. Le raccourci est ecrit sur le bouton : un raccourci
                  qu'il faut deviner n'existe pas. */}
              <button
                type="button"
                onClick={() => setPaletteOuverte(true)}
                data-testid="search-open"
                aria-label={L("Rechercher", "Search")}
                className="flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-md border border-ink/15 text-foreground/60 hover:bg-secondary hover:text-foreground transition-colors"
              >
                <Search size={15} />
                <span className="hidden xl:inline text-xs">{L("Rechercher", "Search")}</span>
                <kbd className="hidden xl:inline font-mono text-[10px] border border-ink/15 rounded px-1 py-0.5 text-foreground/50">
                  /
                </kbd>
              </button>

              <ClocheNotifications pouls={pouls} signaux={signals} basePath={basePath} L={L}
                surAction={relire}
                argent={(n) => `${Number(n || 0).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA",
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`} />

              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/50 hidden xl:inline">
                {new Date().toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA", { weekday: "short", month: "short", day: "numeric" })}
              </span>

              {/* L'avatar : les initiales, et le courriel au survol. Pas de
                  menu de plus — deconnexion et theme vivent au pied du menu de
                  gauche, un seul endroit ou les chercher. */}
              <span
                data-testid="admin-avatar"
                title={user?.email}
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-ink text-white flex items-center justify-center text-[11px] font-bold uppercase shrink-0"
              >
                {initiales}
              </span>
            </div>
          </div>
          {signals && signals.pending_manifest > 0 && !location.pathname.includes("/dispatch") && (
            <div className="bg-red-50 border-b border-red-300 text-red-900 px-8 py-3 font-mono text-xs flex items-center justify-between gap-3" data-testid="manifest-alert">
              <span className="flex items-center gap-2">
                <AlertCircle size={14} />
                {L(
                  `${signals.pending_manifest} étiquette(s) non transmise(s) — surcharge de 2 $/article tant que le manifeste n'est pas envoyé.`,
                  `${signals.pending_manifest} label(s) not transmitted — $2/item surcharge until the manifest is sent.`
                )}
              </span>
              <NavLink to={`${basePath}/dispatch`} className="underline whitespace-nowrap hover:opacity-70">
                {L("Aller au Dispatch", "Go to Dispatch")} →
              </NavLink>
            </div>
          )}
          <Routes>
            <Route index element={hasAccess(user, "dashboard") ? <AdminDashboard /> : <Navigate to={landingPath} replace />} />
            <Route path="orders" element={hasAccess(user, "orders") ? <AdminOrders /> : <Navigate to={landingPath} replace />} />
            <Route path="orders/:id" element={hasAccess(user, "orders") ? <AdminOrders /> : <Navigate to={landingPath} replace />} />
            <Route path="reconciliation" element={hasAccess(user, "orders") ? <AdminReconciliation /> : <Navigate to={landingPath} replace />} />
            <Route path="reconciliation/checkout" element={hasAccess(user, "orders") ? <AdminCheckoutFailures /> : <Navigate to={landingPath} replace />} />
            <Route path="refunds" element={hasAccess(user, "orders") ? <AdminRefunds /> : <Navigate to={landingPath} replace />} />
            <Route path="products" element={hasAccess(user, "products") ? <AdminProducts /> : <Navigate to={landingPath} replace />} />
            <Route path="coupons" element={hasAccess(user, "coupons") ? <AdminCoupons /> : <Navigate to={landingPath} replace />} />
            <Route path="customers" element={hasAccess(user, "customers") ? <AdminCustomers /> : <Navigate to={landingPath} replace />} />
            <Route path="shipping" element={hasAccess(user, "shipping") ? <AdminShipping /> : <Navigate to={landingPath} replace />} />
            <Route path="fulfillment" element={hasAccess(user, "orders") ? <AdminFulfillment /> : <Navigate to={landingPath} replace />} />
            <Route path="dispatch" element={hasAccess(user, "orders") ? <AdminDispatch /> : <Navigate to={landingPath} replace />} />
            <Route path="boxes" element={hasAccess(user, "shipping") ? <AdminBoxes /> : <Navigate to={landingPath} replace />} />
            <Route path="subscribers" element={hasAccess(user, "subscribers") ? <AdminSubscribers /> : <Navigate to={landingPath} replace />} />
            <Route path="categories" element={hasAccess(user, "categories") ? <AdminCategories /> : <Navigate to={landingPath} replace />} />
            <Route path="menus" element={hasAccess(user, "menus") ? <AdminMenus /> : <Navigate to={landingPath} replace />} />
            <Route path="affiliates" element={hasAccess(user, "affiliates") ? <AdminAffiliates /> : <Navigate to={landingPath} replace />} />
            <Route path="payouts" element={hasAccess(user, "affiliates") ? <AdminPayouts /> : <Navigate to={landingPath} replace />} />
            <Route path="tickets" element={hasAccess(user, "affiliates") ? <AdminTickets /> : <Navigate to={landingPath} replace />} />
            <Route path="customer-tickets" element={hasAccess(user, "orders")
              ? <AdminTickets base="/admin/customer-tickets"
                  titre={{ fr: "Billets clients", en: "Customer tickets" }}
                  identite={(t) => ({ name: t.customer_name, email: t.customer_email, code: "" })}
                  remboursement
                  testid="admin-customer-tickets" />
              : <Navigate to={landingPath} replace />} />
            <Route path="staff" element={hasAccess(user, "staff") ? <AdminStaff /> : <Navigate to={landingPath} replace />} />
            <Route path="trash" element={hasAccess(user, "trash") ? <AdminTrash /> : <Navigate to={landingPath} replace />} />
            <Route path="audit-log" element={hasAccess(user, "audit") ? <AdminAuditLog /> : <Navigate to={landingPath} replace />} />
            <Route path="seo" element={hasAccess(user, "seo") ? <AdminSeo /> : <Navigate to={landingPath} replace />} />
            <Route path="emails" element={hasAccess(user, "emails") ? <AdminEmails /> : <Navigate to={landingPath} replace />} />
            <Route path="emails/outbox" element={hasAccess(user, "orders") ? <AdminEmailOutbox /> : <Navigate to={landingPath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export const STATUS_LABELS = {
  paid: { fr: "Payé", en: "Paid" },
  awaiting_etransfer: { fr: "Attente virement", en: "Awaiting e-Transfer" },
  awaiting_crypto: { fr: "Attente crypto", en: "Awaiting crypto" },
  refunded: { fr: "Remboursé", en: "Refunded" },
  pending: { fr: "En attente", en: "Pending" },
  preorder: { fr: "Précommande", en: "Pre-order" },
  processing: { fr: "En traitement", en: "Processing" },
  packing: { fr: "Emballage", en: "Packing" },
  packed: { fr: "Emballé", en: "Packed" },
  shipped: { fr: "Expédié", en: "Shipped" },
  delivered: { fr: "Livré", en: "Delivered" },
  cancelled: { fr: "Annulé", en: "Cancelled" },
  failed: { fr: "Échoué", en: "Failed" },
};

export const statusLabel = (status, lang) => {
  const m = STATUS_LABELS[status];
  if (!m) return (status || "").replace(/_/g, " ");
  return lang === "fr" ? m.fr : m.en;
};

export const StatusBadge = ({ status, lang }) => {
  const map = {
    paid: { bg: "#0d9d57", color: "#fff", icon: CheckCircle2 },
    awaiting_etransfer: { bg: "#f59e0b", color: "#fff", icon: Clock },
    awaiting_crypto: { bg: "#f59e0b", color: "#fff", icon: Clock },
    refunded: { bg: "#6b7280", color: "#fff", icon: AlertCircle },
    pending: { bg: "#f3f4f6", color: "#111", icon: Clock },
    processing: { bg: "#3b82f6", color: "#fff", icon: Package },
    packing: { bg: "#6366f1", color: "#fff", icon: Package },
    packed: { bg: "#8b5cf6", color: "#fff", icon: CheckCircle2 },
    shipped: { bg: "#7c3aed", color: "#fff", icon: Truck },
    delivered: { bg: "#10b981", color: "#fff", icon: CheckCircle2 },
    cancelled: { bg: "#ef4444", color: "#fff", icon: X },
    failed: { bg: "#ef4444", color: "#fff", icon: X },
    preorder: { bg: "#f97316", color: "#fff", icon: Clock },
  };
  const conf = map[status] || { bg: "#f3f4f6", color: "#111", icon: Clock };
  const Icon = conf.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.15em]"
      style={{ background: conf.bg, color: conf.color }}
      data-testid={`status-${status}`}
    >
      <Icon size={11} strokeWidth={2} />
      {statusLabel(status, lang)}
    </span>
  );
};

export { useAdminApi } from "./hooks";
