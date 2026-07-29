#!/usr/bin/env node
/**
 * One-off migration: User.apartmentFloor + User.apartmentDoor -> User.apartmentNumber.
 *
 * Run this against Turso ONCE, before deploying the schema that drops the old columns:
 *
 *   node scripts/migrate-apartment-number.js --dry-run   # print the mapping, change nothing
 *   node scripts/migrate-apartment-number.js             # apply it
 *
 * Why a script instead of `astro db push --remote`: dropping columns is a destructive
 * change, and push either refuses it or demands `--force-reset`, which wipes the whole
 * database (users and bookings included). Doing it here in raw SQL keeps the data and
 * leaves the DB already matching db/config.ts, so the Netlify build's push is a no-op.
 *
 * Mapping (the old grid was floor-major): number = floorIndex * doorsPerFloor + door,
 * with 4 doors per floor in block 1 and 3 in blocks 2-4.
 *   Block 1:   ground 1-4 -> 1-4,  first -> 5-8,  second -> 9-12
 *   Blocks 2-4: ground 1-3 -> 1-3, first -> 4-6,  second -> 7-9
 * Door 4 in blocks 2-4 has no valid target and is left NULL, so that member re-picks their
 * apartment on /settings (the "apartment missing" banner already prompts for it).
 *
 * Safe to re-run: adding the column and dropping the old ones are both tolerated if the
 * previous run already did them.
 */
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@libsql/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

const FLOOR_INDEX = { ground: 0, first: 1, second: 2 };
const DOORS_PER_FLOOR = { 1: 4, 2: 3, 3: 3, 4: 3 };
const APARTMENTS_PER_BLOCK = { 1: 12, 2: 9, 3: 9, 4: 9 };

/** Returns the new apartment number, or null when the old values cannot be mapped. */
function toApartmentNumber(block, floor, door) {
  const doorsPerFloor = DOORS_PER_FLOOR[block];
  const floorIndex = FLOOR_INDEX[floor];
  if (!doorsPerFloor || floorIndex === undefined) return null;
  if (!Number.isInteger(door) || door < 1 || door > doorsPerFloor) return null;
  const number = floorIndex * doorsPerFloor + door;
  return number <= APARTMENTS_PER_BLOCK[block] ? number : null;
}

/** Same shape as scripts/check-env.js: KEY=value lines, optionally quoted. */
function readEnvFile() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const eq = line.indexOf("=");
        const key = line.slice(0, eq).trim();
        const value = line
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        return [key, value];
      })
  );
}

async function run(client, sql, { tolerate } = {}) {
  try {
    await client.execute(sql);
  } catch (err) {
    const message = String(err?.message ?? err);
    if (tolerate && tolerate.test(message)) {
      console.log(`   skipped (already done): ${sql}`);
      return;
    }
    throw err;
  }
}

async function main() {
  const fileEnv = readEnvFile();
  const url = process.env.ASTRO_DB_REMOTE_URL || fileEnv.ASTRO_DB_REMOTE_URL;
  const authToken = process.env.ASTRO_DB_APP_TOKEN || fileEnv.ASTRO_DB_APP_TOKEN;

  if (!url) {
    console.error("Missing ASTRO_DB_REMOTE_URL (env or .env). Run `npm run db:setup` first.");
    process.exit(1);
  }

  const client = createClient({ url, authToken });
  console.log(`${dryRun ? "🔍 Dry run" : "🚚 Migrating"} against ${url}\n`);

  const columns = await client.execute("PRAGMA table_info(User)");
  const columnNames = columns.rows.map((row) => row.name);
  const hasOldColumns = columnNames.includes("apartmentFloor") && columnNames.includes("apartmentDoor");

  if (!hasOldColumns) {
    console.log("apartmentFloor / apartmentDoor are already gone — nothing to migrate.");
    return;
  }

  if (!dryRun) {
    await run(client, "ALTER TABLE User ADD COLUMN apartmentNumber integer", {
      tolerate: /duplicate column/i
    });
  }

  const { rows } = await client.execute(
    "SELECT id, email, apartmentBlock, apartmentFloor, apartmentDoor FROM User ORDER BY createdAt"
  );

  let mapped = 0;
  let blanked = 0;

  for (const row of rows) {
    const block = row.apartmentBlock === null ? null : Number(row.apartmentBlock);
    const door = row.apartmentDoor === null ? null : Number(row.apartmentDoor);
    const number = block === null ? null : toApartmentNumber(block, row.apartmentFloor, door);
    const before = `block ${row.apartmentBlock ?? "—"} / ${row.apartmentFloor ?? "—"} / door ${row.apartmentDoor ?? "—"}`;

    if (number === null) {
      blanked += 1;
      console.log(`   ${row.email}: ${before} -> NULL (must re-pick on /settings)`);
    } else {
      mapped += 1;
      console.log(`   ${row.email}: ${before} -> apartment ${number}`);
    }

    if (!dryRun) {
      await client.execute({
        sql: "UPDATE User SET apartmentNumber = ? WHERE id = ?",
        args: [number, row.id]
      });
    }
  }

  if (!dryRun) {
    await run(client, "ALTER TABLE User DROP COLUMN apartmentFloor", { tolerate: /no such column/i });
    await run(client, "ALTER TABLE User DROP COLUMN apartmentDoor", { tolerate: /no such column/i });
  }

  console.log(`\n${dryRun ? "Would map" : "Mapped"} ${mapped} of ${rows.length} account(s); ${blanked} left blank.`);
  if (dryRun) console.log("Nothing was written. Re-run without --dry-run to apply.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
