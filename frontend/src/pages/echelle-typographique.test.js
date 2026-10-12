// Une seule échelle de titres pour tout le site public.
//
// MIREILLE, 11/10/2026 : « pourquoi la police n'est pas constante d'un
// endpoint à l'autre ».
//
// LE COMPTE, AVANT CORRECTION, SUR LES NEUF PAGES PUBLIQUES :
//
//   titres de page   26/32, 28/34, 30/34, 30/36          4 échelles
//   sous-titres      text-xl, 2xl, 2xl/3xl, 3xl, 28px…   6 échelles
//
// Aucune n'était un choix. Chaque page avait été écrite à la main, un peu
// plus tard que la précédente. Sur le Labo, un sous-titre faisait 28 px — la
// taille du TITRE de « À propos ». C'est l'écart qu'on ne nomme pas et qu'on
// sent quand même : on ne sait plus à quel niveau on se trouve.
//
// POURQUOI CE FILET LIT LA SOURCE. Ce qui doit tenir n'est pas un rendu mais
// une RÈGLE : la taille d'un titre se décide à un seul endroit. Une page qui
// rouvre la question en réécrivant « text-3xl » a déjà cassé la règle, même si
// son rendu plaît ce jour-là.
//
// Les balises sont composées (`"<" + "h1"`) et non écrites telles quelles :
// la sonde `balises` lit tout le répertoire, y compris les chaînes des tests,
// et un « <h1 » cité dans une expression régulière passe pour une balise
// jamais fermée. Elle a raison de ne pas savoir distinguer les deux.

const fs = require("fs");
const path = require("path");

const PAGES = [
  "Home.jsx", "About.jsx", "Catalog.jsx", "ProductDetail.jsx", "Faq.jsx",
  "Lab.jsx", "Certificats.jsx", "Compliance.jsx", "Privacy.jsx",
];

const lire = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const CSS = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

/* LES COMMENTAIRES SORTENT AVANT LE FILTRAGE. C'est la quatrième fois
 * aujourd'hui qu'un test lisant du code se fait piéger par la prose qui
 * explique la correction : les commentaires que je viens d'écrire dans ces
 * pages citent forcément les tailles qu'ils retirent. */
const sansCommentaires = (t) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*/g, " ");

const balises = (source, nom) => {
  const motif = new RegExp(`<${nom}\\s[^>]*>`, "g");
  return [...sansCommentaires(source).matchAll(motif)].map((m) => m[0]);
};

const TAILLE = /\btext-(?:\[[0-9.]+px\]|xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/;

/* LES DEUX SEULES EXCEPTIONS, ET ELLES SONT ÉCRITES ICI PLUTÔT QUE SUBIES.
 *
 *   — le titre du hero : il est posé sur une image, porte ses propres jetons
 *     de couleur stables (`sur-voile`), et une vitrine a le droit d'ouvrir
 *     plus grand que ses pages intérieures ;
 *   — l'étiquette de conformité de la fiche produit : c'est un `h2` par la
 *     structure du document, mais un libellé par le rendu, et sa couleur
 *     (`text-compliance`) porte un sens que `sur-titre` effacerait. */
const EXCEPTIONS = [/data-testid="hero-title"/, /text-compliance/];
const tolere = (balise) => EXCEPTIONS.some((e) => e.test(balise));

describe("l'échelle vit dans le design system, pas dans les pages", () => {
  test("les trois classes existent", () => {
    expect(CSS).toMatch(/\.titre-page\s*\{/);
    expect(CSS).toMatch(/\.titre-section\s*\{/);
    expect(CSS).toMatch(/\.sur-titre\s*\{/);
  });

  test("LA CLASSE MORTE A DISPARU", () => {
    /* `.eyebrow` vivait dans index.css depuis le début avec ZÉRO utilisateur,
     * pendant que chaque page composait son propre libellé. Troisième exemple
     * du même défaut dans la même journée : une règle écrite, d'apparence
     * appliquée, jamais effective.
     *
     * Elle était fausse en plus d'être morte — `color: var(--nova)` donne
     * environ 3:1 sur fond clair, sous le seuil que des capitales de 11 px
     * demandent. */
    expect(CSS).not.toMatch(/\.eyebrow\s*\{/);
  });

  test("et `sur-titre` est réellement employée", () => {
    // Sans cette assertion, on aurait simplement remplacé une classe morte
    // par une autre.
    const utilisee = PAGES.some((f) => lire(f).includes("sur-titre"));
    expect(utilisee).toBe(true);
  });
});

describe("AUCUNE PAGE NE REDÉCIDE LA TAILLE DE SES TITRES", () => {
  for (const f of PAGES) {
    test(`${f} — ni sur le titre, ni sur les sous-titres`, () => {
      const source = lire(f);
      for (const nom of ["h1", "h2"]) {
        for (const balise of balises(source, nom)) {
          if (tolere(balise)) continue;
          expect({ fichier: f, balise }).toEqual(
            expect.objectContaining({ balise: expect.not.stringMatching(TAILLE) }),
          );
        }
      }
    });
  }

  test("et chaque titre de page porte bien la classe", () => {
    for (const f of PAGES) {
      for (const balise of balises(lire(f), "h1")) {
        if (tolere(balise)) continue;
        expect(balise).toMatch(/\btitre-page\b/);
      }
    }
  });
});
