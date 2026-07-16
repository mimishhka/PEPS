import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, checking } = useAuth();
  const location = useLocation();

  if (checking) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center font-mono text-xs uppercase tracking-[0.25em] text-foreground/60">
        LOADING…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  // "staff" a un accès admin partiel — quelles sections il voit dépend de
  // ses permissions, vérifiées à l'affichage de chaque section ET, surtout,
  // par le backend sur chaque appel API (la vraie barrière de sécurité).
  if (adminOnly && user.role !== "admin" && user.role !== "staff") {
    return <Navigate to="/" replace />;
  }
  return children;
}
