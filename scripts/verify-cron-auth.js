#!/usr/bin/env node
/**
 * Assert that the cron endpoints (issue #58) authorize their shared-secret
 * Bearer header with a constant-time comparison instead of `!==`, which
 * short-circuits on the first differing byte and is in theory vulnerable to
 * timing attacks.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cronAuthPath = join(root, "src/lib/cronAuth.ts");
const cronRoutePaths = [
  "src/pages/api/cron/send-reminders.ts",
  "src/pages/api/cron/metrics.ts",
  "src/pages/api/cron/health-probe.ts"
];

function fail(message) {
  console.error(`verify-cron-auth: ${message}`);
  process.exit(1);
}

const cronAuth = readFileSync(cronAuthPath, "utf-8");

if (!/import\s*\{\s*timingSafeEqual\s*\}\s*from\s*["']node:crypto["']/.test(cronAuth)) {
  fail('src/lib/cronAuth.ts must import `timingSafeEqual` from "node:crypto"');
}
if (!/export function isAuthorizedCronRequest/.test(cronAuth)) {
  fail("src/lib/cronAuth.ts must export `isAuthorizedCronRequest`");
}
if (!/expected\.length\s*===\s*actual\.length\s*&&\s*timingSafeEqual\(/.test(cronAuth)) {
  fail(
    "isAuthorizedCronRequest must compare with `timingSafeEqual`, guarded by an equal-length check (timingSafeEqual throws on a length mismatch)"
  );
}
if (
  /CRON_SECRET\s*(?:`|\))\s*!==/.test(cronAuth) ||
  /!==\s*`Bearer \$\{import\.meta\.env\.CRON_SECRET\}`/.test(cronAuth)
) {
  fail("isAuthorizedCronRequest must not fall back to a plain `!==` string comparison of the secret");
}

for (const routePath of cronRoutePaths) {
  const source = readFileSync(join(root, routePath), "utf-8");
  if (!/import\s*\{\s*isAuthorizedCronRequest\s*\}\s*from\s*["']@\/lib\/cronAuth["']/.test(source)) {
    fail(`${routePath} must import \`isAuthorizedCronRequest\` from "@/lib/cronAuth"`);
  }
  if (!/if\s*\(\s*!isAuthorizedCronRequest\(request\)\s*\)/.test(source)) {
    fail(`${routePath} must guard the handler with \`if (!isAuthorizedCronRequest(request))\``);
  }
  if (/!==\s*`Bearer \$\{import\.meta\.env\.CRON_SECRET\}`/.test(source)) {
    fail(
      `${routePath} still compares the Authorization header with a plain \`!==\` — that reintroduces the timing side-channel`
    );
  }
}

console.log("verify-cron-auth: OK");
console.log("  ✓ isAuthorizedCronRequest uses timingSafeEqual with a length guard");
console.log(`  ✓ all ${cronRoutePaths.length} cron routes delegate to isAuthorizedCronRequest`);
