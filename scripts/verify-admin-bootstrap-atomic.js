#!/usr/bin/env node
/**
 * Assert that `becomeAdmin` in src/actions/auth.ts (issue #58) promotes the
 * first admin with a single atomic UPDATE ... WHERE NOT EXISTS statement
 * instead of a separate select-then-update, which has a TOCTOU race: two
 * concurrent bootstrap requests could both pass a plain "any admins exist?"
 * select before either one writes.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const authActionsPath = join(root, "src/actions/auth.ts");

function fail(message) {
  console.error(`verify-admin-bootstrap-atomic: ${message}`);
  process.exit(1);
}

const source = readFileSync(authActionsPath, "utf-8");

if (!/import\s*\{[^}]*\bnotExists\b[^}]*\}\s*from\s*["']astro:db["']/.test(source)) {
  fail('src/actions/auth.ts must import `notExists` from "astro:db"');
}

const handlerMatch = source.match(/becomeAdmin:\s*defineAction\(\{[\s\S]*?\n {2}\}\)/);
if (!handlerMatch) {
  fail("could not find the `becomeAdmin` action in src/actions/auth.ts");
}
const handler = handlerMatch[0];

if (/db\.select\(\)\.from\(User\)\.where\(eq\(User\.role,\s*["']admin["']\)\)\.limit\(1\)/.test(handler)) {
  fail(
    "becomeAdmin must not check for an existing admin with a separate `db.select(...).limit(1)` before updating — that reintroduces the TOCTOU race"
  );
}

if (!/\.update\(User\)/.test(handler) || !/\.set\(\{\s*role:\s*["']admin["']/.test(handler)) {
  fail('becomeAdmin must promote the user via `db.update(User).set({ role: "admin", ... })`');
}

const whereMatch = handler.match(/\.where\(([\s\S]*?)\)\s*\n\s*\.returning\(/);
if (!whereMatch) {
  fail(
    "the `db.update(User)` call must chain `.where(...)` and `.returning(...)` so the promotion and the admin-existence check are one statement"
  );
}
const whereClause = whereMatch[1];

if (!/\bnotExists\(/.test(whereClause)) {
  fail(
    "the update's `.where(...)` clause must use `notExists(...)` to check for an existing admin atomically, in the same statement as the write"
  );
}
if (!/eq\(User\.role,\s*["']admin["']\)/.test(whereClause)) {
  fail('the `notExists(...)` subquery must filter on `eq(User.role, "admin")`');
}
if (!/eq\(User\.id,\s*user\.id\)/.test(whereClause)) {
  fail("the update's `.where(...)` clause must still scope the write to `eq(User.id, user.id)`");
}

if (!/const promoted\s*=\s*await db/.test(handler)) {
  fail(
    "becomeAdmin must inspect the update's `.returning(...)` result to know whether the promotion actually happened"
  );
}
if (!/if\s*\(\s*promoted\.length\s*===\s*0\s*\)/.test(handler)) {
  fail(
    "becomeAdmin must reject with `FORBIDDEN` when `promoted.length === 0` (no row matched, i.e. an admin already existed)"
  );
}

console.log("verify-admin-bootstrap-atomic: OK");
console.log("  ✓ becomeAdmin uses a single UPDATE ... WHERE NOT EXISTS statement");
console.log("  ✓ no separate select-then-update admin-existence check");
console.log("  ✓ promotion result is checked via `.returning(...)` before reporting success");
