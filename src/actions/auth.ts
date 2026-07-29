import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { auth as betterAuth } from "@/lib/auth";
import { APIError } from "better-auth/api";
import { deleteUserCascade } from "@/lib/users";
import { parseApartmentBlock, parseApartmentNumber } from "@/lib/apartment";
import { THEME_PREFERENCES } from "@/lib/theme";
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
      // An unchecked checkbox is absent from the form body, which Astro passes through as
      // `null` — accept it here so "hide my name" can actually be saved.
      showName: z
        .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean(), z.null()])
        .optional()
        .transform((v) => v === true || v === "on" || v === "true"),
      theme: z.enum(THEME_PREFERENCES).optional(),
      apartmentBlock: z.string().nullish(),
      apartmentNumber: z.string().nullish()
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "Sign in required" });
      }
      if (user.disabled) {
        throw new ActionError({ code: "FORBIDDEN", message: "Account disabled" });
      }

      const name = input.name.trim();
      const showName = input.showName ?? false;
      const theme = input.theme ?? user.theme;

      // Accounts created before apartments existed can leave both blank; a partial
      // apartment is always rejected so we never store half an address. A number sent
      // without a block never parses, so "block only" is the shape to reject here.
      const apartmentBlock = parseApartmentBlock(input.apartmentBlock);
      const apartmentNumber = parseApartmentNumber(input.apartmentNumber, apartmentBlock);
      if (apartmentBlock !== null && apartmentNumber === null) {
        throw new ActionError({ code: "BAD_REQUEST", message: "errorApartmentRequired" });
      }

      await db
        .update(User)
        .set({ name, showName, theme, apartmentBlock, apartmentNumber, updatedAt: new Date() })
        .where(eq(User.id, user.id));

      // Middleware loaded `locals.user` before this handler ran; refresh it so the
      // page rendered for this same POST already uses the new name/theme.
      user.name = name;
      user.showName = showName;
      user.theme = theme;
      user.apartmentBlock = apartmentBlock;
      user.apartmentNumber = apartmentNumber;

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

  deleteAccount: defineAction({
    accept: "form",
    input: z.object({
      confirmEmail: z.string().min(1).max(320)
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) {
        throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
      }
      if (user.disabled) {
        throw new ActionError({ code: "FORBIDDEN", message: "errorDisabled" });
      }

      const confirmEmail = input.confirmEmail.trim().toLowerCase();
      if (confirmEmail !== user.email.trim().toLowerCase()) {
        throw new ActionError({ code: "BAD_REQUEST", message: "errorEmailMismatch" });
      }

      const [row] = await db.select({ role: User.role }).from(User).where(eq(User.id, user.id)).limit(1);
      const role = row?.role ?? user.role;

      if (role === "admin") {
        const admins = await db.select({ id: User.id }).from(User).where(eq(User.role, "admin")).limit(2);
        if (admins.length <= 1) {
          throw new ActionError({ code: "BAD_REQUEST", message: "errorLastAdmin" });
        }
      }

      await betterAuth.api.signOut({
        headers: context.request.headers
      });

      await deleteUserCascade(user.id);

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

      await db.update(User).set({ role: "admin", updatedAt: new Date() }).where(eq(User.id, user.id));

      return { success: true };
    }
  })
};
