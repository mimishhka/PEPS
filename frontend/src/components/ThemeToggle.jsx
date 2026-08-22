// frontend/src/components/ThemeToggle.jsx — NOUVEAU fichier.
//
// Bascule à TROIS positions, et non deux : clair, sombre, système.
//
// Un interrupteur binaire oblige à choisir, et fait perdre le suivi du réglage
// de l'appareil. La troisième position est le défaut — celle qui convient à
// qui n'a jamais eu à y penser.
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useLang } from "../contexts/LanguageContext";

export default function ThemeToggle({ className = "" }) {
  const { choix, definir } = useTheme();
  const { lang } = useLang();
  const L = (fr, en) => (lang === "fr" ? fr : en);

  const options = [
    { v: "light", Icon: Sun, t: L("Clair", "Light") },
    { v: "dark", Icon: Moon, t: L("Sombre", "Dark") },
    { v: "system", Icon: Monitor, t: L("Système", "System") },
  ];

  return (
    <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-full border border-ash ${className}`}
         role="radiogroup"
         aria-label={L("Apparence", "Appearance")}
         data-testid="theme-toggle">
      {options.map(({ v, Icon, t }) => {
        const actif = choix === v;
        return (
          <button key={v}
            type="button"
            role="radio"
            aria-checked={actif}
            aria-label={t}
            title={t}
            onClick={() => definir(v)}
            data-testid={`theme-${v}`}
            className={`w-7 h-7 grid place-items-center rounded-full transition ${
              actif ? "bg-nordfjord text-clinical" : "text-glacier hover:text-nordfjord"}`}>
            <Icon size={13} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
