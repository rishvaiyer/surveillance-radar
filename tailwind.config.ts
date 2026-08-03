import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        space: "#05070d",
        panel: "#0b0f18",
        edge: "#1b2433",
        signal: "#38e1ff",
        // Muted text ramp (previously scattered as hardcoded arbitrary hex).
        ink: "#dbe6f2",
        "ink-2": "#9fb0c6",
        muted: "#7d8ba0",
        faint: "#5b6a80",
      },
      fontFamily: {
        sans: ["var(--font-display)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "radar-sweep": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "boot-scan": {
          "0%": { transform: "translateY(-120%)" },
          "100%": { transform: "translateY(120%)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "radar-sweep": "radar-sweep 8s linear infinite",
        "boot-scan": "boot-scan 1.1s ease-in-out infinite",
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
