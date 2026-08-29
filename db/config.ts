import { defineDb, defineTable, column } from "astro:db";

const User = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    email: column.text({ unique: true }),
    name: column.text(),
    emailVerified: column.boolean({ default: false }),
    image: column.text({ optional: true }),
    role: column.text({ default: "member" }),
    showName: column.boolean({ default: true }),
    // Apartment (block + number). Required at sign-up, but optional in the schema so
    // accounts created before this feature keep working — see `src/lib/apartment.ts`.
    apartmentBlock: column.number({ optional: true }),
    apartmentNumber: column.number({ optional: true }),
    // Replaced by `apartmentNumber`; nothing reads or writes these any more. They are kept
    // one push longer because `astro db push` rejects adding and dropping columns in the
    // same table (it reads that as a rename). `deprecated: true` is the documented way out:
    // this push keeps the data so `scripts/migrate-apartment-number.js` can convert it, and
    // a follow-up push deletes these two lines to actually drop the columns.
    apartmentFloor: column.text({ optional: true, deprecated: true }),
    apartmentDoor: column.number({ optional: true, deprecated: true }),
    signupIp: column.text({ optional: true }),
    disabled: column.boolean({ default: false }),
    locale: column.text({ optional: true, default: "en" }),
    theme: column.text({ optional: true, default: "system" }),
    createdAt: column.date(),
    updatedAt: column.date()
  },
  indexes: {
    idx_user_role: { on: "role" },
    idx_user_disabled: { on: "disabled" }
  }
});

const Session = defineTable({
  columns: {
    token: column.text(),
    id: column.text({ primaryKey: true }),
    userId: column.text(),
    expiresAt: column.date(),
    ipAddress: column.text({ optional: true }),
    userAgent: column.text({ optional: true }),
    createdAt: column.date(),
    updatedAt: column.date()
  }
});

const Account = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),
    accountId: column.text({ optional: true }),
    providerId: column.text({ optional: true }),
    accessToken: column.text({ optional: true }),
    refreshToken: column.text({ optional: true }),
    idToken: column.text({ optional: true }),
    expiresAt: column.date({ optional: true }),
    password: column.text({ optional: true }),
    createdAt: column.date(),
    updatedAt: column.date()
  }
});

const Verification = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    identifier: column.text(),
    value: column.text(),
    expiresAt: column.date(),
    createdAt: column.date(),
    updatedAt: column.date()
  }
});

const Bookings = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),
    startsAt: column.date(),
    durationMin: column.number(),
    // Set when the court was released early ("end booking now"). `durationMin` keeps the
    // originally booked length; the court is only blocked until `endedAt`. Always aligned to
    // a SLOT_MINUTES boundary, so the freed time maps cleanly onto the agenda grid.
    endedAt: column.date({ optional: true }),
    createdAt: column.date(),
    reminderSentAt: column.date({ optional: true })
  },
  indexes: {
    idx_bookings_startsAt: { on: "startsAt" },
    idx_bookings_userId: { on: "userId" }
  }
});

/** Append-only domain events for ops / future Grafana. See wiki Event-logging. */
const Events = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    type: column.text(),
    actorUserId: column.text({ optional: true }),
    subjectUserId: column.text({ optional: true }),
    bookingId: column.text({ optional: true }),
    reason: column.text({ optional: true }),
    payload: column.text({ optional: true }),
    createdAt: column.date()
  }
});

const ContactMessages = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text(),
    type: column.text(),
    subject: column.text(),
    message: column.text(),
    createdAt: column.date()
  }
});

// Better Auth's database-backed rate limiter (issue #56). Column names/types
// must match `better-auth`'s built-in `rateLimit` model — see the `rateLimit`
// schema mapping passed to `drizzleAdapter` in `src/lib/auth.ts`.
const RateLimit = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    key: column.text(),
    count: column.number(),
    lastRequest: column.number()
  }
});

export default defineDb({
  tables: {
    User,
    Session,
    Account,
    Verification,
    Bookings,
    Events,
    ContactMessages,
    RateLimit
  }
});
