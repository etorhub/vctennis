#!/usr/bin/env node
/**
 * Assert that the booking overlap check (issue #63) filters by date range in
 * SQL instead of loading the entire Bookings table into memory on every
 * create/update. Catches an accidental regression back to a full table scan,
 * the same way verify-rate-limit.js guards src/lib/auth.ts.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bookingsPath = join(root, "src/actions/bookings.ts");

function fail(message) {
  console.error(`verify-booking-overlap-query: ${message}`);
  process.exit(1);
}

const source = readFileSync(bookingsPath, "utf-8");

const fnMatch = source.match(/async function assertNoOverlap\([\s\S]*?\n\}/);
if (!fnMatch) {
  fail("could not find `assertNoOverlap` in src/actions/bookings.ts");
}
const fnBody = fnMatch[0];

if (/db\s*\.\s*select\(\)\s*\.\s*from\(Bookings\)\s*;/.test(fnBody)) {
  fail("assertNoOverlap must not run an unfiltered `db.select().from(Bookings)` — that's a full table scan on every booking write");
}

if (!/\.where\(/.test(fnBody)) {
  fail("assertNoOverlap's Bookings query is missing a `.where(...)` clause to bound the scan by date range");
}

if (!/gt\(\s*Bookings\.startsAt/.test(fnBody)) {
  fail("assertNoOverlap must lower-bound the query with `gt(Bookings.startsAt, ...)`");
}

if (!/lt\(\s*Bookings\.startsAt/.test(fnBody)) {
  fail("assertNoOverlap must upper-bound the query with `lt(Bookings.startsAt, ...)`");
}

if (!/import\s*\{[^}]*\blt\b[^}]*\}\s*from\s*["']astro:db["']/.test(source)) {
  fail('src/actions/bookings.ts must import `lt` from "astro:db"');
}

console.log("verify-booking-overlap-query: OK");
console.log("  ✓ assertNoOverlap bounds the Bookings query by date range instead of a full table scan");
console.log("  ✓ query is lower-bounded with gt(Bookings.startsAt, ...) and upper-bounded with lt(Bookings.startsAt, ...)");
