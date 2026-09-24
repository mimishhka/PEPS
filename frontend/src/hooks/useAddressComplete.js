import { useEffect } from "react";

// AddressComplete de Postes Canada : l'initialisation, partagée.
//
// Chaque écran qui saisit une adresse (checkout, compte client) branche ses
// champs ici, une seule fois. La librairie remplit rue, ville, province et
// code postal ensemble, depuis le fichier d'adresses du transporteur.
//
// LE GARDE-FOU : si le script n'est pas servi — fin de l'essai, blocage —
// window.pca est absent et il ne se passe rien. La saisie libre reste le
// chemin nominal, avec ses propres aides (formatage du code postal, province
// déduite de la première lettre, vérification Google).
//
// `champs` porte des refs React : elles sont nulles tant que le formulaire
// n'est pas rendu, et l'effet ne se réarme que quand `actif` change — c'est
// ce qui permet d'appeler ce crochet au sommet d'un composant dont le
// formulaire d'adresse n'apparaît qu'à l'ouverture.
export function useAddressComplete({ champs, lang, actif = true }) {
  useEffect(() => {
    if (!actif) return undefined;
    if (typeof window === "undefined" || !window.pca) return undefined;
    const pca = window.pca;
    const mode = pca.fieldMode?.POPULATE;
    const cibles = [
      { element: champs.ligne1?.current, field: "Line1", mode },
      { element: champs.ligne2?.current, field: "Line2", mode },
      { element: champs.ville?.current, field: "City", mode },
      // La province est un <select> de codes (QC, ON...) : AddressComplete
      // remplit la valeur du code, qui correspond aux options.
      { element: champs.province?.current, field: "ProvinceCode", mode },
      { element: champs.codePostal?.current, field: "PostalCode", mode },
    ].filter((c) => c.element);
    if (cibles.length === 0) return undefined;

    let controle = null;
    try {
      controle = new pca.Address(cibles, {
        language: lang === "fr" ? "fr" : "en",
        // Boutique canadienne : pas d'adresse hors Canada.
        countries: { codesList: "CA" },
      });
    } catch {
      return undefined; // échec d'initialisation : la saisie libre reste
    }
    return () => {
      try { if (controle && controle.destroy) controle.destroy(); } catch { /* fin de vie */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif, lang]);
}
