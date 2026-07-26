import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, Bookings, eq, User } from "astro:db";

function requireAdmin(context: { locals: App.Locals }) {
  const user = context.locals.user;
  if (!user) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
  }
  if (user.role !== "admin") {
    throw new ActionError({ code: "FORBIDDEN", message: "errorForbidden" });
  }
  return user;
}

export const admin = {
  setRole: defineAction({
    accept: "form",
    input: z.object({
      userId: z.string().min(1),
      role: z.enum(["member", "admin"])
    }),
    handler: async (input, context) => {
      const adminUser = requireAdmin(context);
      if (input.userId === adminUser.id && input.role !== "admin") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "You cannot demote yourself."
        });
      }
      await db
        .update(User)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(User.id, input.userId));
      return { success: true };
    }
  }),

  setDisabled: defineAction({
    accept: "form",
    input: z.object({
      userId: z.string().min(1),
      disabled: z.enum(["true", "false"])
    }),
    handler: async (input, context) => {
      const adminUser = requireAdmin(context);
      if (input.userId === adminUser.id) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "You cannot disable yourself."
        });
      }
      await db
        .update(User)
        .set({ disabled: input.disabled === "true", updatedAt: new Date() })
        .where(eq(User.id, input.userId));
      return { success: true };
    }
  }),

  deleteUser: defineAction({
    accept: "form",
    input: z.object({
      userId: z.string().min(1)
    }),
    handler: async (input, context) => {
      const adminUser = requireAdmin(context);
      if (input.userId === adminUser.id) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "You cannot delete yourself."
        });
      }
      await db.delete(Bookings).where(eq(Bookings.userId, input.userId));
      await db.delete(User).where(eq(User.id, input.userId));
      return { success: true };
    }
  }),

  deleteBooking: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1)
    }),
    handler: async (input, context) => {
      requireAdmin(context);
      await db.delete(Bookings).where(eq(Bookings.id, input.id));
      return { success: true };
    }
  })
};
