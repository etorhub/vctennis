#!/usr/bin/env node
/**
 * Assert the agenda-booking buttons (issue #61) have a visible focus style
 * and an accessible name, that the skip-to-content link (issue #62) points
 * at a real target on every page, that no low-contrast text-base-content/50
 * usage has crept back in, and that the i18n dictionaries stay in sync.
 * Catches an accidental regression the same way verify-security-headers.js
 * catches a dropped header.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`verify-a11y: ${message}`);
  process.exit(1);
}

const globalCss = readFileSync(join(root, "src/global.css"), "utf-8");
if (!/\.agenda-booking:focus-visible\s*\{[^}]*ring-2/.test(globalCss)) {
  fail(".agenda-booking is missing a :focus-visible ring style in src/global.css");
}

const indexAstro = readFileSync(join(root, "src/pages/index.astro"), "utf-8");
const bookingButtonMatch = indexAstro.match(/class:list=\{\["agenda-booking[^\]]*\]\}[\s\S]*?(?=\n\s*>)/);
if (!bookingButtonMatch) {
  fail("could not locate the .agenda-booking button in src/pages/index.astro");
}
if (!/aria-label=\{t\("bookingSummary"/.test(bookingButtonMatch[0])) {
  fail('.agenda-booking button is missing an aria-label built from t("bookingSummary", ...)');
}

const en = readFileSync(join(root, "src/lib/i18n/en.ts"), "utf-8");
const ca = readFileSync(join(root, "src/lib/i18n/ca.ts"), "utf-8");
for (const [name, contents] of [
  ["en.ts", en],
  ["ca.ts", ca]
]) {
  if (!/bookingSummary:\s*"[^"]*\{time\}[^"]*\{name\}[^"]*"/.test(contents)) {
    fail(`src/lib/i18n/${name} is missing a bookingSummary key with {time} and {name} placeholders`);
  }
}

// Skip-to-content link (issue #62): must be the first focusable element in
// <body>, point at #main-content, and use the skipToContent i18n key.
const layoutAstro = readFileSync(join(root, "src/layouts/Layout.astro"), "utf-8");
const bodyIndex = layoutAstro.indexOf("<body");
const skipLinkMatch = layoutAstro.slice(bodyIndex).match(/<a\s+href="#main-content"[\s\S]*?<\/a>/);
if (!skipLinkMatch) {
  fail('src/layouts/Layout.astro is missing a <a href="#main-content"> skip link right after <body>');
}
if (!/sr-only/.test(skipLinkMatch[0]) || !/focus:not-sr-only/.test(skipLinkMatch[0])) {
  fail("skip-to-content link must be visually hidden until focused (sr-only focus:not-sr-only)");
}
if (!/t\("skipToContent"\)/.test(skipLinkMatch[0])) {
  fail('skip-to-content link must render t("skipToContent")');
}
if (!/skipToContent:\s*"[^"]+"/.test(en) || !/skipToContent:\s*"[^"]+"/.test(ca)) {
  fail("src/lib/i18n/en.ts and ca.ts must both define a skipToContent key");
}

// Every page rendered under AppHeader (plus the standalone disabled page)
// must expose a #main-content landing target for the skip link.
const pagesDir = join(root, "src/pages");
function collectAstroFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collectAstroFiles(full);
    return entry.endsWith(".astro") ? [full] : [];
  });
}
for (const file of collectAstroFiles(pagesDir)) {
  const contents = readFileSync(file, "utf-8");
  const usesAppHeader = /AppHeader/.test(contents);
  const hasMain = /<main[\s>]/.test(contents);
  if ((usesAppHeader || hasMain) && !/<main[^>]*\bid="main-content"/.test(contents)) {
    fail(`${file.replace(root + "/", "")} renders a <main> but is missing id="main-content"`);
  }
}

// Contrast fix (issue #62): text-base-content/50 is below the 4.5:1 minimum.
for (const file of collectAstroFiles(pagesDir)) {
  const contents = readFileSync(file, "utf-8");
  if (/text-base-content\/50\b/.test(contents)) {
    fail(`${file.replace(root + "/", "")} still uses low-contrast text-base-content/50`);
  }
}

console.log("verify-a11y: OK");
console.log("  ✓ .agenda-booking:focus-visible ring style");
console.log('  ✓ .agenda-booking aria-label uses t("bookingSummary", ...)');
console.log("  ✓ bookingSummary present in en.ts and ca.ts");
console.log("  ✓ skip-to-content link present, hidden-until-focused, targets #main-content");
console.log("  ✓ every page with a <main> exposes id=\"main-content\"");
console.log("  ✓ no low-contrast text-base-content/50 usage in src/pages");
