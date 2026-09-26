#!/usr/bin/env node
/**
 * Assert that `assertNoOverlap` in src/actions/bookings.ts (issue #63) bounds
 * its existing-bookings query to a date range in SQL instead of doing a full,
 * unfiltered `db.select().from(Bookings)` table scan on every booking
 * create/update. Catches an accidental regression back to the full scan, the
 * same way verify-db-indexes.js guards the underlying `startsAt` index.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bookingsActionsPath = join(root, "src/actions/bookings.ts");

function fail(message) {
  console.error(`verify-booking-overlap-query: ${message}`);
  process.exit(1);
}

const source = readFileSync(bookingsActionsPath, "utf-8");

const fnMatch = source.match(/async function assertNoOverlap\([\s\S]*?\n\}/);
if (!fnMatch) {
  fail("could not find `async function assertNoOverlap(...)` in src/actions/bookings.ts");
}
const fn = fnMatch[0];

if (/db\s*\.\s*select\(\)\s*\.\s*from\(Bookings\)\s*;/.test(fn)) {
  fail(
    "assertNoOverlap must not run an unfiltered `db.select().from(Bookings)` — that is the full " +
      "table scan issue #63 flagged; bound it with a `.where(...)` date range instead"
  );
}

if (!/\.where\(/.test(fn)) {
  fail("assertNoOverlap's existing-bookings query must chain a `.where(...)` clause");
}
if (!/gt\(Bookings\.startsAt,/.test(fn)) {
  fail("assertNoOverlap's `.where(...)` clause must lower-bound `Bookings.startsAt` with `gt(...)`");
}
if (!/lt\(Bookings\.startsAt,/.test(fn)) {
  fail("assertNoOverlap's `.where(...)` clause must upper-bound `Bookings.startsAt` with `lt(...)`");
}

console.log("verify-booking-overlap-query: OK");
console.log("  ✓ no unfiltered `db.select().from(Bookings)` full table scan");
console.log("  ✓ existing-bookings query bounded by a `startsAt` date range in SQL");
