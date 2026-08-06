import { defineMiddleware } from "astro:middleware";
import { db, eq, User } from "astro:db";
import { auth } from "@/lib/auth";
import { createT, detectLocale, type Locale } from "@/lib/i18n";
import { parseThemePreference } from "@/lib/theme";

export const onRequest = defineMiddleware(async (context, next) => {
  const locale = detectLocale(context.request.headers.get("accept-language"));
  context.locals.locale = locale;
  context.locals.t = createT(locale);

  // Bypass cookie cache so role/disabled changes (e.g. /setup) are visible immediately.
  // A DB/auth outage here must not take the whole site down (see incident 2026-07-26):
  // degrade to a logged-out request instead of throwing, so public pages keep working.
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: context.request.headers,
      query: { disableCookieCache: true }
    });
  } catch (err) {
    console.error("middleware: auth.api.getSession failed", err);
  }

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: (session.user as { role?: string }).role ?? "member",
        showName: (session.user as { showName?: boolean }).showName ?? true,
        apartmentBlock: (session.user as { apartmentBlock?: number | null }).apartmentBlock ?? null,
        apartmentNumber: (session.user as { apartmentNumber?: number | null }).apartmentNumber ?? null,
        signupIp: (session.user as { signupIp?: string | null }).signupIp ?? null,
        disabled: (session.user as { disabled?: boolean }).disabled ?? false,
        locale: ((session.user as { locale?: string }).locale === "ca" ? "ca" : "en") as Locale,
        theme: parseThemePreference((session.user as { theme?: string }).theme),
        image: session.user.image,
        emailVerified: session.user.emailVerified,
        createdAt: session.user.createdAt,
        updatedAt: session.user.updatedAt
      }
    : null;

  // Authoritative role/disabled from DB (session can lag after direct updates).
  // Same failure mode as above: fall back to the session's own values rather than 500ing.
  if (user) {
    try {
      const [row] = await db
        .select({ role: User.role, disabled: User.disabled })
        .from(User)
        .where(eq(User.id, user.id))
        .limit(1);
      if (row) {
        user.role = row.role ?? "member";
        user.disabled = row.disabled ?? false;
      }
    } catch (err) {
      console.error("middleware: role/disabled DB lookup failed", err);
    }
  }

  context.locals.user = user;
  context.locals.session = session?.session ?? null;

  const path = context.url.pathname;

  if (user?.disabled && path !== "/sign-out" && !path.startsWith("/api/auth")) {
    if (path !== "/disabled") {
      return context.redirect("/disabled");
    }
  }

  if (path.startsWith("/admin")) {
    if (!user) return context.redirect("/sign-in");
    if (user.role !== "admin") return context.redirect("/");
  }

  if (path === "/profile" || path === "/privacy" || path === "/setup") {
    if (!user) return context.redirect("/sign-in");
  }

  return next();
});
