import { THEME_COLOR } from "./config";

/** User-facing appearance choice stored on `User.theme`. */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

/** daisyUI theme names (see `tailwind.config.mjs`). */
export const LIGHT_THEME = "tennis";
export const DARK_THEME = "tennis-dark";

/** `<meta name="theme-color">` per resolved theme. */
export const LIGHT_THEME_COLOR = THEME_COLOR;
export const DARK_THEME_COLOR = "#0f172a";

export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : DEFAULT_THEME_PREFERENCE;
}

/**
 * Server-side best guess: `system` renders light and is corrected before paint
 * by the inline script in `Layout.astro`.
 */
export function resolveTheme(preference: ThemePreference): typeof LIGHT_THEME | typeof DARK_THEME {
  return preference === "dark" ? DARK_THEME : LIGHT_THEME;
}
