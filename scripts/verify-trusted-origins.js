#!/usr/bin/env node
/**
 * Assert that Better Auth's config (issue #57) pins `trustedOrigins`
 * explicitly instead of relying solely on its built-in Origin/Referer
 * check. Catches an accidental removal/regression before merge/deploy,
 * the same way verify-security-headers.js does for netlify.toml's headers
 * block and verify-rate-limit.js does for the rate limiter.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const authPath = join(root, "src/lib/auth.ts");

function fail(message) {
  console.error(`verify-trusted-origins: ${message}`);
  process.exit(1);
}

const auth = readFileSync(authPath, "utf-8");

if (!/trustedOrigins:\s*\[/.test(auth)) {
  fail("missing a top-level `trustedOrigins` array in betterAuth() options in src/lib/auth.ts");
}

if (!/trustedOrigins:\s*\[\s*siteUrl\(\)/.test(auth)) {
  fail("`trustedOrigins` must be seeded from `siteUrl()` rather than left empty or hardcoded");
}

if (!/import\s*\{[^}]*\bsiteUrl\b[^}]*\}\s*from\s*["']\.\/emailLayout["']/.test(auth)) {
  fail("src/lib/auth.ts must import `siteUrl` from ./emailLayout to build `trustedOrigins`");
}

console.log("verify-trusted-origins: OK");
console.log("  ✓ trustedOrigins = [siteUrl()]");
