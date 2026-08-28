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
    // La destination part AUSSI dans l'URL, pas seulement dans l'état de
    // navigation : `state` ne survit ni à un rechargement de la page de
    // connexion, ni au détour par le courriel du lien magique.
    //
    // `search` et `hash` sont conservés — `pathname` seul perdait les
    // paramètres, et une page atteinte avec un filtre revenait nue.
    const cible = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(cible)}`}
        state={{ from: cible }}
        replace
      />
    );
  }
  // "staff" a un accès admin partiel — quelles sections il voit dépend de
  // ses permissions, vérifiées à l'affichage de chaque section ET, surtout,
  // par le backend sur chaque appel API (la vraie barrière de sécurité).
  if (adminOnly && user.role !== "admin" && user.role !== "staff") {
    return <Navigate to="/" replace />;
  }
  return children;
}
