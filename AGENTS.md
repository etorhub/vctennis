# Vinya Canadell Tennis — Agent Guide

Community tennis court booking PWA for **Vinya Canadell**.

## Stack

- **Astro 5** (SSR) + **Netlify** adapter (`output: "server"`)
- **Astro DB / Turso** (LibSQL); local file DB via `ASTRO_DATABASE_FILE` for `dev:local`
- **Better Auth** with **email/password**; verification and password reset via **Resend** when `EMAILS_ENABLED=true` (production needs a verified Resend domain in `RESEND_FROM_EMAIL`; `onboarding@resend.dev` only emails the Resend account owner). Default `EMAILS_ENABLED=false` skips all email and auto-activates new accounts
- **Tailwind CSS** + **daisyUI** (`tennis` light theme + `tennis-dark`)
- **Alpine.js** for day switcher, bottom sheets, and client UI
- **PWA**: installable (`manifest.webmanifest` + minimal `sw.js`), dismissible install banner, no offline data
- **Node 20** (`.nvmrc`)

## Booking rules

All constants live in [`src/lib/config.ts`](src/lib/config.ts):

| Constant | Default | Meaning |
|---|---|---|
| `OPEN_HOUR` / `CLOSE_HOUR` | 10 / 21 | Court hours (Europe/Madrid) |
| `BOOK_AHEAD_DAYS` | 3 | Agenda window length; starts today, or tomorrow once no bookable slots remain today |
| `MAX_ACTIVE_BOOKINGS` | 1 | Max future bookings per user (one active booking at a time) |
| `SLOT_MINUTES` | 30 | Starts on :00 / :30 |
| `ALLOWED_DURATIONS` | 30, 60 | Minutes |
| `REMINDER_OFFSET_HOURS` | 2 | Hours before start to send booking reminder email |
| `TIMEZONE` | Europe/Madrid | Always use helpers in [`src/lib/time.ts`](src/lib/time.ts) |

Server-side validation is in [`src/actions/bookings.ts`](src/actions/bookings.ts). Overlaps are hard-blocked. One court only.

UI: Google-agenda style. Mobile/tablet: **one day at a time** with prev/next. Desktop (`lg+`): all `BOOK_AHEAD_DAYS` side by side.

## Auth & roles

- Open registration via email/password (`/sign-in`). When `EMAILS_ENABLED=true`, verify via Resend link; when false (default), accounts activate immediately and “Forgot password” is hidden
- Login with email/password; optional “keep me signed in” (`rememberMe`, long-lived session cookie)
- Password reset via email link (`/reset-password`) only when emails are enabled
- Roles: `member` | `admin` on `User.role`
- First admin: visit `/setup` while signed in when **no admin exists**
- Apartment collected at sign-up: `User.apartmentBlock` (1–4) and `User.apartmentNumber` (1–12 in block 1, 1–9 in blocks 2–4 — see `APARTMENTS_PER_BLOCK`). Constants, parsers and `formatApartment()` live in [`src/lib/apartment.ts`](src/lib/apartment.ts); a number is only ever validated together with its block. Required by the `databaseHooks.user.create.before` hook, DB columns stay optional so pre-existing accounts keep working. Editable on `/profile`, shown on `/admin/users`. Deprecated `apartmentFloor` / `apartmentDoor` remain in [`db/config.ts`](db/config.ts) (`deprecated: true`); `scripts/migrate-apartment-number.js` still runs on every Netlify build after `astro db push`. Drop those columns and remove the migrate step from `netlify.toml` in a follow-up after confirming the backfill is complete
- Signup IP stored on `User.signupIp`
- Disabled users redirected to `/disabled`
- Privacy: `User.showName` (default `true`, opt-out). Hidden → display **"Reserved"**
- Appearance: `User.theme` (`system` default | `light` | `dark`), set on `/profile`
- Self-serve account deletion on `/profile` (type email to confirm); deletes bookings + auth rows; last admin cannot self-delete
- Privacy docs (stored data / deletion) on `/privacy` via `PrivacyContent.astro` — auth-only; `/settings` redirects to `/profile`
- Header user menu (signed-in): bookings, profile, privacy, sign out

## Theming

- daisyUI themes `tennis` / `tennis-dark` in [`tailwind.config.mjs`](tailwind.config.mjs); names, meta colours and the `ThemePreference` type live in [`src/lib/theme.ts`](src/lib/theme.ts)
- `Layout.astro` renders `data-theme` from `Astro.locals.user.theme` and an inline head script resolves `system` (and follows OS changes) before first paint — no flash
- Use daisyUI semantic classes (`bg-base-100`, `border-base-300`, `text-base-content/70`, …) in new UI, never `bg-white` / `text-slate-*`; `dark:` variants are wired to `[data-theme="tennis-dark"]`

## i18n

