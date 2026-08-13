# Architecture

How a request flows through the app, what lives where, and the invariants that are easy to break by accident. Task-shaped instructions ("how do I add X") live in [`Recipes.md`](Recipes.md); the domain-event catalog lives in [`Event-logging.md`](Event-logging.md).

Astro 5 in SSR mode (`output: "server"`) on Netlify. There is no client-side router and no API layer beyond Astro actions plus a few cron endpoints — pages render on the server, mutations go through actions.

## Request lifecycle

Every request passes through [`src/middleware.ts`](../src/middleware.ts) before any page or action runs. In order:

1. **Locale** — `detectLocale(accept-language)` sets `locals.locale`, then `createT(locale)` sets `locals.t`.
2. **Session** — `auth.api.getSession()` with `disableCookieCache: true`, so a role or `disabled` change (e.g. right after `/setup`) is visible on the very next request instead of lagging behind the cookie.
3. **Authoritative role** — `role` and `disabled` are re-read straight from the `User` table and overwrite whatever the session carried. The session can lag after a direct DB update; the table is the source of truth.
4. **Redirects** — the guard table below.
5. `next()`.

Pages and actions then read everything off `Astro.locals` / `context.locals`. They do not call `auth.api.getSession()` again.

### The `Astro.locals` contract

Declared in [`src/env.d.ts`](../src/env.d.ts); `SessionUser` is defined in [`src/lib/auth.ts`](../src/lib/auth.ts).

