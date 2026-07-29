import type { APIRoute } from "astro";
import { buildResetEmail, buildVerifyEmail } from "@/lib/authEmail";
import { buildBookingEmail } from "@/lib/bookingEmail";
import { siteUrl } from "@/lib/emailLayout";
import { createT, type Locale } from "@/lib/i18n";

export const prerender = false;

const SAMPLE_STARTS_AT = new Date(Date.now() + 2 * 60 * 60_000);

export const GET: APIRoute = async ({ url }) => {
  if (!import.meta.env.DEV) {
    return new Response("Not found", { status: 404 });
  }

  const type = url.searchParams.get("type") ?? "booking_confirmed";
  const locale: Locale = url.searchParams.get("locale") === "ca" ? "ca" : "en";
  const part = url.searchParams.get("part") === "text" ? "text" : "html";
  const t = createT(locale);
  const sampleUrl = `${siteUrl()}/reset-password?token=sample-token`;

  const email = (() => {
    switch (type) {
      case "reminder":
        return buildBookingEmail("reminder", t, locale, SAMPLE_STARTS_AT, 60);
      case "verify":
        return buildVerifyEmail(t, locale, sampleUrl);
      case "reset":
        return buildResetEmail(t, locale, sampleUrl);
      case "booking_confirmed":
      default:
        return buildBookingEmail("confirmed", t, locale, SAMPLE_STARTS_AT, 60);
    }
  })();

  if (part === "text") {
    return new Response(`Subject: ${email.subject}\n\n${email.text}`, {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }

  return new Response(email.html, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
};
