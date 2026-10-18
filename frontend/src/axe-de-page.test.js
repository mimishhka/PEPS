// Tout le contenu du site s'aligne sur un seul axe vertical.
//
// MIREILLE, 18/10/2026, capture à l'appui : « regarde l'alignement du texte,
// mets tes yeux de designer web ».
//
// Mesuré sur un écran de 1920 :
//
//   bandeau de confiance   son texte commence à   315 px
//   en-tête                                       347 px
//   produits en vedette                           347 px
//   infolettre                                    347 px
//
// Le bandeau portait `max-w-7xl mx-auto py-4`, SANS aucun `px-`, là où les
// douze autres conteneurs du site en ont un. Son texte vivait donc 32 px à
// gauche de toute la page.
//
// C'EST LA DEUXIÈME FOIS EN DEUX JOURS, et la cause était inverse : au pied de
// page, un rembourrage EN TROP sur un bloc ; ici, un rembourrage MANQUANT sur
// un autre. Les deux produisent le même symptôme — deux axes dans une page qui
// n'en veut qu'un — et aucun des deux ne se voit en lisant le code ligne à
// ligne. Ils se voient en comparant les conteneurs entre eux.
//
// CE FILET NE GARDE DONC PAS UN CAS, IL GARDE LA CLASSE. Il parcourt tout le
// site et exige qu'un conteneur de page porte sa marge horizontale. Le
// treizième qu'on écrira demain sera couvert sans que personne y pense.

const fs = require("fs");
const path = require("path");

const RACINE = __dirname;

const parcourir = (dossier) => {
  const sortie = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) {
      // Le portail d'administration attend son tour : « pas l'OPS pour
      // l'instant étant donné que je suis toujours en mode test ».
      if (e.name === "admin" || e.name === "node_modules") continue;
      sortie.push(...parcourir(complet));
    } else if (e.name.endsWith(".jsx") && !e.name.includes(".test.")) {
      sortie.push(complet);
    }
  }
  return sortie;
};

/* Un conteneur de page est un `max-w-7xl mx-auto` : c'est la laisse qui pose
 * la largeur du contenu et le centre. Les autres `max-w-*` sont des mesures de
 * lecture posées sur un paragraphe, pas des conteneurs — ils n'ont rien à
 * aligner. */
const CONTENEUR = /className=(?:"|\{`)([^"`]*\bmax-w-7xl\b[^"`]*)(?:"|`\})/g;
const REMBOURRAGE = /\bpx-\d|\bpx-\[/;

describe("UN SEUL AXE VERTICAL POUR TOUT LE SITE", () => {
  const fichiers = parcourir(RACINE);

  test("le parcours trouve bien des fichiers", () => {
    // Sans ce garde-fou, une erreur de chemin rendrait une liste vide et le
    // test suivant passerait au vert sans avoir rien lu.
    expect(fichiers.length).toBeGreaterThan(30);
  });

  test("CHAQUE CONTENEUR DE PAGE PORTE SA MARGE HORIZONTALE", () => {
    const fautifs = [];
    for (const f of fichiers) {
      const source = fs.readFileSync(f, "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/.*/g, " ");
      for (const m of source.matchAll(CONTENEUR)) {
        if (!REMBOURRAGE.test(m[1])) {
          fautifs.push(`${path.basename(f)} :: ${m[1].slice(0, 70)}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  test("et le bandeau de confiance s'aligne sur ses voisins", () => {
    /* Le cas qu'elle a vu, garde nommément : il est le seul des treize à
     * avoir manqué sa marge, et il vit juste sous le hero, là où l'œil
     * compare deux bords en un coup. */
    const home = fs.readFileSync(path.join(RACINE, "pages", "Home.jsx"), "utf8");
    const i = home.indexOf('data-testid="trust-marquee"');
    expect(i).toBeGreaterThan(-1);
    const bandeau = home.slice(i, i + 400);
    const conteneur = bandeau.match(/className="([^"]*max-w-7xl[^"]*)"/);
    expect(conteneur).not.toBeNull();
    expect(conteneur[1]).toMatch(REMBOURRAGE);
  });
});
