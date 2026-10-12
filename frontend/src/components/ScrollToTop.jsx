// frontend/src/components/ScrollToTop.jsx
// Remet le défilement en haut à chaque changement de route : sinon en cliquant
// un produit depuis le bas du catalogue, on arrive au milieu de la fiche.
//
// ET IL GÈRE LUI-MÊME LES ANCRES, parce que personne d'autre ne le faisait.
//
// MIREILLE, 11/10/2026 : « pourquoi le lien qui renvoie à l'entreposage ne me
// conduit qu'à la page des FAQ ».
//
// Ce fichier portait la ligne « laisser le navigateur gérer l'ancre ». C'était
// faux, et c'est le genre de défaut le plus coûteux : une règle écrite, qui a
// l'air appliquée, et qui ne l'est jamais. Le navigateur ne gère l'ancre que
// lorsqu'il CHARGE un document. Ici la navigation est interne : React Router
// change l'URL, le navigateur ne recharge rien, et au moment où le hash change
// la section visée n'existe pas encore dans le DOM — les pages sont chargées
// en différé. Il n'y avait donc personne pour faire défiler, et tous les liens
// à ancre du site tombaient en haut de leur page : `/faq#storage` comme
// `/compliance#shipping`.
//
// On réessaie, parce qu'une route chargée en différé peut mettre quelques
// images à se monter. Plafonné à une seconde : au-delà, mieux vaut laisser la
// page tranquille que la faire sauter sous les doigts de quelqu'un qui a
// commencé à lire.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const INTERVALLE_MS = 50;
const ESSAIS = 20; // 1 s

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" in window ? "instant" : "auto" });
      return undefined;
    }

    const cible = decodeURIComponent(hash.replace(/^#/, ""));
    if (!cible) return undefined;

    let annule = false;
    let restants = ESSAIS;
    let minuteur = 0;

    const essayer = () => {
      if (annule) return;
      const el = document.getElementById(cible);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "start", behavior: "auto" });
        return;
      }
      restants -= 1;
      if (restants > 0) minuteur = window.setTimeout(essayer, INTERVALLE_MS);
    };

    essayer();
    return () => {
      annule = true;
      if (minuteur) window.clearTimeout(minuteur);
    };
  }, [pathname, hash]);

  return null;
}
