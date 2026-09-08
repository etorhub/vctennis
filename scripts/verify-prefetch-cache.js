#!/usr/bin/env node
/**
 * Assert link prefetching is scoped (not global) and that admin/mutating
 * links opt out explicitly, and that static passthrough assets under
 * public/ get explicit long-lived cache headers while the service worker
 * stays revalidate-on-load (issue #66). Catches an accidental regression
 * the same way verify-security-headers.js catches a dropped header.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`verify-prefetch-cache: ${message}`);
  process.exit(1);
}

const astroConfig = readFileSync(join(root, "astro.config.mjs"), "utf-8");
if (/prefetchAll\s*:\s*true/.test(astroConfig)) {
  fail("astro.config.mjs must not set prefetchAll: true — links must opt in individually via data-astro-prefetch");
}
if (!/prefetch\s*:\s*\{/.test(astroConfig)) {
  fail("astro.config.mjs is missing the prefetch config block");
}

const adminNavFiles = [
  "src/pages/admin/users.astro",
  "src/pages/admin/bookings.astro",
  "src/pages/admin/timeline.astro"
];
for (const rel of adminNavFiles) {
  const contents = readFileSync(join(root, rel), "utf-8");
  for (const target of ["/admin/users", "/admin/bookings", "/admin/timeline"]) {
    const linkMatch = contents.match(new RegExp(`<a href="${target}"[^>]*>`));
    if (linkMatch && !/data-astro-prefetch="false"/.test(linkMatch[0])) {
      fail(`${rel}: link to ${target} must opt out with data-astro-prefetch="false"`);
    }
  }
}

const appHeader = readFileSync(join(root, "src/components/AppHeader.astro"), "utf-8");
const adminLinkMatch = appHeader.match(/<a href="\/admin\/users"[^>]*>/);
if (!adminLinkMatch || !/data-astro-prefetch="false"/.test(adminLinkMatch[0])) {
  fail('src/components/AppHeader.astro: the /admin/users link must opt out with data-astro-prefetch="false"');
}

const netlifyToml = readFileSync(join(root, "netlify.toml"), "utf-8");

function headersBlockFor(pathGlob) {
  const re = new RegExp(
    `\\[\\[headers\\]\\]\\s*\\n\\s*for\\s*=\\s*"${pathGlob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*\\n\\s*\\[headers\\.values\\]([\\s\\S]*?)(?:\\n\\[|\\n?$)`
  );
  return netlifyToml.match(re)?.[1];
}

for (const pathGlob of ["/icons/*", "/favicon.svg", "/og-image.png", "/manifest.webmanifest"]) {
  const block = headersBlockFor(pathGlob);
  if (!block || !/Cache-Control\s*=\s*"public, max-age=31536000, immutable"/.test(block)) {
    fail(`netlify.toml is missing a long-lived immutable Cache-Control header for ${pathGlob}`);
  }
}

const swBlock = headersBlockFor("/sw.js");
if (!swBlock || !/Cache-Control\s*=\s*"no-cache"/.test(swBlock)) {
  fail("netlify.toml is missing a no-cache Cache-Control header for /sw.js");
}

console.log("verify-prefetch-cache: OK");
console.log("  ✓ prefetchAll disabled in astro.config.mjs");
console.log('  ✓ /admin/* nav links opt out with data-astro-prefetch="false"');
console.log("  ✓ static assets (icons, favicon, og-image, manifest) get immutable Cache-Control");
console.log("  ✓ /sw.js gets no-cache Cache-Control");
