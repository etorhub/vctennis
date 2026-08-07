import type { Config } from "@netlify/functions";
import { pushTimeseries } from "prometheus-remote-write";

const PATHS = ["/", "/sign-in", "/rules"] as const;
const SERVICE = "vctennis";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function isOk(status: number): boolean {
  return status >= 200 && status < 500;
}

function basicAuth(user: string, token: string): string {
  return `Basic ${Buffer.from(`${user}:${token}`, "utf8").toString("base64")}`;
}

type ProbeResult = {
  path: string;
  ok: boolean;
  status: number | string;
  durationMs: number;
};

async function probePath(baseUrl: string, path: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "vctennis-health-probe/1.0" }
    });
    return {
      path,
      ok: isOk(res.status),
      status: res.status,
      durationMs: Date.now() - started
    };
  } catch (err) {
    return {
      path,
      ok: false,
      status: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started
    };
  }
}

async function ship(result: ProbeResult, instance: string): Promise<void> {
  const token = env("GRAFANA_CLOUD_TOKEN");
  const lokiUrl = env("GRAFANA_LOKI_URL");
  const lokiUser = env("GRAFANA_LOKI_USER");
  const promUrl = env("GRAFANA_PROM_REMOTE_WRITE_URL");
  const promUser = env("GRAFANA_PROM_USER");

  if (!token) {
    console.warn("health-probe: GRAFANA_CLOUD_TOKEN unset — skipping Grafana ship");
    return;
  }

  const tasks: Promise<void>[] = [];

  if (lokiUrl && lokiUser) {
    tasks.push(
      (async () => {
        const res = await fetch(`${lokiUrl.replace(/\/$/, "")}/loki/api/v1/push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: basicAuth(lokiUser, token)
          },
          body: JSON.stringify({
            streams: [
              {
                stream: {
                  service_name: SERVICE,
                  event_type: "probe.http",
                  reason: result.ok ? "ok" : "fail",
                  path: result.path
                },
                values: [
                  [
                    `${BigInt(Date.now()) * 1_000_000n}`,
                    JSON.stringify({
                      type: "probe.http",
                      path: result.path,
                      ok: result.ok,
                      status: result.status,
                      durationMs: result.durationMs,
                      instance
                    })
                  ]
                ]
              }
            ]
          })
        });
        if (!res.ok) {
          throw new Error(`Loki ${res.status}: ${(await res.text()).slice(0, 200)}`);
        }
      })()
    );
  }

  if (promUrl && promUser) {
    tasks.push(
      (async () => {
        const ts = Date.now();
        const statusNum = typeof result.status === "number" ? result.status : 0;
        const write = await pushTimeseries(
          [
            {
              labels: {
                __name__: "vctennis_probe_success",
                service_name: SERVICE,
                path: result.path,
                instance
              },
              samples: [{ value: result.ok ? 1 : 0, timestamp: ts }]
            },
            {
              labels: {
                __name__: "vctennis_probe_duration_seconds",
                service_name: SERVICE,
                path: result.path,
                instance
              },
              samples: [{ value: result.durationMs / 1000, timestamp: ts }]
            },
            {
              labels: {
                __name__: "vctennis_probe_http_status_code",
                service_name: SERVICE,
                path: result.path,
                instance
              },
              samples: [{ value: statusNum, timestamp: ts }]
            }
          ],
          {
            url: promUrl,
            auth: { username: promUser, password: token },
            fetch: globalThis.fetch as never
          }
        );
        if (write.status < 200 || write.status >= 300) {
          throw new Error(`Prometheus ${write.status}: ${write.errorMessage || write.statusText}`);
        }
      })()
    );
  }

  const settled = await Promise.allSettled(tasks);
  for (const item of settled) {
    if (item.status === "rejected") {
      console.error("health-probe: ship failed", item.reason);
    }
  }
}

/**
 * Probe prod routes and ship metrics directly (no Astro round-trip / CSRF).
 * Requires GRAFANA_* env on Netlify for dashboard data.
 */
export default async () => {
  const base = (env("HEALTH_PROBE_BASE_URL") || env("URL") || "").replace(/\/$/, "");
  if (!base) {
    console.error("health-probe: HEALTH_PROBE_BASE_URL / URL not set, skipping");
    return;
  }

  const results = await Promise.all(PATHS.map((path) => probePath(base, path)));
  for (const r of results) {
    console.log(
      `health-probe: ${r.path} -> ${r.ok ? "OK" : "FAIL"} (${r.status}, ${r.durationMs}ms)`
    );
  }
  await Promise.all(results.map((r) => ship(r, base)));

  // Registered-user gauge needs Turso via Astro SSR (this function has no DB).
  const secret = env("CRON_SECRET");
  if (secret) {
    try {
      const res = await fetch(`${base}/api/cron/metrics`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
          origin: base
        },
        body: "{}"
      });
      if (!res.ok) {
        console.error(`health-probe: metrics sweep failed (${res.status})`, await res.text());
      }
    } catch (err) {
      console.error("health-probe: metrics sweep error", err);
    }
  }
};

export const config: Config = {
  schedule: "*/5 * * * *"
};
