#!/usr/bin/env node
/**
 * Assert the agenda-booking buttons (issue #61) have a visible focus style
 * and an accessible name, and that the i18n dictionaries stay in sync.
 * Catches an accidental regression the same way verify-security-headers.js
 * catches a dropped header.
 */
import { readFileSync } from "fs";
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

console.log("verify-a11y: OK");
console.log("  ✓ .agenda-booking:focus-visible ring style");
console.log('  ✓ .agenda-booking aria-label uses t("bookingSummary", ...)');
console.log("  ✓ bookingSummary present in en.ts and ca.ts");
