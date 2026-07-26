import type { APIRoute } from "astro";
import { auth, setPendingSignupIp, setPendingSignupLocale } from "@/lib/auth";

export const ALL: APIRoute = async (context) => {
  const ip = context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || context.clientAddress || null;
  setPendingSignupIp(ip);
  setPendingSignupLocale(context.locals.locale);
  return auth.handler(context.request);
};
