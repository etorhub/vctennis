import type { MessageKey } from "./i18n";

/** Booking rules — change here, not via env vars. */
export const OPEN_HOUR = 10;
export const CLOSE_HOUR = 21;
export const BOOK_AHEAD_DAYS = 3;
export const MAX_ACTIVE_BOOKINGS = 1;
export const SLOT_MINUTES = 30;
export const ALLOWED_DURATIONS = [30, 60] as const;
export const TIMEZONE = "Europe/Madrid";
export const SITE_NAME = "Tennis Vinya Canadell";
export const THEME_COLOR = "#16a34a";
/** Hours before a booking's start time to send the reminder email. */
export const REMINDER_OFFSET_HOURS = 2;

export type AllowedDuration = (typeof ALLOWED_DURATIONS)[number];

/**
 * Court-wide closure (tournament, maintenance…): nobody can book inside it, the agenda paints it
 * as a blocked band and the home page announces it.
 *
 * `date` and the hours are **Europe/Madrid wall-clock**, never UTC — `src/lib/time.ts` materialises
 * them with `zonedDate()`. Keep a range inside a single calendar day (it is a start + duration, so a
 * range spanning a DST change would drift by an hour).
 */
export type CourtClosure = {
  /** Europe/Madrid calendar day, `YYYY-MM-DD` (same shape as `getZonedParts().dateKey`). */
  date: string;
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
  /** i18n key: the agenda block label and the home banner title. */
  labelKey: MessageKey;
};

/** Blocked ranges. Prune entries once the event is over. */
export const COURT_CLOSURES: readonly CourtClosure[] = [
  { date: "2026-08-15", startHour: 17, endHour: 21, labelKey: "closureTournament" },
  { date: "2026-08-16", startHour: 17, endHour: 21, labelKey: "closureTournament" }
];

/** How far ahead a closure is announced on the home page banner. */
export const CLOSURE_ANNOUNCE_AHEAD_DAYS = 14;
