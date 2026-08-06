import { Resend } from "resend";

function normalizeEnvFlag(value: unknown): string {
  if (typeof value !== "string") return "";
  // Host UIs (e.g. Netlify) store values literally — strip quotes copied from .env examples.
  return value.trim().replace(/^['"]|['"]$/g, "");
}

/** True when EMAILS_ENABLED is true (ignores surrounding quotes/whitespace from .env or host UIs). */
export function isEmailEnabled(): boolean {
  // Prefer process.env so Netlify runtime updates apply even when a build cache
  // still has an older import.meta.env inlining for the same commit.
  const raw =
    (typeof process !== "undefined" ? process.env.EMAILS_ENABLED : undefined) ??
    import.meta.env.EMAILS_ENABLED;
  return normalizeEnvFlag(raw) === "true";
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

function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? error.name : undefined;
  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  return name === "rate_limit_exceeded" || (typeof statusCode === "number" && statusCode >= 500);
}

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(import.meta.env.RESEND_API_KEY);
  }
  return resendClient;
}

/** Resend tag names/values may only contain ASCII letters, digits, `_` or `-`, up to 256 chars. */
function sanitizeTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 256);
}

const RETRY_DELAYS_MS = [500, 1000];

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Merged with default `app`/`env` tags. Values are sanitized to Resend's allowed tag charset. */
  tags?: Record<string, string>;
  /** Extra headers to send. Merged with a default `X-Entity-Ref-ID`. */
  headers?: Record<string, string>;
  /** Falls back to `RESEND_REPLY_TO` when omitted; omitted entirely when neither is set. */
  replyTo?: string;
  /** Deduped by Resend for 24h — pass a value stable per logical send to make retries/re-sends safe. */
  idempotencyKey?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<{ id: string } | undefined> {
  if (!isEmailEnabled()) {
    console.log(`Email sending disabled (EMAILS_ENABLED is not true); skipping email to ${opts.to}`);
    return;
  }

  const from = import.meta.env.RESEND_FROM_EMAIL || "Vinya Canadell Tennis <onboarding@resend.dev>";
  const replyTo = opts.replyTo ?? import.meta.env.RESEND_REPLY_TO;

  const tags = Object.entries({
    app: "vctennis",
    env: import.meta.env.PROD ? "production" : "development",
    ...opts.tags
  }).map(([name, value]) => ({ name: sanitizeTag(name), value: sanitizeTag(value) }));

  const headers: Record<string, string> = {
    "X-Entity-Ref-ID": crypto.randomUUID(),
    ...opts.headers
  };

  const resend = getResend();
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const { data, error } = await resend.emails.send(
      {
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        tags,
        headers,
        ...(replyTo ? { replyTo } : {})
      },
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined
    );

    if (!error) {
      console.log(`Email sent to ${opts.to} (id=${data?.id}, tags=${JSON.stringify(opts.tags ?? {})})`);
      return data ? { id: data.id } : undefined;
    }

    lastError = error;
    if (!isRetryableError(error) || attempt === RETRY_DELAYS_MS.length) break;
    console.warn(`Resend send to ${opts.to} failed (attempt ${attempt + 1}), retrying:`, error);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }

  const message = resendErrorMessage(lastError);
  console.error("Resend error:", lastError);
  throw new EmailSendError(message, lastError);
}
