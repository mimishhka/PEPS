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
const HAUTEUR = 200;  // hauteur estimée d'une bulle, pour décider haut ou bas

// Couleurs FONCTIONNELLES du système d'identité, pas des teintes décoratives.
// Le système pose une règle : un seul accent décisif, Nova Cyan. Ces trois-là
// ne le concurrencent pas, elles qualifient — vert pour l'argent acquis, ambre
// pour ce qui attend, bleu conformité pour une règle. La couleur informe.
const TONS = {
  acquis:      { c: "#2E9E6B", fr: "Acquis",     en: "Earned" },
  attente:     { c: "#E8A33D", fr: "En attente", en: "Pending" },
  regle:       { c: "#5B7A9E", fr: "Règle",      en: "Rule" },
  nova:        { c: "#00B8D4", fr: "",           en: "" },
};

/** L'étincelle nova du système d'identité. Déjà marqueur de liste et sceau de
 *  confiance ailleurs sur le site — elle ne sort donc pas de nulle part. */
function Spark({ size = 12, className = "", style }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"
         className={className} style={style}>
      <path d="M50 8 L57 43 L92 50 L57 57 L50 92 L43 57 L8 50 L43 43 Z" fill="currentColor" />
    </svg>
  );
}

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

  const ton = TONS[etape.ton] || TONS.nova;
  const libelle = ton.fr ? L(ton.fr, ton.en) : "";
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
        <div className="bg-nordfjord text-clinical rounded-xl p-4 shadow-2xl border-l-[3px]"
             style={{ borderLeftColor: ton.c }}>
          {/* Étiquette de zone. Absente pour le ton neutre : une étiquette qui
              dirait « Info » n'apprendrait rien et volerait une ligne. */}
          {libelle && (
            <span className="inline-flex items-center gap-1.5 font-data text-[10px]
                             font-semibold uppercase tracking-[0.16em] mb-1.5"
                  style={{ color: ton.c }}>
              <Spark size={10} /> {libelle}
            </span>
          )}
          <p className="font-display font-bold text-[15px] leading-snug">{etape.titre}</p>
          <p className="text-[13px] leading-relaxed mt-1.5 text-clinical/85">{etape.texte}</p>
          <div className="flex items-center justify-between gap-3 mt-3.5">
            {/* Chapelet d'étincelles plutôt qu'un « 2 / 5 » muet : on voit ce
                qui reste sans le lire. Le compteur chiffré subsiste pour les
                lecteurs d'écran, à qui une rangée d'icônes ne dit rien. */}
            <span className="flex items-center gap-[3px]"
                  role="img"
                  aria-label={L(`Étape ${i + 1} sur ${utiles.length}`,
                                `Step ${i + 1} of ${utiles.length}`)}>
              {utiles.map((_, n) => (
                <Spark key={n} size={12}
                       style={{
                         color: n <= i ? "#00B8D4" : "rgba(255,255,255,.26)",
                         filter: n <= i ? "drop-shadow(0 0 5px rgba(0,184,212,.7))" : "none",
                         transition: "color .2s, filter .2s",
                       }} />
              ))}
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
