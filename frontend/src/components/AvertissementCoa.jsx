import { FlaskConical } from "lucide-react";

import { useLang } from "../contexts/LanguageContext";

/**
 * « Ce lot part tout de suite, son certificat d'analyse n'est pas encore
 * publié. »
 *
 * MIREILLE, 11/10/2026 : « on veut permettre à ceux qui ne se soucient pas du
 * COA de commander, mais il faut un avertissement ».
 *
 * CE N'EST PAS UNE ALERTE, ET LA COULEUR LE DIT. Le produit est en stock,
 * conforme, et part aujourd'hui : rien ne va mal. Peint en orange ou en
 * rouge, cet encadré ferait fuir exactement les clientes qui s'en moquent —
 * celles que Mireille veut laisser commander. Il porte donc le cyan de la
 * marque, celui des informations de laboratoire, et une fiole plutôt qu'un
 * triangle.
 *
 * Il ne bloque rien non plus. Une fenêtre de confirmation serait le
 * traitement d'une précommande, c'est-à-dire précisément ce qu'on vient de
 * retirer. L'avertissement se voit, il ne barre pas la route.
 */
export default function AvertissementCoa({ compact = false, className = "", testId = "" }) {
  const { lang } = useLang();
  const fr = lang === "fr";

  if (compact) {
    return (
      <span
        className={`font-data text-[11px] text-nova-texte inline-flex items-center gap-1.5 ${className}`}
        data-testid={testId || "avertissement-coa-compact"}
      >
        <FlaskConical size={12} aria-hidden="true" className="shrink-0" />
        {fr ? "Certificat à venir" : "Certificate to come"}
      </span>
    );
  }

  return (
    <div
      className={`border border-nova/30 bg-nova/5 px-4 py-3.5 flex items-start gap-3 ${className}`}
      style={{ borderRadius: "var(--r-m)" }}
      data-testid={testId || "avertissement-coa"}
    >
      <FlaskConical size={17} className="text-nova-texte shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        <div className="font-data text-[11px] uppercase tracking-[0.2em] text-nova-texte">
          {fr ? "Certificat d'analyse à venir" : "Certificate of analysis to come"}
        </div>
        <p className="mt-1 text-sm text-glacier leading-relaxed">
          {fr
            ? "Ce lot est en stock et part tout de suite. Son certificat d'analyse n'est pas encore publié : il sera ajouté à la fiche du produit dès qu'il nous parvient."
            : "This batch is in stock and ships right away. Its certificate of analysis is not published yet : it will be added to the product page as soon as we receive it."}
        </p>
      </div>
    </div>
  );
}
