// Le plancher de 16 px sur les champs, et pourquoi il est écrit là.
//
// Audit UI/UX du 06/10/2026, section 1 : « Champ e-mail en 15 px → sur
// iPhone, Safari zoome automatiquement la page dès qu'on touche un champ en
// dessous de 16 px. La mise en page saute. » Le zoom ne repart pas en
// quittant le champ.
//
// Le rapport citait un champ. Un balayage du code en a trouvé VINGT ET UN,
// tous côté client, dont le code promo de la caisse et les trois champs du
// laboratoire. Une règle `input { font-size: 16px }` existait déjà dans
// @layer base : elle ne servait à rien, parce qu'une CLASSE l'emporte sur un
// sélecteur de balise et que toutes nos classes Tailwind sont écrites après.
//
// Ce fichier ne teste pas du CSS — jsdom n'en applique aucun. Il teste
// l'INVARIANT qui rend la règle efficace, et c'est exactement celui qui avait
// été perdu en silence la première fois :
//
//   le plancher doit être HORS de toute @layer, et en !important.
//
// Sorti de ces deux conditions, il redevient décoratif et les vingt et un
// champs remettent à zoomer sans que rien ne le signale.

const fs = require("fs");
const path = require("path");

/* Les commentaires partent d'abord, et ce n'est pas une précaution de style :
 * la règle qu'on teste est précédée d'un commentaire qui EXPLIQUE pourquoi
 * elle n'est pas dans @layer base — il contient donc le mot « @layer », et le
 * découpeur ci-dessous l'a pris pour une vraie couche dès le premier essai.
 * Il a sauté la règle et les cinq assertions sont tombées. */
const CSS = fs
  .readFileSync(path.join(__dirname, "index.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/* Retire tout bloc `@layer nom { ... }` en comptant les accolades, pour ne
 * garder que ce qui est écrit hors couche. */
function horsCouches(css) {
  let reste = "";
  let i = 0;
  while (i < css.length) {
    const debut = css.indexOf("@layer", i);
    if (debut === -1) {
      reste += css.slice(i);
      break;
    }
    reste += css.slice(i, debut);
    const ouvrante = css.indexOf("{", debut);
    if (ouvrante === -1) break;
    let profondeur = 0;
    let j = ouvrante;
    for (; j < css.length; j += 1) {
      if (css[j] === "{") profondeur += 1;
      else if (css[j] === "}") {
        profondeur -= 1;
        if (profondeur === 0) break;
      }
    }
    i = j + 1;
  }
  return reste;
}

/* Le bloc @media (pointer: coarse) tel qu'il est écrit, accolades comptées. */
function blocPointeurGrossier(css) {
  const debut = css.search(/@media\s*\(\s*pointer\s*:\s*coarse\s*\)/);
  if (debut === -1) return null;
  const ouvrante = css.indexOf("{", debut);
  let profondeur = 0;
  for (let j = ouvrante; j < css.length; j += 1) {
    if (css[j] === "{") profondeur += 1;
    else if (css[j] === "}") {
      profondeur -= 1;
      if (profondeur === 0) return css.slice(debut, j + 1);
    }
  }
  return null;
}

describe("le plancher de 16 px sur les champs", () => {
  test("il existe, sur pointeur grossier", () => {
    expect(blocPointeurGrossier(CSS)).not.toBeNull();
  });

  test("IL EST HORS @layer — sinon Tailwind le bat et il ne sert à rien", () => {
    // C'est le défaut d'origine : la règle était dans @layer base, donc
    // écrite avant les classes utilitaires. `text-[15px]` gagnait.
    const bloc = blocPointeurGrossier(horsCouches(CSS));
    expect(bloc).not.toBeNull();
  });

  test("il est en !important — sinon une classe l'emporte encore", () => {
    // Hors couche ne suffit pas : `.text-sm` (0,1,0) bat `input` (0,0,1)
    // quelle que soit la position dans le fichier. Seul !important renverse
    // cela sans aller inventer des sélecteurs plus spécifiques.
    const bloc = blocPointeurGrossier(horsCouches(CSS));
    expect(bloc).toMatch(/font-size:\s*16px\s*!important/);
  });

  test("il couvre les trois sortes de champs", () => {
    const bloc = blocPointeurGrossier(horsCouches(CSS));
    for (const balise of ["input", "textarea", "select"]) {
      expect(bloc).toMatch(new RegExp(`(^|[\\s,])${balise}\\b`, "m"));
    }
  });

  test("il ne couvre pas les cases, radios et curseurs", () => {
    // Leur taille ne vient pas de font-size : la forcer les déforme. La case
    // de consentement de l'infolettre vient justement de passer à 24 px.
    const bloc = blocPointeurGrossier(horsCouches(CSS));
    for (const type of ["checkbox", "radio", "range"]) {
      expect(bloc).toMatch(new RegExp(`:not\\(\\[type="${type}"\\]\\)`));
    }
  });

  test("il ne s'applique qu'au doigt, pour que le bureau garde son design", () => {
    // Un ordinateur ne zoome pas à la mise au point : lui imposer 16 px
    // partout casserait les tailles choisies sans rien régler.
    const bloc = blocPointeurGrossier(horsCouches(CSS));
    expect(bloc).toMatch(/@media\s*\(\s*pointer\s*:\s*coarse\s*\)/);
    expect(bloc).not.toMatch(/pointer\s*:\s*fine/);
  });
});
