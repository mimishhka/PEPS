import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../contexts/LanguageContext";

const STORAGE_KEY = "fironova_cookie_consent";

export default function CookieConsent() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md z-[90]"
      data-testid="cookie-consent"
    >
      <div className="rounded-xl border border-ash bg-white shadow-2xl p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-compliance mb-2">
          // {t("cookies.title")}
        </div>
        <p className="text-sm leading-relaxed text-glacier mb-4">{t("cookies.body")}</p>
        <div className="flex items-center gap-3">
          <button
            data-testid="cookie-consent-accept"
            onClick={accept}
            className="rounded-full bg-nova text-nordfjord font-mono text-xs uppercase tracking-[0.2em] px-5 py-2.5 transition-colors hover:bg-[#00A3BC]"
          >
            {t("cookies.accept")}
          </button>
          <Link
            to="/privacy"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-glacier underline underline-offset-4 hover:text-nordfjord transition-colors"
          >
            {t("cookies.learnMore")}
          </Link>
        </div>
      </div>
    </div>
  );
}
