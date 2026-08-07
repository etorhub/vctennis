import { db, User } from "astro:db";
import { shipRegisteredUsers } from "./observability";

/** Count User rows and push `vctennis_users_registered`. Never throws. */
export async function refreshRegisteredUsersMetric(): Promise<number | null> {
  try {
    const rows = await db.select({ id: User.id }).from(User);
    const count = rows.length;
    await shipRegisteredUsers(count);
    return count;
  } catch (err) {
    console.error("Failed to refresh registered users metric:", err);
    return null;
  }
}
