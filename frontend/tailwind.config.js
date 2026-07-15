/** @type {import('tailwindcss').Config} */
// FIRONOVA — aligné sur tokens.json v1.0.0 « LE SIGNAL »
// Changements vs version précédente :
//  - signal dédupliqué (#C20114 uniquement — l'ancien doublon #E51919 créait
//    un rouge hors-palette selon l'ordre des clés)
//  - warning #FFCC00 → #B8860B (token functional.warning)
//  - ajout: faint, garnet, inkmuted, success (tokens manquants)
//  - radius 0 → 8/12/16px (tokens shape.*) : les 60+ usages existants de
//    rounded-sm/md/lg prennent vie sans toucher aucun composant
//  - TYPOGRAPHIE (règle « two rooms, one person ») :
//      display → Space Grotesk 700 = voix boutique (le serif ne titre plus le store)
//      social  → Instrument Serif  = voix feed/social uniquement
//      sans    → Inter             = voix body
//    ↩︎ POUR REVENIR au serif en boutique : remettre display sur Instrument Serif.
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],      // voix boutique
        social: ["'Instrument Serif'", "Georgia", "serif"],           // voix feed — jamais dans l'UI boutique
        sans: ["'Inter'", "system-ui", "sans-serif"],                 // voix body
        store: ["'Space Grotesk'", "system-ui", "sans-serif"],        // alias explicite
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"], // voix data
      },
      borderRadius: {
        sm: "8px",   /* --fn-radius-sm */
        md: "12px",  /* --fn-radius-md */
        lg: "16px",  /* --fn-radius-lg */
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        /* --- Palette FIRONOVA · LE SIGNAL (tokens.json) --- */
        paper: "#FFFAF6",     /* ground — every surface */
        ink: "#3A0A08",       /* oxblood — texte, wordmark */
        garnet: "#6B0504",    /* deep sections, social tiles */
        oxblood: "#6B0504",   /* alias rétro-compatible (code existant) */
        copper: "#B06C49",    /* data voice, captions, badges compliance */
        copperlight: "#DCB49A",
        signal: "#C20114",    /* LA LIGNE + CTA primaire — rationné */
        faint: "#E9DED4",     /* filets, bordures, baselines */
        inkmuted: "#8A6F63",  /* texte secondaire sur paper */

        /* --- Fonctionnels (jamais brand) --- */
        success: "#2E7D52",
        warning: "#B8860B",
        error: "#C20114",     /* contexte formulaire/système uniquement */
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "marquee": { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        "fade-up": { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "marquee": "marquee 30s linear infinite",
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
