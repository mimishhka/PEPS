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
      borderRadius: {
        sm: "8px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "16px",
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
