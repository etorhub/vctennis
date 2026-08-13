# Recipes

Step-by-step for the changes this repo asks for most often. Each recipe names a file that already does the thing — read it before writing new code. Background on why the steps are what they are: [`Architecture.md`](Architecture.md).

## Add an Astro action

Reference: [`src/actions/contact.ts`](../src/actions/contact.ts).

1. Add the action to an existing `src/actions/<domain>.ts`, or create one for a new domain.
2. **Register it** in [`src/actions/index.ts`](../src/actions/index.ts) — an unregistered action is unreachable.
3. Validate input with `z` from `astro:schema`. Use `accept: "form"` for `<form method="POST">` submissions (the site's default) and omit it for JSON calls.
4. Re-check auth in the handler — the middleware does not guard actions:
   ```ts
   const user = context.locals.user;
   if (!user) throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
   if (user.disabled) throw new ActionError({ code: "FORBIDDEN", message: "errorDisabled" });
   ```
5. Throw `ActionError` with an **i18n key** as `message`, never prose.
6. `emitEvent(...)` for anything worth an audit trail — including rejections, if the domain tracks them the way bookings do.
7. Wrap side effects (email, Grafana) in `try`/`catch` so they cannot fail the mutation.
8. In the page, submit with `action={actions.<domain>.<name>}` and read `Astro.getActionResult(actions.<domain>.<name>)`, resolving any error message through `Astro.locals.t`. See [`src/pages/rules.astro`](../src/pages/rules.astro).

> Do not add a bare `POST` API route to handle a form. SSR intercepts every request before Netlify's form capture can see it — that is exactly why the contact form is an action and not Netlify Forms.

## Add a UI string

1. Add the key to [`src/lib/i18n/en.ts`](../src/lib/i18n/en.ts) **first** — it types `MessageKey`, so Catalan will not typecheck against a key English does not have.
2. Add the same key to [`src/lib/i18n/ca.ts`](../src/lib/i18n/ca.ts).
3. Use it via `Astro.locals.t("key")` in pages, `context.locals.t` in actions, or the `t` passed into email builders. Interpolate with `t("key", { name })` against `{name}` placeholders.

A missing Catalan key silently falls back to English — `astro check` will not flag it, so add both in the same edit.

## Add a domain event

1. Append the type to `EVENT_TYPES` in [`src/lib/events.ts`](../src/lib/events.ts) (the union is derived from this array).
2. Call `emitEvent({ type, actorUserId, subjectUserId?, bookingId?, reason?, payload? })` at the point of the change.
3. Document it in [`Event-logging.md`](Event-logging.md) — the catalog there is canonical, including PII rules for anything you put in `payload`.
4. If it should be visible in ops, add a panel to [`ops/grafana/dashboards/domain-events.json`](../ops/grafana/dashboards/domain-events.json).
5. If it should appear on the admin timeline, extend [`src/pages/admin/timeline.astro`](../src/pages/admin/timeline.astro).

Never put a raw email address in `payload` unless `Event-logging.md` says that event carries one; `redactEventEmails()` only strips a key literally named `email`.

## Add or change a DB column

1. Edit the table in [`db/config.ts`](../db/config.ts).
2. Local file DB (`npm run dev:local`) picks the change up on restart. For Turso: `npm run db:update-schemas`.
3. Netlify runs `astro db push --remote` on every build (`netlify.toml`), so a deploy applies the schema on its own.

**Removing a column takes two pushes.** `astro db push` treats a drop plus an add on the same table as a rename and refuses. Mark the old column `deprecated: true` first, ship the backfill, then delete the lines in a follow-up push. `User.apartmentFloor` / `apartmentDoor` are the worked example.

## Add a protected route

1. Create the page under [`src/pages/`](../src/pages/).
2. Add the guard to [`src/middleware.ts`](../src/middleware.ts) — either the `/admin` branch or the signed-in-only path list. **Do not** guard inside the `.astro` file; every other route is guarded centrally.
3. Anything under `/admin/*` is already covered by the existing prefix check.

## Add an email

Reference: [`src/lib/contactEmail.ts`](../src/lib/contactEmail.ts).

1. Write a builder in `src/lib/` returning `{ subject, html, text }`; compose the body with `renderEmail()` from [`emailLayout.ts`](../src/lib/emailLayout.ts). Pass `paragraphs` as **plain strings** — `renderEmail()` escapes them and emits the HTML and text bodies from that one source. Do not pre-escape, and do not hand-build HTML.
2. Take `t` and `locale` as arguments so the mail matches the recipient's language.
3. Send with `sendEmail({ to, subject, html, text, tags, idempotencyKey })`. The `idempotencyKey` should be stable per logical send (e.g. `contact-${id}-${recipient}`) so retries do not duplicate.
4. Wrap the send in `try`/`catch`.
5. Add a case to [`src/pages/api/dev/email-preview.ts`](../src/pages/api/dev/email-preview.ts) so it can be eyeballed without sending.

Nothing sends unless `EMAILS_ENABLED=true`; with it off, `sendEmail()` logs and returns.

## Verifying a change

**This repo has no unit or e2e tests** — no vitest, no playwright, no test files. Correctness comes from the typechecker, server-side validation, and manual checks. Do not assume a suite exists, and do not add one as a side effect of another change.

The gate is:

```bash
npm run ci     # astro check (typecheck) → local SSR build → verify:dist
```

That is exactly what GitHub Actions runs on every PR ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)), so a green `npm run ci` locally means a green check on the PR.

Manual loop:

```bash
npm run dev:local     # local SQLite in .data/, no Turso needed
```

Needs only `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in `.env`. Sign up, then visit `/setup` once to become the first admin. `--host` is on, so you can open it from a phone on the same LAN — worth doing for booking UI, which is mobile-first.

Emails, without sending any (DEV only):

```
/api/dev/email-preview?type=booking_confirmed|reminder|verify|reset&locale=ca|en&part=html|text
```

Things worth exercising by hand, since nothing else will catch them:

- **Booking rules** — overlap, the one-active-booking limit, open hours, and the walk-up case (the in-progress `:00`/`:30` slot stays bookable).
- **Both locales** — send `Accept-Language: ca` and confirm no English leaks through.
- **Both themes** — light and dark, since hard-coded colours only break in one.
- **Signed out / member / admin / disabled** — the four states the middleware branches on.
