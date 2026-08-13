# Vinya Canadell Tennis — Agent Guide

Community tennis court booking PWA for **Vinya Canadell**.

Start here, then follow the pointers. This file is the index: invariants, constants, routes, and commands. The depth lives in `docs/`.

| Doc | For |
| --- | --- |
| [`docs/Architecture.md`](docs/Architecture.md) | Request lifecycle, `Astro.locals`, route guards, module map, data model, email pipeline |
| [`docs/Recipes.md`](docs/Recipes.md) | How to add an action, a string, an event, a column, a route, an email — and how to verify |
| [`docs/Event-logging.md`](docs/Event-logging.md) | Domain event catalog, PII rules, reason codes |
| [`README.md`](README.md) | Human-facing setup, env vars, deploy |

## Stack

- **Astro 5** (SSR) + **Netlify** adapter (`output: "server"`)
- **Astro DB / Turso** (LibSQL); local file DB via `ASTRO_DATABASE_FILE` for `dev:local`
- **Better Auth** with **email/password**; verification and password reset via **Resend** when `EMAILS_ENABLED=true` (production needs a verified Resend domain in `RESEND_FROM_EMAIL`; `onboarding@resend.dev` only emails the Resend account owner). Default `EMAILS_ENABLED=false` skips all email and auto-activates new accounts
- **Tailwind CSS** + **daisyUI** (`tennis` light theme + `tennis-dark`)
- **Alpine.js** for day switcher, bottom sheets, and client UI
- **PWA**: installable (`manifest.webmanifest` + minimal `sw.js`), dismissible install banner, no offline data
- **Node 20** (`.nvmrc`)

## Invariants

Non-obvious rules. Breaking one typechecks fine and fails in production — details in [`docs/Architecture.md`](docs/Architecture.md).

