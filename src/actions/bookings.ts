import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, Bookings, eq, and, gt } from "astro:db";
import { buildBookingEmail } from "@/lib/bookingEmail";
import { MAX_ACTIVE_BOOKINGS } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import {
  isAlignedSlot,
  isAllowedDuration,
  isFuture,
  isWithinBookAhead,
  isWithinOpenHours,
  rangesOverlap
} from "@/lib/time";

function requireUser(context: { locals: App.Locals }) {
  const user = context.locals.user;
  if (!user) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
  }
  if (user.disabled) {
    throw new ActionError({ code: "FORBIDDEN", message: "errorDisabled" });
  }
  return user;
}

async function assertNoOverlap(startsAt: Date, durationMin: number, excludeId?: string) {
  const existing = await db.select().from(Bookings);
  for (const b of existing) {
    if (excludeId && b.id === excludeId) continue;
    if (rangesOverlap(startsAt, durationMin, b.startsAt, b.durationMin)) {
      throw new ActionError({ code: "CONFLICT", message: "errorOverlap" });
    }
  }
}

function validateSlot(startsAt: Date, durationMin: number) {
  if (!isAllowedDuration(durationMin)) {
    throw new ActionError({ code: "BAD_REQUEST", message: "errorSlot" });
  }
  if (!isAlignedSlot(startsAt)) {
    throw new ActionError({ code: "BAD_REQUEST", message: "errorSlot" });
  }
  if (!isWithinOpenHours(startsAt, durationMin)) {
    throw new ActionError({ code: "BAD_REQUEST", message: "errorOutsideHours" });
  }
  if (!isWithinBookAhead(startsAt)) {
    throw new ActionError({ code: "BAD_REQUEST", message: "errorTooFar" });
  }
  if (!isFuture(startsAt)) {
    throw new ActionError({ code: "BAD_REQUEST", message: "errorPast" });
  }
}

export const bookings = {
  create: defineAction({
    accept: "form",
    input: z.object({
      startsAt: z.string().min(1),
      durationMin: z.coerce.number().int()
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const startsAt = new Date(input.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        throw new ActionError({ code: "BAD_REQUEST", message: "errorSlot" });
      }
      validateSlot(startsAt, input.durationMin);

      const active = await db
        .select()
        .from(Bookings)
        .where(and(eq(Bookings.userId, user.id), gt(Bookings.startsAt, new Date())));

      if (active.length >= MAX_ACTIVE_BOOKINGS) {
        throw new ActionError({ code: "BAD_REQUEST", message: "errorMaxBookings" });
      }

      await assertNoOverlap(startsAt, input.durationMin);

      const id = crypto.randomUUID();
      await db.insert(Bookings).values({
        id,
        userId: user.id,
        startsAt,
        durationMin: input.durationMin,
        createdAt: new Date()
      });

      try {
        const { subject, html } = buildBookingEmail(
          "confirmed",
          context.locals.t,
          context.locals.locale,
          startsAt,
          input.durationMin
        );
        await sendEmail({ to: user.email, subject, html });
      } catch (err) {
        console.error("Failed to send booking confirmation email:", err);
      }

      return { success: true, id };
    }
  }),

  update: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1),
      startsAt: z.string().min(1),
      durationMin: z.coerce.number().int()
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const rows = await db.select().from(Bookings).where(eq(Bookings.id, input.id)).limit(1);
      const booking = rows[0];
      if (!booking) {
        throw new ActionError({ code: "NOT_FOUND", message: "errorGeneric" });
      }

      const isOwner = booking.userId === user.id;
      const isAdmin = user.role === "admin";
      if (!isOwner && !isAdmin) {
        throw new ActionError({ code: "FORBIDDEN", message: "errorForbidden" });
      }
      if (!isFuture(booking.startsAt) && !isAdmin) {
        throw new ActionError({ code: "BAD_REQUEST", message: "errorPast" });
      }

      const startsAt = new Date(input.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        throw new ActionError({ code: "BAD_REQUEST", message: "errorSlot" });
      }
      validateSlot(startsAt, input.durationMin);
      await assertNoOverlap(startsAt, input.durationMin, booking.id);

      await db
        .update(Bookings)
        .set({ startsAt, durationMin: input.durationMin, reminderSentAt: null })
        .where(eq(Bookings.id, booking.id));

      return { success: true };
    }
  }),

  delete: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1)
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const rows = await db.select().from(Bookings).where(eq(Bookings.id, input.id)).limit(1);
      const booking = rows[0];
      if (!booking) {
        throw new ActionError({ code: "NOT_FOUND", message: "errorGeneric" });
      }

      const isOwner = booking.userId === user.id;
      const isAdmin = user.role === "admin";
      if (!isOwner && !isAdmin) {
        throw new ActionError({ code: "FORBIDDEN", message: "errorForbidden" });
      }
      if (!isFuture(booking.startsAt) && !isAdmin) {
        throw new ActionError({ code: "BAD_REQUEST", message: "errorPast" });
      }

      await db.delete(Bookings).where(eq(Bookings.id, booking.id));
      return { success: true };
    }
  })
};
