import { defineMiddleware } from "astro:middleware";
import { db, eq, User } from "astro:db";
import { auth } from "@/lib/auth";
import { createT, detectLocale } from "@/lib/i18n";

export const onRequest = defineMiddleware(async (context, next) => {
  const locale = detectLocale(context.request.headers.get("accept-language"));
  context.locals.locale = locale;
  context.locals.t = createT(locale);

  const session = await auth.api.getSession({
    headers: context.request.headers
  });

  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: (session.user as { role?: string }).role ?? "member",
        showName: (session.user as { showName?: boolean }).showName ?? true,
        signupIp: (session.user as { signupIp?: string | null }).signupIp ?? null,
        disabled: (session.user as { disabled?: boolean }).disabled ?? false,
        image: session.user.image,
        emailVerified: session.user.emailVerified,
        createdAt: session.user.createdAt,
        updatedAt: session.user.updatedAt
      }
    : null;

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
    // Role can be stale in Better Auth cookie cache after /setup — trust the DB.
    const [row] = await db
      .select({ role: User.role })
      .from(User)
      .where(eq(User.id, user.id))
      .limit(1);
    const role = row?.role ?? user.role;
    user.role = role;
    if (role !== "admin") return context.redirect("/");
  }

  if (path === "/settings" || path === "/setup") {
    if (!user) return context.redirect("/sign-in");
  }

  return next();
});
