import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import api from "../lib/api";

/**
 * LA CLOCHE DU COMPTE AFFILIE.
 *
 * Mireille : une icone de notification pour un nouveau message, des
 * parametres de paiement non etablis, un nouveau palier atteint — avec la
 * possibilite d'effacer chaque notification. Le backend cree les entrees
 * (reponse du support, palier franchi, rappel de versement a cinq jours de
 * la fin du mois) ; cette cloche ne fait que les montrer et les effacer.
 */

const LIBELLES = {
  message: ["Une réponse à votre demande vous attend", "A reply to your request is waiting"],
  palier: ["Nouveau palier atteint", "New tier reached"],
  paiement: ["Vos paramètres de versement manquent", "Your payout settings are missing"],
};

const DETAILS = {
  message: [
    "dans l'onglet Aide.",
    "in the Help tab.",
  ],
  palier: [
    "votre taux de commission a augmenté.",
    "your commission rate went up.",
  ],
  paiement: [
    "sans adresse USDT/USDC, votre versement du 1er ne peut pas partir.",
    "without a USDT/USDC address, your payout on the 1st cannot leave.",
  ],
};

export default function ClocheAffilie({ L, onOuvrirParametres }) {
  const [notifs, setNotifs] = useState([]);
  const [nonLues, setNonLues] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const panneau = useRef(null);

  useEffect(() => {
    let monte = true;
    api.get("/affiliate/notifications")
      .then((r) => {
        if (!monte) return;
        setNotifs(r.data?.notifications || []);
        setNonLues((r.data?.notifications || []).length);
      })
      .catch(() => { /* la cloche reste silencieuse, jamais bloquante */ });
    return () => { monte = false; };
  }, []);

  // Fermeture au clic dehors : la cloche est une liste, pas une page.
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => {
      if (panneau.current && !panneau.current.contains(e.target)) setOuvert(false);
    };
    document.addEventListener("pointerdown", fermer);
    return () => document.removeEventListener("pointerdown", fermer);
  }, [ouvert]);

  const effacer = async (id) => {
    try {
      await api.post("/affiliate/notifications/dismiss", { id });
      setNotifs((n) => n.filter((x) => x.id !== id));
      setNonLues((c) => Math.max(0, c - 1));
    } catch { /* muet */ }
  };

  const toutEffacer = async () => {
    try {
      await api.post("/affiliate/notifications/dismiss", { all: true });
      setNotifs([]);
      setNonLues(0);
    } catch { /* muet */ }
  };

  const label = (n) => {
    const i = L("fr", "en") === "fr" ? 0 : 1;
    return {
      titre: (LIBELLES[n.kind] || LIBELLES.message)[i],
      detail: (DETAILS[n.kind] || DETAILS.message)[i],
      estPalier: n.kind === "palier" && n.ref,
      palier: n.ref,
    };
  };

  return (
    <div className="relative" ref={panneau}>
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-label={L("Notifications", "Notifications")}
        data-testid="affiliate-bell"
        className="relative p-2.5 rounded-full border border-ash text-glacier
                   hover:text-nordfjord hover:border-nova transition-colors
                   active:scale-[0.97]"
        style={{ borderRadius: "9999px" }}
      >
        <Bell size={16} />
        {nonLues > 0 && (
          <span aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1
                       rounded-full bg-nova text-nordfjord font-data text-[10px]
                       font-bold flex items-center justify-center">
            {nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="absolute right-0 top-11 z-50 w-[300px] max-w-[calc(100vw-2rem)]
                        rounded-xl border border-ash bg-white shadow-xl"
             style={{ boxShadow: "var(--ombre-flotte)" }}
             data-testid="affiliate-bell-panel">
          <div className="flex items-baseline justify-between px-4 pt-3 pb-2 border-b border-ash">
            <p className="font-data text-[11px] font-semibold uppercase tracking-[0.18em] text-nordfjord">
              {L("Notifications", "Notifications")}
            </p>
            {notifs.length > 0 && (
              <button onClick={toutEffacer}
                className="font-data text-[11px] text-glacier hover:text-nordfjord underline">
                {L("Tout effacer", "Clear all")}
              </button>
            )}
          </div>
          {notifs.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-glacier">
              {L("Aucune notification.", "No notifications.")}
            </p>
          ) : (
            <ul className="max-h-[340px] overflow-y-auto py-1">
              {notifs.map((n) => {
                const { titre, detail, estPalier, palier } = label(n);
                const contenu = (
                  <div className="flex items-start gap-2.5 px-4 py-3 hover:bg-clinical transition-colors">
                    <span aria-hidden="true"
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        n.kind === "palier" ? "bg-warning"
                        : n.kind === "paiement" ? "bg-error"
                        : "bg-nova"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-nordfjord leading-snug">
                        {titre}
                        {estPalier && <> · {palier}</>}
                      </p>
                      <p className="text-[12px] text-glacier mt-0.5 leading-snug">{detail}</p>
                    </div>
                    <button onClick={() => effacer(n.id)}
                      aria-label={L("Effacer", "Dismiss")}
                      className="shrink-0 mt-0.5 font-data text-[11px] text-glacier
                                 hover:text-error transition-colors">
                      ✕
                    </button>
                  </div>
                );
                return (
                  <li key={n.id} className="list-none">
                    {n.kind === "paiement"
                      /* Un bouton, pas un Link : la cloche vit DEJA dans le
                         tableau de bord, naviguer remonterait la page et
                         perdrait l'onglet. On ouvre Parametres sur place. */
                      ? <button type="button"
                          onClick={() => { setOuvert(false); onOuvrirParametres(); }}
                          className="block w-full text-left">{contenu}</button>
                      : contenu}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
