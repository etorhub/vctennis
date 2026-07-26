import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { Account, db, Session, User, Verification } from "astro:db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";
import { SITE_NAME } from "./config";

const resend = new Resend(import.meta.env.RESEND_API_KEY);

/** Set per-request in the auth API route so databaseHooks can read it. */
export let pendingSignupIp: string | null = null;

export function setPendingSignupIp(ip: string | null) {
  pendingSignupIp = ip;
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
              signupIp: pendingSignupIp
            }
          };
        }
      }
    }
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
    }
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const from =
          import.meta.env.RESEND_FROM_EMAIL || "Vinya Canadell Tennis <onboarding@resend.dev>";
        const { error } = await resend.emails.send({
          from,
          to: email,
          subject: `${SITE_NAME} — sign in`,
          html: `
            <p>Click the link below to sign in to ${SITE_NAME}:</p>
            <p><a href="${url}">${url}</a></p>
            <p>This link expires soon. If you did not request it, you can ignore this email.</p>
          `
        });
        if (error) {
          console.error("Resend error:", error);
          throw new Error("Failed to send magic link email");
        }
      }
    })
  ]
});

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  showName: boolean;
  signupIp?: string | null;
  disabled: boolean;
  image?: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};
