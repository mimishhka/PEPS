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
jest.mock("lucide-react", () => new Proxy({}, {
  get: (cible, nom) => (nom === "__esModule" ? true : () => null),
}));

const produit = {
  slug: "bpc-157",
  name_fr: "BPC-157",
  name_en: "BPC-157",
  price_cad: 60,
  dosage_mg: 5,
  // La variante porte un `id`, comme en vrai : le serveur en pose un a chaque
  // ecriture (`_ensure_variant_ids`), et toute la selection de dosage compare
  // ce champ. Une maquette sans id rendait une liste React sans cle.
  variants: [{ id: "v1", dosage_mg: 5, price: 60, stock: 12 }],
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
  test("il tient 44 px de haut, malgré la densité de la carte", () => {
    /* Descendu de 48 à 44 le 11/10/2026 : « add to order too big (too much
     * space and empty spaces) ». 44 px est le minimum d'Apple, et on le
     * garde ICI parce que c'est le bouton qui rapporte l'argent — c'est la
     * seule cible de la carte qui ne descend pas plus bas. */
    render(<ProductCard product={produit} />);
    const bouton = screen.getByTestId("add-to-cart-bpc-157");
    expect(pixelsMinimum(bouton, "h")).toBeGreaterThanOrEqual(44);
  });

  test("le plancher tient aussi quand le produit est en rupture", () => {
    // Le bouton désactivé reste un bouton : on le touche quand même, et
    // c'est là qu'on lit « Rupture ». Un plancher qui ne s'appliquerait
    // qu'au cas vendeur laisserait l'autre à 30 px.
    render(<ProductCard product={{ ...produit, slug: "epuise", variants: [{ id: "v1", dosage_mg: 5, price: 60, stock: 0 }] }} />);
    const bouton = screen.getByTestId("add-to-cart-epuise");
    expect(bouton).toBeDisabled();
    expect(pixelsMinimum(bouton, "h")).toBeGreaterThanOrEqual(44);
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

  test("LES TROIS PASTILLES DE CONFORMITÉ SONT PARTIES", () => {
    /* MIREILLE, 11/10/2026 : « remove For Research Use Only / 19+ Age
     * Verified / Loi 25 / PIPEDA ».
     *
     * Elles redisaient en petit ce que le titre juste au-dessus dit en gros,
     * ce que la porte d'entrée exige déjà, et ce que le bandeau de l'en-tête
     * répète sur chaque page. Une mention affichée quatre fois ne rassure
     * plus : elle devient du motif. */
    /* On lit la source SANS SES COMMENTAIRES. C'est la troisième fois
     * aujourd'hui qu'un test lisant du code se fait piéger par la prose qui
     * explique la correction : le commentaire ci-dessus nomme forcément les
     * pastilles qu'il vient de retirer. */
    const code = SOURCE.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      // Le point ne franchit pas une fin de ligne sans le drapeau « s » :
      // inutile d'écrire la classe négative, qui a justement cassé ce
      // fichier en traversant les couches d'échappement.
      .replace(/\/\/.*/g, " ");
    expect(code).not.toMatch(/19\+ Age Verified/);
    expect(code).not.toMatch(/Âge vérifié 19\+/);
    expect(code).not.toMatch(/PIPEDA/);
    expect(code).not.toMatch(/const badges/);
  });

  test("LA GRILLE DU PIED DE PAGE SUIT LE NOMBRE DE COLONNES", () => {
    /* MIREILLE : « pourquoi le contenu montré sur la photo est du côté
     * gauche du site ». La grille déclarait QUATRE colonnes quoi qu'il
     * arrive : avec une seule colonne de liens, le quart droit restait vide
     * et toute la page paraissait poussée à gauche. */
    expect(SOURCE).toMatch(/columns\.length >= 2/);
    expect(SOURCE).not.toMatch(/grid grid-cols-2 md:grid-cols-4 gap-10/);
  });

  test("L'ENTRÉE /lab TOMBE AVEC SON DRAPEAU, ICI AUSSI", () => {
    /* L'en-tête filtrait déjà cette entrée sur `coaPageEnabled`. Le pied de
     * page l'affichait toujours : la règle existait, à un seul des deux
     * endroits qui en avaient besoin.
     *
     * Et la colonne vidée disparaît, sinon la grille garderait une colonne de
     * titre sans liens — exactement le quart de page vide qu'on vient de
     * corriger juste en dessous. */
    expect(SOURCE).toMatch(/useSiteConfig/);
    expect(SOURCE).toMatch(/l\.to === "\/lab" \? coaPageEnabled/);
    expect(SOURCE).toMatch(/\.filter\(\(c\) => c\.links\.length\)/);
  });

  test("LA BANDE DE CONFORMITÉ REMPLIT SA LARGEUR", () => {
    /* MIREILLE, 11/10/2026 : « tout ce qui est du côté gauche de la page
     * n'a pas été modifié ». Mesuré sur un écran de 1920 : la déclaration
     * occupait 896 px et la confirmation 768 px dans une bande de 1216, l'une
     * sous l'autre, toutes deux calées à gauche.
     *
     * Les deux paragraphes ne portent plus de laisse de largeur : c'est la
     * grille qui décide. Si l'une revient, ce test tombe. */
    expect(SOURCE).toContain('data-testid="footer-conformite"');
    expect(SOURCE).toMatch(/lg:grid-cols-\[1\.3fr_1fr\]/);
    expect(SOURCE).not.toMatch(/max-w-4xl/);
    expect(SOURCE).not.toMatch(/max-w-3xl/);
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

  test("elle fait 18 px, et la ligne entière porte la cible", () => {
    /* Elle faisait 16 px, puis 24 pour tenir la cible tactile de l'audit.
     * MIREILLE, 11/10/2026 : « la case à cocher de l'infolettre est trop
     * grosse ». À 24 px, la case pesait plus lourd que la phrase de
     * consentement qu'elle accompagne — un contrôle secondaire qui crie plus
     * fort que son propre libellé.
     *
     * La cible tactile n'est pas perdue : le `<label>` englobe la case ET le
     * texte, donc toute la rangée reste cliquable sur sa largeur. C'est ce
     * que ce test vérifie vraiment — la taille seule ne dirait rien. */
    expect(champ).toMatch(/w-\[18px\]/);
    expect(champ).toMatch(/h-\[18px\]/);

    const avant = SOURCE.slice(
      Math.max(0, SOURCE.indexOf("newsletter-consent") - 700),
      SOURCE.indexOf("newsletter-consent"),
    );
    expect(avant).toContain("<label");
    expect(avant).toMatch(/cursor-pointer/);
  });

  test("LE FORMULAIRE NE LAISSE PLUS LA MOITIÉ DROITE VIDE", () => {
    /* C'est le bloc qui donnait vraiment l'impression d'une page poussée à
     * gauche : 672 px de contenu dans un conteneur de 1280, soit 576 px de
     * vide à sa droite — plus de place perdue que de place occupée.
     *
     * Et ce n'était pas un paragraphe qu'on laisse respirer : une boîte de
     * saisie posée dans le coin supérieur gauche d'une bande vide se lit
     * comme une page inachevée.
     *
     * Le test porte sur la DISPARITION de l'ancienne laisse autant que sur
     * l'arrivée de la grille : ajouter la seconde sans retirer la première
     * n'aurait rien changé à l'écran. */
    expect(SOURCE).toContain('data-testid="newsletter-grille"');
    expect(SOURCE).toMatch(/lg:grid-cols-\[1fr_minmax\(0,34rem\)\]/);
    expect(SOURCE).not.toMatch(/relative max-w-2xl/);

    // Et le formulaire vit DANS la grille, pas à côté d'elle.
    expect(SOURCE.indexOf("newsletter-grille")).toBeLessThan(
      SOURCE.indexOf("newsletter-form"),
    );
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
