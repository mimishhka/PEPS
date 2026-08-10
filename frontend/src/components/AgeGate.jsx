import { useEffect, useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
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
      {/* Mesh accent */}
      <div className="pointer-events-none absolute inset-0 opacity-30"
           style={{
             background:
               "radial-gradient(600px circle at 20% 30%, rgba(0,184,212,0.25), transparent 60%)," +
               "radial-gradient(500px circle at 80% 70%, rgba(0,184,212,0.15), transparent 60%)",
           }} />

      <div className="relative w-full max-w-lg rounded-2xl overflow-hidden bg-white border border-ash shadow-2xl">
        {/* Top bar — Fironova nordfjord + nova accent */}
        <div className="bg-nordfjord px-6 py-3 font-data text-[11px] uppercase tracking-[0.25em] text-white flex items-center justify-between">
          <span className="inline-flex items-center gap-2" data-testid="age-gate-tag">
            <ShieldCheck size={14} className="text-nova" />
            RESTRICTED · FIRONOVA
          </span>
          <span className="text-nova font-bold">19+</span>
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
              className="flex-1 rounded-full bg-nordfjord text-white font-data text-xs uppercase tracking-[0.2em] py-4 hover:bg-nordfjord/90 shadow-lg shadow-nordfjord/20 transition inline-flex items-center justify-center gap-2"
            >
              {t("age.confirm")}
              <span className="text-nova" aria-hidden="true">→</span>
            </button>
            <button
              data-testid="age-gate-exit"
              onClick={exit}
              className="flex-1 rounded-full border border-ash text-nordfjord font-data text-xs uppercase tracking-[0.2em] py-4 hover:border-nova hover:text-nova transition inline-flex items-center justify-center gap-2"
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
