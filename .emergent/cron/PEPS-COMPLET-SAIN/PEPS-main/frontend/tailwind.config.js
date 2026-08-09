/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        /* ---- FIRONOVA official identity ---- */
        nordfjord: "#0B2E4F",   // primary structure / ink
        glacier: "#3E5C76",     // secondary text
        nova: "#00B8D4",        // accent / spark — used with restraint
        clinical: "#F7FAFC",    // page ground
        ash: "#CBD5E0",         // borders / hairlines
        ink: "#0A0F14",         // deep footer ground
        success: "#2E9E6B",
        warning: "#E8A33D",
        error: "#D64545",
        compliance: "#5B7A9E",  // RUO / regulatory channel

        /* ---- Tokens sémantiques (composants shadcn / ui-*) ---- */
        background: {
          DEFAULT: "#F7FAFC",   // clinical — page ground
          foreground: "#0B2E4F",
        },
        foreground: "#0B2E4F",  // nordfjord — ink
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#0B2E4F",
        },
        popover: {
          DEFAULT: "#FFFFFF",
          foreground: "#0B2E4F",
        },
        primary: {
          DEFAULT: "#0B2E4F",   // nordfjord
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#CBD5E0",   // ash
          foreground: "#0B2E4F",
        },
        muted: {
          DEFAULT: "#CBD5E0",   // ash
          foreground: "#3E5C76", // glacier
        },
        accent: {
          DEFAULT: "#CBD5E0",   // ash
          foreground: "#0B2E4F",
        },
        destructive: {
          DEFAULT: "#D64545",   // error
          foreground: "#FFFFFF",
        },
        border: "#CBD5E0",      // ash — hairlines
        input: "#CBD5E0",       // ash
        ring: "#00B8D4",        // nova — focus spark
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "sans-serif"],
        data: ["Inter", "sans-serif"],
        sans: ["Inter", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
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
        "2xl": "24px",
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