- **Route guards live in [`src/middleware.ts`](src/middleware.ts)**, not in pages. New protected route → add it there.
- **Actions re-check auth themselves.** The middleware guards page paths, not action calls. Every action verifies `locals.user` and `user.disabled` (admin actions also check `role`).
- **`ActionError`'s `message` is an i18n key** (`"errorUnauthorized"`), not prose. The page resolves it through `locals.t`.
- **The middleware must never throw.** A DB/auth outage degrades to a logged-out request; it must not 500 the public pages (incident 2026-07-26).
- **[`src/lib/i18n/en.ts`](src/lib/i18n/en.ts) types the dictionary.** Add the English key first; a missing Catalan key falls back silently and `astro check` will not catch it.
- **`emitEvent()` never throws**, and Grafana shipping is best-effort. Logging must not break a mutation. Same rule for email: wrap sends in `try`/`catch`.
- **Booking knobs live in [`src/lib/config.ts`](src/lib/config.ts)**, never in env vars.
- **All dates go through [`src/lib/time.ts`](src/lib/time.ts)** (`Europe/Madrid`). No raw `Date` math.
- **There are no tests in this repo.** `npm run ci` (typecheck + build + dist verify) is the gate — see [Verifying a change](docs/Recipes.md#verifying-a-change).

## Booking rules

All constants live in [`src/lib/config.ts`](src/lib/config.ts):

| Constant | Default | Meaning |
|---|---|---|
| `OPEN_HOUR` / `CLOSE_HOUR` | 10 / 21 | Court hours (Europe/Madrid) |
| `BOOK_AHEAD_DAYS` | 3 | Agenda window length; starts today, or tomorrow once no bookable slots remain today |
| `MAX_ACTIVE_BOOKINGS` | 1 | Max not-yet-ended bookings per user (one active booking at a time) |
| `SLOT_MINUTES` | 30 | Starts on :00 / :30 |
| `ALLOWED_DURATIONS` | 30, 60 | Minutes |
| `REMINDER_OFFSET_HOURS` | 2 | Hours before start to send booking reminder email |
| `TIMEZONE` | Europe/Madrid | Always use helpers in [`src/lib/time.ts`](src/lib/time.ts) |

Server-side validation is in [`src/actions/bookings.ts`](src/actions/bookings.ts). Overlaps are hard-blocked. One court only. The current in-progress `:00`/`:30` slot stays bookable if free (walk-up); confirmation email is skipped when the start has already passed.

UI: Google-agenda style. Mobile/tablet: **one day at a time** with prev/next. Desktop (`lg+`): all `BOOK_AHEAD_DAYS` side by side.

## Auth & roles

- Open registration via email/password (`/sign-in`); roles are `member` | `admin` on `User.role`. First admin: visit `/setup` while signed in when **no admin exists**
- Privacy: `User.showName` (default `true`, opt-out). Hidden → display **"Reserved"**. Self-serve account deletion on `/profile` — use `deleteUserCascade()` in [`src/lib/users.ts`](src/lib/users.ts); last admin cannot self-delete
- Disabled users redirected to `/disabled`. Signup IP stored on `User.signupIp`
- Apartment collected at sign-up: `User.apartmentBlock` (1–4) and `User.apartmentNumber` (1–12 in block 1, 1–9 in blocks 2–4 — see `APARTMENTS_PER_BLOCK`). Constants, parsers and `formatApartment()` live in [`src/lib/apartment.ts`](src/lib/apartment.ts); a number is only ever validated together with its block. Required by the `databaseHooks.user.create.before` hook, DB columns stay optional so pre-existing accounts keep working. Editable on `/profile`, shown on `/admin/users`. Deprecated `apartmentFloor` / `apartmentDoor` remain in [`db/config.ts`](db/config.ts) (`deprecated: true`); `scripts/migrate-apartment-number.js` still runs on every Netlify build after `astro db push`. Drop those columns and remove the migrate step from `netlify.toml` in a follow-up after confirming the backfill is complete

## Key routes

| Path | Access | Purpose |
|---|---|---|
| `/` | Public | Day agenda (`BOOK_AHEAD_DAYS`, one day at a time; skips today after last slot) |
| `/rules` | Public | Hours, booking rules, etiquette, access; contact/incident form (auth-only) — `actions.contact.send` stores to `ContactMessages` and emails all admins via Resend (not Netlify Forms: SSR routes aren't visible to Netlify's form capture) |
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
| `/admin/timeline` | Admin | Recent domain events (sign-ups, bookings created/cancelled) |
| `/api/auth/[...all]` | Public | Better Auth handler |
| `/api/cron/*` | `CRON_SECRET` | Reminders, metrics, manual health probe |
| `/api/dev/email-preview` | DEV only | Render any email template without sending |

## Commands

```bash
npm install
npm run dev:local   # local file DB, no Turso — needs only BETTER_AUTH_SECRET / BETTER_AUTH_URL in .env
npm run ci          # the gate: typecheck + local build + dist verify (same as GitHub Actions)
```

Turso is only needed for `npm run dev` / `npm run build --remote` and Netlify: `turso auth login`, `npm run db:setup`, `npm run db:update-schemas`. Full script table and env reference: [`README.md`](README.md).

## Deploy stability

- **GitHub Actions** (`.github/workflows/ci.yml`): on PR and push to `main`/`master`, runs `npm run ci` (`build:local` + `verify:dist`). Require this check in branch protection.
- **Netlify smoke plugin** (`netlify/plugins/smoke-test`): after production publish, GETs `/`, `/sign-in`, `/rules`; on 5xx calls site rollback (`PUT /sites/{SITE_ID}/rollback`) then fails the deploy. Needs site env `NETLIFY_AUTH_TOKEN`.
- `netlify.toml` build command: `astro db push --remote && node scripts/migrate-apartment-number.js && npm run build`

## Git workflow

- Default branch is **`master`**. One conversation → one dedicated branch from up-to-date `master` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
- Land changes via PR; do not commit or push to `master` unless the user explicitly says to stay on `master`.
- Read-only exploration needs no branch. Offer to open a PR when work is ready; merge only when asked.
- Do not add `Co-Authored-By` or `Claude-Session` attribution footers (or any AI-attribution trailer) to commit messages or PR descriptions.

## Conventions

- Mobile-first UI; Google-agenda style calendar
- Prefer Astro actions for mutations; validate on the server
- Use daisyUI semantic classes (`bg-base-100`, `border-base-300`, `text-base-content/70`, …) in new UI, never `bg-white` / `text-slate-*`
- Do not reintroduce Freedom Stack demos (posts, bknd, marketing, React, HTMX)
- Keep human docs in [`README.md`](README.md); keep this file and `docs/` accurate for agents
- Follow the Git workflow above (feature branch + PR)
