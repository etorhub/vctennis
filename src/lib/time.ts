import {
  ALLOWED_DURATIONS,
  BOOK_AHEAD_DAYS,
  CLOSE_HOUR,
  OPEN_HOUR,
  SLOT_MINUTES,
  TIMEZONE,
  type AllowedDuration
} from "./config";

/** Instant representing local wall-clock time in Europe/Madrid. */
export function zonedDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const iso = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:00`;
  // Interpret as Madrid local via Intl offset lookup
  const asUtc = new Date(`${iso}Z`);
  const offsetMin = getTimeZoneOffsetMinutes(asUtc, TIMEZONE);
  return new Date(asUtc.getTime() - offsetMin * 60_000);
}

function pad(n: number, len: number) {
  return String(n).padStart(len, "0");
}

/** Offset of timezone at given instant, in minutes east of UTC (e.g. CET = 60). */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - date.getTime()) / 60_000;
}

export function getZonedParts(date: Date) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    weekday: parts.weekday as string,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`
  };
}

export function startOfZonedDay(date = new Date()): Date {
  const p = getZonedParts(date);
  return zonedDate(p.year, p.month, p.day, 0, 0);
}

export function addZonedDays(date: Date, days: number): Date {
  const p = getZonedParts(date);
  // Use noon UTC trick-safe path: construct via local parts + day offset on UTC calendar of those parts
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day + days, 12, 0, 0));
  const bp = getZonedParts(base);
  // Re-anchor to the intended calendar day in Madrid
  return zonedDate(bp.year, bp.month, bp.day, p.hour, p.minute);
}

export function bookingEnd(startsAt: Date, durationMin: number): Date {
  return new Date(startsAt.getTime() + durationMin * 60_000);
}

export function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ca" ? "ca-ES" : "en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function formatFullDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ca" ? "ca-ES" : "en-GB", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

export function formatDayHeader(date: Date, locale: string, labels: { today: string; tomorrow: string }): string {
  const today = startOfZonedDay();
  const tomorrow = addZonedDays(today, 1);
  const dayStart = startOfZonedDay(date);
  const dateFmt = formatFullDate(date, locale);

  if (dayStart.getTime() === today.getTime()) return `${labels.today} · ${dateFmt}`;
  if (dayStart.getTime() === tomorrow.getTime()) return `${labels.tomorrow} · ${dateFmt}`;
  return dateFmt;
}

export function isAlignedSlot(date: Date): boolean {
  const { minute } = getZonedParts(date);
  return minute % SLOT_MINUTES === 0;
}

export function isAllowedDuration(n: number): n is AllowedDuration {
  return (ALLOWED_DURATIONS as readonly number[]).includes(n);
}

export function isWithinOpenHours(startsAt: Date, durationMin: number): boolean {
  const start = getZonedParts(startsAt);
  const end = getZonedParts(bookingEnd(startsAt, durationMin));
  if (start.hour < OPEN_HOUR) return false;
  // End must be <= CLOSE_HOUR on same calendar day
  if (end.dateKey !== start.dateKey) return false;
  const endMinutes = end.hour * 60 + end.minute;
  return endMinutes <= CLOSE_HOUR * 60;
}

export function isWithinBookAhead(startsAt: Date, now = new Date()): boolean {
  // Same sliding window as agendaDays (skips today when no slots remain)
  const days = agendaDays(now);
  const lastDay = days[days.length - 1];
  const p = getZonedParts(lastDay);
  const endOfLast = zonedDate(p.year, p.month, p.day, CLOSE_HOUR, 0);
  return startsAt.getTime() <= endOfLast.getTime() && isBookableStart(startsAt, now);
}

export function isFuture(startsAt: Date, now = new Date()): boolean {
  return startsAt.getTime() > now.getTime();
}

/** True once a booking's end time has passed. */
export function isBookingOver(startsAt: Date, durationMin: number, now = new Date()): boolean {
  return bookingEnd(startsAt, durationMin).getTime() <= now.getTime();
}

/**
 * True while the start's first SLOT_MINUTES cell is still running or in the future.
 * Allows walk-up booking of the current in-progress :00/:30 period (e.g. 16:40 → 16:30).
 */
export function isBookableStart(startsAt: Date, now = new Date()): boolean {
  return !isBookingOver(startsAt, SLOT_MINUTES, now);
}

/** Start of the SLOT_MINUTES cell containing `date` (e.g. 16:47 -> 16:30). */
export function slotStartFor(date: Date): Date {
  const p = getZonedParts(date);
  return zonedDate(p.year, p.month, p.day, p.hour, p.minute - (p.minute % SLOT_MINUTES));
}

