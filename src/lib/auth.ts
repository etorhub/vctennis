import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { Account, db, Session, User, Verification } from "astro:db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { SITE_NAME } from "./config";
import { EmailSendError, sendEmail } from "./email";
import { createT, type Locale } from "./i18n";

/** Set per-request in the auth API route so databaseHooks can read it. */
export let pendingSignupIp: string | null = null;

export function setPendingSignupIp(ip: string | null) {
  pendingSignupIp = ip;
}

/** Set per-request in the auth API route so databaseHooks can read it. */
export let pendingSignupLocale: Locale = "en";

export function setPendingSignupLocale(locale: Locale) {
  pendingSignupLocale = locale;
}

async function sendAuthEmail(opts: { to: string; subject: string; html: string }) {
  try {
    await sendEmail(opts);
  } catch (err) {
    if (err instanceof EmailSendError) {
      console.error("Auth email failed:", err.message, err.resendError);
    } else {
      console.error("Auth email failed:", err);
    }
    throw new APIError("BAD_REQUEST", {
      message: createT(pendingSignupLocale)("errorEmailSend")
    });
  }
}

export const auth = betterAuth({
  baseURL: import.meta.env.BETTER_AUTH_URL,
  secret: import.meta.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    schema: {
      user: User,
      account: Account,
      session: Session,
      verification: Verification
    },
    provider: "sqlite"
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "member",
        input: false
      },
      showName: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: true
      },
      signupIp: {
        type: "string",
        required: false,
        input: false
      },
      disabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false
      },
      locale: {
        type: "string",
        required: false,
        defaultValue: "en",
        input: false
      }
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email ?? "";
          const defaultName = email.includes("@") ? email.split("@")[0] : email;
          return {
            data: {
              ...user,
              name: user.name?.trim() || defaultName,
              role: "member",
              showName: true,
              disabled: false,
              signupIp: pendingSignupIp,
              locale: pendingSignupLocale
            }
          };
        }
      }
    }
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, token }) => {
      const base = import.meta.env.BETTER_AUTH_URL.replace(/\/$/, "");
      const url = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      await sendAuthEmail({
        to: user.email,
        subject: `${SITE_NAME} — reset password`,
        html: `
          <p>Reset your password for ${SITE_NAME}:</p>
          <p><a href="${url}">${url}</a></p>
          <p>This link expires soon. If you did not request it, you can ignore this email.</p>
        `
      });
    }
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: `${SITE_NAME} — verify your email`,
        html: `
          <p>Verify your email to activate your ${SITE_NAME} account:</p>
          <p><a href="${url}">${url}</a></p>
          <p>This link expires soon. If you did not create an account, you can ignore this email.</p>
        `
      });
    }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 days
    updateAge: 60 * 60 * 24, // sliding refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
    }
  }
});

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  showName: boolean;
  signupIp?: string | null;
  disabled: boolean;
  locale: Locale;
  image?: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};
