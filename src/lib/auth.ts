import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { Account, db, Session, User, Verification } from "astro:db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { parseApartmentBlock, parseApartmentNumber } from "./apartment";
import { buildResetEmail, buildVerifyEmail } from "./authEmail";
import { EmailSendError, isEmailEnabled, sendEmail, type SendEmailOptions } from "./email";
import { siteUrl } from "./emailLayout";
import { emitEvent } from "./events";
import { createT, type Locale } from "./i18n";
import { DEFAULT_THEME_PREFERENCE, type ThemePreference } from "./theme";
import { refreshRegisteredUsersMetric } from "./userMetrics";

function userLocale(user: { locale?: string }): Locale {
  return user.locale === "ca" || user.locale === "en" ? user.locale : pendingSignupLocale;
}

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

async function sendAuthEmail(opts: SendEmailOptions, locale: Locale) {
  try {
    await sendEmail(opts);
  } catch (err) {
    if (err instanceof EmailSendError) {
      console.error("Auth email failed:", err.message, err.resendError);
    } else {
      console.error("Auth email failed:", err);
    }
    throw new APIError("BAD_REQUEST", {
      message: createT(locale)("errorEmailSend")
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
      // `input: true` is what lets these come through the sign-up body; they are still
      // validated server-side in the `user.create.before` hook below.
      apartmentBlock: {
        type: "number",
        required: false,
        input: true
      },
      apartmentNumber: {
        type: "number",
        required: false,
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
      },
      theme: {
        type: "string",
        required: false,
        defaultValue: DEFAULT_THEME_PREFERENCE,
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

          // The sign-up form validates these too, but that is trivially bypassable —
          // this is the check that actually enforces "apartment required at signup".
          const incoming = user as Partial<Record<"apartmentBlock" | "apartmentNumber", unknown>>;
          const apartmentBlock = parseApartmentBlock(incoming.apartmentBlock);
          const apartmentNumber = parseApartmentNumber(incoming.apartmentNumber, apartmentBlock);
          if (apartmentBlock === null || apartmentNumber === null) {
            throw new APIError("BAD_REQUEST", {
              message: createT(pendingSignupLocale)("errorApartmentRequired")
            });
          }

          return {
            data: {
              ...user,
              name: user.name?.trim() || defaultName,
              role: "member",
              showName: true,
              disabled: false,
              apartmentBlock,
              apartmentNumber,
              signupIp: pendingSignupIp,
              locale: pendingSignupLocale,
              theme: DEFAULT_THEME_PREFERENCE
            }
          };
        },
        after: async (user) => {
          await emitEvent({
            type: "user.signed_up",
            actorUserId: user.id,
            subjectUserId: user.id,
            payload: { email: user.email, source: "member" }
          });
          await refreshRegisteredUsersMetric();
        }
      }
    },
    session: {
      create: {
        after: async (session) => {
          await emitEvent({
            type: "user.signed_in",
            actorUserId: session.userId,
            subjectUserId: session.userId,
            payload: { source: "member" }
          });
        }
      }
    }
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: isEmailEnabled(),
    minPasswordLength: 8,
    sendResetPassword: async ({ user, token }) => {
      const locale = userLocale(user as Partial<Record<"locale", string>>);
      const url = `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      const { subject, html, text } = buildResetEmail(createT(locale), locale, url);
      await sendAuthEmail(
        {
          to: user.email,
          subject,
          html,
          text,
          tags: { type: "password_reset", locale },
          idempotencyKey: `password-reset-${token}`
        },
        locale
      );
    }
  },
  emailVerification: {
    sendOnSignUp: isEmailEnabled(),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url, token }) => {
      const locale = userLocale(user as Partial<Record<"locale", string>>);
      const { subject, html, text } = buildVerifyEmail(createT(locale), locale, url);
      await sendAuthEmail(
        {
          to: user.email,
          subject,
          html,
          text,
          tags: { type: "verify_email", locale },
          idempotencyKey: `verify-email-${token}`
        },
        locale
      );
    },
    afterEmailVerification: async (user: { id: string; email: string }) => {
      await emitEvent({
        type: "user.verified",
        actorUserId: user.id,
        subjectUserId: user.id,
        payload: { email: user.email, source: "member" }
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
  apartmentBlock: number | null;
  apartmentNumber: number | null;
  signupIp?: string | null;
  disabled: boolean;
  locale: Locale;
  theme: ThemePreference;
  image?: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};
