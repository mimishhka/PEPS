import { useEffect, useRef, useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { useLang } from "../contexts/LanguageContext";

export default function AgeGate() {
  const { t } = useLang();
  // E2E SP-004 : la confirmation etait persistee en localStorage, donc le
  // gate ne revenait plus au rechargement — contrairement a la regle du plan
  // (« pas memorise »). L'etat vit en MEMOIRE : chaque chargement repose la
  // question, comme une verification d'age doit le faire.
  const [open, setOpen] = useState(true);
  // « Quitter » renvoyait vers le site de Santé Canada.
  //
  // Deux problèmes. Envoyer un visiteur vers le régulateur depuis une boutique
  // de peptides pouvait laisser croire à une association qui n'existe pas. Et
  // cela expédiait vers un tiers quelqu'un qui n'avait rien demandé d'autre
  // que de s'en aller.
  //
  // Le refus reste donc chez nous : un écran terminal, sans lien de retour et
  // sans destination. Il n'est pas mémorisé : un rechargement ramène la
  // question, ce qui est le comportement attendu d'une vérification d'âge et
  // évite d'enfermer quelqu'un sur un refus mal cliqué.
  const [refuse, setRefuse] = useState(false);

  // PIEGE DE FOCUS (E2E NF-007 / SP-003) : la tabulation restait dans la
  // page derriere le voile et atteignait le catalogue sans repondre. Tant
  // que la question est posee (ou le refus affiche), Tab ne sort pas de la
  // fenetre : on reboucle du dernier element au premier.
  const fenetreRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const surTouche = (e) => {
      if (e.key !== "Tab") return;
      const fenetre = fenetreRef.current;
      if (!fenetre) return;
      const ciblables = Array.from(
        fenetre.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute("disabled"));
      if (ciblables.length === 0) return;
      const premier = ciblables[0];
      const dernier = ciblables[ciblables.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener("keydown", surTouche);
    // Le premier element interactif prend le focus des l'ouverture : le
    // clavier commence dans la fenetre, pas derriere.
    const t = setTimeout(() => {
      const f = fenetreRef.current;
      if (f) {
        const premier = f.querySelector("button, a[href], input, [tabindex]");
        if (premier) premier.focus();
      }
    }, 50);
    return () => { document.removeEventListener("keydown", surTouche); clearTimeout(t); };
  }, [open]);

  // Le voile couvrait l'écran sans empêcher la page de défiler dessous : on
  // pouvait parcourir le catalogue à la molette sans jamais répondre. Le
  // défilement est donc bloqué tant que la question est posée, et rendu dès
  // qu'elle ne l'est plus : y compris si le composant disparaît entre-temps.
  // E2E SP-005 : body etait bloque, mais <html> defilait encore a la molette.
  useEffect(() => {
    if (!open) return undefined;
    const precedentBody = document.body.style.overflow;
    const precedentHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = precedentBody;
      document.documentElement.style.overflow = precedentHtml;
    };
  }, [open]);

  if (!open) return null;

  const confirm = () => {
    setOpen(false);
  };

  const exit = () => setRefuse(true);

  if (refuse) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-nordfjord px-4" style={{ zIndex: "var(--z-modal)" }}
        data-testid="age-gate-denied"
        role="alertdialog"
        aria-modal="true"
        ref={fenetreRef}
      >
        <div className="w-full max-w-md text-center">
          <ShieldCheck size={28} className="text-nova-texte mx-auto" aria-hidden="true" />
          <h2 className="mt-6 font-display text-2xl sm:text-3xl font-bold tracking-[-0.01em] text-white">
            {t("age.deniedTitle")}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-mist">
            {t("age.deniedBody")}
          </p>
          <p className="mt-8 font-data text-[10px] uppercase tracking-[0.24em] text-compliance">
            {t("age.deniedNote")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-nordfjord/80 backdrop-blur-xl px-4" style={{ zIndex: "var(--z-modal)" }}
      data-testid="age-gate-modal"
      role="dialog"
      aria-modal="true"
      ref={fenetreRef}
    >
      {/* Mesh accent */}
      <div className="pointer-events-none absolute inset-0 opacity-30"
           style={{
             background:
               "radial-gradient(600px circle at 20% 30%, rgba(0,184,212,0.25), transparent 60%)," +
               "radial-gradient(500px circle at 80% 70%, rgba(0,184,212,0.15), transparent 60%)",
           }} />

      <div className="relative w-full max-w-lg rounded-xl overflow-hidden bg-white border border-ash shadow-2xl">
        {/* Top bar : Fironova nordfjord + nova accent */}
        <div className="bg-nordfjord px-6 py-3 font-data text-[11px] uppercase tracking-[0.25em] text-white flex items-center justify-between">
          <span className="inline-flex items-center gap-2" data-testid="age-gate-tag">
            <ShieldCheck size={14} className="text-nova-texte" />
            RESTRICTED · FIRONOVA
          </span>
          <span className="text-nova-texte font-bold">19+</span>
        </div>

        <div className="p-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.01em] text-nordfjord" data-testid="age-gate-title">
            {t("age.title")}
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-glacier" data-testid="age-gate-body">
            {t("age.body")}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              data-testid="age-gate-confirm"
              onClick={confirm}
              className="flex-1 bg-nordfjord text-white font-data text-xs uppercase tracking-[0.2em] py-4 hover:bg-nordfjord/90 transition inline-flex items-center justify-center gap-2" style={{ borderRadius: "var(--r-m)" }}
            >
              {t("age.confirm")}
              <span className="text-nova-texte" aria-hidden="true">→</span>
            </button>
            <button
              data-testid="age-gate-exit"
              onClick={exit}
              className="flex-1 border border-ash text-nordfjord font-data text-xs uppercase tracking-[0.2em] py-4 hover:border-nova hover:text-nova-texte transition inline-flex items-center justify-center gap-2" style={{ borderRadius: "var(--r-m)" }}
            >
              <LogOut size={12} />
              {t("age.exit")}
            </button>
          </div>

          <p className="mt-6 text-center font-data text-[10px] uppercase tracking-[0.28em] text-glacier">
            FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT
          </p>
        </div>
      </div>
    </div>
  );
}
