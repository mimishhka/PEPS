// frontend/src/components/TierLadder.jsx — NOUVEAU fichier.
//
// Échelle des paliers et simulateur de commission, portés depuis le document
// du programme où ils existaient en maquette sans jamais avoir été construits.
//
// Deux choses que le tableau de bord ne disait pas :
//
//   — CE QUI VIENT ENSUITE. L'affilié voyait son palier et le montant restant,
//     jamais l'échelle entière. On ne se projette pas dans une progression
//     dont on ignore la forme.
//   — CE QU'UNE VENTE RAPPORTE VRAIMENT. Un taux en pourcentage ne parle pas ;
//     un montant en dollars, oui. Le curseur transforme l'un en l'autre.
//
// Le barème vient du SERVEUR, jamais d'une copie locale : une échelle écrite
// en dur ici divergerait des seuils réels au premier ajustement, et montrerait
// une marche à franchir qui n'existe plus.
import { useState } from "react";

export default function TierLadder({ data, L, lang, money, TIER_META }) {
  const tiers = data?.tiers || [];
  const [montant, setMontant] = useState(150);

  if (!tiers.length) return null;

  const actuel = data?.tier;
  const rabais = Number(data?.coupon_percent ?? 10) / 100;
  // Base commissionnable : le rabais du contact est déduit avant le calcul.
  // L'afficher autrement promettrait plus que ce que le versement contient.
  const base = Math.round(montant * (1 - rabais) * 100) / 100;

  return (
    <div className="bg-white rounded-2xl border border-ash p-6" data-testid="tier-ladder">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.24em] text-nova">
          {L("CE QU'UNE VENTE RAPPORTE", "WHAT A SALE EARNS")}
        </p>
        <p className="font-data text-[10px] text-glacier">
          {L(`Base après le rabais de ${Math.round(rabais * 100)} % de votre contact`,
             `Base after your contact's ${Math.round(rabais * 100)}% discount`)}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <label htmlFor="sim-montant"
               className="font-data text-[10px] uppercase tracking-[0.18em] text-glacier">
          {L("Commande", "Order")}
        </label>
        <input id="sim-montant" type="number" min="20" max="5000" step="10"
               value={montant}
               onChange={(e) => setMontant(Math.max(0, Number(e.target.value) || 0))}
               data-testid="sim-amount"
               className="w-28 font-data text-lg font-bold text-nordfjord text-right
                          bg-clinical border border-ash rounded-lg px-3 py-2
                          outline-none focus:border-nova" />
        <input type="range" min="20" max="5000" step="10"
               value={Math.min(5000, Math.max(20, montant))}
               onChange={(e) => setMontant(Number(e.target.value))}
               aria-label={L("Montant de la commande", "Order amount")}
               className="flex-1 min-w-[10rem] accent-nova" />
        <span className="font-data text-[11px] text-glacier whitespace-nowrap">
          {L("base", "base")} {money(base)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((t) => {
          const meta = TIER_META[t.name] || {};
          const ici = t.name === actuel;
          return (
            <div key={t.name}
                 data-testid={`ladder-${t.name}`}
                 className={`rounded-xl border p-3 transition ${
                   ici ? "bg-clinical" : "bg-white border-ash"}`}
                 style={ici ? { borderColor: meta.color, boxShadow: `0 0 0 1px ${meta.color}` }
                            : undefined}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-data text-[10px] uppercase tracking-[0.14em] font-semibold"
                      style={{ color: meta.color }}>
                  {meta[lang] || t.name}
                </span>
                {ici && (
                  <span className="font-data text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5
                                   rounded-full"
                        style={{ background: `${meta.color}1f`, color: meta.color }}>
                    {L("vous", "you")}
                  </span>
                )}
              </div>
              <p className="font-display text-xl font-bold text-nordfjord tabular-nums mt-1">
                {money(Math.round(base * t.rate * 100) / 100)}
              </p>
              <p className="font-data text-[10px] text-glacier mt-0.5">
                {Math.round(t.rate * 1000) / 10} %
                {t.floor > 0 && (
                  <> · {L("dès", "from")} {money(t.floor)}</>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
