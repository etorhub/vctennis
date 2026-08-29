#!/usr/bin/env node
/**
 * Assert that db/config.ts defines indexes on the columns the app filters/joins
 * on the hot path (issue #64): the booking overlap check and agenda queries on
 * `Bookings.startsAt`, my-bookings / active-booking-count lookups on
 * `Bookings.userId`, and the per-request auth checks in src/middleware.ts on
 * `User.role` / `User.disabled`. Catches an accidental removal/regression the
 * same way verify-rate-limit.js does for the rate limiter config.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbConfigPath = join(root, "db/config.ts");

const REQUIRED_INDEXES = [
  { table: "User", column: "role" },
  { table: "User", column: "disabled" },
  { table: "Bookings", column: "startsAt" },
  { table: "Bookings", column: "userId" }
];

function fail(message) {
  console.error(`verify-db-indexes: ${message}`);
  process.exit(1);
}

const dbConfig = readFileSync(dbConfigPath, "utf-8");

const missing = [];
for (const { table, column } of REQUIRED_INDEXES) {
  const tableMatch = dbConfig.match(new RegExp(`const ${table} = defineTable\\(\\{([\\s\\S]*?)\\n\\}\\);`));
  if (!tableMatch) {
    fail(`could not find \`const ${table} = defineTable({...})\` in db/config.ts`);
  }
  const tableBlock = tableMatch[1];
  const indexesMatch = tableBlock.match(/indexes:\s*\{([\s\S]*?)\n\s*\}/);
  const indexesBlock = indexesMatch ? indexesMatch[1] : "";
  if (!new RegExp(`on:\\s*["']${column}["']`).test(indexesBlock)) {
    missing.push(`${table}.${column}`);
  }
}

if (missing.length > 0) {
  fail(`db/config.ts is missing required indexes for:\n  - ${missing.join("\n  - ")}`);
}

console.log("verify-db-indexes: OK");
for (const { table, column } of REQUIRED_INDEXES) {
  console.log(`  ✓ ${table}.${column} indexed`);
}
