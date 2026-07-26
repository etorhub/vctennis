import { ca } from "./ca";
import { en, type Dictionary, type MessageKey } from "./en";

export type Locale = "ca" | "en";
export type { Dictionary, MessageKey };

const dictionaries: Record<Locale, Dictionary> = { ca, en };

/** ca/es → Catalan; everything else → English */
export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return "en";
  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of preferred) {
    if (tag.startsWith("ca") || tag.startsWith("es")) return "ca";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function createT(locale: Locale): TFunction {
  const dict = getDictionary(locale);
  return (key, vars) => {
    let text: string = dict[key] ?? en[key] ?? String(key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  };
}