- Dictionaries: [`src/lib/i18n/ca.ts`](src/lib/i18n/ca.ts), [`src/lib/i18n/en.ts`](src/lib/i18n/en.ts)
- Locale from `Accept-Language`: `ca`/`es` → Catalan, else English
- Middleware sets `Astro.locals.locale` and `Astro.locals.t`

## Key routes

| Path | Access | Purpose |
|---|---|---|
| `/` | Public | Day agenda (`BOOK_AHEAD_DAYS`, one day at a time; skips today after last slot) |
| `/rules` | Public | Hours, booking rules, etiquette, access |
| `/sign-in` | Public | Sign in / sign up |
| `/sign-out` | Auth | Sign out |
| `/reset-password` | Public | Set new password from email link |
| `/profile` | Auth | Name, showName, appearance (theme), change password, delete account |
| `/privacy` | Auth | Stored data and deletion docs (`PrivacyContent.astro`) |
| `/settings` | Auth | Redirects to `/profile` |
| `/my-bookings` | Auth | Upcoming + past bookings (edit/cancel upcoming) |
| `/setup` | Auth, once | Become first admin |
| `/admin/users` | Admin | User management |
| `/admin/bookings` | Admin | All bookings |
| `/api/auth/[...all]` | Public | Better Auth handler |

## Commands

```bash
npm install

# Local file DB (fastest to start — no Turso)
# Needs BETTER_AUTH_SECRET / BETTER_AUTH_URL in .env (RESEND_API_KEY only if EMAILS_ENABLED=true)
npm run dev:local
npm run build:local

# Same checks as GitHub Actions (typecheck + local build + dist verify)
npm run ci

# Turso (required for npm run dev / build --remote and Netlify)
turso auth login
npm run db:setup            # create Turso DB + write ASTRO_DB_* to .env
npm run db:update-schemas   # push schema to Turso

# Backfills apartmentNumber from the deprecated apartmentFloor/apartmentDoor columns.
# The Netlify build runs it after `astro db push`; --dry-run prints the mapping only.
node scripts/migrate-apartment-number.js --dry-run
npm run dev                 # uses Turso --remote (LAN-bound via --host)
npm run build               # uses Turso --remote (Netlify)

# Deploy (builds on Netlify so smoke + rollback run)
npm run host:login
npm run host:deploy
```

## Deploy stability

- **GitHub Actions** (`.github/workflows/ci.yml`): on PR and push to `main`/`master`, runs `npm run ci` (`build:local` + `verify:dist`). Require this check in branch protection.
- **Netlify smoke plugin** (`netlify/plugins/smoke-test`): after production publish, GETs `/`, `/sign-in`, `/rules`; on 5xx calls site rollback (`PUT /sites/{SITE_ID}/rollback`) then fails the deploy. Needs site env `NETLIFY_AUTH_TOKEN`.
- `netlify.toml` build command: `astro db push --remote && node scripts/migrate-apartment-number.js && npm run build`

## Git workflow

- Default branch is **`master`**. One conversation → one dedicated branch from up-to-date `master` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
- Land changes via PR; do not commit or push to `master` unless the user explicitly says to stay on `master`.
- Read-only exploration needs no branch. Offer to open a PR when work is ready; merge only when asked.

## Event logging

Append-only domain events in the `Events` table (Astro DB / Turso). Emit via [`src/lib/events.ts`](src/lib/events.ts) (`emitEvent`). After insert, [`src/lib/observability.ts`](src/lib/observability.ts) best-effort dual-writes to Grafana Cloud Loki + Prometheus when `GRAFANA_*` env is set (no-op otherwise; never fails the mutation). Prod HTTP health: Netlify cron [`health-probe`](netlify/functions/health-probe.mts) every 5m ships `vctennis_probe_*` metrics and POSTs [`/api/cron/metrics`](src/pages/api/cron/metrics.ts) for gauge `vctennis_users_registered`. No admin UI yet.

Canonical catalog, PII rules, and reason codes: [`docs/Event-logging.md`](docs/Event-logging.md). Dashboards: [`ops/grafana/dashboards/domain-events.json`](ops/grafana/dashboards/domain-events.json), [`ops/grafana/dashboards/prod-health.json`](ops/grafana/dashboards/prod-health.json). After the GitHub wiki is initialized once in the UI, sync with `npm run docs:wiki` → [wiki Event-logging](https://github.com/etorhub/vctennis/wiki/Event-logging).

## Conventions

- Mobile-first UI; Google-agenda style calendar
- Prefer Astro actions for mutations; validate on the server
- Timezone always `Europe/Madrid` via helpers in [`src/lib/time.ts`](src/lib/time.ts)
- Do not reintroduce Freedom Stack demos (posts, bknd, marketing, React, HTMX)
- Config knobs stay in code (`config.ts`), not env vars
- Keep human docs in [`README.md`](README.md); keep this file accurate for agents
- Follow the Git workflow above (feature branch + PR)
