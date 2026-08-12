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
