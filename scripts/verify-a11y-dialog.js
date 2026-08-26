#!/usr/bin/env node
/**
 * Assert that BookingSheet.astro (issue #59) keeps its dialog semantics and
 * focus-management wiring: role/aria attributes, a Tab focus trap, focus
 * moved in on open, and focus restored to the trigger on close. Catches an
 * accidental regression the same way verify-security-headers.js does for
 * the security headers block.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentPath = join(root, "src/components/BookingSheet.astro");

const REQUIRED = [
  ['role="dialog"', "dialog role on the sheet panel"],
  ['aria-modal="true"', "aria-modal on the sheet panel"],
  ['aria-labelledby="sheet-title"', "aria-labelledby pointing at the title"],
  ['id="sheet-title"', "id on the title element matching aria-labelledby"],
  ["trapFocus(", "a Tab focus trap"],
  ["focusFirst(", "focus moved into the sheet on open"],
  ["triggerEl", "the trigger element tracked for focus return"],
  ["@keydown.escape.window", "Escape still closes the sheet"]
];

function fail(message) {
  console.error(`verify-a11y-dialog: ${message}`);
  process.exit(1);
}

const source = readFileSync(componentPath, "utf-8");

const missing = REQUIRED.filter(([needle]) => !source.includes(needle));
if (missing.length > 0) {
  fail(`BookingSheet.astro is missing:\n${missing.map(([needle, desc]) => `  - ${desc} (${needle})`).join("\n")}`);
}

console.log("verify-a11y-dialog: OK");
for (const [, desc] of REQUIRED) {
  console.log(`  ✓ ${desc}`);
}
