import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      colors: {
        // Gain/loss -- the one color signal every real exchange leans on.
        // Text and background variants are tuned separately for contrast.
        up: "#16a34a",
        "up-text": "#006300",
        "up-text-dark": "#0ca30c",
        down: "#dc2626",
        "down-text": "#b3241f",
        "down-text-dark": "#e6635f",
        // Deep steel-blue accent (replaces the earlier generic indigo) --
        // a validated blue ramp tuned for both light and dark contrast.
        brand: {
          50: "#eef4fc",
          100: "#d9e6f8",
          200: "#b7d3f6",
          300: "#86b6ef",
          400: "#3987e5",
          500: "#2a78d6",
          600: "#1c5cab",
          700: "#104281",
          800: "#0d366b",
          900: "#0a2a54",
        },
        // Near-black exchange chrome for headers/ticker tape.
        ink: {
          900: "#0b0e14",
          800: "#11151d",
          700: "#181d27",
        },
      },
    },
  },
  plugins: [],
};

export default config;
