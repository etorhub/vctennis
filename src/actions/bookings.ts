import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import { db, Bookings, eq, and, gt } from "astro:db";
import { buildBookingEmail } from "@/lib/bookingEmail";
import { ALLOWED_DURATIONS, MAX_ACTIVE_BOOKINGS } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emitEvent, type BookingRejectReason } from "@/lib/events";
import {
  earlyEndAt,
  effectiveDurationMin,
  isAlignedSlot,
  isAllowedDuration,
  isBookableStart,
  isBookingOver,
  isFuture,
  isWithinBookAhead,
  isWithinOpenHours,
  conflictsWithExisting
} from "@/lib/time";

type BookingEventSource = "member" | "admin";

async function rejectBooking(
  actorUserId: string | undefined,
  reason: BookingRejectReason,
  message: string,
  code: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" = "BAD_REQUEST",
  extra?: {
    bookingId?: string;
    source?: BookingEventSource;
    payload?: Record<string, unknown>;
  }
): Promise<never> {
  await emitEvent({
    type: "booking.rejected",
    actorUserId,
    bookingId: extra?.bookingId,
    reason,
    payload: {
      ...extra?.payload,
      source: extra?.source ?? "member"
    }
  });
  throw new ActionError({ code, message });
}

async function requireUser(context: { locals: App.Locals }) {
  const user = context.locals.user;
  if (!user) {
    await emitEvent({
      type: "booking.rejected",
      reason: "unauthorized",
      payload: { source: "member" }
    });
    throw new ActionError({ code: "UNAUTHORIZED", message: "errorUnauthorized" });
  }
  if (user.disabled) {
    await emitEvent({
      type: "booking.rejected",
      actorUserId: user.id,
      reason: "disabled",
      payload: { source: "member" }
    });
    throw new ActionError({ code: "FORBIDDEN", message: "errorDisabled" });
  }
  return user;
}

function slotPayload(startsAt: Date, durationMin: number) {
  return { startsAt: startsAt.toISOString(), durationMin };
}

async function assertNoOverlap(
  actorUserId: string,
  startsAt: Date,
  durationMin: number,
  excludeId?: string,
  source: BookingEventSource = "member"
) {
  const existing = await db.select().from(Bookings);
  if (conflictsWithExisting(startsAt, durationMin, existing, excludeId)) {
    await rejectBooking(actorUserId, "overlap", "errorOverlap", "CONFLICT", {
      bookingId: excludeId,
      source,
      payload: slotPayload(startsAt, durationMin)
    });
  }
}

