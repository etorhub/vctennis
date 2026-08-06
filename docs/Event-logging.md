# Event logging

Append-only **domain events** for ops and Grafana Cloud dashboards. There is no admin UI yet — events are always written to Astro DB / Turso, and optionally dual-written to Loki + Prometheus.

> Canonical copy lives in this repo. After the GitHub wiki has been initialized once (create any page under Wiki in the GitHub UI), run `npm run docs:wiki` to publish this file (and Home) to [Event-logging](https://github.com/etorhub/vctennis/wiki/Event-logging).

## Code

| Piece | Location |
| --- | --- |
| Schema | [`db/config.ts`](../db/config.ts) — `Events` table |
| Emit helper | [`src/lib/events.ts`](../src/lib/events.ts) — `emitEvent`, `redactEventEmails` |
| Grafana ship | [`src/lib/observability.ts`](../src/lib/observability.ts) — Loki push + Prometheus remote write |
| Dashboard | [`ops/grafana/dashboards/domain-events.json`](../ops/grafana/dashboards/domain-events.json) |
| Instrumentation | Astro actions (`bookings`, `admin`, `auth`), Better Auth hooks in `src/lib/auth.ts`, reminder cron |

## Schema

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | text PK | UUID |
| `type` | text | Event name (see catalog) |
| `actorUserId` | text? | Who performed the action |
| `subjectUserId` | text? | Target user when different from actor |
| `bookingId` | text? | Related booking |
| `reason` | text? | Stable rejection / failure code |
| `payload` | text? | JSON extras |
| `createdAt` | date | Event time (UTC stored) |

No foreign keys — history survives booking/user deletion.

## Emit contract

- Call `emitEvent({ type, actorUserId?, subjectUserId?, bookingId?, reason?, payload? })`.
- Inserts are best-effort: failures are `console.error`'d and **never** fail the parent mutation.
- `payload` is JSON text. Common keys:
  - `startsAt` (ISO string), `durationMin`
  - `source`: `member` | `admin` | `system`
  - `email` — only on allowed event types (below)
  - `role`, `showName`, `theme`, before/after slot fields on updates

## PII rules

- Always OK: user/booking ids, reason codes, timestamps, slot metadata, `source`.
- **Email** only on: `user.signed_up`, `user.verified`, `user.role_changed`, `user.disabled`, `user.enabled`, `user.deleted` (admin/self delete).
- **Never** store IP, password, or display name in events.
- On account deletion: `redactEventEmails(userId)` strips `email` from historical payloads for that user, then a new `user.deleted` row is written (may include email for the delete audit itself). Event rows are **not** cascade-deleted.

## Event catalog

| type | Emitted from | Notes |
| --- | --- | --- |
| `booking.created` | `bookings.create` after insert | payload: startsAt, durationMin, source |
| `booking.updated` | `bookings.update` after update | before/after slot; source member/admin |
| `booking.cancelled` | `bookings.delete` / `admin.deleteBooking` | source member/admin |
| `booking.rejected` | booking validation / authz failures | see reason codes below |
| `user.signed_up` | Better Auth `user.create.after` | email + userId |
| `user.verified` | `emailVerification.afterEmailVerification` | email + userId |
| `user.signed_in` | `session.create.after` | also fires after verify auto-sign-in |
| `user.signed_out` | `auth.signOut` | |
| `user.profile_updated` | `auth.updateProfile` | showName, theme (not name text) |
| `user.password_changed` | `auth.changePassword` success | |
| `user.password_change_rejected` | password change failures | reason: mismatch / incorrect_password / error |
| `user.deleted` | after redaction in `deleteUserCascade` | source self/admin; email when known |
| `user.disabled` / `user.enabled` | `admin.setDisabled` | subject + email |
| `user.role_changed` | `admin.setRole` | role + email |
| `user.became_admin` | `auth.becomeAdmin` | |
| `reminder.sent` / `reminder.failed` | `/api/cron/send-reminders` | bookingId; no email |

### `booking.rejected` reason codes

| reason | Typical cause |
| --- | --- |
| `overlap` | Slot conflicts with another booking |
| `max_bookings` | Over `MAX_ACTIVE_BOOKINGS` |
| `outside_hours` | Outside open hours |
| `too_far` | Outside book-ahead window |
| `past` | Start in the past / booking already over |
| `invalid_slot` | Bad duration, alignment, or timestamp |
| `cutoff` | Reserved for cancel/change cutoff (if reintroduced) |
| `unauthorized` | Not signed in |
| `disabled` | Account disabled |
| `forbidden` | Not allowed |
| `not_found` | Booking missing |

## Example queries

Local file DB (`ASTRO_DATABASE_FILE`) or Turso shell:

```sql
-- Recent events
SELECT type, actorUserId, bookingId, reason, createdAt
FROM Events
ORDER BY createdAt DESC
LIMIT 50;

-- Bookings created per day
SELECT date(createdAt) AS day, count(*) AS n
FROM Events
WHERE type = 'booking.created'
GROUP BY day
ORDER BY day DESC;

-- Rejection breakdown
SELECT reason, count(*) AS n
FROM Events
WHERE type = 'booking.rejected'
GROUP BY reason
ORDER BY n DESC;
```

## Grafana Cloud

When `GRAFANA_CLOUD_TOKEN` and related `GRAFANA_*` vars are set (see [`.env.example`](../.env.example)):

- **Loki** — structured log line per event; labels `service_name=vctennis`, `event_type`, `reason`. Body omits email/name/IP.
- **Prometheus** — sample `vctennis_events{type,reason,source}=1` per event. Panels use `count_over_time` (not `rate`/`increase`) because serverless has no cumulative counter.

Provisioning: import or sync [`ops/grafana/dashboards/domain-events.json`](../ops/grafana/dashboards/domain-events.json). Datasource UIDs assume Grafana Cloud defaults `grafanacloud-prom` / `grafanacloud-logs`.

## Out of scope / future

- Admin UI for browsing events
- Retention / TTL job
- IP logging in events
- Backfill of historical Turso rows into Loki/Prometheus
