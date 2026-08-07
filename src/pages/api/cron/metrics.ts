import type { APIRoute } from "astro";
import { refreshRegisteredUsersMetric } from "@/lib/userMetrics";

export const prerender = false;

/** Periodic / on-demand gauges that need Astro DB (e.g. registered users). */
export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const usersRegistered = await refreshRegisteredUsersMetric();
  return new Response(JSON.stringify({ usersRegistered }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
