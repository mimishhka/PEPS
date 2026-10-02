// L'échelle des paliers : ses couleurs, et ce qu'elle promet.
//
// MIREILLE, 01/10/2026, capture à l'appui : « aussi où sont passées les
// couleurs des paliers... des icônes ».
//
// Les six symboles sortaient gris. La jetonisation des couleurs de palier
// avait remplacé le champ `color` de TIER_META par `jeton` — et converti
// CarteAffilie, mais pas ce fichier. Les CINQ lectures de `meta.color`
// rendaient `undefined` :
//
//   — `<TierMark color={undefined}>` retombe sur `currentColor`, donc la
//     couleur de texte héritée : gris ;
//   — la bordure du palier courant disparaissait ;
//   — la pastille « vous » recevait `background: "undefined1f"`, une chaîne
//     invalide que le navigateur ignore.
//
// Rien ne tenait cette liaison. Ce composant n'avait aucun test.

import { render, screen } from "@testing-library/react";

import TierLadder from "./TierLadder";

const L = (fr) => fr;
const money = (n) => `${Number(n || 0).toFixed(2)} $`;

// La vraie table du tableau de bord : des JETONS, pas des couleurs finies.
const TIER_META = {
  standard: { fr: "Standard", en: "Standard", jeton: "--fn-palier-standard" },
  bronze: { fr: "Bronze", en: "Bronze", jeton: "--fn-palier-bronze" },
  silver: { fr: "Argent", en: "Silver", jeton: "--fn-palier-argent" },
  gold: { fr: "Or", en: "Gold", jeton: "--fn-palier-or" },
  platinum: { fr: "Platine", en: "Platinum", jeton: "--fn-palier-platine" },
  diamond: { fr: "Diamant", en: "Diamond", jeton: "--fn-palier-diamant" },
};

const DATA = {
  tier: "bronze",
  rolling12_revenue: 4679,
  coupon_percent: 10,
  tiers: [
    { name: "standard", rate: 0.10, floor: 0, ceil: 2000 },
    { name: "bronze", rate: 0.12, floor: 2001, ceil: 5000 },
    { name: "silver", rate: 0.14, floor: 5001, ceil: 15000 },
    { name: "gold", rate: 0.16, floor: 15001, ceil: 40000 },
    { name: "platinum", rate: 0.18, floor: 40001, ceil: 100000 },
    { name: "diamond", rate: 0.20, floor: 100001, ceil: null },
  ],
};

const afficher = (data = DATA) =>
  render(<TierLadder data={data} L={L} lang="fr" money={money}
                     TIER_META={TIER_META} />);

// CE QUE CES TESTS NE PEUVENT PAS LIRE, ET POURQUOI ILS LISENT AUTRE CHOSE.
//
// jsdom rejette `rgb(var(--x))` comme valeur invalide et SUPPRIME la
// propriété : `style.color` revient vide, et l'attribut `style` vaut `null`.
// Une assertion `toHaveStyle("color: rgb(var(--fn-palier-bronze))")` compare
// donc deux absences et passe quoi qu'il arrive — c'était ma première
// rédaction, et elle aurait laissé passer le défaut même qu'on corrige.
//
// Le composant expose donc `data-jeton` et `data-jeton-vif`, que jsdom garde
// intacts. On vérifie le CHOIX du jeton, qui est ce qui s'est cassé ; le fait
// que `rgb(var(...))` peigne bien relève du navigateur.

const jeton = (palier) =>
  screen.getByTestId(`ladder-${palier}`).getAttribute("data-jeton");

describe("les couleurs des paliers", () => {
  test("LE CAS DE MIREILLE : chaque palier retient SON jeton", () => {
    afficher();

    expect(jeton("standard")).toBe("--fn-palier-standard");
    expect(jeton("bronze")).toBe("--fn-palier-bronze");
    expect(jeton("silver")).toBe("--fn-palier-argent");
    expect(jeton("gold")).toBe("--fn-palier-or");
    expect(jeton("platinum")).toBe("--fn-palier-platine");
    expect(jeton("diamond")).toBe("--fn-palier-diamant");
  });

  test("LES SIX SONT DISTINCTS — c'est le test qui attrape le défaut", () => {
    /* Le défaut ne se voyait pas comme une absence de couleur mais comme six
     * symboles IDENTIQUES : `meta.color` étant `undefined` partout, tous
     * retombaient sur la même valeur. Un correctif qui les peindrait tous
     * pareil passerait le test précédent et raterait le problème. */
    afficher();

    const jetons = ["standard", "bronze", "silver", "gold", "platinum", "diamond"]
      .map(jeton);

    expect(new Set(jetons).size).toBe(6);
    for (const j of jetons) expect(j).toMatch(/^--fn-palier-/);
  });

  test("LE SYMBOLE prend le trait VIF, pas celui du texte", () => {
    /* 4,5:1 vaut pour du TEXTE ; un objet graphique n'exige que 3:1. Durcir
     * les symboles au seuil du texte les éteint sans raison — c'est la
     * décision déjà prise pour les cartes de l'onglet Performance, et
     * l'échelle doit la suivre. */
    afficher();

    expect(screen.getByTestId("ladder-bronze").getAttribute("data-jeton-vif"))
      .toBe("--fn-vif-bronze");
    expect(screen.getByTestId("ladder-diamond").getAttribute("data-jeton-vif"))
      .toBe("--fn-vif-diamant");
  });

  test("aucun `undefined` ne traverse", () => {
    /* La pastille « vous » composait son fond en collant « 1f » à la couleur.
     * Avec `meta.color` absent, cela donnait la chaîne « undefined1f ». */
    afficher();

    for (const p of ["standard", "bronze", "silver", "gold", "platinum", "diamond"]) {
      expect(jeton(p)).not.toContain("undefined");
    }
  });

  test("un palier inconnu retombe sur le jeton par défaut, sans lever", () => {
    // Un barème qui gagnerait un palier sans que TIER_META suive ne doit pas
    // casser l'écran.
    afficher({ ...DATA,
               tiers: [...DATA.tiers, { name: "mythique", rate: 0.25, floor: 999999, ceil: null }] });

    expect(jeton("mythique")).toBe("--fn-palier-defaut");
  });
});

describe("le palier courant", () => {
  test("il est le seul marqué « vous »", () => {
    afficher();

    expect(screen.getByTestId("ladder-bronze")).toHaveTextContent(/vous/i);
    expect(screen.getByTestId("ladder-silver")).not.toHaveTextContent(/vous/i);
    expect(screen.getByTestId("ladder-standard")).not.toHaveTextContent(/vous/i);
  });
});

describe("ce que l'échelle promet", () => {
  test("elle ne rend rien sans barème — jamais une échelle vide", () => {
    /* `tiers` vient du serveur précisément pour qu'une échelle écrite en dur
     * ne diverge pas du barème appliqué. Sans elle, mieux vaut ne rien
     * afficher que d'inventer des seuils. */
    const { container } = afficher({ ...DATA, tiers: [] });
    expect(container).toBeEmptyDOMElement();
  });

  test("le gain simulé déduit le rabais du contact", () => {
    // 150 $ moins 10 % = 135 $ de base ; à 12 % cela fait 16,20 $.
    // L'afficher autrement promettrait plus que ce que le versement contient.
    afficher();
    expect(screen.getByTestId("ladder-bronze")).toHaveTextContent("16.20");
  });
});
