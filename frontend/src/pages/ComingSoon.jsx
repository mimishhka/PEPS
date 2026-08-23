import { useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";
import { useLang } from "../contexts/LanguageContext";

export default function ComingSoon() {
  const { t, lang } = useLang();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    // LCAP : consentement exprès obligatoire, case jamais pré-cochée.
    if (!consent) {
      toast.error(t("home.newsletterConsentRequired"));
      return;
    }
    setBusy(true);
    try {
      await api.post("/newsletter/subscribe", { email: email.trim(), consent, lang, source: "prelaunch" });
      setDone(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || t("home.newsletterError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white grain flex items-center justify-center px-6 py-16" data-testid="coming-soon-page">
      <div className="w-full max-w-xl text-center">
        <div className="font-display font-bold text-3xl tracking-[-0.01em] text-ink">
          FIRONOVA<span className="text-nova">.</span>
        </div>

        <svg viewBox="0 0 520 120" className="w-full h-24 mt-10" role="img" aria-label="HPLC chromatogram">
          <line x1="20" y1="100" x2="500" y2="100" stroke="#3E5C76" strokeWidth="1.5" />
          <path
            className="hplc-trace"
            d="M20 98 L120 96 L150 94 L168 84 L180 20 L196 90 L214 96 L280 94 L300 52 L318 95 L400 97 L420 74 L438 96 L500 97"
            fill="none" stroke="#00B8D4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          />
        </svg>

        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.02em] text-ink mt-8">
          {t("prelaunch.title")}
        </h1>
        <div className="mx-auto mt-6 w-24 h-px bg-nova" />
        <p className="mt-6 text-glacier leading-relaxed max-w-md mx-auto">{t("prelaunch.body")}</p>

        {done ? (
          <div
            className="mt-10 rounded-lg border border-ash bg-white px-6 py-8 shadow-lg"
            data-testid="coming-soon-success"
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-glacier">
              {t("prelaunch.confirmedTag")}
            </div>
            <p className="mt-3 text-ink">{t("prelaunch.confirmed")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-10 text-left max-w-md mx-auto" data-testid="coming-soon-form">
            <div className="flex rounded-full bg-white border border-ash p-1.5 shadow-lg">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("home.newsletterPlaceholder")}
                className="flex-1 px-5 py-3 bg-transparent font-mono text-sm text-ink focus:outline-none min-w-0 rounded-full"
                data-testid="coming-soon-input"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-nordfjord text-white font-mono text-xs uppercase tracking-[0.25em] px-6 py-3 disabled:opacity-60 whitespace-nowrap"
                data-testid="coming-soon-submit"
              >
                {t("prelaunch.cta")} →
              </button>
            </div>
            <label className="mt-4 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                data-testid="coming-soon-consent"
                className="mt-0.5 w-4 h-4 shrink-0 accent-[#00B8D4]"
              />
              <span className="text-[11px] leading-relaxed text-glacier">{t("home.newsletterConsent")}</span>
            </label>
          </form>
        )}

        <p className="mt-12 fn-ruo inline-block">
          FOR RESEARCH USE ONLY · USAGE RECHERCHE UNIQUEMENT · 19+
        </p>
      </div>
    </div>
  );
}
