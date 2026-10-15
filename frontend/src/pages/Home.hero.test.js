// Le hero : tout le texte qui s'y pose doit être clair, et le voile doit
// tenir sous lui.
//
// MIREILLE, 11/10/2026, capture à l'appui : « ici le texte n'est pas
// lisible ».
//
// LE DÉFAUT ÉTAIT STRUCTUREL, pas une question de teinte. Le titre `h1` ne
// portait aucune classe de couleur : il héritait du bleu marine du corps de
// page, pendant que l'accroche, le texte et le lien second étaient en blanc.
// Sur fond clair le titre se lisait et les trois autres disparaissaient ; sur
// fond sombre, l'inverse. Aucune photo de produit ne pouvait rendre les
// quatre lisibles ensemble — c'est la combinaison qui était impossible.
//
// Ces tests lisent la source plutôt que le rendu : l'accueil demande six
// contextes et douze produits, et ce qui se vérifie ici n'est pas un rendu
// mais une RÈGLE — sur une image, tout le texte va dans le même sens.

const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "Home.jsx"), "utf8");

const hero = () => {
  const debut = SOURCE.indexOf('data-testid="hero-section"');
  const fin = SOURCE.indexOf('data-testid="hero-cta-lab"');
  expect(debut).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(debut);
  return SOURCE.slice(debut, fin);
};

describe("le voile sous le hero", () => {
  test("il descend franchement là où la copie est posée", () => {
    // La copie vit en bas (`justify-end`). Le voile n'y montait qu'à 0,72 et
    // restait à 0,08 au milieu : sur une photo claire, du blanc sur du
    // presque blanc. Audit du 06/10, point 8 : « voile sous le hero ».
    const stops = [...hero().matchAll(/rgba\(11,46,79,\.(\d+)\)/g)].map((m) => Number(`0.${m[1]}`));
    expect(stops.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...stops)).toBeGreaterThanOrEqual(0.85);
  });

  test("et il garde le haut aéré, pour qu'on voie la photo", () => {
    const stops = [...hero().matchAll(/rgba\(11,46,79,\.(\d+)\)/g)].map((m) => Number(`0.${m[1]}`));
    expect(Math.min(...stops)).toBeLessThanOrEqual(0.25);
  });
});

