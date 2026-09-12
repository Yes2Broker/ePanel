import type { Config } from "tailwindcss";

/**
 * Centralized design system.
 * Change brand color, radius or fonts here and it propagates everywhere —
 * no component should hardcode a raw hex value.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Neutral surface palette (matches the light, low-contrast reference UI)
        surface: {
          DEFAULT: "#F3F3EF", // app background
          card: "#FFFFFF", // card background
          border: "#E7E7E1",
        },
        ink: {
          DEFAULT: "#16171A", // primary text
          muted: "#6B6C66", // secondary text
          faint: "#A3A49C", // tertiary / placeholder text
        },
        // Brand accent — the single yellow highlight color used sparingly
        brand: {
          DEFAULT: "#E8E24A",
          dark: "#C9C400",
          soft: "#F6F5C9",
        },
        status: {
          success: "#1E9E6B",
          successBg: "#E7F6EE",
          warning: "#B98900",
          warningBg: "#FBF1DA",
          danger: "#D1443B",
          dangerBg: "#FBE9E8",
          neutralBg: "#EFEFEA",
        },
      },
      borderRadius: {
        card: "1rem",
        pill: "999px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(20,20,15,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
