// Les trois autres cibles du point 4 : la carte produit, le pied de page,
// la case de consentement.
//
// Audit UI/UX du 06/10/2026, section 1 :
//
//   « Boutons ADD TO ORDER : 30 px de haut → Sous le minimum de 44–48 px.
//     Ce sont les boutons qui rapportent de l'argent. »
//   « Liens du pied de page (Terms, Privacy, Shipping, FAQ) : 17 px de haut,
//     collés → Taps ratés, ouverture du mauvais lien. padding: 12px 0;
//     display: block sur chaque lien. »
//
// jsdom ne calcule rien : ces tests lisent les classes qui portent le
// plancher. C'est pauvre, et c'est assumé — elles attrapent ce qui arrive
// réellement, à savoir qu'une ligne se reformate et perd un bout.
//
// Le lien du pied de page a droit à une vérification plus forte que sa seule
// marge : `block`. Sans elle, la zone sensible s'arrête aux lettres, et une
// colonne de liens larges de 160 px n'offre que la largeur du mot le plus
// court. C'est ce que le rapport décrit par « ouverture du mauvais lien » :
// on vise entre deux liens et on tombe sur celui du dessous.

import { render, screen } from "@testing-library/react";

import ProductCard from "./ProductCard";

jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...reste }) => <a href={String(to)} {...reste}>{children}</a>,
}));
jest.mock("../contexts/LanguageContext", () => ({
  useLang: () => ({ lang: "fr", setLang: jest.fn(), toggle: jest.fn(), t: (k) => k }),
}));
jest.mock("../contexts/CartContext", () => ({
  useCart: () => ({ add: jest.fn() }),
}));
jest.mock("./ConfirmDialog", () => ({
  useConfirm: () => jest.fn().mockResolvedValue(true),
}));
jest.mock("./ProductImage", () => ({
  __esModule: true,
  default: () => null,
}));

const produit = {
  slug: "bpc-157",
  name_fr: "BPC-157",
  name_en: "BPC-157",
  price_cad: 60,
  dosage_mg: 5,
  variants: [{ dosage_mg: 5, price: 60, stock: 12 }],
};

const pixelsMinimum = (element, axe) => {
  const classes = element.getAttribute("class") || "";
  const arbitraire = classes.match(new RegExp(`min-${axe}-\\[(\\d+)px\\]`));
  if (arbitraire) return Number(arbitraire[1]);
  const echelle = classes.match(new RegExp(`min-${axe}-(\\d+)(?:\\s|$)`));
  if (echelle) return Number(echelle[1]) * 4;
  return 0;
};

describe("le bouton d'achat de la carte produit", () => {
  test("il tient 48 px de haut, malgré la densité de la carte", () => {
    render(<ProductCard product={produit} />);
    const bouton = screen.getByTestId("add-to-cart-bpc-157");
    expect(pixelsMinimum(bouton, "h")).toBeGreaterThanOrEqual(48);
  });

  test("le plancher tient aussi quand le produit est en rupture", () => {
    // Le bouton désactivé reste un bouton : on le touche quand même, et
    // c'est là qu'on lit « Rupture ». Un plancher qui ne s'appliquerait
    // qu'au cas vendeur laisserait l'autre à 30 px.
    render(<ProductCard product={{ ...produit, slug: "epuise", variants: [{ dosage_mg: 5, price: 60, stock: 0 }] }} />);
    const bouton = screen.getByTestId("add-to-cart-epuise");
    expect(bouton).toBeDisabled();
    expect(pixelsMinimum(bouton, "h")).toBeGreaterThanOrEqual(48);
  });
});

describe("les liens du pied de page", () => {
  /* Le pied de page tire ses colonnes d'un appel réseau et de plusieurs
   * contextes : on lit sa source plutôt que de monter tout un décor pour
   * vérifier deux classes. Le test porte sur la recette, pas sur le rendu. */
  const SOURCE = require("fs").readFileSync(
    require("path").join(__dirname, "Footer.jsx"),
    "utf8",
  );

  /* `[\s\S]*?` et non `[^>]*` : la balise ouvrante se ferme AVANT
   * `{l.label}`, et un motif qui refuse le `>` ne pouvait jamais
   * l'atteindre. Il rendait zéro lien, donc zéro assertion — une suite
   * verte qui ne vérifiait rien. */
  const liens = SOURCE.match(/<(?:a|Link)\s[\s\S]*?\{l\.label\}<\/(?:a|Link)>/g) || [];

  test("les deux formes de lien existent bien (interne et nouvel onglet)", () => {
    expect(liens).toHaveLength(2);
  });

  test("chacun porte sa marge de 12 px", () => {
    for (const lien of liens) expect(lien).toMatch(/\bpy-3\b/);
  });

  test("CHACUN EST `block` — sans quoi la zone s'arrête aux lettres", () => {
    for (const lien of liens) expect(lien).toMatch(/\bblock\b/);
  });

  test("l'écart vertical ne se cumule plus avec la marge des rangées", () => {
    // `space-y-2.5` par-dessus `py-3` aurait fait un pied de page à rallonge
    // pour rien : la respiration vient désormais des rangées elles-mêmes.
    //
    // On cherche la classe seule, sans écrire la balise qui la portait : la
    // sonde `balises` lit tout le répertoire, y compris les chaînes des
    // tests, et un `<ul>` cité dans une expression régulière passait pour
    // une balise jamais fermée. Elle a raison de ne pas savoir distinguer
    // les deux — c'est à moi de ne pas lui tendre le piège.
    expect(SOURCE).not.toMatch(/space-y-2\.5/);
  });
});

describe("la case de consentement de l'infolettre", () => {
  /* Même raison que pour le pied de page : l'accueil tire douze produits,
   * trois contextes et deux appels réseau. Le test porte sur la recette. */
  const SOURCE = require("fs").readFileSync(
    require("path").join(__dirname, "..", "pages", "Home.jsx"),
    "utf8",
  );

  const champ = (SOURCE.match(
    /<input[\s\S]*?data-testid="newsletter-consent"[\s\S]*?\/>/,
  ) || [""])[0];

  test("elle existe, et c'est bien une case", () => {
    expect(champ).toMatch(/type="checkbox"/);
  });

  test("elle fait 24 px de côté, pas 16", () => {
    // La plus petite cible du site, et c'est elle qui décide si
    // l'infolettre part. `w-6 h-6` = 24 px dans l'échelle de Tailwind.
    expect(champ).toMatch(/\bw-6\b/);
    expect(champ).toMatch(/\bh-6\b/);
  });

  test("le plancher de 16 px ne vient pas la déformer", () => {
    // La règle de index.css exclut explicitement les cases : une case dont
    // on force le font-size change de taille ET de proportions.
    const CSS = require("fs").readFileSync(
      require("path").join(__dirname, "..", "index.css"),
      "utf8",
    );
    expect(CSS).toMatch(/:not\(\[type="checkbox"\]\)/);
  });
});
