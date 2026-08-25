#!/usr/bin/env node
/**
 * Assert that Better Auth's rate limiter (issue #56) is configured with
 * persistent (database) storage and custom rules on the sign-in, sign-up,
 * and password-reset endpoints. Catches an accidental removal/regression
 * before merge/deploy, the same way verify-security-headers.js does for
 * netlify.toml's headers block.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const authPath = join(root, "src/lib/auth.ts");
const dbConfigPath = join(root, "db/config.ts");

const REQUIRED_CUSTOM_RULES = ["/sign-in/email", "/sign-up/email", "/forget-password"];

function fail(message) {
  console.error(`verify-rate-limit: ${message}`);
  process.exit(1);
}

const auth = readFileSync(authPath, "utf-8");

const rateLimitBlockMatch = auth.match(/rateLimit:\s*\{([\s\S]*?)\n {2}\},/);
if (!rateLimitBlockMatch) {
  fail("missing a top-level `rateLimit` block in betterAuth() options in src/lib/auth.ts");
}
const rateLimitBlock = rateLimitBlockMatch[1];

if (!/enabled:\s*true/.test(rateLimitBlock)) {
  fail("rateLimit block must set `enabled: true` (do not rely on NODE_ENV defaults in a serverless deploy)");
}

if (!/storage:\s*["']database["']/.test(rateLimitBlock)) {
  fail('rateLimit block must set `storage: "database"` — the default in-memory limiter does not survive Netlify Functions cold starts');
}

const missingRules = REQUIRED_CUSTOM_RULES.filter((path) => !rateLimitBlock.includes(`"${path}"`));
if (missingRules.length > 0) {
  fail(`rateLimit.customRules is missing entries for:\n  - ${missingRules.join("\n  - ")}`);
}

if (!/rateLimit:\s*RateLimit/.test(auth)) {
  fail("drizzleAdapter's `schema` option must map `rateLimit` to the `RateLimit` astro:db table, or database storage has nowhere to write");
}

const dbConfig = readFileSync(dbConfigPath, "utf-8");
if (!/const RateLimit = defineTable/.test(dbConfig)) {
  fail("db/config.ts is missing the `RateLimit` table required by Better Auth's database-backed rate limiter");
}
if (!/RateLimit\s*$/m.test(dbConfig) && !/RateLimit,?\s*\n\s*\}/.test(dbConfig)) {
  fail("db/config.ts defines `RateLimit` but does not register it in `defineDb({ tables: { ... } })`");
}

console.log("verify-rate-limit: OK");
console.log("  ✓ rateLimit.enabled = true");
console.log('  ✓ rateLimit.storage = "database"');
for (const path of REQUIRED_CUSTOM_RULES) {
  console.log(`  ✓ customRules["${path}"]`);
}
console.log("  ✓ RateLimit table wired into drizzleAdapter schema and db/config.ts");
