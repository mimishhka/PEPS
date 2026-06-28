import { useEffect, useState } from "react";
import { useLang } from "../contexts/LanguageContext";

export default function AgeGate() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("nordpep_age_confirmed");
    if (!accepted) setOpen(true);
  }, []);

  if (!open) return null;

  const confirm = () => {
    localStorage.setItem("nordpep_age_confirmed", "1");
    setOpen(false);
  };

  const exit = () => {
    window.location.href = "https://www.canada.ca/en/health-canada.html";
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xl px-4"
      data-testid="age-gate-modal"
    >
      <div className="relative w-full max-w-lg border border-ink bg-white">
        <div className="bg-ink px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-white flex items-center justify-between">
          <span data-testid="age-gate-tag">// RESTRICTED · NORDPEP</span>
          <span className="text-signal" style={{ color: "#E51919" }}>19+</span>
        </div>
        <div className="p-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-tight" data-testid="age-gate-title">
            {t("age.title")}
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-foreground/80" data-testid="age-gate-body">
            {t("age.body")}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              data-testid="age-gate-confirm"
              onClick={confirm}
              className="flex-1 bg-ink text-white font-mono text-xs uppercase tracking-[0.2em] py-4 hover:bg-foreground/90 transition-colors"
            >
              {t("age.confirm")} →
            </button>
            <button
              data-testid="age-gate-exit"
              onClick={exit}
              className="flex-1 border border-ink font-mono text-xs uppercase tracking-[0.2em] py-4 hover:bg-secondary transition-colors"
            >
              {t("age.exit")}
            </button>
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            FOR RESEARCH USE ONLY · NOT FOR HUMAN CONSUMPTION
          </p>
        </div>
      </div>
    </div>
  );
}
