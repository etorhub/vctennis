import { existsSync, readFileSync, copyFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");
const envPath = join(root, ".env");
const envExamplePath = join(root, ".env.example");
const isCI = Boolean(process.env.CI || process.env.NETLIFY);

const envExample = readFileSync(envExamplePath, "utf8");
const allVars = envExample
  .split("\n")
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split("=")[0]);

function parseEnvFile(content) {
  return Object.fromEntries(
    content
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const eq = line.indexOf("=");
        if (eq === -1) return [line.trim(), ""];
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
      })
  );
}

function normalize(value) {
  return (value || "").replace(/^["']|["']$/g, "").trim();
}

let fileEnv = {};
if (existsSync(envPath)) {
  fileEnv = parseEnvFile(readFileSync(envPath, "utf8"));
} else if (!isCI) {
  console.error("\x1b[33m%s\x1b[0m", "No .env file found. Creating one from .env.example...");
  try {
    copyFileSync(envExamplePath, envPath);
    console.log("\x1b[32m%s\x1b[0m", "Created .env file from .env.example");
  } catch {
    console.error("\x1b[31m%s\x1b[0m", "Error: Failed to create .env file!");
    process.exit(1);
  }
  process.exit(1);
}

// Resend creds are only required when EMAILS_ENABLED="true" - otherwise all email sending is skipped.
const emailsEnabled = normalize(process.env.EMAILS_ENABLED ?? fileEnv.EMAILS_ENABLED) === "true";
const requiredVars = emailsEnabled
  ? allVars
  : allVars.filter((varName) => varName !== "RESEND_API_KEY" && varName !== "RESEND_FROM_EMAIL");

// Prefer process.env (Netlify/CI), fall back to .env for local dev
const missingVars = requiredVars.filter((varName) => {
  const value = normalize(process.env[varName] ?? fileEnv[varName]);
  return !value;
});

if (missingVars.length > 0) {
  console.error("\x1b[31m%s\x1b[0m", "Error: You have some missing required environment variables:");

  const envExampleLines = envExample.split("\n");
  const varComments = new Map();
  let currentComment = "";
  envExampleLines.forEach((line) => {
    if (line.startsWith("#")) {
      currentComment = line.substring(1).trim();
    } else if (line && !line.startsWith("#")) {
      const varName = line.split("=")[0];
      varComments.set(varName, currentComment);
    }
  });

  missingVars.forEach((varName) => {
    console.error("\x1b[33m%s\x1b[0m", `- ${varName}`);
    const comment = varComments.get(varName);
    if (comment) {
      console.error("\x1b[36m%s\x1b[0m", `  → ${comment}`);
    }
  });

  if (missingVars.includes("ASTRO_DB_REMOTE_URL") || missingVars.includes("ASTRO_DB_APP_TOKEN")) {
    console.error(
      "\n\x1b[37m%s\x1b[0m",
      "Without ASTRO_DB_REMOTE_URL / ASTRO_DB_APP_TOKEN, `astro build --remote` falls back to discontinued Astro Studio and fails looking for ASTRO_STUDIO_APP_TOKEN."
    );
    console.error(
      "\x1b[37m%s\x1b[0m",
      "Set your Turso values in Netlify → Site configuration → Environment variables (or run npm run db:setup locally)."
    );
  }

  console.error(
    "\n\x1b[37m%s\x1b[0m",
    isCI
      ? "Set these variables in your host's environment (Netlify site env vars) and redeploy."
      : "Please set these variables in your .env file before running the dev server."
  );
  process.exit(1);
}
