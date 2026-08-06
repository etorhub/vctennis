import type { Config } from "@netlify/functions";

export default async () => {
  const base = process.env.URL;
  if (!base) {
    console.error("health-probe: URL env var not set, skipping");
    return;
  }

  const res = await fetch(`${base}/api/cron/health-probe`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }
  });

  if (!res.ok) {
    console.error(`health-probe: sweep failed with status ${res.status}`, await res.text());
  }
};

export const config: Config = {
  schedule: "*/5 * * * *"
};
