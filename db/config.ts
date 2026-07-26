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
    signupIp: column.text({ optional: true }),
    disabled: column.boolean({ default: false }),
    locale: column.text({ optional: true, default: "en" }),
    createdAt: column.date(),
    updatedAt: column.date()
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
    createdAt: column.date(),
    reminderSentAt: column.date({ optional: true })
  }
});

export default defineDb({
  tables: {
    User,
    Session,
    Account,
    Verification,
    Bookings
  }
});
