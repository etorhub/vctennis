# Grafana alerting (vctennis)

Email alerts for production health. Instance: [niftyamaranth452.grafana.net](https://niftyamaranth452.grafana.net). Folder: **Vinya Canadell Tennis** (`vctennis`).

## Contact point

| Name | Type | Destination |
|---|---|---|
| `vctennis-ops-email` | Email | `etor.diaz@proton.me` (single email) |

Payload: [`contact-point-email.json`](contact-point-email.json).

Create or recreate via UI (**Alerting → Contact points → New contact point**) or API:

```bash
curl -X POST "$GRAFANA_URL/api/v1/provisioning/contact-points" \
  -H "Authorization: Bearer $GRAFANA_SA_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Disable-Provenance: true" \
  -d @ops/grafana/alerting/contact-point-email.json
```

Then open the contact point → **Test** to confirm Proton receives mail from Grafana Cloud.

Set the default notification policy receiver to `vctennis-ops-email` (**Alerting → Notification policies**), or rely on each rule’s `notification_settings.receiver` in [`rules.json`](rules.json).

## Alert rules

Group `vctennis-health` (evaluate every 1m). Source of truth for recreate: [`rules.json`](rules.json).

| Rule | UID | Fires when | `for` | Dashboard panel |
|---|---|---|---|---|
| `vctennis-app-down` | `cfus13gvppfk0b` | `min(last_over_time(vctennis_probe_success{service_name="vctennis"}[15m])) < 1`, or no data | 10m | Prod health → Success rate (15m) |
| `vctennis-errors-high` | `ffus14a7jad4wa` | `sum(count_over_time(vctennis_events{service_name="vctennis",type="reminder.failed"}[1h])) >= 3` | 5m | Domain events → Reminder failures |

Both rules appear on the **Alerts** panels (`service=vctennis`) on Prod health and Domain events. `booking.rejected` is **not** alerted (normal validation noise).

## Mute / pause

- **Pause a rule:** Alerting → Alert rules → rule → Pause.
- **Silence:** Alerting → Silences (label matchers e.g. `service=vctennis`).

## Links

- Contact points: https://niftyamaranth452.grafana.net/alerting/notifications
- Alert rules: https://niftyamaranth452.grafana.net/alerting/list
- Prod health: https://niftyamaranth452.grafana.net/d/vctennis-prod-health/prod-health ([JSON](../dashboards/prod-health.json))
- Domain events: https://niftyamaranth452.grafana.net/d/vctennis-domain-events/domain-events ([JSON](../dashboards/domain-events.json))
