#!/usr/bin/env node
/**
 * Assert that netlify.toml declares the core security headers (issue #55)
 * on every response. Catches an accidental removal of the [[headers]] block
 * before merge/deploy, the same way verify-dist.js catches a broken build.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tomlPath = join(root, "netlify.toml");

const REQUIRED_HEADERS = [
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Strict-Transport-Security",
  "Content-Security-Policy-Report-Only"
];

function fail(message) {
  console.error(`verify-security-headers: ${message}`);
  process.exit(1);
}

const toml = readFileSync(tomlPath, "utf-8");

const headersBlockMatch = toml.match(/\[\[headers\]\]\s*\n\s*for\s*=\s*"\/\*"\s*\n\s*\[headers\.values\]([\s\S]*?)(?:\n\[|\n?$)/);
if (!headersBlockMatch) {
  fail('missing a [[headers]] block for = "/*" with a [headers.values] table in netlify.toml');
}

const headersBlock = headersBlockMatch[1];
const missing = REQUIRED_HEADERS.filter((name) => !new RegExp(`^\\s*${name}\\s*=`, "m").test(headersBlock));
if (missing.length > 0) {
  fail(`headers.values for "/*" is missing:\n  - ${missing.join("\n  - ")}`);
}

console.log("verify-security-headers: OK");
for (const name of REQUIRED_HEADERS) {
  console.log(`  ✓ ${name}`);
}
