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
          info: "#38bdf8",
          success: "#86efac",
          warning: "#fbbf24",
          error: "#ef4444",
          "--rounded-btn": "0.75rem"
        }
      }
    ]
  },
  plugins: [require("daisyui")],
  darkMode: "class"
};