async function validateSlot(
  actorUserId: string,
  startsAt: Date,
  durationMin: number,
  source: BookingEventSource = "member",
  bookingId?: string
) {
  const payload = slotPayload(startsAt, durationMin);
  if (!isAllowedDuration(durationMin)) {
    await rejectBooking(actorUserId, "invalid_slot", "errorSlot", "BAD_REQUEST", {
      bookingId,
      source,
      payload
    });
  }
  if (!isAlignedSlot(startsAt)) {
    await rejectBooking(actorUserId, "invalid_slot", "errorSlot", "BAD_REQUEST", {
      bookingId,
      source,
      payload
    });
  }
  if (!isWithinOpenHours(startsAt, durationMin)) {
    await rejectBooking(actorUserId, "outside_hours", "errorOutsideHours", "BAD_REQUEST", {
      bookingId,
      source,
      payload
    });
  }
  if (!isWithinBookAhead(startsAt)) {
    await rejectBooking(actorUserId, "too_far", "errorTooFar", "BAD_REQUEST", {
      bookingId,
      source,
      payload
    });
  }
  if (!isBookableStart(startsAt)) {
    await rejectBooking(actorUserId, "past", "errorPast", "BAD_REQUEST", {
      bookingId,
      source,
      payload
    });
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
        await rejectBooking(user.id, "invalid_slot", "errorSlot", "BAD_REQUEST", {
          payload: { durationMin: input.durationMin }
        });
      }
      await validateSlot(user.id, startsAt, input.durationMin);

      const now = new Date();
      const lookbackMs = Math.max(...ALLOWED_DURATIONS) * 60_000;
      const candidates = await db
        .select()
        .from(Bookings)
        .where(
          and(eq(Bookings.userId, user.id), gt(Bookings.startsAt, new Date(now.getTime() - lookbackMs)))
        );
      const active = candidates.filter((b) => !isBookingOver(b.startsAt, b.durationMin, now));

      if (active.length >= MAX_ACTIVE_BOOKINGS) {
        await rejectBooking(user.id, "max_bookings", "errorMaxBookings", "BAD_REQUEST", {
          payload: slotPayload(startsAt, input.durationMin)
        });
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

      // Walk-up mid-period bookings skip confirmation (start already passed).
      if (isFuture(startsAt, now)) {
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
      const source: BookingEventSource = user.role === "admin" ? "admin" : "member";
      const rows = await db.select().from(Bookings).where(eq(Bookings.id, input.id)).limit(1);
      const booking = rows[0];
      if (!booking) {
        await rejectBooking(user.id, "not_found", "errorGeneric", "NOT_FOUND", {
          bookingId: input.id,
          source
        });
      }

      const isAdmin = source === "admin";
      if (isBookingOver(booking.startsAt, booking.durationMin) && !isAdmin) {
        await rejectBooking(user.id, "past", "errorPast", "BAD_REQUEST", {
          bookingId: booking.id,
          source,
          payload: slotPayload(booking.startsAt, booking.durationMin)
        });
      }
      // Ending is final: the freed time may already belong to someone else.
      if (booking.endedAt) {
        await rejectBooking(user.id, "already_ended", "errorAlreadyEnded", "BAD_REQUEST", {
          bookingId: booking.id,
          source,
          payload: slotPayload(booking.startsAt, booking.durationMin)
        });
      }

      const startsAt = new Date(input.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        await rejectBooking(user.id, "invalid_slot", "errorSlot", "BAD_REQUEST", {
          bookingId: booking.id,
          source,
          payload: { durationMin: input.durationMin }
        });
      }
      await validateSlot(user.id, startsAt, input.durationMin, source, booking.id);
      await assertNoOverlap(user.id, startsAt, input.durationMin, booking.id, source);

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
          source
        }
      });

      return { success: true };
    }
  }),

  /**
   * Release the rest of an in-progress booking. The row is kept (so it still counts towards
   * MAX_ACTIVE_BOOKINGS until its original end) and `endedAt` marks how far the court stays
   * blocked: the start of the SLOT_MINUTES cell in progress. Everything after that reads as free
   * through `conflictsWithExisting`, so the freed time can be booked normally and can never
   * overlap the shortened booking.
   */
  end: defineAction({
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
      const source: BookingEventSource = isAdmin && booking.userId !== user.id ? "admin" : "member";
      if (booking.userId !== user.id && !isAdmin) {
        await rejectBooking(user.id, "forbidden", "errorUnauthorized", "FORBIDDEN", {
          bookingId: booking.id,
          source
        });
      }

      const payload = slotPayload(booking.startsAt, booking.durationMin);
      if (booking.endedAt) {
        await rejectBooking(user.id, "already_ended", "errorAlreadyEnded", "BAD_REQUEST", {
          bookingId: booking.id,
          source,
          payload
        });
      }

      const now = new Date();
      // Only a running booking can be ended; a future one is cancelled instead.
      if (isFuture(booking.startsAt, now)) {
        await rejectBooking(user.id, "not_started", "errorNotStarted", "BAD_REQUEST", {
          bookingId: booking.id,
          source,
          payload
        });
      }
      if (isBookingOver(booking.startsAt, booking.durationMin, now)) {
        await rejectBooking(user.id, "past", "errorPast", "BAD_REQUEST", {
          bookingId: booking.id,
          source,
          payload
        });
      }

      const endedAt = earlyEndAt(booking.startsAt, booking.durationMin, now);
      await db.update(Bookings).set({ endedAt }).where(eq(Bookings.id, booking.id));

      const playedMin = effectiveDurationMin({ ...booking, endedAt });
      await emitEvent({
        type: "booking.ended",
        actorUserId: user.id,
        subjectUserId: booking.userId,
        bookingId: booking.id,
        payload: {
          startsAt: booking.startsAt.toISOString(),
          durationMin: booking.durationMin,
          endedAt: endedAt.toISOString(),
          playedMin,
          freedMin: booking.durationMin - playedMin,
          source
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
      const source: BookingEventSource = user.role === "admin" ? "admin" : "member";
      const rows = await db.select().from(Bookings).where(eq(Bookings.id, input.id)).limit(1);
      const booking = rows[0];
      if (!booking) {
        await rejectBooking(user.id, "not_found", "errorGeneric", "NOT_FOUND", {
          bookingId: input.id,
          source
        });
      }

      const isAdmin = source === "admin";
      if (isBookingOver(booking.startsAt, booking.durationMin) && !isAdmin) {
        await rejectBooking(user.id, "past", "errorPast", "BAD_REQUEST", {
          bookingId: booking.id,
          source,
          payload: slotPayload(booking.startsAt, booking.durationMin)
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
          source
        }
      });

      return { success: true };
    }
  })
};
