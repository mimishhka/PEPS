// frontend/src/components/TermsModal.jsx — NOUVEAU fichier.
//
// Fenêtre de lecture des conditions du programme, ouverte PAR-DESSUS l'écran
// d'acceptation. Un nouvel onglet faisait quitter la page : sur mobile il
// désoriente, et au retour on ne sait plus où on en était.
//
// Le bouton de fermeture reste grisé tant que la personne n'a pas déroulé
// jusqu'au bas. On ne peut évidemment pas prouver la lecture — mais un
// défilement complet est autrement plus sérieux qu'un lien ouvert et refermé
// dans la seconde, et c'est cette trace-là qui a une valeur le jour où
// quelqu'un conteste avoir accepté.
//
// Échap ferme TOUJOURS, même sans défilement : on n'enferme personne dans une
// fenêtre. Mais fermer ainsi ne débloque pas la case — la sortie est libre,
// le crédit ne l'est pas.
import { useCallback, useEffect, useRef, useState } from "react";
import { SECTIONS, AFFILIATE_TERMS_VERSION } from "../pages/AffiliateTerms";

export default function TermsModal({ L, lang, onClose }) {
  const isFr = lang === "fr";
  const zone = useRef(null);
  const [bas, setBas] = useState(false);

  // `bas` passe à vrai quand on atteint le bas — ou d'emblée si le texte tient
  // sans défilement. Sans cette seconde branche, un grand écran rendrait le
  // bouton définitivement grisé : une porte qu'on ne peut plus franchir.
  const mesurer = useCallback(() => {
    const el = zone.current;
    if (!el) return;
    const marge = 24;   // tolérance : le dernier pixel est difficile à atteindre
    const atteint = el.scrollHeight - el.scrollTop - el.clientHeight <= marge;
    const sansDefilement = el.scrollHeight <= el.clientHeight + marge;
    if (atteint || sansDefilement) setBas(true);
  }, []);

  useEffect(() => {
    mesurer();                       // cas du texte qui tient déjà en entier
    const t = setTimeout(mesurer, 120);  // après la mise en page
    return () => clearTimeout(t);
  }, [mesurer]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(false); };
    window.addEventListener("keydown", onKey);
    // Le corps ne défile plus derrière la fenêtre : sans cela, la molette
    // continue la page au lieu du texte, et la personne croit être bloquée.
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = avant;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center px-4 py-6"
         style={{ background: "rgba(11,46,79,.72)" }}
         onClick={() => onClose(false)}
         data-testid="terms-modal">
      <div className="w-full max-w-2xl max-h-full bg-white rounded-2xl border border-ash
                      flex flex-col overflow-hidden shadow-2xl"
           role="dialog" aria-modal="true" aria-label={isFr ? "Conditions du programme" : "Program terms"}
           onClick={(e) => e.stopPropagation()}>

        <div className="px-6 pt-5 pb-3 border-b border-ash">
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
            {L("VERSION", "VERSION")} {AFFILIATE_TERMS_VERSION}
          </p>
          <h2 className="font-display text-xl font-bold text-nordfjord mt-1">
            {L("Conditions du programme d'affiliation", "Affiliate program terms")}
          </h2>
        </div>

        <div ref={zone} onScroll={mesurer}
             className="flex-1 overflow-y-auto px-6 py-5 space-y-7"
             data-testid="terms-modal-scroll">
          {SECTIONS.map((s, i) => (
            <div key={s.id}>
              <h3 className="font-display text-base font-bold text-nordfjord">
                <span className="font-data text-xs text-nova mr-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {isFr ? s.fr.title : s.en.title}
              </h3>
              <div className="mt-2 space-y-2.5 text-[13px] text-glacier leading-relaxed">
                {s.paras.map((p, j) => (
                  <p key={j} className={p.strong ? "font-semibold text-nordfjord" : undefined}>
                    {isFr ? p.fr : p.en}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-ash flex items-center justify-between gap-4">
          <p className="font-data text-[11px] text-glacier">
            {bas
              ? L("Vous avez parcouru le texte.", "You have been through the text.")
              : L("Faites défiler jusqu'au bas pour continuer.", "Scroll to the bottom to continue.")}
          </p>
          <button
            onClick={() => onClose(true)}
            disabled={!bas}
            data-testid="terms-modal-close"
            title={bas ? undefined : L("Déroulez le texte jusqu'au bas.", "Scroll the text to the bottom.")}
            className="px-5 py-2.5 rounded-full bg-nova text-nordfjord font-data text-xs font-bold
                       uppercase tracking-wider disabled:opacity-35 disabled:cursor-not-allowed
                       whitespace-nowrap">
            {L("J'ai lu", "I have read")}
          </button>
        </div>
      </div>
    </div>
  );
}
