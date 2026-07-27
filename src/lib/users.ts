import { Account, Bookings, db, eq, Session, User } from "astro:db";

/** Remove a user and all related rows (no FK cascades in schema). */
export async function deleteUserCascade(userId: string) {
  await db.delete(Bookings).where(eq(Bookings.userId, userId));
  await db.delete(Session).where(eq(Session.userId, userId));
  await db.delete(Account).where(eq(Account.userId, userId));
  await db.delete(User).where(eq(User.id, userId));
}
