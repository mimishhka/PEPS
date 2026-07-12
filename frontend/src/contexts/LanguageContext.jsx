import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { t as tx } from "../lib/i18n";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem("fironova_lang") || "en";
  });

  useEffect(() => {
    localStorage.setItem("fironova_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const toggle = useCallback(() => setLang((l) => (l === "en" ? "fr" : "en")), []);
  const t = useCallback((path) => tx(lang, path), [lang]);

  const value = useMemo(() => ({ lang, setLang, toggle, t }), [lang, toggle, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
