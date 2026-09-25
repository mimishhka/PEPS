// Prénom et nom, en deux champs : mais un seul champ stocké.
//
// L'adresse conserve `full_name`, et c'est volontaire : c'est ce que lisent
// l'étiquette de Postes Canada, la recherche de commandes et l'affichage des
// dossiers. Scinder le stockage aurait demandé de migrer toutes les commandes
// existantes et de toucher à la création d'étiquettes : beaucoup de risque
// pour un gain nul, puisque le transporteur veut de toute façon une seule
// ligne de nom.
//
// La saisie, elle, se fait en deux champs : c'est ce qu'attendent les gens,
// c'est ce que remplit l'autocomplétion du navigateur (`given-name` et
// `family-name`), et cela évite les « Tremblay Marie » inversés.
import { useEffect, useRef, useState } from "react";

// « Marie Claire Tremblay » → prénom « Marie », nom « Claire Tremblay ».
// Le nom de famille prend le reste : il est bien plus souvent composé que le
// prénom, et la recomposition reste fidèle dans les deux cas.
export function separerNom(complet) {
  const propre = String(complet || "").trim().replace(/\s+/g, " ");
  if (!propre) return { prenom: "", nom: "" };
  const espace = propre.indexOf(" ");
  if (espace === -1) return { prenom: propre, nom: "" };
  return { prenom: propre.slice(0, espace), nom: propre.slice(espace + 1) };
}

export function composerNom(prenom, nom) {
  return `${String(prenom || "").trim()} ${String(nom || "").trim()}`.trim();
}

export function NomEnDeux({ valeur, onChange, lang, prefix, requis = true, classeChamp, classeEtiquette }) {
  const lbl = (en, fr) => (lang === "fr" ? fr : en);
  const [parts, setParts] = useState(() => separerNom(valeur));
  // Ce que ce composant a écrit en dernier. Sans cette mémoire, taper un
  // espace dans le prénom déclencherait un nouveau découpage et la lettre
  // suivante partirait dans le champ du nom.
  const dernierEcrit = useRef(composerNom(parts.prenom, parts.nom));

  useEffect(() => {
    const entrant = String(valeur || "").trim();
    if (entrant === dernierEcrit.current) return;   // c'est notre propre écho
    const decoupe = separerNom(entrant);
    dernierEcrit.current = composerNom(decoupe.prenom, decoupe.nom);
    setParts(decoupe);
  }, [valeur]);

  const modifier = (champ, texte) => {
    const suite = { ...parts, [champ]: texte };
    setParts(suite);
    const complet = composerNom(suite.prenom, suite.nom);
    dernierEcrit.current = complet;
    onChange(complet);
  };

  const champ = classeChamp || "rounded-xl border border-ash px-4 py-3 outline-none focus:border-nova w-full";
  const etiquette = classeEtiquette
    || "font-data text-[10px] uppercase tracking-[0.18em] text-compliance";

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className={etiquette}>{lbl("First name", "Prénom")}</span>
        <input value={parts.prenom} onChange={(e) => modifier("prenom", e.target.value)}
          required={requis} autoComplete="given-name" data-testid={`${prefix}-first-name`}
          className={champ} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={etiquette}>{lbl("Last name", "Nom")}</span>
        <input value={parts.nom} onChange={(e) => modifier("nom", e.target.value)}
          required={requis} autoComplete="family-name" data-testid={`${prefix}-last-name`}
          className={champ} />
      </label>
    </>
  );
}

export default NomEnDeux;
