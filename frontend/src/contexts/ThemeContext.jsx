// frontend/src/contexts/ThemeContext.jsx — NOUVEAU fichier.
//
// Mode jour / nuit.
//
// Trois états, pas deux : « clair », « sombre », et SYSTÈME — le défaut.
// Quelqu'un dont le téléphone est en mode sombre retrouve le mode sombre sans
// rien demander, et si ce réglage change en cours de route, la page suit. Un
// simple booléen aurait perdu cette troisième possibilité, et forcé un choix
// à qui n'en avait pas exprimé.
//
// La classe est posée sur <html> et non sur <body> : plusieurs écrans peignent
// leur propre fond de page, et une classe sur <body> laisserait des bandes
// claires au-delà du contenu lors du défilement.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const CLE = "fn_theme";           // "light" | "dark" | "system"
const ThemeContext = createContext(null);

function lireChoix() {
  try {
    const v = localStorage.getItem(CLE);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    // Navigation privée ou stockage refusé : on suit le système.
    return "system";
  }
}

function systemeSombre() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }) {
  const [choix, setChoix] = useState(lireChoix);
  const [sombreSysteme, setSombreSysteme] = useState(systemeSombre);

  // Le réglage du système peut changer pendant la visite — coucher du soleil
  // sur un téléphone, bascule manuelle sur un portable. On écoute plutôt que
  // de lire une fois au chargement.
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return undefined;
    }
    const onChange = (e) => setSombreSysteme(e.matches);
    // addEventListener n'existe pas sur MediaQueryList dans les Safari anciens.
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);

  const sombre = choix === "dark" || (choix === "system" && sombreSysteme);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", sombre);
    // Indique au navigateur quoi peindre pour les barres de défilement et les
    // contrôles natifs, que la classe seule ne couvre pas.
    el.style.colorScheme = sombre ? "dark" : "light";
  }, [sombre]);

  const definir = useCallback((v) => {
    setChoix(v);
    try {
      if (v === "system") localStorage.removeItem(CLE);
      else localStorage.setItem(CLE, v);
    } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
  }, []);

  const valeur = useMemo(
    () => ({ choix, sombre, definir }),
    [choix, sombre, definir]
  );

  return <ThemeContext.Provider value={valeur}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
