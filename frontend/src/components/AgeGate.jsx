import { useEffect, useState } from "react";
import { useLang } from "../contexts/LanguageContext";

export default function AgeGate() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("fironova_age_confirmed");
    if (!accepted) setOpen(true);
  }, []);

  if (!open) return null;

  const confirm = () => {
    localStorage.setItem("fironova_age_confirmed", "1");
    setOpen(false);
  };

  const exit = () => {
    window.location.href = "https://www.canada.ca/en/health-canada.html";
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-nordfjord/80 backdrop-blur-xl px-4"
      data-testid="age-gate-modal"
    >
      <div className="relative w-full max-w-lg rounded-lg overflow-hidden bg-white border border-ash shadow-2xl">
        <div className="bg-nordfjord px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-white flex items-center justify-between">
          <span data-testid="age-gate-tag">// RESTRICTED · FIRONOVA</span>
          <span className="text-nova">19+</span>
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
              className="flex-1 rounded-full bg-nova text-nordfjord font-mono text-xs uppercase tracking-[0.2em] py-4 transition-colors hover:bg-[#00A3BC]"
            >
              {t("age.confirm")} →
            </button>
            <button
              data-testid="age-gate-exit"
              onClick={exit}
              className="flex-1 rounded-full border border-ash text-nordfjord font-mono text-xs uppercase tracking-[0.2em] py-4 hover:border-nova hover:text-nova transition-colors"
            >
              {t("age.exit")}
            </button>
          </div>
          <p className="mt-6 block text-center font-mono text-[11px] uppercase tracking-[0.2em] text-compliance border border-compliance/40 rounded-lg px-4 py-3">
            FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT
          </p>
        </div>
      </div>
    </div>
  );
}