describe("tout le texte du hero va dans le même sens", () => {
  test("LE TITRE EST CLAIR, et ne l'hérite plus du corps de page", () => {
    // La balise est composee et non ecrite telle quelle : la sonde `balises`
    // lit tout le repertoire, y compris les chaines des tests, et un « <h1 »
    // cite dans une expression reguliere passait pour une balise jamais
    // fermee. Elle a raison de ne pas savoir distinguer les deux.
    const titre = hero().match(new RegExp(`<${"h1"}[^>]*data-testid="hero-title"`, "s"));
    expect(titre).not.toBeNull();
    expect(titre[0]).toMatch(/sur-voile/);
  });

  test("LA COULEUR DU TITRE NE S'INVERSE PAS LA NUIT", () => {
    /* Le piège que j'ai tendu en corrigeant le premier, et que le
     * vérificateur de cohérence a attrapé avant la cliente.
     *
     * Le voile du hero est codé en dur — rgba(11,46,79,…) — donc il reste
     * bleu marine dans les deux modes. `text-clinical` vaut #F7FAFC le jour
     * et #0A0F14 la nuit : un titre « clair » serait devenu presque noir sur
     * un fond resté marine. Le même défaut, dans l'autre mode.
     *
     * Fond fixe, texte fixe : c'est la règle, et `--sur-voile` la tient par
     * construction — ces jetons n'apparaissent pas dans le bloc nuit. */
    const titre = hero().match(new RegExp(`<${"h1"}[^>]*data-testid="hero-title"`, "s"));
    expect(titre[0]).not.toMatch(/text-clinical|text-nordfjord/);

    /* Le bloc nuit est borne par son SELECTEUR et son accolade fermante, et
     * non par une ligne reperee au jugé. Le premier jet découpait depuis
     * « --fn-clinical: 10 15 20 » : une redefinition placée une ligne plus
     * haut passait au travers, et la mutation de contrôle l'a prouvé — elle
     * n'a fait tomber aucun test. Un filet qui dépend de l'ordre des lignes
     * n'est pas un filet. */
    const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");
    const ouverture = css.indexOf(".dark {");
    expect(ouverture).toBeGreaterThan(-1);
    // Le bloc ne contient que des déclarations, jamais de règle imbriquée :
    // la première accolade fermante est bien la sienne.
    const nuit = css.slice(ouverture, css.indexOf("}", ouverture) + 1);
    expect(nuit).toContain("--fn-clinical");

    for (const jeton of ["--sur-voile:", "--sur-voile-doux:", "--sur-voile-accent:"]) {
      expect(css).toContain(jeton);
      expect(nuit).not.toContain(jeton);
    }
  });

  test("l'accroche n'est pas en Nova pur : 10 px en demandent 4,5:1", () => {
    /* Nova (#00B8D4) sur le voile donne environ 3:1 — assez pour un titre de
     * 34 px, qui n'en demande que 3, pas pour des capitales de 10 px. Le cyan
     * pâle du bandeau de conformité, déjà employé sur fond marine, en donne 5.
     * L'accent se module selon la TAILLE, ce qui est exactement ce que dit la
     * règle de contraste.
     *
     * LE REPÈRE A CHANGÉ, PAS LA RÈGLE. Ce test cherchait la chaîne littérale
     * « font-data text-[10.5px] » ; cette accroche portait une taille à elle
     * seule — 10,5 px, une valeur qui n'existait nulle part ailleurs sur le
     * site. Elle est passée sur l'échelle commune, et le test vise maintenant
     * ce qu'il voulait vraiment dire : l'étiquette du hero, quelle que soit sa
     * taille, ne se peint pas en Nova pur. */
    const accroche = hero().match(/<p className="etiquette[^>]*>/s);
    expect(accroche).not.toBeNull();
    expect(accroche[0]).not.toMatch(/text-nova\b/);
    expect(accroche[0]).toMatch(/sur-voile-accent/);
  });

  test("le texte d'accroche et le lien second restent lisibles", () => {
    expect(hero()).toMatch(/sur-voile-doux/);
    expect(SOURCE).not.toMatch(/text-white\/70/);
  });
});

describe("le bloc de preuve a été retiré", () => {
  /* MIREILLE, 15/10/2026 : « c'est laid — est-ce que j'ai vraiment besoin de
   * ça ».
   *
   * Non, et c'était mesurable avant de répondre. Le bandeau de confiance,
   * posé AVANT les produits en vedette, dit déjà « Testé en laboratoire
   * tiers ». La fiche produit renvoie au certificat de son lot à dix endroits.
   * La page /certificats explique un COA en sept sections. Le pied de page y
   * mène.
   *
   * Le bloc reprenait donc cet argument une quatrième fois, dans 603 px de
   * carte marine — avec une étiquette posée au-dessus du titre, que le
   * plancher de qualité interdit sans exception, et une feuille de certificat
   * DESSINÉE en HTML dont le chromatogramme était tracé à la main. Du poids
   * sans travail.
   *
   * CE QUE CE FILET PROTÈGE N'EST PAS L'ABSENCE DU BLOC, c'est le reste : le
   * message doit continuer d'exister là où il était déjà. Retirer une section
   * qui répète est une amélioration ; retirer la dernière occurrence d'un
   * argument est une perte, et rien ne les distingue à l'œil. */

  test("la section n'est plus là", () => {
    expect(SOURCE).not.toContain('data-testid="preuve-section"');
  });

  test("ET PLUS RIEN NE DESSINE DE CERTIFICAT", () => {
    // La feuille et son chromatogramme inventé partent avec le bloc.
    expect(SOURCE).not.toContain("preuve-certificat");
    expect(SOURCE).not.toMatch(/strokeWidth/);
    expect(SOURCE).not.toMatch(/from "\.\.\/lib\/certificat"/);
  });

  test("MAIS LE BANDEAU DE CONFIANCE LE DIT TOUJOURS, et plus haut dans la page", () => {
    expect(SOURCE).toContain('data-testid="trust-marquee"');
    expect(SOURCE).toMatch(/home\.trustTested/);

    const bandeau = SOURCE.indexOf('data-testid="trust-marquee"');
    const vedettes = SOURCE.indexOf('data-testid="featured-products"');
    expect(bandeau).toBeGreaterThan(-1);
    expect(bandeau).toBeLessThan(vedettes);
  });

  test("ET UNE SECTION LA REMPLACE, QUI FAIT UN AUTRE TRAVAIL", () => {
    /* MIREILLE, 15/10/2026, d'après sa propre maquette : « est-ce qu'on peut
     * rajouter cette section ».
     *
     * Elle fait ce que l'ancienne ne faisait pas. Le bandeau de confiance dit
     * « nous avons des certificats » ; celle-ci s'adresse à quelqu'un qui
     * tient DÉJÀ un flacon et cherche le sien. C'est la seule chose de
     * l'accueil qui parle à un client existant plutôt qu'à un visiteur.
     *
     * Et elle tient en un titre, une phrase, un bouton — 290 px contre 603. */
    expect(SOURCE).toContain('data-testid="lot-section"');

    const vedettes = SOURCE.indexOf('data-testid="featured-products"');
    const lot = SOURCE.indexOf('data-testid="lot-section"');
    const infolettre = SOURCE.indexOf('data-testid="newsletter-section"');
    expect(vedettes).toBeLessThan(lot);
    expect(lot).toBeLessThan(infolettre);
  });

  test("MAIS ELLE N'EXISTE QUE SI LA RECHERCHE DE LOT EXISTE", () => {
    /* Son unique bouton mène à /lab, servie derrière COA_PAGE_ENABLED. Drapeau
     * à `false` : la route renvoie à l'accueil, et la section devient une bande
     * marine avec un bouton qui ne fait rien. On ne l'affiche pas du tout
     * plutôt que de promettre à moitié.
     *
     * C'est la quatrième fois cette semaine qu'un lien vers /lab est posé sans
     * ce verrou — en-tête, pied de page, page des certificats, bloc de preuve.
     * La règle existait ; c'est sa portée qui manquait à chaque fois. */
    const i = SOURCE.indexOf('data-testid="lot-section"');
    expect(SOURCE.slice(Math.max(0, i - 500), i)).toMatch(/\{coaPageEnabled && \(/);
    expect(SOURCE).toMatch(/import \{ useSiteConfig \} from "\.\.\/contexts\/SiteConfigContext"/);
  });

  test("et elle ne promet aucun effet", () => {
    const i = SOURCE.indexOf('data-testid="lot-section"');
    const bloc = SOURCE.slice(i, SOURCE.indexOf('data-testid="newsletter-section"'))
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
    for (const motif of [/bienfait/i, /efficacit/i, /thérapeut/i, /traitement/i,
                         /\bdose/i, /guéri/i, /garanti/i]) {
      expect(bloc).not.toMatch(motif);
    }
  });

  test("et la page des certificats reste atteignable depuis le pied de page", () => {
    const pied = fs.readFileSync(
      path.join(__dirname, "..", "components", "Footer.jsx"), "utf8",
    );
    expect(pied).toContain('to: "/certificats"');
  });
});
