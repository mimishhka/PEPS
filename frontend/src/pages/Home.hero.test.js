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

describe("le bloc de preuve, après les produits en vedette", () => {
  /* MIREILLE, 11/10/2026 : « regarde ce site après les produits en vedette,
   * est-ce qu'on peut avoir quelque chose de similaire ».
   *
   * Align pose là un bloc « QUALITY ASSURANCE — The paperwork ships with
   * it », dont la phrase dit tout : la qualité se démontre par l'analyse, la
   * traçabilité et les certificats, « not implied outcomes or marketing
   * language ». C'est la position qu'elle tient depuis le début, et elle
   * n'était écrite nulle part sur son site.
   *
   * CE QUE CE FILET PROTÈGE : que le bloc ROUTE vers ce qui se vérifie au
   * lieu de promettre. Un bloc « assurance qualité » est exactement l'endroit
   * où une phrase d'effet se glisse — et il perdrait alors tout son sens. */

  /* LES COMMENTAIRES SONT RETIRÉS AVANT LE FILTRAGE, et ce n'est pas du
   * confort. Le premier jet lisait la source brute, et le filtre a attrapé
   * le mot « garantir » — dans MON PROPRE commentaire expliquant pourquoi je
   * n'invente pas de chiffre. Un filtre qui lit ce que personne ne voit
   * signale des défauts qui n'existent pas, et on finit par l'assouplir
   * jusqu'à ce qu'il ne serve plus à rien. */
  const sansCommentaires = (t) =>
    t.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

  const preuve = () => {
    const i = SOURCE.indexOf('data-testid="preuve-section"');
    expect(i).toBeGreaterThan(-1);
    return sansCommentaires(SOURCE.slice(i, SOURCE.indexOf('data-testid="newsletter-section"')));
  };

  test("il vient APRÈS les vedettes et AVANT l'infolettre", () => {
    const vedettes = SOURCE.indexOf('data-testid="featured-products"');
    const bloc = SOURCE.indexOf('data-testid="preuve-section"');
    const infolettre = SOURCE.indexOf('data-testid="newsletter-section"');
    expect(vedettes).toBeLessThan(bloc);
    expect(bloc).toBeLessThan(infolettre);
  });

  test("IL ROUTE VERS LA PREUVE au lieu de la promettre", () => {
    expect(preuve()).toContain('to="/certificats"');
    expect(preuve()).toContain('to="/lab"');
  });

  test("MAIS LE RENVOI VERS /lab ATTEND QUE LA PAGE EXISTE", () => {
    /* MIREILLE, 11/10/2026 : « pourquoi je ne vois pas la page qui permet de
     * faire une recherche pour les COA ». Elle est derrière COA_PAGE_ENABLED,
     * et quand ce drapeau est à `false` la route renvoie à l'accueil.
     *
     * Trois endroits renvoyaient vers elle sans le vérifier — ce bloc, la page
     * des certificats, le pied de page. L'en-tête, lui, le vérifiait depuis le
     * début : la règle était écrite, à un seul des quatre endroits. */
    expect(preuve()).toMatch(/\{coaPageEnabled && \(/);
    expect(SOURCE).toMatch(/import \{ useSiteConfig \} from "\.\.\/contexts\/SiteConfigContext"/);
  });

  test("et il ne promet aucun effet", () => {
    const interdits = [/bienfait/i, /efficacit/i, /thérapeut/i, /traitement/i,
                       /dose/i, /guéri/i, /meilleur/i, /garanti/i];
    for (const motif of interdits) expect(preuve()).not.toMatch(motif);
  });

  test("AUCUN CHIFFRE ÉCRIT EN DUR : ils viennent du certificat", () => {
    /* Align affiche « 25 composés ». Je n'ai aucun nombre que je puisse
     * affirmer sans le calculer — et un chiffre faux, ICI précisément,
     * détruirait ce que le bloc est censé établir.
     *
     * Ce test a d'abord refusé TOUT chiffre. Il avait tort sur l'intention :
     * la feuille de certificat dessinée dans ce bloc porte de vrais chiffres,
     * ceux du lot FN-OLW8W. Mais il avait raison sur le fond — je venais de
     * recopier « 99,7 % » et « 105,32 mg » dans cette page alors que
     * `Certificats.jsx` les portait déjà. Deux copies du même chiffre
     * finissent toujours par diverger.
     *
     * Il exige donc maintenant la SOURCE UNIQUE : les valeurs viennent de
     * `lib/certificat`, pas de littéraux. */
    expect(preuve()).toContain("GHK.purete.res");
    expect(preuve()).toContain("GHK.teneur.res");
    expect(preuve()).toContain("GHK.lot");
    expect(SOURCE).toMatch(/import \{ GHK \} from "\.\.\/lib\/certificat"/);

    // Et aucune valeur recopiée à la main dans la section.
    expect(preuve()).not.toMatch(/99,7|105,32|FN-OLW8W/);
  });

  test("le bloc montre un OBJET, pas seulement du texte", () => {
    /* MIREILLE, 11/10/2026 : « pourquoi le design est simpliste. zéro image,
     * zéro beauté, rien qu'un bloc ». Le panneau de droite était une liste à
     * puces dans un cadre blanc.
     *
     * La réponse n'était pas d'aller chercher une photo : le document EST
     * l'objet dont le bloc parle. */
    expect(preuve()).toContain('data-testid="preuve-certificat"');
    expect(preuve()).toContain("MolecularMesh");
    expect(preuve()).toContain("<svg");
  });

  test("son texte clair ne s'inverse pas la nuit", () => {
    // Le panneau est en marine codé en dur : mêmes jetons stables que le
    // hero, pour la même raison.
    expect(preuve()).toContain("--sur-voile-accent");
    expect(preuve()).toContain("--sur-voile-doux");
  });
});
