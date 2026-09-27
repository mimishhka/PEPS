import { useEffect, useRef, useState } from "react";

// UN MONTANT QUI COMPTE JUSQU'À SA VALEUR.
//
// Mireille : « il faut que ce soit vivant ». Le compte d'une affiliée n'est pas
// la vitrine : c'est l'endroit où elle vient voir sa récompense. Un chiffre qui
// monte jusqu'à son total transforme une donnée en moment.
//
// POURQUOI CELUI-CI A LE DROIT DE S'ANIMER. La table de fréquence d'Emil
// Kowalski tranche : une animation vue cent fois par jour doit disparaître,
// une animation occasionnelle peut porter du plaisir. Ce montant est vu une
// fois par visite — c'est exactement le cas « occasionnel ».
//
// Et il dit quelque chose : la progression du compteur EST la lecture du
// montant. Ce n'est pas de la décoration posée sur un chiffre déjà lisible.
//
// TROIS GARDE-FOUS :
//   — `prefers-reduced-motion` coupe le compte et pose la valeur finale ;
//   — la durée reste sous une seconde : au-delà, on attend son propre argent ;
//   — une valeur qui CHANGE après coup ne rejoue pas depuis zéro, elle repart
//     de là où elle est. Rejouer depuis zéro ferait clignoter un solde.
const DUREE = 900;

// Sortie exponentielle : rapide d'emblée, puis elle se pose. Les courbes
// natives de CSS sont trop molles pour qu'un compteur paraisse décidé.
const sortie = (t) => 1 - Math.pow(2, -10 * t);

export default function ChiffreAnime({ valeur, format, className, testId }) {
  const cible = Number(valeur) || 0;
  const [affiche, setAffiche] = useState(cible);
  const depart = useRef(cible);
  const trame = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setAffiche(cible);
      return undefined;
    }
    const sansMouvement = window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (sansMouvement || typeof requestAnimationFrame === "undefined") {
      setAffiche(cible);
      return undefined;
    }

    const de = depart.current;
    if (de === cible) {
      setAffiche(cible);
      return undefined;
    }

    const t0 = window.performance.now();
    const avancer = (maintenant) => {
      const t = Math.min(1, (maintenant - t0) / DUREE);
      setAffiche(de + (cible - de) * sortie(t));
      if (t < 1) {
        trame.current = requestAnimationFrame(avancer);
      } else {
        depart.current = cible;
      }
    };
    trame.current = requestAnimationFrame(avancer);
    return () => {
      if (trame.current) cancelAnimationFrame(trame.current);
      depart.current = cible;
    };
  }, [cible]);

  // tabular-nums : sans lui, chaque chiffre qui défile change la largeur du
  // nombre et le montant tressaute pendant tout le compte.
  return (
    <span className={`${className || ""} tabular-nums`} data-testid={testId}>
      {format ? format(affiche) : Math.round(affiche)}
    </span>
  );
}
