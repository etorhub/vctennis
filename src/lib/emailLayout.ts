import { SITE_NAME, THEME_COLOR } from "./config";
import type { Locale } from "./i18n";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** `BETTER_AUTH_URL` with any trailing slash stripped, for building links inside emails. */
export function siteUrl(): string {
  return import.meta.env.BETTER_AUTH_URL.replace(/\/$/, "");
}

export interface RenderEmailOptions {
  locale: Locale;
  /** Hidden preheader shown next to the subject in most inboxes. */
  previewText: string;
  heading: string;
  /** Plain strings — escaped here, one <p>/line per entry. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Caption shown above the raw URL fallback under the CTA button. Required when `cta` is set. */
  linkFallbackLabel?: string;
  footerNote: string;
}

/** Renders one branded email as both HTML and plain text from a single source of truth. */
export function renderEmail(opts: RenderEmailOptions): { html: string; text: string } {
  const { locale, previewText, heading, paragraphs, cta, linkFallbackLabel, footerNote } = opts;
  const site = siteUrl();

  const paragraphsHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#1f2937;">${escapeHtml(p)}</p>`)
    .join("\n");

  const ctaHtml = cta
    ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">
          <tr>
            <td style="border-radius:8px;background-color:${THEME_COLOR};">
              <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                ${escapeHtml(cta.label)}
              </a>
            </td>
          </tr>
        </table>
        ${
          linkFallbackLabel
            ? `<p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(linkFallbackLabel)}</p>`
            : ""
        }
        <p style="margin:0 0 16px;font-size:13px;line-height:1.5;word-break:break-all;color:#6b7280;">
          ${escapeHtml(cta.url)}
        </p>`
    : "";

  const html = `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${escapeHtml(SITE_NAME)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(previewText)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;background-color:${THEME_COLOR};">
                <span style="font-size:18px;font-weight:700;color:#ffffff;">${escapeHtml(SITE_NAME)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1f2937;">${escapeHtml(heading)}</h1>
                ${paragraphsHtml}
                ${ctaHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#6b7280;">${escapeHtml(footerNote)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    SITE_NAME,
    "",
    heading,
    "",
    ...paragraphs,
    ...(cta ? ["", linkFallbackLabel ?? cta.label, cta.url] : []),
    "",
    "--",
    footerNote,
    site
  ];

  return { html, text: textLines.join("\n") };
}
