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
//
// PORTÉE RESTREINTE. Le mode nuit ne vaut QUE pour les espaces personnels —
// compte client, espace affilié, administration. La boutique publique garde
// son apparence en toutes circonstances.
//
// Ce n'était pas le cas au départ : la classe suivait le réglage du système,
// donc quelqu'un dont le téléphone est en mode sombre voyait la boutique
// basculer sans l'avoir demandé — et le bandeau devenait illisible. Une
// vitrine ne change pas d'aspect selon le réglage de qui la regarde.
//
// La décision de portée vit dans <PorteeDuTheme>, et non ici : elle a besoin
// de connaître la page courante, or ce fournisseur est monté au-dessus du
// routeur pour que le choix survive à la navigation.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

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

// Les espaces où le mode nuit s'applique. Tout le reste — vitrine, catalogue,
// panier, pages légales — reste en mode jour quoi qu'il arrive.
const ESPACES_PERSONNELS = ["/account", "/affiliate"];

export function estEspacePersonnel(chemin, cheminAdmin = "") {
  const p = String(chemin || "");
  const admin = String(cheminAdmin || "").trim();
  const bases = admin ? [...ESPACES_PERSONNELS, admin] : ESPACES_PERSONNELS;
  // Comparaison par SEGMENT : « /accounting » ne doit pas passer pour
  // « /account ». Un simple startsWith l'aurait accepté.
  return bases.some((b) => p === b || p.startsWith(`${b}/`));
}

/* Applique — ou retire — la classe de thème selon la page courante.
 *
 * À monter DANS le routeur. Séparée du fournisseur parce qu'elle a besoin de
 * useLocation(), tandis que l'état du choix doit vivre au-dessus du routeur
 * pour survivre à la navigation. */
export function PorteeDuTheme({ cheminAdmin = "" }) {
  const { sombre } = useTheme();
  const { pathname } = useLocation();
  // `cheminAdmin` vient d'App.js, qui détient la constante. Le déduire ici
  // d'une variable d'environnement aurait renvoyé undefined — le préfixe de
  // l'administration est écrit en dur, pas configuré — et l'administration
  // aurait perdu le thème sans que rien ne le signale.
  const actif = sombre && estEspacePersonnel(pathname, cheminAdmin);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", actif);
    // Indique au navigateur quoi peindre pour les barres de défilement et les
    // contrôles natifs, que la classe seule ne couvre pas.
    el.style.colorScheme = actif ? "dark" : "light";
    return () => {
      // En quittant l'application (ou au remontage), on ne laisse pas la page
      // figée en sombre : la vitrine reprendrait la classe au vol.
      el.classList.remove("dark");
      el.style.colorScheme = "light";
    };
  }, [actif]);

  return null;
}
