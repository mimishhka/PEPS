// frontend/src/components/GuidedTour.jsx — NOUVEAU fichier.
//
// Visite guidée en bulles. Écrite à la main plutôt qu'ajoutée en dépendance :
// le besoin tient en une centaine de lignes, et une bibliothèque de visite
// guidée pèse plus lourd que ce qu'elle rend ici.
//
// Trois règles de conduite, qui viennent de ce que ces visites font mal en
// général :
//
//   — « Quitter » est visible dès la première bulle, jamais réduit à une croix
//     minuscule. Une visite dont on ne voit pas la sortie est une prison.
//   — Une étape dont la cible est absente est SAUTÉE, pas affichée dans le
//     vide. La mise en page change avec les données ; pointer une zone qui
//     n'existe pas ferait douter du reste.
//   — La visite ne se rejoue jamais d'elle-même une fois terminée ou quittée.
//     Elle reste relançable à la demande.
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const MARGE = 8;      // respiration autour de la zone mise en évidence
const ECART = 12;     // distance entre la zone et la bulle
const HAUTEUR = 190;  // hauteur estimée d'une bulle, pour décider haut ou bas

// Ce composant ne mémorise RIEN. Savoir si la visite a déjà été donnée relève
// de la fiche affilié, côté serveur : un marqueur dans le navigateur la faisait
// rejouer entièrement sur un autre appareil ou après un nettoyage. Le parent
// décide de l'afficher et enregistre la fin par onClose.
export default function GuidedTour({ steps, onClose, L }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState(null);

  // Étapes réellement affichables : celles dont la cible existe dans le DOM.
  const [utiles, setUtiles] = useState([]);
  useEffect(() => {
    setUtiles(steps.filter((s) => document.querySelector(`[data-testid="${s.cible}"]`)));
  }, [steps]);

  const etape = utiles[i];

  // Terminer et quitter appellent la même sortie : quelqu'un qui s'en va à la
  // deuxième bulle a décidé qu'il n'en voulait pas, et la lui resservir au
  // prochain chargement serait le punir de son choix. C'est le parent qui
  // enregistre, ce composant ne fait que le prévenir.
  const fermer = useCallback(() => { onClose(); }, [onClose]);

  // Position de la zone mise en évidence. useLayoutEffect et non useEffect :
  // mesurer après peinture ferait apparaître la bulle au mauvais endroit
  // pendant une image, ce qui se voit.
  useLayoutEffect(() => {
    if (!etape) return undefined;
    const el = document.querySelector(`[data-testid="${etape.cible}"]`);
    if (!el) return undefined;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const mesurer = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    mesurer();
    // Le défilement est animé : on remesure le temps qu'il se termine.
    const t = setInterval(mesurer, 60);
    const stop = setTimeout(() => clearInterval(t), 700);
    window.addEventListener("resize", mesurer);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
      window.removeEventListener("resize", mesurer);
    };
  }, [etape]);

  // Échap ferme la visite, les flèches la parcourent. Attendu de tout ce qui
  // recouvre l'écran.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") fermer();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, utiles.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fermer, utiles.length]);

  if (!etape || !box) return null;

  const dernier = i === utiles.length - 1;
  // La bulle passe au-dessus quand la zone est en bas d'écran, pour ne pas
  // sortir du cadre.
  const dessous = box.top + box.height + ECART + HAUTEUR < window.innerHeight;
  const bulleStyle = {
    position: "fixed",
    left: Math.max(16, Math.min(box.left, window.innerWidth - 360)),
    top: dessous
      ? box.top + box.height + ECART
      : Math.max(16, box.top - HAUTEUR - ECART),
    width: "min(22rem, calc(100vw - 2rem))",
    zIndex: 10001,
  };

  return (
    <>
      {/* Voile percé : une ombre portée démesurée assombrit tout SAUF la zone
          ciblée. Évite quatre rectangles à positionner et reste net au
          redimensionnement. */}
      <div
        aria-hidden="true"
        onClick={fermer}
        style={{
          position: "fixed",
          top: box.top - MARGE,
          left: box.left - MARGE,
          width: box.width + MARGE * 2,
          height: box.height + MARGE * 2,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(11,46,79,.72)",
          zIndex: 10000,
          pointerEvents: "auto",
          transition: "all .18s ease",
        }}
      />
      <div style={bulleStyle} role="dialog" aria-modal="true"
           aria-label={etape.titre} data-testid="guided-tour">
        <div className="bg-nordfjord text-clinical rounded-xl p-4 shadow-2xl">
          <p className="font-display font-bold text-[15px] leading-snug">{etape.titre}</p>
          <p className="text-[13px] leading-relaxed mt-1.5 text-clinical/85">{etape.texte}</p>
          <div className="flex items-center justify-between gap-3 mt-3.5">
            <span className="font-data text-[11px] text-clinical/60 tabular-nums">
              {i + 1} / {utiles.length}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={fermer} data-testid="tour-exit"
                      className="font-data text-[11px] uppercase tracking-wider text-clinical/70 hover:text-clinical px-2 py-1.5">
                {L("Quitter", "Exit")}
              </button>
              {i > 0 && (
                <button onClick={() => setI(i - 1)} data-testid="tour-prev"
                        className="px-3 py-1.5 rounded-full border border-clinical/30 font-data text-[11px] font-bold uppercase tracking-wider">
                  {L("Précédent", "Back")}
                </button>
              )}
              <button
                onClick={() => (dernier ? fermer() : setI(i + 1))}
                data-testid="tour-next"
                className="px-3.5 py-1.5 rounded-full bg-nova text-nordfjord font-data text-[11px] font-bold uppercase tracking-wider">
                {dernier ? L("Terminer", "Done") : L("Suivant", "Next")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