/**
 * Instant a booking ends when released now: the start of the SLOT_MINUTES cell in progress,
 * clamped to the booking's own start and end. Ending inside the first cell returns `startsAt`,
 * i.e. the whole booking is freed.
 */
export function earlyEndAt(startsAt: Date, durationMin: number, now = new Date()): Date {
  const boundary = slotStartFor(now).getTime();
  const end = bookingEnd(startsAt, durationMin).getTime();
  return new Date(Math.min(Math.max(boundary, startsAt.getTime()), end));
}

export type EndableBooking = {
  startsAt: Date;
  durationMin: number;
  /** Set when the booking was ended early; the court is free from this instant on. */
  endedAt?: Date | null;
};

/**
 * Minutes the court is actually blocked. Equals `durationMin` unless the booking was ended
 * early, in which case only the elapsed (slot-aligned) part still blocks the court. `0` means
 * the whole booking was released and it no longer occupies the agenda.
 */
export function effectiveDurationMin(booking: EndableBooking): number {
  if (!booking.endedAt) return booking.durationMin;
  const elapsed = Math.round((booking.endedAt.getTime() - booking.startsAt.getTime()) / 60_000);
  return Math.min(booking.durationMin, Math.max(0, elapsed));
}

/** End instant the court is blocked until — earlier than the booked end when ended early. */
export function effectiveEnd(booking: EndableBooking): Date {
  return bookingEnd(booking.startsAt, effectiveDurationMin(booking));
}

/** Minutes released back to the agenda by ending early (0 when not ended). */
export function freedMinutes(booking: EndableBooking): number {
  return booking.endedAt ? booking.durationMin - effectiveDurationMin(booking) : 0;
}

/** True while the booking is running: started, not ended early, not over. */
export function isBookingInProgress(booking: EndableBooking, now = new Date()): boolean {
  if (booking.startsAt.getTime() > now.getTime()) return false;
  if (booking.endedAt) return false;
  return !isBookingOver(booking.startsAt, booking.durationMin, now);
}

export function rangesOverlap(aStart: Date, aDuration: number, bStart: Date, bDuration: number): boolean {
  if (aDuration <= 0 || bDuration <= 0) return false;
  const aEnd = bookingEnd(aStart, aDuration).getTime();
  const bEnd = bookingEnd(bStart, bDuration).getTime();
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}

export type BookingInterval = EndableBooking & {
  id?: string;
};

/**
 * True if `startsAt`+`durationMin` overlaps any existing booking (optionally skipping one id).
 * Bookings ended early only block their elapsed part, so released time reads as free here — this
 * is the single check every booking path goes through, so freed time can never double-book.
 */
export function conflictsWithExisting(
  startsAt: Date,
  durationMin: number,
  existing: BookingInterval[],
  excludeId?: string
): boolean {
  return existing.some(
    (b) =>
      (!excludeId || b.id !== excludeId) &&
      rangesOverlap(startsAt, durationMin, b.startsAt, effectiveDurationMin(b))
  );
}

export function agendaDays(now = new Date()): Date[] {
  const today = startOfZonedDay(now);
  // After the last bookable slot today, start from tomorrow (sliding BOOK_AHEAD_DAYS window)
  const start =
    slotOptionsForDay(today, now).length === 0 ? addZonedDays(today, 1) : today;
  return Array.from({ length: BOOK_AHEAD_DAYS }, (_, i) => addZonedDays(start, i));
}

export function hourLabels(): number[] {
  return Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => OPEN_HOUR + i);
}

export type SlotOptions = {
  /** Required duration that must fit open hours and not overlap (default 30). */
  durationMin?: number;
  existing?: BookingInterval[];
  excludeId?: string;
};

/**
 * Bookable start times for a day. Fully elapsed grid starts and overlaps (for the given duration) are excluded.
 * The current in-progress SLOT_MINUTES cell remains bookable. Default duration 30 lists every start
 * where a 30‑minute booking would fit.
 */
export function slotOptionsForDay(day: Date, now = new Date(), options: SlotOptions = {}): Date[] {
  const durationMin = options.durationMin ?? 30;
  const p = getZonedParts(day);
  const slots: Date[] = [];
  for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      const slot = zonedDate(p.year, p.month, p.day, hour, minute);
      if (!isWithinOpenHours(slot, durationMin)) continue;
      if (!isBookableStart(slot, now)) continue;
      if (
        options.existing &&
        conflictsWithExisting(slot, durationMin, options.existing, options.excludeId)
      ) {
        continue;
      }
      slots.push(slot);
    }
  }
  return slots;
}
