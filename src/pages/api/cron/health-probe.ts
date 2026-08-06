import type { APIRoute } from "astro";
import { runHealthProbes } from "@/lib/healthProbe";

export const prerender = false;

/** Scheduled HTTP health checks for prod routes; ships metrics to Grafana Cloud. */
export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runHealthProbes();
    for (const r of summary.results) {
      console.log(
        `health-probe: ${r.path} -> ${r.ok ? "OK" : "FAIL"} (${r.status}, ${r.durationMs}ms)`
      );
    }
    return new Response(JSON.stringify(summary), {
      status: summary.allOk ? 200 : 503,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("health-probe failed:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
