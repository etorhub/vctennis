#!/usr/bin/env node
/**
 * Assert that `astro build` (via build:local / build) produced a usable
 * Netlify SSR output. Catches incomplete adapter bundles before merge/deploy.
 */
import { existsSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const requiredFiles = [
  "dist/_redirects",
  "dist/manifest.webmanifest",
  "dist/sw.js",
  ".netlify/v1/functions/ssr/ssr.mjs",
  ".netlify/build/entry.mjs",
  ".netlify/functions/manifest.json"
];

const requiredDirs = ["dist/_astro", ".netlify/v1/functions/ssr"];

function fail(message) {
  console.error(`verify-dist: ${message}`);
  process.exit(1);
}

function nonEmptyDir(relPath) {
  const abs = join(root, relPath);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return false;
  return readdirSync(abs).length > 0;
}

const missingFiles = requiredFiles.filter((rel) => !existsSync(join(root, rel)));
if (missingFiles.length > 0) {
  fail(`missing required build artifacts:\n  - ${missingFiles.join("\n  - ")}`);
}

const emptyDirs = requiredDirs.filter((rel) => !nonEmptyDir(rel));
if (emptyDirs.length > 0) {
  fail(`empty or missing directories:\n  - ${emptyDirs.join("\n  - ")}`);
}

const clientAssets = readdirSync(join(root, "dist/_astro"));
if (!clientAssets.some((name) => name.endsWith(".js"))) {
  fail("dist/_astro has no client JS bundles");
}

console.log("verify-dist: OK");
for (const rel of requiredFiles) {
  console.log(`  ✓ ${rel}`);
}
for (const rel of requiredDirs) {
  console.log(`  ✓ ${rel}/`);
}
