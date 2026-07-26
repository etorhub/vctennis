import type { APIRoute } from "astro";
import { auth, setPendingSignupIp } from "@/lib/auth";

export const ALL: APIRoute = async (context) => {
  const ip =
    context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    context.clientAddress ||
    null;
  setPendingSignupIp(ip);
  return auth.handler(context.request);
};
