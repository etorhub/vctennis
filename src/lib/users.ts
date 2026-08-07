import { Account, Bookings, db, eq, Session, User } from "astro:db";
import { emitEvent, redactEventEmails } from "@/lib/events";
import { refreshRegisteredUsersMetric } from "@/lib/userMetrics";

type DeleteUserMeta = {
  actorUserId: string;
  source: "self" | "admin";
  email?: string;
};

/** Remove a user and related rows. Events stay; emails redacted, then `user.deleted` is emitted. */
export async function deleteUserCascade(userId: string, meta?: DeleteUserMeta) {
  await redactEventEmails(userId);
  if (meta) {
    await emitEvent({
      type: "user.deleted",
      actorUserId: meta.actorUserId,
      subjectUserId: userId,
      payload: {
        source: meta.source,
        ...(meta.email ? { email: meta.email } : {})
      }
    });
  }
  await db.delete(Bookings).where(eq(Bookings.userId, userId));
  await db.delete(Session).where(eq(Session.userId, userId));
  await db.delete(Account).where(eq(Account.userId, userId));
  await db.delete(User).where(eq(User.id, userId));
  await refreshRegisteredUsersMetric();
}
