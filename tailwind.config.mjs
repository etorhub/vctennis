/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      container: {
        center: true,
        padding: "16px",
        maxWidth: "640px"
      }
    }
  },
  daisyui: {
    themes: [
      {
        tennis: {
          primary: "#16a34a",
          secondary: "#f0fdf4",
          accent: "#15803d",
          neutral: "#1f2937",
          "base-100": "#ffffff",
          "base-200": "#f8fafc",
          "base-300": "#e2e8f0",
          "base-content": "#1f2937",
          info: "#38bdf8",
          success: "#86efac",
          warning: "#fbbf24",
          error: "#ef4444",
          "--rounded-btn": "0.75rem",
          "color-scheme": "light"
        }
      },
      {
        "tennis-dark": {
          primary: "#22c55e",
          secondary: "#14532d",
          accent: "#4ade80",
          neutral: "#334155",
          "base-100": "#0f172a",
          "base-200": "#1e293b",
          "base-300": "#334155",
          "base-content": "#e2e8f0",
          info: "#38bdf8",
          success: "#4ade80",
          warning: "#fbbf24",
          error: "#f87171",
          "--rounded-btn": "0.75rem",
          "color-scheme": "dark"
        }
      }
    ]
  },
  plugins: [require("daisyui")],
  darkMode: ["class", '[data-theme="tennis-dark"]']
};
