#!/usr/bin/env node
/**
 * Assert that Alpine-hidden day/step panels (issue #60) stay marked `inert`
 * while inactive, so a regression that drops the binding fails CI instead of
 * silently reopening the panel to keyboard/AT focus.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`verify-a11y-hidden-panels: ${message}`);
  process.exit(1);
}

// Confirms `needle` occurs in `source`, and that an `x-bind:inert=` binding
// sits within `window` characters after it (i.e. on the same element).
function assertInertNear(source, file, needle, window = 400) {
  const index = source.indexOf(needle);
  if (index === -1) {
    fail(`${file}: expected to find ${JSON.stringify(needle)}`);
  }
  const nearby = source.slice(index, index + needle.length + window);
  if (!nearby.includes("x-bind:inert=")) {
    fail(`${file}: element with ${JSON.stringify(needle)} is missing a paired x-bind:inert binding`);
  }
}

const indexPath = join(root, "src/pages/index.astro");
const indexSource = readFileSync(indexPath, "utf-8");

if (!indexSource.includes("isDesktop")) {
  fail(
    "src/pages/index.astro: missing the isDesktop reactive flag used to keep desktop's always-visible day columns interactive"
  );
}
const agendaDaySectionIndex = indexSource.indexOf('class="agenda-day ');
if (agendaDaySectionIndex === -1) {
  fail("src/pages/index.astro: expected to find the agenda-day <section>");
}
assertInertNear(
  indexSource.slice(agendaDaySectionIndex),
  "src/pages/index.astro",
  "x-show={`dayIndex === ${day.index}`}"
);
if (!indexSource.includes("x-bind:inert={`!isDesktop && dayIndex !== ${day.index}`}")) {
  fail(
    "src/pages/index.astro: agenda-day panel's x-bind:inert must stay false on desktop, where CSS forces every day column visible"
  );
}

const sheetPath = join(root, "src/components/BookingSheet.astro");
const sheetSource = readFileSync(sheetPath, "utf-8");

const stepShowNeedles = [
  `x-show="mode === 'view' && step === 'view'"`,
  `x-show="mode === 'create' && step === 'form'"`,
  `x-show="mode === 'edit' && step === 'form'"`,
  `x-show="step === 'conflict'"`,
  `x-show="mode === 'create' && step === 'confirm'"`,
  `x-show="mode === 'edit' && step === 'confirm'"`
];

for (const needle of stepShowNeedles) {
  assertInertNear(sheetSource, "src/components/BookingSheet.astro", needle);
}

// The edit-mode "form" step appears twice: the editable fields, and the
// delete button rendered below them — both must stay inert together.
const editFormOccurrences = sheetSource.split(`x-show="mode === 'edit' && step === 'form'"`).length - 1;
if (editFormOccurrences < 2) {
  fail(
    `src/components/BookingSheet.astro: expected 2 occurrences of x-show="mode === 'edit' && step === 'form'", found ${editFormOccurrences}`
  );
}

console.log("verify-a11y-hidden-panels: OK");
console.log("  ✓ index.astro agenda-day panels stay inert while inactive on mobile, interactive on desktop");
console.log("  ✓ BookingSheet.astro step panels are paired with x-bind:inert");
