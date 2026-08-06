import type { TFunction } from "./i18n";

/**
 * Apartment a member lives in, stored on `User.apartmentBlock` / `User.apartmentNumber`.
 * Required at sign-up and editable on `/profile`; the DB columns are optional so accounts
 * created before this feature keep working until they fill it in.
 */
export const APARTMENT_BLOCKS = [1, 2, 3, 4] as const;

export type ApartmentBlock = (typeof APARTMENT_BLOCKS)[number];

/** Block 1 is the big one; the rest have nine apartments each. */
export const APARTMENTS_PER_BLOCK: Record<ApartmentBlock, number> = {
  1: 12,
  2: 9,
  3: 9,
  4: 9
};

/** Apartment fields as they appear on `User` rows and `Astro.locals.user`. */
export type ApartmentFields = {
  apartmentBlock?: number | null;
  apartmentNumber?: number | null;
};

/** Valid apartment numbers in a block, e.g. `[1..9]` for block 2. */
export function apartmentNumbersForBlock(block: ApartmentBlock): number[] {
  return Array.from({ length: APARTMENTS_PER_BLOCK[block] }, (_, i) => i + 1);
}

function parseOption<T extends number>(value: unknown, options: readonly T[]): T | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && options.includes(n as T) ? (n as T) : null;
}

export function parseApartmentBlock(value: unknown): ApartmentBlock | null {
  return parseOption(value, APARTMENT_BLOCKS);
}

/**
 * A number only means anything alongside its block — 11 is a real apartment in block 1 and
 * nowhere else — so the block is always required here.
 */
export function parseApartmentNumber(value: unknown, block: ApartmentBlock | null): number | null {
  if (block === null) return null;
  return parseOption(value, apartmentNumbersForBlock(block));
}

export function hasApartment(user: ApartmentFields | null | undefined): boolean {
  if (!user) return false;
  const block = parseApartmentBlock(user.apartmentBlock);
  return parseApartmentNumber(user.apartmentNumber, block) !== null;
}

/** e.g. "Bloc 2 · Apt. 7". Returns "—" when the apartment is not set yet. */
export function formatApartment(user: ApartmentFields | null | undefined, t: TFunction): string {
  const block = parseApartmentBlock(user?.apartmentBlock);
  const number = parseApartmentNumber(user?.apartmentNumber, block);
  if (block === null || number === null) return "—";
  return `${t("apartmentBlock")} ${block} · ${t("apartmentShort", { number })}`;
}
