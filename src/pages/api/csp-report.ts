import type { APIRoute } from "astro";

export const prerender = false;

const MAX_BODY_BYTES = 8192;

/**
 * Collects CSP violation reports sent by browsers while
 * Content-Security-Policy-Report-Only is active (see netlify.toml, issue #55).
 * Logged only — this lets us watch real traffic for anything the policy
 * would break before switching it to an enforcing Content-Security-Policy.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text();
    console.warn("csp-report:", body.slice(0, MAX_BODY_BYTES));
  } catch (err) {
    console.error("csp-report: failed to read report body", err);
  }
  return new Response(null, { status: 204 });
};
