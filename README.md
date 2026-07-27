# Vinya Canadell Tennis

[![Astro](https://img.shields.io/badge/Astro_5-BC52EE?style=flat&logo=astro&logoColor=white)](https://astro.build)
[![Netlify](https://img.shields.io/badge/Netlify-00C7B7?style=flat&logo=netlify&logoColor=white)](https://www.netlify.com)
[![Turso](https://img.shields.io/badge/Turso-4FF8D2?style=flat&logo=turso&logoColor=black)](https://turso.tech)
[![Better Auth](https://img.shields.io/badge/Better_Auth-000000?style=flat)](https://www.better-auth.com)
[![Resend](https://img.shields.io/badge/Resend-000000?style=flat&logo=resend&logoColor=white)](https://resend.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![daisyUI](https://img.shields.io/badge/daisyUI-1AD1A5?style=flat)](https://daisyui.com)
[![Alpine.js](https://img.shields.io/badge/Alpine.js-8BC0D0?style=flat&logo=alpinedotjs&logoColor=black)](https://alpinejs.dev)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Node](https://img.shields.io/badge/Node-20-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./package.json)

Community tennis court booking PWA for **Vinya Canadell**.

Public day agenda, email/password accounts with verification, and admin tools — mobile-first, Europe/Madrid timezone.

## Features

- One-court agenda (today + 2 days); one day at a time on mobile, all days side by side on desktop
- Book 30 or 60 minutes on `:00` / `:30` slots (10:00–21:00)
- Max 3 active future bookings per member; overlaps hard-blocked
- Open signup with email verification and password reset (Resend)
- Privacy: members can hide their name → shown as **Reserved**; self-serve account deletion on `/settings` (see `/privacy`)
- Roles: `member` / `admin` (first admin via `/setup`)
- Installable PWA (no offline booking data)
- Catalan / English from `Accept-Language`

## Quick start (local DB)

Requires **Node 20** (see `.nvmrc`).

```bash
npm install
cp .env.example .env
# set at least: BETTER_AUTH_SECRET, BETTER_AUTH_URL, RESEND_API_KEY
openssl rand -base64 32   # → BETTER_AUTH_SECRET

npm run dev:local
```

Open `http://localhost:4321`, create an account, verify email, then visit `/setup` once to become the first admin.

`dev` / `dev:local` bind to all interfaces (`--host`) so you can use the app from other devices on the LAN.

## Turso (remote DB)

Needed for `npm run dev`, `npm run build`, and Netlify:

```bash
turso auth login
npm run db:setup            # creates DB + writes ASTRO_DB_* into .env
npm run db:update-schemas   # push schema
npm run dev                 # Astro DB --remote
```

## Environment

Copy [`.env.example`](.env.example). Required:

| Variable | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | Auth signing secret |
| `BETTER_AUTH_URL` | Public app URL (`http://localhost:4321` locally) |
| `RESEND_API_KEY` | Verification + password-reset emails |
| `ASTRO_DB_REMOTE_URL` | Turso URL (remote / production) |
| `ASTRO_DB_APP_TOKEN` | Turso token (remote / production) |

Optional: `RESEND_FROM_EMAIL` (defaults to Resend onboarding sender).

Booking knobs (hours, book-ahead, durations) live in [`src/lib/config.ts`](src/lib/config.ts), not env vars.

## Scripts

| Command | Description |
|---|---|
| `npm run dev:local` | Dev server + local SQLite file (`.data/`) |
| `npm run build:local` | Typecheck + build with local DB |
| `npm run dev` | Dev server + Turso (`--remote`) |
| `npm run build` | Typecheck + build for Netlify (`--remote`) |
| `npm run db:setup` | Create Turso DB and write credentials |
| `npm run db:update-schemas` | Push Astro DB schema to Turso |
| `npm run host:login` | Netlify CLI login |
| `npm run host:deploy` | Production deploy via Netlify CLI |

## Deploy (Netlify)

1. Link the site (`npx netlify link` or the Netlify UI).
2. Set the env vars above; use your production URL for `BETTER_AUTH_URL`.
3. Push schema once: `npm run db:update-schemas`.
4. Deploy: `npm run host:deploy` (or Netlify Git continuous deploy with build command `npm run build`).

## Project layout

```
src/
  actions/     # bookings, auth, admin (Astro actions)
  components/  # header, booking bottom sheet
  lib/         # config, auth, time helpers, i18n
  pages/       # routes (agenda, sign-in, settings, admin, …)
db/            # Astro DB schema + seed
public/        # PWA manifest, icons, sw.js
```

## Docs for agents

Contributor and AI agent conventions: [`AGENTS.md`](AGENTS.md).
