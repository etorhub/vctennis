import { SITE_NAME } from "./config";
import { renderEmail, siteUrl } from "./emailLayout";
import type { Locale, TFunction } from "./i18n";
import { formatFullDate, formatTime } from "./time";

export function buildBookingEmail(
  kind: "confirmed" | "reminder",
  t: TFunction,
  locale: Locale,
  startsAt: Date,
  durationMin: number
): { subject: string; html: string; text: string } {
  const date = formatFullDate(startsAt, locale);
  const time = formatTime(startsAt, locale);
  const duration = t(durationMin === 30 ? "minutes30" : "minutes60");
  const vars = { date, time, duration };

  const subjectKey = kind === "confirmed" ? "emailBookingConfirmedSubject" : "emailReminderSubject";
  const bodyKey = kind === "confirmed" ? "emailBookingConfirmedBody" : "emailReminderBody";
  const previewKey = kind === "confirmed" ? "emailBookingConfirmedPreview" : "emailReminderPreview";

  const { html, text } = renderEmail({
    locale,
    previewText: t(previewKey, vars),
    heading: t(subjectKey),
    paragraphs: [t(bodyKey, vars)],
    cta: { label: t("emailCtaViewBookings"), url: `${siteUrl()}/my-bookings` },
    linkFallbackLabel: t("emailLinkFallback"),
    footerNote: t("emailFooterTransactional", { site: SITE_NAME })
  });

  return {
    subject: `${SITE_NAME} — ${t(subjectKey)}`,
    html,
    text
  };
}
