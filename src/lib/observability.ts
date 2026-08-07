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

type PromSample = {
  name: string;
  value: number;
  labels?: Record<string, string>;
};

async function pushPrometheusSamples(samples: PromSample[]): Promise<void> {
  const url = env("GRAFANA_PROM_REMOTE_WRITE_URL");
  const user = env("GRAFANA_PROM_USER");
  const token = env("GRAFANA_CLOUD_TOKEN");
  if (!url || !user || !token || samples.length === 0) return;

  const { pushTimeseries } = await import("prometheus-remote-write");
  const ts = Date.now();
  const result = await pushTimeseries(
    samples.map((s) => ({
      labels: {
        __name__: s.name,
        service_name: SERVICE,
        ...(s.labels ?? {})
      },
      samples: [{ value: s.value, timestamp: ts }]
    })),
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

async function pushPrometheusEvent(labels: ShipLabels): Promise<void> {
  // Sample of 1 per event. Dashboard panels use count_over_time(...) — not
  // rate/increase — because serverless has no cumulative counter.
  await pushPrometheusSamples([
    {
      name: "vctennis_events",
      value: 1,
      labels: {
        type: labels.type,
        reason: labels.reason,
        source: labels.source
      }
    }
  ]);
}

async function pushLokiRaw(
  streamLabels: Record<string, string>,
  line: string
): Promise<void> {
  const baseUrl = env("GRAFANA_LOKI_URL");
  const user = env("GRAFANA_LOKI_USER");
  const token = env("GRAFANA_CLOUD_TOKEN");
  if (!baseUrl || !user || !token) return;

  const url = `${baseUrl.replace(/\/$/, "")}/loki/api/v1/push`;
  const tsNs = `${BigInt(Date.now()) * 1_000_000n}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(user, token)
    },
    body: JSON.stringify({
      streams: [{ stream: { service_name: SERVICE, ...streamLabels }, values: [[tsNs, line]] }]
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Loki push ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Best-effort ship of a domain event to Grafana Cloud (Loki + Prometheus).
 * No-ops when Grafana env is unset. Never throws to the caller.
 */
export async function shipEventObservability(input: EmitEventInput): Promise<void> {
  const labels = shipLabels(input);
  const tasks: Promise<void>[] = [pushLoki(input, labels), pushPrometheusEvent(labels)];
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to ship event observability:", input.type, result.reason);
    }
  }
}

export type ProbeResult = {
  path: string;
  ok: boolean;
  status: number | string;
  durationMs: number;
  instance: string;
};

/**
 * Best-effort gauge of current registered users (User row count).
 * Dashboard panels use lastNotNull on this series — not count_over_time.
 * Never throws to the caller.
 */
export async function shipRegisteredUsers(count: number): Promise<void> {
  try {
    await pushPrometheusSamples([
      {
        name: "vctennis_users_registered",
        value: count
      }
    ]);
  } catch (err) {
    console.error("Failed to ship registered users metric:", err);
  }
}

/** Best-effort ship of an HTTP health probe result. Never throws. */
export async function shipProbeObservability(result: ProbeResult): Promise<void> {
  const path = result.path || "/";
  const statusNum = typeof result.status === "number" ? result.status : 0;
  const tasks: Promise<void>[] = [
    pushLokiRaw(
      {
        event_type: "probe.http",
        reason: result.ok ? "ok" : "fail",
        path
      },
      JSON.stringify({
        type: "probe.http",
        path,
        ok: result.ok,
        status: result.status,
        durationMs: result.durationMs,
        instance: result.instance
      })
    ),
    pushPrometheusSamples([
      {
        name: "vctennis_probe_success",
        value: result.ok ? 1 : 0,
        labels: { path, instance: result.instance }
      },
      {
        name: "vctennis_probe_duration_seconds",
        value: result.durationMs / 1000,
        labels: { path, instance: result.instance }
      },
      {
        name: "vctennis_probe_http_status_code",
        value: statusNum,
        labels: { path, instance: result.instance }
      }
    ])
  ];
  const settled = await Promise.allSettled(tasks);
  for (const item of settled) {
    if (item.status === "rejected") {
      console.error("Failed to ship probe observability:", path, item.reason);
    }
  }
}
