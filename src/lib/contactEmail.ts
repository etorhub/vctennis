import { SITE_NAME } from "./config";
import { renderEmail } from "./emailLayout";
import type { Locale, TFunction } from "./i18n";

export function buildContactAdminEmail(
  t: TFunction,
  locale: Locale,
  data: { name: string; email: string; type: "contact" | "incident"; subject: string; message: string }
): { subject: string; html: string; text: string } {
  const typeLabel = t(data.type === "incident" ? "rulesContactTypeIncident" : "rulesContactTypeContact");
  const vars = { name: data.name, email: data.email, type: typeLabel, subject: data.subject };

  const { html, text } = renderEmail({
    locale,
    previewText: t("emailContactPreview", vars),
    heading: t("emailContactHeading"),
    paragraphs: [
      t("emailContactFrom", vars),
      t("emailContactTypeLine", vars),
      t("emailContactSubjectLine", vars),
      data.message
    ],
    footerNote: t("emailContactFooter", { site: SITE_NAME })
  });

  return {
    subject: `${SITE_NAME} — ${data.subject}`,
    html,
    text
  };
}
