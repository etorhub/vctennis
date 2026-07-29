import { SITE_NAME } from "./config";
import { renderEmail } from "./emailLayout";
import type { Locale, TFunction } from "./i18n";

type MessageKeyOf = Parameters<TFunction>[0];

function buildAuthEmail(
  t: TFunction,
  locale: Locale,
  url: string,
  keys: {
    subject: MessageKeyOf;
    heading: MessageKeyOf;
    body: MessageKeyOf;
    ignore: MessageKeyOf;
    preview: MessageKeyOf;
    cta: MessageKeyOf;
  }
): { subject: string; html: string; text: string } {
  const { html, text } = renderEmail({
    locale,
    previewText: t(keys.preview, { site: SITE_NAME }),
    heading: t(keys.heading),
    paragraphs: [t(keys.body, { site: SITE_NAME }), t(keys.ignore)],
    cta: { label: t(keys.cta), url },
    linkFallbackLabel: t("emailLinkFallback"),
    footerNote: t("emailFooterTransactional", { site: SITE_NAME })
  });
  return { subject: `${SITE_NAME} — ${t(keys.subject)}`, html, text };
}

export function buildVerifyEmail(t: TFunction, locale: Locale, url: string) {
  return buildAuthEmail(t, locale, url, {
    subject: "emailVerifySubject",
    heading: "emailVerifyHeading",
    body: "emailVerifyBody",
    ignore: "emailVerifyIgnore",
    preview: "emailVerifyPreview",
    cta: "emailCtaVerify"
  });
}

export function buildResetEmail(t: TFunction, locale: Locale, url: string) {
  return buildAuthEmail(t, locale, url, {
    subject: "emailResetSubject",
    heading: "emailResetHeading",
    body: "emailResetBody",
    ignore: "emailResetIgnore",
    preview: "emailResetPreview",
    cta: "emailCtaReset"
  });
}
