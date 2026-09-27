import { Link } from "react-router-dom";

/**
 * LE MENU DU COMPTE AFFILIE, partage entre le tableau de bord et la FAQ.
 *
 * Mireille : « le menu doit aussi etre sur la page FAQ ». Extraire la barre
 * dans un composant unique garantit que les deux ecrans ne divergent jamais —
 * meme ordre, memes libelles, meme style.
 *
 * Les boutons appellent `onTab` (le tableau de bord bascule d'onglet, la
 * page FAQ renvoie vers /affiliate?tab=...). La FAQ est une PAGE complete :
 * son entree est un lien, la seule du menu.
 */

const ELEMENTS = [
  ["overview", "Vue globale", "Overview"],
  ["performance", "Performance", "Performance"],
  ["payments", "Paiements", "Payments"],
  ["compliance", "Conformité", "Compliance"],
  ["settings", "Paramètres", "Settings"],
  ["support", "Aide", "Help"],
  ["faq", "FAQ", "FAQ"],
];

export const CLES_ONGLETS = ELEMENTS.map(([k]) => k).filter((k) => k !== "faq");

export default function OngletsAffilie({ actif, L, onTab, actifRef }) {
  return (
    <div className="-mx-5 px-5 sm:mx-0 sm:px-0 mb-7 overflow-x-auto sm:overflow-visible
                    scrollbar-none snap-x snap-mandatory border-b border-ash pb-2.5">
      <div className="flex gap-1 w-max sm:w-auto sm:flex-wrap">
        {ELEMENTS.map(([k, fr, en]) => {
          const label = L(fr, en);
          const cls = `snap-start shrink-0 px-4 py-2.5 rounded-full font-data text-xs
                       font-semibold uppercase tracking-wider transition-colors
                       active:scale-[0.97] ${
            actif === k ? "bg-nordfjord text-white shadow-sm"
                        : "text-glacier hover:text-nordfjord hover:bg-white"}`;
          if (k === "faq") {
            return (
              <Link key={k} to="/affiliate/faq" data-testid="affiliate-tab-faq"
                    className={cls}>
                {label}
              </Link>
            );
          }
          return (
            <button key={k} onClick={() => onTab(k)}
              data-testid={`affiliate-tab-${k}`}
              ref={actif === k ? actifRef : null}
              aria-current={actif === k ? "page" : undefined}
              className={cls}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
