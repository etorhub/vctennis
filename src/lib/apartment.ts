import type { MessageKey, TFunction } from "./i18n";

/**
 * Apartment a member lives in, stored on `User.apartmentBlock` / `apartmentFloor` /
 * `apartmentDoor`. Required at sign-up and editable on `/settings`; the DB columns are
 * optional so accounts created before this feature keep working until they fill it in.
 */
export const APARTMENT_BLOCKS = [1, 2, 3, 4] as const;
export const APARTMENT_FLOORS = ["ground", "first", "second"] as const;
export const APARTMENT_DOORS = [1, 2, 3, 4] as const;

export type ApartmentBlock = (typeof APARTMENT_BLOCKS)[number];
export type ApartmentFloor = (typeof APARTMENT_FLOORS)[number];
export type ApartmentDoor = (typeof APARTMENT_DOORS)[number];

/** Apartment fields as they appear on `User` rows and `Astro.locals.user`. */
export type ApartmentFields = {
  apartmentBlock?: number | null;
  apartmentFloor?: string | null;
  apartmentDoor?: number | null;
};

const FLOOR_LABEL_KEYS: Record<ApartmentFloor, MessageKey> = {
  ground: "floorGround",
  first: "floorFirst",
  second: "floorSecond"
};

function parseOption<T extends number>(value: unknown, options: readonly T[]): T | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  return typeof n === "number" && options.includes(n as T) ? (n as T) : null;
}

export function parseApartmentBlock(value: unknown): ApartmentBlock | null {
  return parseOption(value, APARTMENT_BLOCKS);
}

export function parseApartmentDoor(value: unknown): ApartmentDoor | null {
  return parseOption(value, APARTMENT_DOORS);
}

export function parseApartmentFloor(value: unknown): ApartmentFloor | null {
  return APARTMENT_FLOORS.includes(value as ApartmentFloor) ? (value as ApartmentFloor) : null;
}

export function floorLabel(floor: ApartmentFloor, t: TFunction): string {
  return t(FLOOR_LABEL_KEYS[floor]);
}

export function hasApartment(user: ApartmentFields | null | undefined): boolean {
  if (!user) return false;
  return (
    parseApartmentBlock(user.apartmentBlock) !== null &&
    parseApartmentFloor(user.apartmentFloor) !== null &&
    parseApartmentDoor(user.apartmentDoor) !== null
  );
}

/** e.g. "Bloc 2 · Primer · 3a". Returns "—" when the apartment is not set yet. */
export function formatApartment(user: ApartmentFields | null | undefined, t: TFunction): string {
  const block = parseApartmentBlock(user?.apartmentBlock);
  const floor = parseApartmentFloor(user?.apartmentFloor);
  const door = parseApartmentDoor(user?.apartmentDoor);
  if (block === null || floor === null || door === null) return "—";
  return `${t("apartmentBlock")} ${block} · ${floorLabel(floor, t)} · ${t("apartmentDoorShort", { door })}`;
}
