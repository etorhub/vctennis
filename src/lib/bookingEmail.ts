import { SITE_NAME } from "./config";
import type { Locale, TFunction } from "./i18n";
import { formatFullDate, formatTime } from "./time";

export function buildBookingEmail(
  kind: "confirmed" | "reminder",
  t: TFunction,
  locale: Locale,
  startsAt: Date,
  durationMin: number
): { subject: string; html: string } {
  const date = formatFullDate(startsAt, locale);
  const time = formatTime(startsAt, locale);
  const duration = t(durationMin === 30 ? "minutes30" : "minutes60");

  const subjectKey = kind === "confirmed" ? "emailBookingConfirmedSubject" : "emailReminderSubject";
  const bodyKey = kind === "confirmed" ? "emailBookingConfirmedBody" : "emailReminderBody";

  return {
    subject: `${SITE_NAME} — ${t(subjectKey)}`,
    html: `<p>${t(bodyKey, { date, time, duration })}</p>`
  };
}
