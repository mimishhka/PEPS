import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";

import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider } from "./contexts/AuthContext";
import { CartProvider } from "./contexts/CartContext";

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

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <CartProvider>
            <Shell>
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
                <Route path="/lab" element={<Lab />} />
                <Route path="/compliance" element={<Compliance />} />
                <Route path="/admin/*" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
                <Route path="*" element={<Home />} />
              </Routes>
            </Shell>
          </CartProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
