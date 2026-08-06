import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, Bookings, eq, User } from "astro:db";
import { emitEvent } from "@/lib/events";
import { deleteUserCascade } from "@/lib/users";

async function requireAdmin(context: { locals: App.Locals }) {
  const user = context.locals.user;
  if (!user) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
  }
  // Prefer DB role — session/cookie can lag after /setup or setRole.
  const [row] = await db
    .select({ role: User.role })
    .from(User)
    .where(eq(User.id, user.id))
    .limit(1);
  if ((row?.role ?? user.role) !== "admin") {
    throw new ActionError({ code: "FORBIDDEN", message: "errorForbidden" });
  }
  return user;
}

async function loadUserEmail(userId: string): Promise<string | undefined> {
  const [row] = await db.select({ email: User.email }).from(User).where(eq(User.id, userId)).limit(1);
  return row?.email;
}

export const admin = {
  setRole: defineAction({
    accept: "form",
    input: z.object({
      userId: z.string().min(1),
      role: z.enum(["member", "admin"])
    }),
    handler: async (input, context) => {
      const adminUser = await requireAdmin(context);
      if (input.userId === adminUser.id && input.role !== "admin") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "You cannot demote yourself."
        });
      }
      const email = await loadUserEmail(input.userId);
      await db
        .update(User)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(User.id, input.userId));
      await emitEvent({
        type: "user.role_changed",
        actorUserId: adminUser.id,
        subjectUserId: input.userId,
        payload: { role: input.role, ...(email ? { email } : {}) }
      });
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
      const adminUser = await requireAdmin(context);
      if (input.userId === adminUser.id) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "You cannot disable yourself."
        });
      }
      const disabled = input.disabled === "true";
      const email = await loadUserEmail(input.userId);
      await db
        .update(User)
        .set({ disabled, updatedAt: new Date() })
        .where(eq(User.id, input.userId));
      await emitEvent({
        type: disabled ? "user.disabled" : "user.enabled",
        actorUserId: adminUser.id,
        subjectUserId: input.userId,
        payload: { ...(email ? { email } : {}) }
      });
      return { success: true };
    }
  }),

  deleteUser: defineAction({
    accept: "form",
    input: z.object({
      userId: z.string().min(1)
    }),
    handler: async (input, context) => {
      const adminUser = await requireAdmin(context);
      if (input.userId === adminUser.id) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "You cannot delete yourself."
        });
      }
      const email = await loadUserEmail(input.userId);
      await deleteUserCascade(input.userId, {
        actorUserId: adminUser.id,
        source: "admin",
        email
      });
      return { success: true };
    }
  }),

  deleteBooking: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1)
    }),
    handler: async (input, context) => {
      const adminUser = await requireAdmin(context);
      const rows = await db.select().from(Bookings).where(eq(Bookings.id, input.id)).limit(1);
      const booking = rows[0];
      await db.delete(Bookings).where(eq(Bookings.id, input.id));
      if (booking) {
        await emitEvent({
          type: "booking.cancelled",
          actorUserId: adminUser.id,
          subjectUserId: booking.userId,
          bookingId: booking.id,
          payload: {
            startsAt: booking.startsAt.toISOString(),
            durationMin: booking.durationMin,
            source: "admin"
          }
        });
      }
      return { success: true };
    }
  })
};
