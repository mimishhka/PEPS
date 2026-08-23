// frontend/src/hooks/useChartColors.js — couleurs de graphique suivant le thème.
//
// Recharts reçoit ses couleurs en PROPRIÉTÉS (stroke, fill), pas en classes
// Tailwind. Elles échappent donc entièrement au thème : la grille #E2E8F0 et
// les axes #64748B, justes sur fond clair, deviennent l'un éblouissant et
// l'autre illisible sur une carte sombre.
//
// On ne peut pas non plus y écrire `rgb(var(--fn-ash))` : `var()` ne se
// résout pas dans un attribut de présentation SVG. Il faut donc lire le thème
// en JavaScript et fournir la valeur finale.
//
// Les valeurs sombres viennent de la palette de nuit d'index.css — Ash de nuit
// pour la grille, Glacier de nuit pour les axes — et non de teintes choisies
// au jugé.
import { useTheme } from "../contexts/ThemeContext";

export default function useChartColors() {
  const { sombre } = useTheme();
  return sombre
    ? { grille: "#1E3C58", axe: "#9FB6CC" }   // Ash nuit, Glacier nuit
    : { grille: "#E2E8F0", axe: "#64748B" };  // valeurs d'origine, mode jour
}
