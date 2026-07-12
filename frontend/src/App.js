import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";

import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { CartProvider } from "./contexts/CartContext";
import { SiteConfigProvider, useSiteConfig } from "./contexts/SiteConfigContext";

import Header from "./components/Header";
import Footer from "./components/Footer";
import AgeGate from "./components/AgeGate";
import CartDrawer from "./components/CartDrawer";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
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
import Admin from "./pages/admin/AdminLayout";

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
      <Route path="/admin/*" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
      <Route path="*" element={<Home />} />
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
              <Shell>
                <AppRoutes />
              </Shell>
            </CartProvider>
          </AuthProvider>
        </LanguageProvider>
      </SiteConfigProvider>
    </BrowserRouter>
  );
}
