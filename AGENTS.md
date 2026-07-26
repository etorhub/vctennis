# Vinya Canadell Tennis — Agent Guide

Community tennis court booking PWA for **Vinya Canadell**.

## Stack

- **Astro 5** (SSR) + **Netlify** adapter (`output: "server"`)
- **Astro DB / Turso** (LibSQL); local file DB via `ASTRO_DATABASE_FILE` for `dev:local`
- **Better Auth** with **email/password**, email verification, and password reset via **Resend**
- **Tailwind CSS** + **daisyUI** (`tennis` theme)
- **Alpine.js** for day switcher, bottom sheets, and client UI
- **PWA**: installable (`manifest.webmanifest` + minimal `sw.js`), no offline data
- **Node 20** (`.nvmrc`)

## Booking rules

All constants live in [`src/lib/config.ts`](src/lib/config.ts):

| Constant | Default | Meaning |
|---|---|---|
| `OPEN_HOUR` / `CLOSE_HOUR` | 10 / 21 | Court hours (Europe/Madrid) |
| `BOOK_AHEAD_DAYS` | 3 | Agenda window: today + 2; book within that window |
| `MAX_ACTIVE_BOOKINGS` | 3 | Max future bookings per user |
| `SLOT_MINUTES` | 30 | Starts on :00 / :30 |
| `ALLOWED_DURATIONS` | 30, 60 | Minutes |
| `TIMEZONE` | Europe/Madrid | Always use helpers in [`src/lib/time.ts`](src/lib/time.ts) |

Server-side validation is in [`src/actions/bookings.ts`](src/actions/bookings.ts). Overlaps are hard-blocked. One court only.

UI: Google-agenda style. Mobile/tablet: **one day at a time** with prev/next. Desktop (`lg+`): all `BOOK_AHEAD_DAYS` side by side.

## Auth & roles

- Open registration via email/password (`/sign-in` → verify email via Resend link)
- Login with email/password; optional “keep me signed in” (`rememberMe`, long-lived session cookie)
- Password reset via email link (`/reset-password`)
- Roles: `member` | `admin` on `User.role`
- First admin: visit `/setup` while signed in when **no admin exists**
- Signup IP stored on `User.signupIp`
- Disabled users redirected to `/disabled`
- Privacy: `User.showName` (default `true`, opt-out). Hidden → display **"Reserved"**

## i18n

- Dictionaries: [`src/lib/i18n/ca.ts`](src/lib/i18n/ca.ts), [`src/lib/i18n/en.ts`](src/lib/i18n/en.ts)
- Locale from `Accept-Language`: `ca`/`es` → Catalan, else English
- Middleware sets `Astro.locals.locale` and `Astro.locals.t`

## Key routes

| Path | Access | Purpose |
|---|---|---|
| `/` | Public | Day agenda (today + 2, one day at a time) |
| `/rules` | Public | Hours, booking rules, etiquette, access |
| `/sign-in` | Public | Sign in / sign up |
| `/sign-out` | Auth | Sign out |
| `/reset-password` | Public | Set new password from email link |
| `/settings` | Auth | Name + showName |
| `/setup` | Auth, once | Become first admin |
| `/admin/users` | Admin | User management |
| `/admin/bookings` | Admin | All bookings |
| `/api/auth/[...all]` | Public | Better Auth handler |

## Commands

```bash
npm install

# Local file DB (fastest to start — no Turso)
# Needs BETTER_AUTH_SECRET / BETTER_AUTH_URL / RESEND_API_KEY in .env
npm run dev:local
npm run build:local

# Turso (required for npm run dev / build --remote and Netlify)
turso auth login
npm run db:setup            # create Turso DB + write ASTRO_DB_* to .env
npm run db:update-schemas   # push schema to Turso
npm run dev                 # uses Turso --remote (LAN-bound via --host)
npm run build               # uses Turso --remote (Netlify)

# Deploy
npm run host:login
npm run host:deploy
```

## Git workflow (mandatory for Cursor + Claude)

Default branch is **`master`**. All implementation lands via **PR → `master`**.

- **One conversation → one branch.** Before the first implementation edit for a new plan/task, create a dedicated branch from up-to-date `master` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
- Do **not** commit or push to `master`.
- Do **not** pile unrelated work onto another conversation's branch unless the user explicitly continues that work.
- Read-only exploration needs no branch.
- Push / open a PR only when the user asks (or offer when ready). Do not merge unless asked.
- If the tree is dirty with unrelated changes, stop and ask.

```bash
git fetch origin
git checkout master
git pull --ff-only origin master
git checkout -b feat/<short-name>
```

Enforcement: Cursor rules + hooks in [`.cursor/`](.cursor/); Claude Code via [`CLAUDE.md`](CLAUDE.md) + [`.claude/`](.claude/).

## Conventions

- Mobile-first UI; Google-agenda style calendar
- Prefer Astro actions for mutations; validate on the server
- Timezone always `Europe/Madrid` via helpers in [`src/lib/time.ts`](src/lib/time.ts)
- Do not reintroduce Freedom Stack demos (posts, bknd, marketing, React, HTMX)
- Config knobs stay in code (`config.ts`), not env vars
- Keep human docs in [`README.md`](README.md); keep this file accurate for agents
