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
  /* CE QUE LE BLOC AFFIRME TIENT EN UNE LIGNE : le numéro imprimé sur
   * l'étiquette est celui qui ouvre le rapport du laboratoire. Deux images
   * réelles le prouvent — une photographie de la fiole, une bande continue du
   * certificat — et le lecteur compare deux chaînes de caractères.
   *
   * CE FILET PROTÈGE TROIS CHOSES, dans cet ordre d'importance :
   *   1. que rien ne soit DESSINÉ à la place du réel ;
   *   2. qu'aucun chiffre ne soit recopié à la main ;
   *   3. qu'aucune phrase ne promette un effet.
   *
   * La version précédente du bloc dessinait une feuille de certificat en HTML,
   * chromatogramme compris. MIREILLE, 12/10/2026 : « ça prend de vraies
   * images ». Sa propre DESIGN.md le disait déjà — « sans photo disponible,
   * le repli est la maille moléculaire de la marque, jamais un bloc de texte
   * décoré ». */

  /* LES COMMENTAIRES SONT RETIRÉS AVANT LE FILTRAGE, et ce n'est pas du
   * confort. Un premier jet lisait la source brute, et le filtre a attrapé le
   * mot « garantir » — dans MON PROPRE commentaire expliquant pourquoi je
   * n'invente pas de chiffre. Un filtre qui lit ce que personne ne voit
   * signale des défauts qui n'existent pas, et on finit par l'assouplir
   * jusqu'à ce qu'il ne serve plus à rien. */
  const sansCommentaires = (t) =>
    t.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

  /* LA DÉCOUPE PART DE L'OUVERTURE DE LA BALISE, pas du `data-testid`.
   * Celui-ci vient APRÈS le `className` : en partant de lui, les classes de la
   * section elle-même tombaient hors du périmètre, et le test qui vérifie
   * qu'elle est un filet et non une carte cherchait dans un texte où la
   * réponse n'avait jamais pu se trouver. */
  const preuve = () => {
    const i = SOURCE.indexOf('data-testid="preuve-section"');
    expect(i).toBeGreaterThan(-1);
    const ouverture = SOURCE.lastIndexOf("<section", i);
    return sansCommentaires(
      SOURCE.slice(ouverture, SOURCE.indexOf('data-testid="newsletter-section"')),
    );
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
    expect(preuve()).toContain("RET.pieces.pdf");
  });

  test("MAIS LE RENVOI VERS /lab ATTEND QUE LA PAGE EXISTE", () => {
    /* MIREILLE, 11/10/2026 : « pourquoi je ne vois pas la page qui permet de
     * faire une recherche pour les COA ». Elle est derrière COA_PAGE_ENABLED,
     * et quand ce drapeau est à `false` la route renvoie à l'accueil. */
    expect(preuve()).toContain('to="/lab"');
    expect(preuve()).toMatch(/\{coaPageEnabled && \(/);
    expect(SOURCE).toMatch(/import \{ useSiteConfig \} from "\.\.\/contexts\/SiteConfigContext"/);
  });

  test("et il ne promet aucun effet", () => {
    const interdits = [/bienfait/i, /efficacit/i, /thérapeut/i, /traitement/i,
                       /dose/i, /guéri/i, /meilleur/i, /garanti/i];
    for (const motif of interdits) expect(preuve()).not.toMatch(motif);
  });

  test("RIEN N'EST DESSINÉ : les deux pièces sont réelles", () => {
    /* Le cœur du filet. La version précédente composait une feuille de
     * certificat en HTML — bande d'en-tête, numéro de lot en gros, et un
     * chromatogramme dont le tracé était écrit à la main dans un `path`.
     * Il ressemblait à une mesure sans en être une.
     *
     * Les trois pièces viennent maintenant du PDF du laboratoire, par
     * `scripts/certificats_exemples.py`. */
    const bloc = preuve();
    expect(bloc).toContain("RET.pieces.fiole");
    expect(bloc).toContain("RET.pieces.extrait");
    expect(bloc).toContain("RET.pieces.lotEtroit");

    // Et les vestiges de la feuille dessinée ont disparu.
    expect(bloc).not.toContain("NovaSpark");
    expect(bloc).not.toMatch(/rotate\(-?[\d.]+deg\)/);
    expect(bloc).not.toMatch(/strokeWidth/);
  });

  test("LES FICHIERS EXISTENT VRAIMENT", () => {
    /* Une image absente ne casse aucun test de rendu : elle rend un cadre
     * vide, en silence, sur la page la plus vue du site. */
    const racine = path.join(__dirname, "..", "..", "public");
    for (const f of ["ret-394-fiole.webp", "ret-394-extrait.webp",
                     "ret-394-lot.webp", "ret-394.pdf"]) {
      expect(fs.existsSync(path.join(racine, "certificats", f))).toBe(true);
    }
  });

  test("AUCUN CHIFFRE ÉCRIT EN DUR : ils viennent du certificat", () => {
    /* Deux copies du même numéro finissent toujours par diverger — et
     * diverger ICI détruirait exactement ce que le bloc établit. */
    expect(preuve()).toContain("RET.lot");
    expect(preuve()).toContain("RET.rapport");
    expect(SOURCE).toMatch(/import \{ RET \} from "\.\.\/lib\/certificat"/);
    expect(preuve()).not.toMatch(/FN-ELBCJ|COA-2026/);
  });

  test("UN FILET, PAS UNE CARTE", () => {
    /* DESIGN.md : « un filet plutôt qu'une carte chaque fois que c'est
     * possible », et la profondeur vient « des filets, du voile sur les photos
     * et de l'espace blanc ». Le panneau marine arrondi avec son ombre était
     * la carte que ce monde refuse. */
    expect(preuve()).toContain("border-y border-ash");
    expect(preuve()).not.toContain("bg-nordfjord");
    expect(preuve()).not.toContain("var(--ombre)");
  });

  test("PLUS D'ÉTIQUETTE AU-DESSUS DU TITRE", () => {
    /* Interdiction sans exception du plancher de qualité : le titre porte son
     * propre poids. Le bloc en avait une — « CHAQUE LOT, SON RAPPORT » — qui
     * redisait en petit ce que le titre dit en grand. */
    const titre = preuve().indexOf("titre-section");
    expect(titre).toBeGreaterThan(-1);
    expect(preuve().slice(0, titre)).not.toMatch(/etiquette|sur-titre/);
  });

  test("CHAQUE IMAGE SE DÉCRIT, et l'extrait large ne descend pas sous lg", () => {
    /* La bande de 830 px tomberait à 0,4 de son échelle sur un téléphone, et
     * son texte à sept pixels : un document illisible n'est pas une preuve,
     * c'est une texture. La version resserrée prend le relais. */
    const bloc = preuve();
    const motif = new RegExp(`<${"img"}[\\s\\S]*?/>`, "g");
    const images = bloc.match(motif) || [];
    expect(images).toHaveLength(3);
    for (const img of images) {
      expect(img).toMatch(/alt=/);
      expect(img).toMatch(/loading="lazy"/);
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    }
    expect(bloc).toMatch(/hidden lg:block/);
    expect(bloc).toMatch(/lg:hidden/);
  });
});
