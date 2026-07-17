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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#3A0A08]/70 backdrop-blur-xl px-4"
      data-testid="age-gate-modal"
    >
      <div className="relative w-full max-w-lg rounded-lg overflow-hidden bg-paper border border-faint shadow-luxe-lg">
        <div className="bg-garnet px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-paper flex items-center justify-between">
          <span data-testid="age-gate-tag">// RESTRICTED · FIRONOVA</span>
          <span className="text-copperlight">19+</span>
        </div>
        <div className="p-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-[-0.01em] text-ink" data-testid="age-gate-title">
            {t("age.title")}
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-inkmuted" data-testid="age-gate-body">
            {t("age.body")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              data-testid="age-gate-confirm"
              onClick={confirm}
              className="flex-1 rounded-full bg-signal text-paper font-mono text-xs uppercase tracking-[0.2em] py-4 shadow-luxe hover:shadow-luxe-lg transition-shadow"
            >
              {t("age.confirm")} →
            </button>
            <button
              data-testid="age-gate-exit"
              onClick={exit}
              className="flex-1 rounded-full border border-faint text-ink font-mono text-xs uppercase tracking-[0.2em] py-4 hover:border-copper transition-colors"
            >
              {t("age.exit")}
            </button>
          </div>
          <p className="mt-6 fn-ruo block text-center">
            FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT
          </p>
        </div>
      </div>
    </div>
  );
}
