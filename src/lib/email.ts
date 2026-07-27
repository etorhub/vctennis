import { Resend } from "resend";

export function isEmailEnabled(): boolean {
  return import.meta.env.EMAILS_ENABLED === "true";
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly resendError?: unknown
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

function resendErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Failed to send email";
}

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  if (!isEmailEnabled()) {
    console.log(`Email sending disabled (EMAILS_ENABLED != "true"); skipping email to ${opts.to}`);
    return;
  }

  const resend = new Resend(import.meta.env.RESEND_API_KEY);
  const from = import.meta.env.RESEND_FROM_EMAIL || "Vinya Canadell Tennis <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html
  });
  if (error) {
    const message = resendErrorMessage(error);
    console.error("Resend error:", error);
    throw new EmailSendError(message, error);
  }
}
