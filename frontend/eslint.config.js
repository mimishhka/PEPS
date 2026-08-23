// Minimal ESLint v9 flat config (CommonJS) — keeps platform linter happy
// without enforcing intrusive rules on the existing CRA/React codebase.
// Registers react-hooks plugin so inline `eslint-disable react-hooks/*`
// directives sprinkled through the code do not trigger "rule not found".
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: [
      "build/**",
      "dist/**",
      "node_modules/**",
      "public/**",
      "coverage/**",
      "**/*.min.js",
    ],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        process: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        // Ajoutes apres le premier passage reel de no-undef : ces globaux du
        // navigateur produisaient 24 fausses erreurs. Une liste incomplete ne
        // rend pas la regle prudente, elle la rend bruyante — et une regle
        // bruyante finit desactivee.
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        IntersectionObserver: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        AbortController: "readonly",
        // alert, confirm et prompt sont VOLONTAIREMENT ABSENTS de cette liste.
        //
        // Ce sont bien des globaux du navigateur, et les declarer supprimerait
        // trois erreurs. Mais ce projet a son propre dialogue — useConfirm —
        // et c'est justement en oubliant `const confirm = useConfirm()` dans
        // OrderDetail que trois actions destructrices ont fini par afficher
        // « [object Object] » : le natif recevait un objet la ou il attend une
        // chaine, sans qu'aucune erreur ne soit levee.
        //
        // Les laisser non declares transforme ce piege silencieux en erreur de
        // lint. C'est un choix propre a ce projet, pas un oubli.
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        matchMedia: "readonly",
        history: "readonly",
        location: "readonly",
        atob: "readonly",
        btoa: "readonly",
        structuredClone: "readonly",
        Image: "readonly",
        WebSocket: "readonly",
      },
    },
    rules: {
      /* no-undef fait, correctement, ce qu'une expression reguliere ne peut
       * pas faire : de l'analyse de PORTEE.
       *
       * Le defaut qui a motive son activation : `load()` appele depuis
       * OrderDetail, qui ne recoit que { order, onClose, onUpdate }. La
       * fonction existait dans le fichier, mais dans un composant VOISIN. Le
       * code compilait, les quatre sondes maison passaient, et cela plantait
       * au premier clic.
       *
       * J'ai essaye d'ecrire une sonde equivalente. Elle a echoue quatre fois
       * de suite — ratant sa cible, puis denoncant `rgba(` lu dans une chaine
       * CSS et « tiers (» lu dans de la prose francaise. C'est le mauvais
       * outil pour ce travail, et ESLint etait deja installe.
       *
       * ATTENTION avant de la rendre bloquante : craco lance ESLint pendant
       * `yarn build` avec une configuration SEPAREE (craco.config.js), qui
       * n'active que les regles react-hooks. Cette regle-ci ne s'applique donc
       * qu'aux passages manuels — `yarn lint` — tant que personne ne l'ajoute
       * la-bas. C'est deliberé : je n'ai pas pu mesurer combien de violations
       * existent, et l'activer a l'aveugle dans le build aurait pu casser la
       * chaine d'integration.
       */
      "no-undef": "error",
    },
  },
  {
    // Les fichiers de test tournent sous Jest, qui injecte ses propres globaux.
    // Sans ce bloc, no-undef signalait 14 fois describe, it et expect —
    // du bruit pur, dans les deux seuls fichiers de test du projet.
    files: ["src/**/*.test.{js,jsx}", "src/**/__tests__/**/*.{js,jsx}"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
      },
    },
  },
];
