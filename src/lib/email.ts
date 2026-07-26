import { Resend } from "resend";

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const from = import.meta.env.RESEND_FROM_EMAIL || "Vinya Canadell Tennis <onboarding@resend.dev>";
  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html
  });
  if (error) {
    console.error("Resend error:", error);
    throw new Error("Failed to send email");
  }
}
