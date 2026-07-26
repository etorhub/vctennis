import type { APIRoute } from "astro";
import { db, Bookings, User, and, eq, gt, isNull, lte } from "astro:db";
import { buildBookingEmail } from "@/lib/bookingEmail";
import { REMINDER_OFFSET_HOURS } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { createT, type Locale } from "@/lib/i18n";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${import.meta.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_OFFSET_HOURS * 60 * 60_000);

  const upcoming = await db
    .select({
      id: Bookings.id,
      startsAt: Bookings.startsAt,
      durationMin: Bookings.durationMin,
      email: User.email,
      locale: User.locale
    })
    .from(Bookings)
    .innerJoin(User, eq(User.id, Bookings.userId))
    .where(and(isNull(Bookings.reminderSentAt), gt(Bookings.startsAt, now), lte(Bookings.startsAt, windowEnd)));

  let sent = 0;
  let failed = 0;

  for (const booking of upcoming) {
    try {
      const locale: Locale = booking.locale === "ca" ? "ca" : "en";
      const t = createT(locale);
      const { subject, html } = buildBookingEmail("reminder", t, locale, booking.startsAt, booking.durationMin);
      await sendEmail({ to: booking.email, subject, html });
      await db.update(Bookings).set({ reminderSentAt: new Date() }).where(eq(Bookings.id, booking.id));
      sent++;
    } catch (err) {
      console.error(`Failed to send reminder for booking ${booking.id}:`, err);
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};
