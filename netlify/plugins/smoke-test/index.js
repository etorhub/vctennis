// Local Netlify build plugin: after a production deploy goes live, hit a
// few key routes and fail loudly if the site is actually down.
//
// Why: on 2026-07-26, a Netlify deploy showed "Published" while every page
// was 500ing (an unguarded DB call in middleware threw on every request).
// A green build/deploy told us nothing about whether the site worked, so
// nobody knew until a user reported it.
//
// onSuccess runs AFTER the deploy is already live, so failBuild alone cannot
// restore traffic. On smoke failure we call Netlify's site rollback API to
// republish the previous production deploy, then fail the build so the bad
// deploy is obvious in the dashboard.
const CHECK_PATHS = ["/", "/sign-in", "/rules"];
const RETRIES = 5;
const RETRY_DELAY_MS = 3000;
const NETLIFY_API = "https://api.netlify.com/api/v1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkPath(baseUrl, path) {
  const url = `${baseUrl}${path}`;
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return { path, ok: true, status: res.status };
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return { path, ok: false, status: lastError };
}

async function rollbackProduction(siteId, token) {
  const res = await fetch(`${NETLIFY_API}/sites/${siteId}/rollback`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Netlify rollback failed: HTTP ${res.status}${body ? ` — ${body}` : ""}`);
  }
}

module.exports.onSuccess = async ({ utils }) => {
  const baseUrl = process.env.URL;
  if (!baseUrl) {
    console.log("smoke-test: no deploy URL available (not a deploy that serves traffic), skipping.");
    return;
  }
  if (process.env.CONTEXT && process.env.CONTEXT !== "production") {
    console.log(`smoke-test: skipping non-production context "${process.env.CONTEXT}".`);
    return;
  }

  console.log(`smoke-test: checking ${CHECK_PATHS.join(", ")} on ${baseUrl}`);
  const results = await Promise.all(CHECK_PATHS.map((path) => checkPath(baseUrl, path)));

  const failures = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`smoke-test: ${r.path} -> ${r.ok ? `OK (${r.status})` : `FAILED (${r.status})`}`);
  }

  if (failures.length === 0) return;

  const failedPaths = failures.map((f) => f.path).join(", ");
  const siteId = process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;

  if (!token) {
    utils.build.failBuild(
      `Production is live but returning server errors on: ${failedPaths}. ` +
        "Auto-rollback skipped: set NETLIFY_AUTH_TOKEN in Netlify site env vars " +
        "(personal access token with deploy permissions), then restore the previous " +
        "deploy manually in the Netlify dashboard. Check function logs and Turso/env configuration."
    );
    return;
  }

  if (!siteId) {
    utils.build.failBuild(
      `Production is live but returning server errors on: ${failedPaths}. ` +
        "Auto-rollback skipped: SITE_ID is missing from the build environment. " +
        "Restore the previous deploy manually in the Netlify dashboard."
    );
    return;
  }

  try {
    console.log(`smoke-test: rolling back site ${siteId} to previous production deploy…`);
    await rollbackProduction(siteId, token);
    console.log("smoke-test: rollback requested successfully.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    utils.build.failBuild(
      `Production is live but returning server errors on: ${failedPaths}. ` +
        `Auto-rollback failed (${message}). Restore the previous deploy manually in the Netlify dashboard.`
    );
    return;
  }

  utils.build.failBuild(
    `Production returned server errors on: ${failedPaths}. ` +
      "Rolled back to the previous production deploy. " +
      "Check function logs in the Netlify dashboard and your Turso/env configuration."
  );
};
