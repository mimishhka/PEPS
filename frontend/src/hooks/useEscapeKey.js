import { useEffect } from "react";

/**
 * Ferme un panneau ou une modale avec la touche Échap.
 *
 * Les modales du projet se ferment en cliquant sur le fond (`<div onClick>`),
 * ce qui ne marche qu'à la souris : au clavier, l'utilisateur reste piégé
 * dans la modale sans moyen d'en sortir. Ce hook rétablit le raccourci
 * attendu partout ailleurs sur le web.
 *
 * @param {boolean} active  n'écoute que lorsque la modale est ouverte
 * @param {() => void} onEscape  appelé à l'appui sur Échap
 */
export default function useEscapeKey(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onEscape]);
}
