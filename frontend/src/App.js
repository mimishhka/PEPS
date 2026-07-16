import { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";

import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CartProvider } from "./contexts/CartContext";
import { SiteConfigProvider, useSiteConfig } from "./contexts/SiteConfigContext";
import api from "./lib/api";

import Header from "./components/Header";
import Footer from "./components/Footer";
import AgeGate from "./components/AgeGate";
import CartDrawer from "./components/CartDrawer";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminGate from "./components/AdminGate";

import Home from "./pages/Home";
import ComingSoon from "./pages/ComingSoon";
import Catalog from "./pages/Catalog";
import ProductDetail from "./pages/ProductDetail";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Account from "./pages/Account";
import About from "./pages/About";
import Lab from "./pages/Lab";
import Compliance from "./pages/Compliance";
import Privacy from "./pages/Privacy";
import Faq from "./pages/Faq";
import NotFound from "./pages/NotFound";

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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <AgeGate />
      <Header />
      <CartDrawer />
      <main className="flex-1">{children}</main>
      <Footer />
      <Toaster position="bottom-right" />
    </div>
  );
}

// La page d'attente se suffit à elle-même : ni header boutique, ni panier,
// ni footer — sinon le prélancement laisse fuiter toute la navigation.
function GatedApp() {
  const { loaded, prelaunchEnabled } = useSiteConfig();
  const { user, checking: authLoading } = useAuth();
  const location = useLocation();
  const [previewOk, setPreviewOk] = useState(false);
  const [previewChecked, setPreviewChecked] = useState(false);
  const token = new URLSearchParams(location.search).get("preview");

  useEffect(() => {
    let cancelled = false;
    if (!token) { setPreviewChecked(true); return; }
    api.get("/prelaunch/preview", { params: { token } })
      .then((r) => { if (!cancelled) setPreviewOk(!!r.data.ok); })
      .catch(() => { if (!cancelled) setPreviewOk(false); })
      .finally(() => { if (!cancelled) setPreviewChecked(true); });
    return () => { cancelled = true; };
  }, [token]);

  if (!loaded || authLoading || !previewChecked) return null;

  const bypass =
    !prelaunchEnabled ||
    user?.role === "admin" ||
    user?.role === "staff" ||
    previewOk ||
    ["/login", "/register", "/account"].some((p) => location.pathname.startsWith(p)) ||
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
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/catalog" element={<Catalog />} />
      <Route path="/product/:slug" element={<ProductDetail />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/order/:id" element={<OrderConfirmation />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
      <Route path="/about" element={<About />} />
      <Route path="/lab" element={<LabRoute />} />
      <Route path="/compliance" element={<Compliance />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/faq" element={<Faq />} />
      <Route
        path={`${ADMIN_PATH}/*`}
        element={
          <AdminGate>
            <Suspense fallback={null}>
              <ProtectedRoute adminOnly>
                <Admin basePath={ADMIN_PATH} />
              </ProtectedRoute>
            </Suspense>
          </AdminGate>
        }
      />
      {/* L'ancien /admin ne mène plus nulle part de spécial — traité comme
          n'importe quelle URL inconnue, comme si le panneau n'avait jamais
          existé à cet endroit. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SiteConfigProvider>
        <LanguageProvider>
          <AuthProvider>
            <CartProvider>
              <GatedApp />
            </CartProvider>
          </AuthProvider>
        </LanguageProvider>
      </SiteConfigProvider>
    </BrowserRouter>
  );
}
