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
];
