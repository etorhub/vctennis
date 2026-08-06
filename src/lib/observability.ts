import type { EmitEventInput } from "./events";

const SERVICE = "vctennis";

type ShipLabels = {
  type: string;
  reason: string;
  source: string;
};

function env(name: string): string | undefined {
  const raw =
    (typeof process !== "undefined" ? process.env[name] : undefined) ??
    (import.meta.env as Record<string, string | undefined>)[name];
  const value = raw?.trim();
  return value || undefined;
}

function shipLabels(input: EmitEventInput): ShipLabels {
  const source =
    input.payload && typeof input.payload.source === "string" && input.payload.source
      ? input.payload.source
      : "none";
  return {
    type: input.type,
    reason: input.reason?.trim() || "none",
    source
  };
}

/** Safe JSON body for Loki — no email, name, or IP. */
function lokiLine(input: EmitEventInput, labels: ShipLabels): string {
  return JSON.stringify({
    type: labels.type,
    reason: labels.reason === "none" ? null : labels.reason,
    source: labels.source === "none" ? null : labels.source,
    bookingId: input.bookingId ?? null,
    actorUserId: input.actorUserId ?? null,
    subjectUserId: input.subjectUserId ?? null
  });
}

function basicAuth(user: string, token: string): string {
  return `Basic ${Buffer.from(`${user}:${token}`, "utf8").toString("base64")}`;
}

async function pushLoki(input: EmitEventInput, labels: ShipLabels): Promise<void> {
  const baseUrl = env("GRAFANA_LOKI_URL");
  const user = env("GRAFANA_LOKI_USER");
  const token = env("GRAFANA_CLOUD_TOKEN");
  if (!baseUrl || !user || !token) return;

  const url = `${baseUrl.replace(/\/$/, "")}/loki/api/v1/push`;
  const tsNs = `${BigInt(Date.now()) * 1_000_000n}`;
  const body = {
    streams: [
      {
        stream: {
          service_name: SERVICE,
          event_type: labels.type,
          reason: labels.reason
        },
        values: [[tsNs, lokiLine(input, labels)]]
      }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(user, token)
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Loki push ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function pushPrometheus(labels: ShipLabels): Promise<void> {
  const url = env("GRAFANA_PROM_REMOTE_WRITE_URL");
  const user = env("GRAFANA_PROM_USER");
  const token = env("GRAFANA_CLOUD_TOKEN");
  if (!url || !user || !token) return;

  // Each serverless invocation writes a sample of 1. Dashboard panels use
  // count_over_time(...) — not rate/increase — because we have no cumulative counter.
  const { pushTimeseries } = await import("prometheus-remote-write");
  const result = await pushTimeseries(
    {
      labels: {
        __name__: "vctennis_events",
        service_name: SERVICE,
        type: labels.type,
        reason: labels.reason,
        source: labels.source
      },
      samples: [{ value: 1, timestamp: Date.now() }]
    },
    {
      url,
      auth: { username: user, password: token },
      fetch: globalThis.fetch as never
    }
  );

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `Prometheus remote write ${result.status}: ${result.errorMessage || result.statusText}`
    );
  }
}

/**
 * Best-effort ship of a domain event to Grafana Cloud (Loki + Prometheus).
 * No-ops when Grafana env is unset. Never throws to the caller.
 */
export async function shipEventObservability(input: EmitEventInput): Promise<void> {
  const labels = shipLabels(input);
  const tasks: Promise<void>[] = [pushLoki(input, labels), pushPrometheus(labels)];
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to ship event observability:", input.type, result.reason);
    }
  }
}
