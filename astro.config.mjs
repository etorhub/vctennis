import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import alpinejs from "@astrojs/alpinejs";
import netlify from "@astrojs/netlify";
import db from "@astrojs/db";

// https://astro.build/config
export default defineConfig({
  integrations: [
    db(),
    tailwind(),
    alpinejs({
      entrypoint: "/src/entrypoint"
    })
  ],
  output: "server",
  adapter: netlify(),
  security: {
    // Trust the public site host when Netlify forwards X-Forwarded-* (cron/self-POSTs).
    allowedDomains: [{ hostname: "tennisvinyacanadell.cc", protocol: "https" }]
  },
  // prefetchAll is intentionally omitted: prefetching every link on hover
  // (including /admin/* pages and the sign-out action) triggers SSR + DB
  // queries for users who never click through. Links opt in individually
  // via the `data-astro-prefetch` attribute instead (issue #66).
  prefetch: {
    defaultStrategy: "hover"
  },
  server: {
    host: true // expose on LAN during `astro dev`
  }
});
