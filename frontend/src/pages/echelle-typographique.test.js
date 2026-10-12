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

describe("LES ÉTIQUETTES EN MONO CAPITALES", () => {
  /* LE RELEVÉ, AVANT CORRECTION : 192 étiquettes sur l'ensemble du site, pour
   * 74 combinaisons de taille et d'espacement — dont 52 n'apparaissant QU'UNE
   * SEULE FOIS. 8,5 px à côté de 12 px, un espacement de 0,06 em à côté d'un
   * de 0,28. Ce n'était pas une échelle, c'étaient 74 décisions séparées.
   *
   * DEUX NIVEAUX, et la frontière existait déjà dans le code sans être
   * nommée : `text-xs` servait aux libellés INTERACTIFS — navigation, boutons
   * — et les tailles en pixels aux mentions. Le premier jet pliait tout sur
   * 10 px, y compris la navigation et les deux boutons de la porte d'âge :
   * ç'aurait été échanger une incohérence contre une régression. */

  const VITRINE = [
    ["pages", "Home.jsx"], ["pages", "Catalog.jsx"], ["pages", "ProductDetail.jsx"],
    ["pages", "Lab.jsx"], ["pages", "Certificats.jsx"],
    ["components", "Header.jsx"], ["components", "Footer.jsx"],
    ["components", "ProductCard.jsx"], ["components", "CartDrawer.jsx"],
    ["components", "AgeGate.jsx"], ["components", "AvertissementCoa.jsx"],
  ];

  const lireVitrine = ([dossier, nom]) =>
    fs.readFileSync(path.join(__dirname, "..", dossier, nom), "utf8");

  test("les deux niveaux existent", () => {
    expect(CSS).toMatch(/\.etiquette\s*\{/);
    expect(CSS).toMatch(/\.etiquette-nav\s*\{/);
  });

  test("ILS NE SE CONFONDENT PAS : 10 px pour la mention, 12 pour la cible", () => {
    /* Sans cette assertion, les deux classes pourraient converger sur la même
     * taille et le filet continuerait de passer au vert — en ayant perdu
     * exactement ce qu'il protège. */
    const bloc = (nom) => {
      const i = CSS.indexOf(`.${nom} {`);
      return CSS.slice(i, CSS.indexOf("}", i));
    };
    expect(bloc("etiquette")).toMatch(/text-\[10px\]/);
    expect(bloc("etiquette-nav")).toMatch(/text-xs/);
  });

  test("AUCUNE PAGE DE LA VITRINE NE RECOMPOSE SON PROPRE LIBELLÉ", () => {
    /* LES DEUX FORMES DE `className`, ET C'EST UNE CORRECTION. La première
     * version de ce test — comme le script qui a fait la bascule — ne lisait
     * que `className="…"`. Six étiquettes vivaient dans des gabarits
     * `className={`…`}`, dont le sélecteur de langue de l'en-tête et les trois
     * boutons de tri du catalogue : elles sont restées composées à la main,
     * pendant que le test affichait vert.
     *
     * Un filet qui ne voit pas la moitié des cas donne un verdict juste sur ce
     * qu'il regarde, et faux sur le site. */
    const fautifs = [];
    for (const cible of VITRINE) {
      const source = sansCommentaires(lireVitrine(cible));
      const formes = [/className="([^"]*)"/g, /className=\{`([^`]*)`\}/gs];
      for (const forme of formes) {
        for (const m of source.matchAll(forme)) {
          const cls = m[1];
          if (cls.includes("font-data") && cls.includes("uppercase")) {
            fautifs.push(`${cible[1]} :: ${cls.slice(0, 80)}`);
          }
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});
