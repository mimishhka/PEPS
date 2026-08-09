// frontend/src/components/ScrollToTop.jsx
// Remet le défilement en haut à chaque changement de route — sinon en cliquant
// un produit depuis le bas du catalogue, on arrive au milieu de la fiche.
// Respecte les ancres (#section) : ne scrolle pas en haut si un hash est présent.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return; // laisser le navigateur gérer l'ancre
    window.scrollTo({ top: 0, left: 0, behavior: "instant" in window ? "instant" : "auto" });
  }, [pathname, hash]);

  return null;
}
