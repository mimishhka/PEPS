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
