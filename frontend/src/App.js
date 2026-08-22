import { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";

import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CartProvider } from "./contexts/CartContext";
import { SiteConfigProvider, useSiteConfig } from "./contexts/SiteConfigContext";
import api from "./lib/api";

import Header from "./components/Header";
import ScrollToTop from "./components/ScrollToTop";
import { PorteeDuTheme } from "./contexts/ThemeContext";
import Footer from "./components/Footer";
import AgeGate from "./components/AgeGate";
import CartDrawer from "./components/CartDrawer";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminGate from "./components/AdminGate";
import ErrorBoundary from "./components/ErrorBoundary";

import Home from "./pages/Home";
import ComingSoon from "./pages/ComingSoon";
import { ConfirmProvider } from "./components/ConfirmDialog";
import useAffiliateRef from "./hooks/useAffiliateRef";
import NotFound from "./pages/NotFound";
import { DashboardSkeleton, RouteSkeleton } from "./components/LoadingSkeletons";

const Catalog = lazy(() => import("./pages/Catalog"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const NewsletterConfirm = lazy(() => import("./pages/NewsletterConfirm"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Account = lazy(() => import("./pages/Account"));
const About = lazy(() => import("./pages/About"));
const Lab = lazy(() => import("./pages/Lab"));
const Compliance = lazy(() => import("./pages/Compliance"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Faq = lazy(() => import("./pages/Faq"));
const AffiliateDashboard = lazy(() => import("./pages/AffiliateDashboard"));
const AffiliateJoin = lazy(() => import("./pages/AffiliateJoin"));
const AffiliateProgramme = lazy(() => import("./pages/AffiliateProgramme"));
const AffiliateTerms = lazy(() => import("./pages/AffiliateTerms"));
const AffiliateFaq = lazy(() => import("./pages/AffiliateFaq"));
const StaffAccept = lazy(() => import("./pages/StaffAccept"));

// Chargé à la demande (chunk séparé) — le code du panneau admin n'est PLUS
// téléchargé par un visiteur du site public tant qu'il ne visite pas cette
// route précise. Avant ce changement, tout le bundle admin (React.lazy absent)
// était livré à chaque visiteur, même caché derrière /admin.
const Admin = lazy(() => import("./pages/admin/AdminLayout"));

// ⚠️ À PERSONNALISER avant mise en prod : remplacer par un chemin que toi
// seul(e) et ton équipe connaissez. Ne JAMAIS le mettre dans robots.txt,
// le sitemap, ou un lien visible — sa confidentialité EST la protection.
const ADMIN_PATH = "/ops-portal-fn7k2q";

import "./index.css";

function Shell({ children }) {
  return (
    <ConfirmProvider>
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <AgeGate />
      <Header />
      <CartDrawer />
      <main className="flex-1">{children}</main>
      <Footer />
      <Toaster position="bottom-right" />
    </div>
    </ConfirmProvider>
  );
}

// La page d'attente se suffit à elle-même : ni header boutique, ni panier,
// ni footer — sinon le prélancement laisse fuiter toute la navigation.
function GatedApp() {
  const { loaded, prelaunchEnabled } = useSiteConfig();
  useAffiliateRef();
  const { user, checking: authLoading } = useAuth();
  const location = useLocation();
  const [previewOk, setPreviewOk] = useState(false);
  const [previewChecked, setPreviewChecked] = useState(false);
  const token = new URLSearchParams(location.search).get("preview");

  useEffect(() => {
    let cancelled = false;
    if (!token) { setPreviewChecked(true); return; }
    const cleanUrl = `${location.pathname}${location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
    api.get("/prelaunch/preview", { params: { token } })
      .then((r) => { if (!cancelled) setPreviewOk(!!r.data.ok); })
      .catch(() => { if (!cancelled) setPreviewOk(false); })
      .finally(() => { if (!cancelled) setPreviewChecked(true); });
    return () => { cancelled = true; };
  }, [location.hash, location.pathname, location.search, token]);

  if (!loaded || authLoading || !previewChecked) return null;

  // Pages atteintes depuis un lien que NOUS avons envoyé par courriel. Elles
  // portent toutes un jeton à usage unique : c'est lui qui autorise l'accès,
  // pas la porte de préversion. Sans cette liste, une invitation d'affilié, un
  // lien magique de connexion ou une réinitialisation de mot de passe tombait
  // sur « Coming Soon » — le destinataire ne pouvait rien faire du courriel
  // qu'on venait de lui envoyer.
  const EMAIL_ENTRY_PATHS = [
    "/affiliate/join",      // invitation d'affilié
    "/auth/callback",       // lien magique de connexion
    "/reset-password",      // réinitialisation de mot de passe
    "/newsletter/confirm",  // double opt-in infolettre
    "/staff-accept",        // invitation d'un membre du personnel
    "/order/",              // commande invité, via son jeton d'accès
  ];

  const bypass =
    !prelaunchEnabled ||
    user?.role === "admin" ||
    user?.role === "staff" ||
    previewOk ||
    ["/login", "/register", "/account"].some((p) => location.pathname.startsWith(p)) ||
    EMAIL_ENTRY_PATHS.some((p) => location.pathname.startsWith(p)) ||
    location.pathname.startsWith(ADMIN_PATH);

  if (!bypass) return <><ComingSoon /><Toaster position="bottom-right" /></>;
  return <Shell><AppRoutes /></Shell>;
}

// The COA/Lab page is hidden until the backend flag COA_PAGE_ENABLED is turned on
// (env var, no code change needed). Direct navigation to /lab redirects home while
// the flag is off, so the page can be re-enabled later without touching routing code.
function LabRoute() {
  const { loaded, coaPageEnabled } = useSiteConfig();
  if (!loaded) return null;
  return coaPageEnabled ? <Lab /> : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/catalog" element={<Catalog />} />
      <Route path="/product/:slug" element={<ProductDetail />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/order/:id" element={<OrderConfirmation />} />
      <Route path="/newsletter/confirm/:token" element={<NewsletterConfirm />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
      <Route path="/about" element={<About />} />
      <Route path="/lab" element={<LabRoute />} />
      <Route path="/compliance" element={<Compliance />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/affiliate/join" element={<AffiliateJoin />} />
      {/* Sans garde de session, mais PAS publique pour autant : la page ne
          montre rien sans un jeton d'invitation valide, que le serveur
          vérifie. Le programme reste privé ; seul l'invité peut le lire, et
          il peut le lire AVANT d'activer quoi que ce soit. */}
      <Route path="/affiliate/programme" element={<AffiliateProgramme />} />
      {/* PUBLIQUE, et volontairement : on doit pouvoir lire ce qu'on
          s'apprête à accepter avant d'y être invité, et le texte doit rester
          consultable pour établir ce qui a été accepté. */}
      <Route path="/affiliate/terms" element={<AffiliateTerms />} />
      {/* Protégée : la FAQ répond à des questions d'exploitation — seuils,
          délais, mécanique d'attribution — qui n'intéressent qu'un partenaire.
          La page elle-même écarte ensuite un compte non affilié. */}
      <Route path="/affiliate/faq" element={<ProtectedRoute><AffiliateFaq /></ProtectedRoute>} />
      <Route path="/affiliate" element={<ProtectedRoute><AffiliateDashboard /></ProtectedRoute>} />
      <Route path="/staff-accept" element={<StaffAccept />} />
      <Route
        path={`${ADMIN_PATH}/*`}
        element={
          <AdminGate>
            <Suspense fallback={<DashboardSkeleton />}>
              <ProtectedRoute adminOnly>
                <Admin basePath={ADMIN_PATH} />
              </ProtectedRoute>
            </Suspense>
          </AdminGate>
        }
      />
      <Route path="/admin/*" element={<Navigate to={ADMIN_PATH} replace />} />
      <Route path="/ops/*" element={<Navigate to={ADMIN_PATH} replace />} />
        {/* Alias de compatibilité : redirigent vers le portail OPS courant. */}
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      {/* Décide OÙ le mode nuit s'applique — comptes et administration
          seulement. Doit être dans le routeur : elle lit la page courante. */}
      <PorteeDuTheme cheminAdmin={ADMIN_PATH} />
      <SiteConfigProvider>
        <LanguageProvider>
          <AuthProvider>
            <CartProvider>
              <ErrorBoundary>
                <GatedApp />
              </ErrorBoundary>
            </CartProvider>
          </AuthProvider>
        </LanguageProvider>
      </SiteConfigProvider>
    </BrowserRouter>
  );
}
