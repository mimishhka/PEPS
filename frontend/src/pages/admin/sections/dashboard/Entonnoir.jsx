// L'entonnoir des commandes : créées → payées → expédiées → livrées.
//
// Les entonnoirs des maquettes commencent aux vues produit et aux paniers
// abandonnés. Nous ne les enregistrons pas, et une première marche inventée
// fausserait tous les pourcentages qui suivent. Celui-ci part donc de la
// commande créée, qui est un fait vérifiable.
//
// Chaque marche porte son compte ET sa part de la première : c'est la
// comparaison qui informe, pas le nombre brut. La perte entre deux marches
// est écrite en clair — c'est elle qui appelle une action.
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-ash rounded-xl overflow-hidden border border-ash"
         data-testid={testid}>
      {lignes.map((m, i) => {
        const precedente = i > 0 ? lignes[i - 1] : null;
        const perdues = precedente ? precedente.count - m.count : 0;
        return (
          <div key={m.step} className="bg-card px-4 py-3.5" data-testid={`${testid}-${m.step}`}>
            <div className="text-[11px] text-glacier">{etiquettes[m.step]}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="font-display text-xl font-bold tabular-nums text-nordfjord leading-none">
                {m.count}
              </span>
              <span className="text-[11px] text-glacier tabular-nums">{m.pct} %</span>
            </div>
            {/* La barre donne la proportion d'un coup d'œil ; le texte la dit
                aussi, pour qui ne distingue pas les longueurs. */}
            <div className="mt-2.5 h-1.5 bg-clinical rounded-full overflow-hidden">
              <div className="h-full bg-nova/70 rounded-full"
                   style={{ width: `${Math.max(2, m.pct)}%` }} aria-hidden="true" />
            </div>
            <div className="text-[10px] text-glacier mt-1.5 h-4">
              {perdues > 0 && (
                <span className="text-warning">
                  −{perdues} {L("depuis l'étape précédente", "from previous step")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Entonnoir;
