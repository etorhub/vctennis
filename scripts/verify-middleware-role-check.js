#!/usr/bin/env node
/**
 * Assert that src/middleware.ts's authoritative role/disabled DB re-check
 * (issue #65) is scoped to privileged routes and mutating requests instead of
 * running unconditionally on every request, including public/static pages.
 * Catches an accidental regression back to two DB round-trips per page load,
 * the same way verify-booking-overlap-query.js guards assertNoOverlap.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const middlewarePath = join(root, "src/middleware.ts");

function fail(message) {
  console.error(`verify-middleware-role-check: ${message}`);
  process.exit(1);
}

const source = readFileSync(middlewarePath, "utf-8");

const guardMatch = source.match(/const needsFreshRoleCheck\s*=\s*([^;]+);/);
if (!guardMatch) {
  fail("could not find a `needsFreshRoleCheck` guard in src/middleware.ts");
}
const guardExpr = guardMatch[1];

if (!/path\.startsWith\(\s*["']\/admin["']\s*\)/.test(guardExpr)) {
  fail("needsFreshRoleCheck must cover privileged routes via `path.startsWith(\"/admin\")`");
}

if (!/request\.method\s*!==\s*["']GET["']/.test(guardExpr)) {
  fail('needsFreshRoleCheck must cover mutating requests via `context.request.method !== "GET"`');
}

const ifMatch = source.match(/if\s*\(([^)]*)\)\s*\{\s*\n\s*try\s*\{\s*\n\s*const \[row\] = await db/);
if (!ifMatch) {
  fail("could not find the guarded `if (...) { try { const [row] = await db ... } }` block around the role/disabled DB lookup");
}
if (!/needsFreshRoleCheck/.test(ifMatch[1])) {
  fail("the role/disabled DB lookup must be gated on `needsFreshRoleCheck`, not run for every request with a user");
}
if (!/\buser\b/.test(ifMatch[1])) {
  fail("the role/disabled DB lookup must still be skipped entirely for anonymous (logged-out) requests");
}

console.log("verify-middleware-role-check: OK");
console.log("  ✓ needsFreshRoleCheck covers /admin/* routes and non-GET (mutating) requests");
console.log("  ✓ the role/disabled DB re-check only runs when needsFreshRoleCheck is true");
