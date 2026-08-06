import { shipProbeObservability, type ProbeResult } from "@/lib/observability";

/** Same paths as the Netlify post-deploy smoke plugin. */
export const HEALTH_PROBE_PATHS = ["/", "/sign-in", "/rules"] as const;

export type HealthProbeSummary = {
  baseUrl: string;
  results: ProbeResult[];
  allOk: boolean;
};

function resolveBaseUrl(): string | undefined {
  const fromEnv =
    (typeof process !== "undefined" ? process.env.HEALTH_PROBE_BASE_URL : undefined) ??
    (typeof process !== "undefined" ? process.env.URL : undefined) ??
    (import.meta.env as Record<string, string | undefined>).HEALTH_PROBE_BASE_URL ??
    (import.meta.env as Record<string, string | undefined>).BETTER_AUTH_URL;
  const value = fromEnv?.trim().replace(/\/$/, "");
  return value || undefined;
}

/** Match deploy smoke-test: any non-5xx counts as healthy. */
function isOk(status: number): boolean {
  return status >= 200 && status < 500;
}

async function probePath(baseUrl: string, path: string): Promise<ProbeResult> {
  const url = `${baseUrl}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "vctennis-health-probe/1.0" }
    });
    const durationMs = Date.now() - started;
    return {
      path,
      ok: isOk(res.status),
      status: res.status,
      durationMs,
      instance: baseUrl
    };
  } catch (err) {
    return {
      path,
      ok: false,
      status: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
      instance: baseUrl
    };
  }
}

/** Probe key routes and ship results to Grafana Cloud. */
export async function runHealthProbes(): Promise<HealthProbeSummary> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    throw new Error("HEALTH_PROBE_BASE_URL / URL / BETTER_AUTH_URL not set");
  }

  const results = await Promise.all(HEALTH_PROBE_PATHS.map((path) => probePath(baseUrl, path)));
  await Promise.all(results.map((r) => shipProbeObservability(r)));
  return {
    baseUrl,
    results,
    allOk: results.every((r) => r.ok)
  };
}
