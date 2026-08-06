import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, Bookings, eq, and, gt } from "astro:db";
import { buildBookingEmail } from "@/lib/bookingEmail";
import { MAX_ACTIVE_BOOKINGS } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emitEvent, type BookingRejectReason } from "@/lib/events";
import {
  isAlignedSlot,
  isAllowedDuration,
  isBookingOver,
  isFuture,
  isWithinBookAhead,
  isWithinOpenHours,
  conflictsWithExisting
} from "@/lib/time";

async function rejectBooking(
  actorUserId: string | undefined,
  reason: BookingRejectReason,
  message: string,
  code: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" = "BAD_REQUEST",
  extra?: { bookingId?: string; payload?: Record<string, unknown> }
): Promise<never> {
  await emitEvent({
    type: "booking.rejected",
    actorUserId,
    bookingId: extra?.bookingId,
    reason,
    payload: extra?.payload
  });
  throw new ActionError({ code, message });
}

async function requireUser(context: { locals: App.Locals }) {
  const user = context.locals.user;
  if (!user) {
    await emitEvent({ type: "booking.rejected", reason: "unauthorized" });
    throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
  }
  if (user.disabled) {
    await emitEvent({
      type: "booking.rejected",
      actorUserId: user.id,
      reason: "disabled"
    });
    throw new ActionError({ code: "FORBIDDEN", message: "errorDisabled" });
  }
  return user;
}

async function assertNoOverlap(
  actorUserId: string,
  startsAt: Date,
  durationMin: number,
  excludeId?: string
) {
  const existing = await db.select().from(Bookings);
  if (conflictsWithExisting(startsAt, durationMin, existing, excludeId)) {
    await rejectBooking(actorUserId, "overlap", "errorOverlap", "CONFLICT", {
      bookingId: excludeId,
      payload: { startsAt: startsAt.toISOString(), durationMin }
    });
  }
}

async function validateSlot(actorUserId: string, startsAt: Date, durationMin: number) {
  if (!isAllowedDuration(durationMin)) {
    await rejectBooking(actorUserId, "invalid_slot", "errorSlot");
  }
  if (!isAlignedSlot(startsAt)) {
    await rejectBooking(actorUserId, "invalid_slot", "errorSlot");
  }
  if (!isWithinOpenHours(startsAt, durationMin)) {
    await rejectBooking(actorUserId, "outside_hours", "errorOutsideHours");
  }
  if (!isWithinBookAhead(startsAt)) {
    await rejectBooking(actorUserId, "too_far", "errorTooFar");
  }
  if (!isFuture(startsAt)) {
    await rejectBooking(actorUserId, "past", "errorPast");
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
      const user = await requireUser(context);
      const startsAt = new Date(input.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        await rejectBooking(user.id, "invalid_slot", "errorSlot");
      }
      await validateSlot(user.id, startsAt, input.durationMin);

      const active = await db
        .select()
        .from(Bookings)
        .where(and(eq(Bookings.userId, user.id), gt(Bookings.startsAt, new Date())));

      if (active.length >= MAX_ACTIVE_BOOKINGS) {
        await rejectBooking(user.id, "max_bookings", "errorMaxBookings");
      }

      await assertNoOverlap(user.id, startsAt, input.durationMin);

      const id = crypto.randomUUID();
      await db.insert(Bookings).values({
        id,
        userId: user.id,
        startsAt,
        durationMin: input.durationMin,
        createdAt: new Date()
      });

      await emitEvent({
        type: "booking.created",
        actorUserId: user.id,
        subjectUserId: user.id,
        bookingId: id,
        payload: {
          startsAt: startsAt.toISOString(),
          durationMin: input.durationMin,
          source: "member"
        }
      });

      try {
        const { subject, html, text } = buildBookingEmail(
          "confirmed",
          context.locals.t,
          context.locals.locale,
          startsAt,
          input.durationMin
        );
        await sendEmail({
          to: user.email,
          subject,
          html,
          text,
          tags: { type: "booking_confirmed", locale: context.locals.locale },
          idempotencyKey: `booking-confirmed-${id}`
        });
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
      const user = await requireUser(context);
      const rows = await db.select().from(Bookings).where(eq(Bookings.id, input.id)).limit(1);
      const booking = rows[0];
      if (!booking) {
        await rejectBooking(user.id, "not_found", "errorGeneric", "NOT_FOUND", {
          bookingId: input.id
        });
      }

      const isAdmin = user.role === "admin";
      if (isBookingOver(booking.startsAt, booking.durationMin) && !isAdmin) {
        await rejectBooking(user.id, "past", "errorPast", "BAD_REQUEST", {
          bookingId: booking.id
        });
      }

      const startsAt = new Date(input.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        await rejectBooking(user.id, "invalid_slot", "errorSlot", "BAD_REQUEST", {
          bookingId: booking.id
        });
      }
      await validateSlot(user.id, startsAt, input.durationMin);
      await assertNoOverlap(user.id, startsAt, input.durationMin, booking.id);

      await db
        .update(Bookings)
        .set({ startsAt, durationMin: input.durationMin, reminderSentAt: null })
        .where(eq(Bookings.id, booking.id));

      await emitEvent({
        type: "booking.updated",
        actorUserId: user.id,
        subjectUserId: booking.userId,
        bookingId: booking.id,
        payload: {
          beforeStartsAt: booking.startsAt.toISOString(),
          beforeDurationMin: booking.durationMin,
          startsAt: startsAt.toISOString(),
          durationMin: input.durationMin,
          source: isAdmin ? "admin" : "member"
        }
      });

      return { success: true };
    }
  }),

  delete: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1)
    }),
    handler: async (input, context) => {
      const user = await requireUser(context);
      const rows = await db.select().from(Bookings).where(eq(Bookings.id, input.id)).limit(1);
      const booking = rows[0];
      if (!booking) {
        await rejectBooking(user.id, "not_found", "errorGeneric", "NOT_FOUND", {
          bookingId: input.id
        });
      }

      const isAdmin = user.role === "admin";
      if (isBookingOver(booking.startsAt, booking.durationMin) && !isAdmin) {
        await rejectBooking(user.id, "past", "errorPast", "BAD_REQUEST", {
          bookingId: booking.id
        });
      }

      await db.delete(Bookings).where(eq(Bookings.id, booking.id));

      await emitEvent({
        type: "booking.cancelled",
        actorUserId: user.id,
        subjectUserId: booking.userId,
        bookingId: booking.id,
        payload: {
          startsAt: booking.startsAt.toISOString(),
          durationMin: booking.durationMin,
          source: isAdmin ? "admin" : "member"
        }
      });

      return { success: true };
    }
  })
};
