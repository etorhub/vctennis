import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { auth as betterAuth } from "@/lib/auth";
import { APIError } from "better-auth/api";
import { db, eq, User } from "astro:db";

export const auth = {
  signOut: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      await betterAuth.api.signOut({
        headers: context.request.headers
      });
      return { success: true };
    }
  }),

  updateProfile: defineAction({
    accept: "form",
    input: z.object({
      name: z.string().min(1).max(80),
      showName: z
        .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
        .optional()
        .transform((v) => v === true || v === "on" || v === "true")
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "Sign in required" });
      }
      if (user.disabled) {
        throw new ActionError({ code: "FORBIDDEN", message: "Account disabled" });
      }

      await db
        .update(User)
        .set({
          name: input.name.trim(),
          showName: input.showName ?? false,
          updatedAt: new Date()
        })
        .where(eq(User.id, user.id));

      return { success: true };
    }
  }),

  changePassword: defineAction({
    accept: "form",
    input: z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
      confirmPassword: z.string().min(1)
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
      }
      if (user.disabled) {
        throw new ActionError({ code: "FORBIDDEN", message: "errorDisabled" });
      }
      if (input.newPassword !== input.confirmPassword) {
        throw new ActionError({ code: "BAD_REQUEST", message: "passwordMismatch" });
      }

      try {
        await betterAuth.api.changePassword({
          headers: context.request.headers,
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword
          }
        });
      } catch (err) {
        if (err instanceof APIError) {
          const detail = (err.body as { message?: string } | undefined)?.message ?? err.message;
          if (detail === "Invalid password") {
            throw new ActionError({ code: "BAD_REQUEST", message: "incorrectPassword" });
          }
          throw new ActionError({ code: "BAD_REQUEST", message: "errorGeneric" });
        }
        throw err;
      }

      return { success: true };
    }
  }),

  becomeAdmin: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      const user = context.locals.user;
      if (!user) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "Sign in required" });
      }

      const admins = await db.select().from(User).where(eq(User.role, "admin")).limit(1);
      if (admins.length > 0) {
        throw new ActionError({ code: "FORBIDDEN", message: "Setup unavailable" });
      }

      await db
        .update(User)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(User.id, user.id));

      return { success: true };
    }
  })
};
