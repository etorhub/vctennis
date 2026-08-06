import type { Config } from "@netlify/functions";

export default async () => {
  const base = process.env.URL;
  if (!base) {
    console.error("send-reminders: URL env var not set, skipping");
    return;
  }

  const res = await fetch(`${base}/api/cron/send-reminders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET}`,
      "content-type": "application/json",
      origin: base
    },
    body: "{}"
  });

  if (!res.ok) {
    console.error(`send-reminders: sweep failed with status ${res.status}`, await res.text());
  }
};

export const config: Config = {
  schedule: "*/15 * * * *"
};
