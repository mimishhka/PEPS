import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { t as tx } from "../lib/i18n";

const LanguageContext = createContext(null);

const LANGUES = ["fr", "en"];

/* LA LANGUE PEUT ÊTRE DEMANDÉE PAR LE LIEN.
 *
 * MIREILLE, 01/10/2026 : « si je choisis une langue pour mon affilié, il
 * recevra le courriel dans la langue demandée, sauf que le lien ne redirige
 * pas vraiment vers la page dans la bonne langue — pareil lorsque la personne
 * utilise le lien magique pour se connecter ».
 *
 * La cause était double, et cette moitié-ci est la clef de voûte.
 *
 * La langue ne venait que de `localStorage`, avec l'anglais par défaut. Un
 * affilié francophone qui n'avait JAMAIS visité le site n'avait donc rien en
 * mémoire : son courriel était en français, et la page s'ouvrait en anglais.
 * Le défaut touchait tous les liens envoyés par courriel — invitation
 * d'affilié, lien magique, réinitialisation de mot de passe, invitation au
 * personnel — et pas seulement les deux qu'elle a remarqués.
 *
 * L'autre moitié est côté serveur : les liens ne portaient aucune langue. Les
 * deux corrections vont ensemble ; celle-ci ne sert à rien sans l'autre, et
 * l'autre ne servirait à rien sans celle-ci.
 *
 * LE PARAMÈTRE EST RETENU, et non seulement honoré à l'arrivée. Qui arrive
 * par un courriel en français veut lire le site en français, y compris en
 * naviguant ensuite — et le sélecteur reste là pour en changer.
 */
function langueDuLien() {
  if (typeof window === "undefined") return "";
  try {
    const brut = new URLSearchParams(window.location.search).get("lang");
    // Les deux premières lettres suffisent : « fr-CA » comme « fr » désignent
    // la même chose, et un code inconnu est ignoré plutôt que de remplacer
    // une préférence déjà exprimée par quelque chose d'incompréhensible.
    const code = String(brut || "").trim().toLowerCase().slice(0, 2);
    return LANGUES.includes(code) ? code : "";
  } catch {
    return "";
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window === "undefined") return "en";
    // Le lien d'abord : c'est une demande explicite, faite à l'instant.
    // Puis la préférence retenue. Puis le repli.
    return langueDuLien() || localStorage.getItem("fironova_lang") || "en";
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
