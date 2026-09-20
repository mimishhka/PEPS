// L'entonnoir des commandes : créées → payées → expédiées → livrées.
//
// Les entonnoirs des maquettes commencent aux vues produit et aux paniers
// abandonnés. Nous ne les enregistrons pas, et une première marche inventée
// fausserait tous les pourcentages qui suivent. Celui-ci part de la commande
// créée, qui est un fait vérifiable.
//
// Quatre lignes, pas quatre cartes : c'est une même mesure qui décroît, la
// comparaison doit se lire verticalement, d'un coup d'œil.
export function Entonnoir({ marches, L, testid = "funnel" }) {
  const etiquettes = {
    created: L("Créées", "Created"),
    paid: L("Payées", "Paid"),
    shipped: L("Expédiées", "Shipped"),
    delivered: L("Livrées", "Delivered"),
  };
  const lignes = (marches || []).filter((m) => etiquettes[m.step]);
  if (!lignes.length || !lignes[0].count) return null;

  return (
    <div data-testid={testid}>
      {lignes.map((m, i) => {
        const precedente = i > 0 ? lignes[i - 1] : null;
        const perdues = precedente ? precedente.count - m.count : 0;
        return (
          <div key={m.step} className="py-2.5 border-b border-ash/40 last:border-0"
               data-testid={`${testid}-${m.step}`}>
            <div className="flex items-baseline gap-3 text-sm">
              <span className="text-nordfjord">{etiquettes[m.step]}</span>
              <span className="font-data text-[11px] text-glacier tabular-nums">{m.pct} %</span>
              {perdues > 0 && (
                <span className="font-data text-[11px] text-glacier/70 tabular-nums">
                  −{perdues}
                </span>
              )}
              <span className="ml-auto font-data tabular-nums text-nordfjord">{m.count}</span>
            </div>
            <div className="mt-1.5 h-[3px] bg-ash/40">
              <div className="h-full bg-nordfjord" style={{ width: `${Math.max(1, m.pct)}%` }}
                   aria-hidden="true" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Entonnoir;