| Field | Type | Notes |
| --- | --- | --- |
| `user` | `SessionUser \| null` | `null` when signed out **or** when the session lookup failed — see the resilience invariant below |
| `session` | `unknown` | Better Auth session row, rarely needed directly |
| `locale` | `"ca" \| "en"` | From `Accept-Language`, never from a cookie or URL |
| `t` | `TFunction` | `t(key, vars?)` — see [i18n](#i18n) |

`SessionUser` carries `id`, `email`, `name`, `role`, `showName`, `apartmentBlock`, `apartmentNumber`, `signupIp`, `disabled`, `locale`, `theme`, `image`, `emailVerified`, `createdAt`, `updatedAt`.

### Route guards

**Protected routes are declared in the middleware, not in the page.** Adding a guard inside an `.astro` file instead diverges from every other route and is easy to miss.

| Condition | Result |
| --- | --- |
| `user.disabled`, any path except `/sign-out` and `/api/auth/*` | Redirect to `/disabled` |
| `/admin/*`, signed out | Redirect to `/sign-in` |
| `/admin/*`, `role !== "admin"` | Redirect to `/` |
| `/profile`, `/privacy`, `/setup`, signed out | Redirect to `/sign-in` |

Everything else is public, including `/` and `/rules`.

### Invariant: the middleware must never throw

Both the session lookup and the role re-read are wrapped in `try`/`catch` that log and continue. This is deliberate (incident 2026-07-26): a DB or auth outage degrades the request to *logged-out* rather than 500ing. Because the middleware runs on **every** request, letting it throw takes down the public agenda, `/sign-in`, and `/rules` — which is also exactly what the post-deploy smoke test probes. Keep new middleware work inside a `catch`.

### Invariant: actions re-check auth themselves

The middleware guards **page paths**. It does not guard action invocations, so every action that needs a user checks again:

```ts
const user = context.locals.user;
if (!user) throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
if (user.disabled) throw new ActionError({ code: "FORBIDDEN", message: "errorDisabled" });
```

See [`src/actions/contact.ts`](../src/actions/contact.ts) for the plain version and `requireUser()` in [`src/actions/bookings.ts`](../src/actions/bookings.ts) for the version that also emits a `booking.rejected` event. Admin actions check `role === "admin"` on top.

### Invariant: `ActionError.message` is an i18n key

Actions throw the **message key**, not prose: `message: "errorUnauthorized"`, not `"You must sign in"`. The page resolves it with `locals.t` when rendering `Astro.getActionResult()`. A raw English string leaks untranslated into the UI.

## Module map

### `src/lib/`

| Module | Reach for it when… |
| --- | --- |
| [`config.ts`](../src/lib/config.ts) | You need a booking knob (hours, durations, book-ahead, reminder offset) or `SITE_NAME` / `THEME_COLOR`. Knobs live here, never in env vars |
| [`time.ts`](../src/lib/time.ts) | Anything touching dates. Slot alignment, open hours, overlap, book-ahead window, agenda days, formatting. **Never** use raw `Date` math — everything is `Europe/Madrid` |
| [`auth.ts`](../src/lib/auth.ts) | Better Auth config, `databaseHooks`, verification/reset email wiring, the `SessionUser` type |
| [`auth-client.ts`](../src/lib/auth-client.ts) | Browser-side Better Auth calls (sign-in/sign-up forms) |
| [`apartment.ts`](../src/lib/apartment.ts) | Block/number validation or display. A number is only ever valid *together with* its block (`APARTMENTS_PER_BLOCK`) |
| [`i18n/`](../src/lib/i18n/) | Any user-facing string |
| [`theme.ts`](../src/lib/theme.ts) | Theme names, meta colours, `ThemePreference` parsing |
| [`events.ts`](../src/lib/events.ts) | Recording that something happened — `emitEvent`, `EVENT_TYPES`, `redactEventEmails` |
| [`observability.ts`](../src/lib/observability.ts) | Shipping to Grafana Loki / Prometheus. Called *for* you by `emitEvent`; direct use is for probes and gauges |
| [`email.ts`](../src/lib/email.ts) | Sending anything. `isEmailEnabled()` gate, `sendEmail()` with retries, tags, and `idempotencyKey` |
| [`emailLayout.ts`](../src/lib/emailLayout.ts) | Building an email body — `renderEmail()` renders HTML **and** text from one branded shell and escapes `paragraphs` for you; also `escapeHtml()`, `siteUrl()` |
| [`authEmail.ts`](../src/lib/authEmail.ts) | Verification and password-reset templates |
| [`bookingEmail.ts`](../src/lib/bookingEmail.ts) | Booking confirmation and reminder templates |
| [`contactEmail.ts`](../src/lib/contactEmail.ts) | Contact/incident notification to admins |
| [`users.ts`](../src/lib/users.ts) | Deleting a user. `deleteUserCascade()` removes bookings + auth rows and anonymizes events — do not hand-roll this |
| [`userMetrics.ts`](../src/lib/userMetrics.ts) | Refreshing the `vctennis_users_registered` gauge |
| [`healthProbe.ts`](../src/lib/healthProbe.ts) | The probe path list and `runHealthProbes()`, shared by the Netlify function and the manual cron route |

### `src/actions/`

Registered in [`index.ts`](../src/actions/index.ts) — a new action file must be added to the `server` object there or it is unreachable.

| File | Covers |
| --- | --- |
| [`bookings.ts`](../src/actions/bookings.ts) | Create / update / cancel, all booking validation, `booking.rejected` events |
| [`auth.ts`](../src/actions/auth.ts) | Profile updates, password change, account deletion, `/setup` |
| [`admin.ts`](../src/actions/admin.ts) | User management, admin-side booking edits |
| [`contact.ts`](../src/actions/contact.ts) | Contact/incident form on `/rules` |

### `netlify/`

| Piece | Schedule | Does |
| --- | --- | --- |
| [`functions/send-reminders.mts`](../netlify/functions/send-reminders.mts) | `*/15 * * * *` | Calls `/api/cron/send-reminders` to mail upcoming-booking reminders |
| [`functions/health-probe.mts`](../netlify/functions/health-probe.mts) | `*/5 * * * *` | GETs the probe paths, ships `vctennis_probe_*`, POSTs `/api/cron/metrics` |
| [`plugins/smoke-test/`](../netlify/plugins/smoke-test/) | post-publish | GETs `/`, `/sign-in`, `/rules`; on 5xx rolls the site back and fails the deploy |

Cron endpoints under `src/pages/api/cron/` are Bearer-authenticated with `CRON_SECRET`.

## Data model

Schema in [`db/config.ts`](../db/config.ts) (Astro DB / Turso, Drizzle under the hood).

| Table | Owner | Notes |
| --- | --- | --- |
| `User` | app | Includes `role`, `disabled`, `showName`, `theme`, `locale`, apartment columns |
| `Session`, `Account`, `Verification` | Better Auth | Shapes are dictated by the library — do not edit to suit app needs |
| `Bookings` | app | `startsAt` + `durationMin`; `reminderSentAt` marks the reminder as sent |
| `Events` | app | Append-only. **No foreign keys**, so history survives user/booking deletion. See [`Event-logging.md`](Event-logging.md) |
| `ContactMessages` | app | One row per `/rules` submission |

`User.apartmentFloor` and `User.apartmentDoor` are marked `deprecated: true` rather than deleted: `astro db push` refuses to add and drop columns on one table in the same push (it reads that as a rename). They stay one push longer so [`scripts/migrate-apartment-number.js`](../scripts/migrate-apartment-number.js) can backfill; a follow-up push removes the lines for real.

## Email pipeline

```
isEmailEnabled()  →  build{Verify,Reset,Booking,ContactAdmin}Email()  →  renderEmail()  →  sendEmail()
   EMAILS_ENABLED          per-message subject/body               shared HTML+text shell    Resend + retries
```

- `EMAILS_ENABLED` is **false by default**. When off, `sendEmail()` logs and returns without sending, and sign-up activates accounts immediately with no verification step.
- Builders return `{ subject, html, text }` and get both bodies from a single `renderEmail()` call, so HTML and text never drift apart.
- Pass `tags` (for Resend filtering) and a stable `idempotencyKey` so a retry or double-submit does not send twice.
- Sending is a **side effect**: wrap it in `try`/`catch` so a mail failure never rolls back the mutation that triggered it.
- Preview any template without sending: `/api/dev/email-preview` (DEV only) — see [`Recipes.md`](Recipes.md#verifying-a-change).

## i18n

- [`en.ts`](../src/lib/i18n/en.ts) is the **type source of truth**: it exports `Dictionary` and `MessageKey`. [`ca.ts`](../src/lib/i18n/ca.ts) satisfies that type.
- Add the English key first, or the Catalan one will not typecheck.
- `createT()` falls back to English, then to the raw key — a missing translation degrades **silently** rather than erroring, so `astro check` will not catch one you forgot.
- Locale comes only from `Accept-Language` (`ca`/`es` → Catalan, else English). There is no locale switcher, cookie, or `/ca/` route prefix.

## Theming

daisyUI themes `tennis` / `tennis-dark`, declared in [`tailwind.config.mjs`](../tailwind.config.mjs). [`Layout.astro`](../src/layouts/Layout.astro) renders `data-theme` from `locals.user.theme` and an inline head script resolves `system` before first paint, so there is no flash.

Use daisyUI semantic classes in new UI — `bg-base-100`, `border-base-300`, `text-base-content/70`. Never hard-code `bg-white` or `text-slate-*`: they do not follow the theme. `dark:` variants are wired to `[data-theme="tennis-dark"]`.

## Observability

`emitEvent()` writes to the `Events` table, then best-effort dual-writes to Grafana Cloud Loki + Prometheus when the `GRAFANA_*` env vars are set (a no-op otherwise). Neither step can fail the calling mutation. Full catalog, PII rules, and reason codes: [`Event-logging.md`](Event-logging.md).
