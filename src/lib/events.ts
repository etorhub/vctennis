import { db, Events, eq, or } from "astro:db";
import { shipEventObservability } from "./observability";

export const EVENT_TYPES = [
  "booking.created",
  "booking.updated",
  "booking.cancelled",
  "booking.ended",
  "booking.rejected",
  "user.signed_up",
  "user.verified",
  "user.signed_in",
  "user.signed_out",
  "user.profile_updated",
  "user.password_changed",
  "user.password_change_rejected",
  "user.deleted",
  "user.disabled",
  "user.enabled",
  "user.role_changed",
  "user.became_admin",
  "reminder.sent",
  "reminder.failed",
  "contact.submitted"
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type BookingRejectReason =
  | "overlap"
  | "max_bookings"
  | "outside_hours"
  | "too_far"
  | "past"
  | "not_started"
  | "already_ended"
  | "invalid_slot"
  | "cutoff"
  | "unauthorized"
  | "disabled"
  | "forbidden"
  | "not_found";

export type EventPayload = Record<string, unknown>;

export type EmitEventInput = {
  type: EventType;
  actorUserId?: string | null;
  subjectUserId?: string | null;
  bookingId?: string | null;
  reason?: string | null;
  payload?: EventPayload | null;
};

/** Persist a domain event. Never throws — logging must not break mutations. */
export async function emitEvent(input: EmitEventInput): Promise<void> {
  try {
    await db.insert(Events).values({
      id: crypto.randomUUID(),
      type: input.type,
      actorUserId: input.actorUserId ?? undefined,
      subjectUserId: input.subjectUserId ?? undefined,
      bookingId: input.bookingId ?? undefined,
      reason: input.reason ?? undefined,
      payload: input.payload ? JSON.stringify(input.payload) : undefined,
      createdAt: new Date()
    });
    await shipEventObservability(input);
  } catch (err) {
    console.error("Failed to emit event:", input.type, err);
  }
}

/** Strip `email` from event payloads for a deleted user (rows kept anonymized). */
export async function redactEventEmails(userId: string): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(Events)
      .where(or(eq(Events.actorUserId, userId), eq(Events.subjectUserId, userId)));

    for (const row of rows) {
      if (!row.payload) continue;
      let parsed: EventPayload;
      try {
        parsed = JSON.parse(row.payload) as EventPayload;
      } catch {
        continue;
      }
      if (!("email" in parsed)) continue;
      const { email: _email, ...rest } = parsed;
      await db
        .update(Events)
        .set({ payload: JSON.stringify(rest) })
        .where(eq(Events.id, row.id));
    }
  } catch (err) {
    console.error("Failed to redact event emails for user:", userId, err);
  }
}
