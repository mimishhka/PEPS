/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        /* ---- FIRONOVA official identity ----
         * Les valeurs vivent dans src/index.css, en canaux RVB, et changent
         * selon le theme. La syntaxe <alpha-value> preserve les modificateurs
         * d'opacite : bg-nova/15, border-ash/60, text-white/70 continuent de
         * fonctionner exactement comme avant.
         *
         * Ecrire un hexadecimal ici figerait la couleur et le mode nuit
         * n'aurait aucun effet sur la classe concernee. */
        nordfjord: "rgb(var(--fn-nordfjord) / <alpha-value>)",   // structure / ink
        glacier: "rgb(var(--fn-glacier) / <alpha-value>)",       // secondary text
        nova: "rgb(var(--fn-nova) / <alpha-value>)",             // accent, used with restraint
        clinical: "rgb(var(--fn-clinical) / <alpha-value>)",     // page ground
        ash: "rgb(var(--fn-ash) / <alpha-value>)",               // borders / hairlines
        ink: "rgb(var(--fn-ink) / <alpha-value>)",               // deep footer ground
        card: "rgb(var(--fn-card) / <alpha-value>)",             // card surface
        success: "rgb(var(--fn-success) / <alpha-value>)",
        warning: "rgb(var(--fn-warning) / <alpha-value>)",
        error: "rgb(var(--fn-error) / <alpha-value>)",
        compliance: "rgb(var(--fn-compliance) / <alpha-value>)", // RUO / regulatory

        /* ---- Jetons shadcn/ui, branches sur l'identite ----
         *
         * Les composants de components/ui/ sont ecrits pour le theme shadcn et
         * emploient bg-primary, text-foreground, bg-muted, border-input… Ces
         * noms n'existaient nulle part : ~450 classes ne peignaient RIEN.
         * Boites de dialogue, menus deroulants, infobulles et champs
         * s'affichaient donc sans thème, sans qu'aucune erreur ne le signale.
         *
         * Plutot que de reecrire ces composants, on declare les noms qu'ils
         * attendent en les faisant pointer sur les MEMES variables que le
         * reste du site. Consequence : ils suivent le mode nuit sans une ligne
         * de plus, et il n'existe toujours qu'une seule palette.
         *
         * Chaque paire fond/texte s'inverse ensemble — c'est la paire qui
         * porte le contraste, jamais la valeur absolue. */
        background: "rgb(var(--fn-clinical) / <alpha-value>)",
        foreground: "rgb(var(--fn-nordfjord) / <alpha-value>)",
        "card-foreground": "rgb(var(--fn-nordfjord) / <alpha-value>)",
        popover: "rgb(var(--fn-card) / <alpha-value>)",
        "popover-foreground": "rgb(var(--fn-nordfjord) / <alpha-value>)",
        primary: "rgb(var(--fn-nordfjord) / <alpha-value>)",
        "primary-foreground": "rgb(var(--fn-clinical) / <alpha-value>)",
        secondary: "rgb(var(--fn-clinical) / <alpha-value>)",
        "secondary-foreground": "rgb(var(--fn-nordfjord) / <alpha-value>)",
        muted: "rgb(var(--fn-clinical) / <alpha-value>)",
        "muted-foreground": "rgb(var(--fn-glacier) / <alpha-value>)",
        accent: "rgb(var(--fn-clinical) / <alpha-value>)",
        "accent-foreground": "rgb(var(--fn-nordfjord) / <alpha-value>)",
        destructive: "rgb(var(--fn-error) / <alpha-value>)",
        "destructive-foreground": "rgb(var(--fn-clinical) / <alpha-value>)",
        border: "rgb(var(--fn-ash) / <alpha-value>)",
        input: "rgb(var(--fn-ash) / <alpha-value>)",
        ring: "rgb(var(--fn-nova) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        data: ["'JetBrains Mono'", "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      letterSpacing: {
        wordmark: "0.14em",
      },
      /* Quatre valeurs, pas huit.
       *
       * Le code employait 8 noms — sm, md, DEFAULT, lg, xl, 2xl, 3xl, full —
       * pour 3 valeurs seulement : sm/md/DEFAULT rendaient 8 px, xl et 2xl
       * rendaient 16 px. Les alias ont ete unifies dans le code (renommage
       * pur, rendu identique au pixel), et les doublons retires ici.
       *
       * 3xl etait employe 9 fois sans etre declare : il retombait sur le
       * defaut de Tailwind. Il est desormais explicite. */
      borderRadius: {
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "3xl": "24px",
      },
      keyframes: {
        mesh: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        node: {
          "0%,100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
        seal: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        drop: {
          "0%": { opacity: "0", transform: "scaleY(0)", transformOrigin: "top" },
          "50%": { opacity: "1" },
          "100%": { opacity: "0", transform: "scaleY(1)", transformOrigin: "bottom" },
        },
      },
      animation: {
        mesh: "mesh 9s ease-in-out infinite",
        node: "node 3s ease-in-out infinite",
        seal: "seal 40s linear infinite",
        drop: "drop 2s infinite",
      },
    },
  },
  plugins: [],
};
