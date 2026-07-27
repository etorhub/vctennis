// Local Netlify build plugin: after a production deploy goes live, hit a
// few key routes and fail the deploy loudly if the site is actually down.
//
// Why: on 2026-07-26, a Netlify deploy showed "Published" while every page
// was 500ing (an unguarded DB call in middleware threw on every request).
// A green build/deploy told us nothing about whether the site worked, so
// nobody knew until a user reported it. This plugin closes that gap.
const CHECK_PATHS = ["/", "/sign-in", "/rules"];
const RETRIES = 5;
const RETRY_DELAY_MS = 3000;

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

  if (failures.length > 0) {
    utils.build.failBuild(
      `Production is live but returning server errors on: ${failures.map((f) => f.path).join(", ")}. ` +
        "Check function logs in the Netlify dashboard and your Turso/env configuration."
    );
  }
};
