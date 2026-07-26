/** Booking rules — change here, not via env vars. */
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 21;
export const BOOK_AHEAD_DAYS = 3;
export const MAX_ACTIVE_BOOKINGS = 3;
export const SLOT_MINUTES = 30;
export const ALLOWED_DURATIONS = [30, 60] as const;
export const TIMEZONE = "Europe/Madrid";
export const SITE_NAME = "Vinya Canadell Tennis";
export const THEME_COLOR = "#16a34a";

export type AllowedDuration = (typeof ALLOWED_DURATIONS)[number];
