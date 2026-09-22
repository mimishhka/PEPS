// Les durées, dites comme on les dit.
//
// Le délai de paiement a longtemps été écrit en dur dans la page — « 12
// heures » — alors que la règle publiée aux clients dit trente minutes et que
// le serveur applique ce que son `.env` porte. Trois chiffres, trois sources,
// sur un même écran. Ces deux fonctions ne connaissent qu'une source : la
// commande elle-même.

// 0.5 -> « 30 minutes ». 2 -> « 2 heures ». 1.5 -> « 1 h 30 ».
// Renvoie null si la valeur est absente ou absurde : mieux vaut une phrase
// sans durée qu'une durée inventée.
export function delaiLisible(heures, lang) {
  const h = Number(heures);
  if (!Number.isFinite(h) || h <= 0) return null;
  const minutes = Math.round(h * 60);
  const en = lang !== "fr";
  if (minutes < 60) return en ? `${minutes} minutes` : `${minutes} minutes`;
  const entieres = Math.floor(minutes / 60);
  const reste = minutes % 60;
  if (reste === 0) {
    if (entieres === 1) return en ? "1 hour" : "1 heure";
    return en ? `${entieres} hours` : `${entieres} heures`;
  }
  return en ? `${entieres}h ${reste}min` : `${entieres} h ${reste}`;
}

// Ce qu'il reste, arrondi vers le BAS. « Il vous reste 1 minute » quand il en
// reste quarante secondes, c'est déjà trop tard pour un virement.
export function resteLisible(millisecondes, lang) {
  const ms = Math.max(0, Number(millisecondes) || 0);
  const minutes = Math.floor(ms / 60000);
  const en = lang !== "fr";
  if (minutes < 60) {
    if (minutes <= 1) return en ? "less than a minute" : "moins d'une minute";
    return en ? `${minutes} min` : `${minutes} min`;
  }
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return en ? `${heures}h ${reste}min` : `${heures} h ${reste} min`;
}
