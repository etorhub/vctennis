/// <reference path="../.astro/types.d.ts" />
/// <reference types="@astrojs/db" />

import type { SessionUser } from "./lib/auth";
import type { Locale, TFunction } from "./lib/i18n";

declare global {
  interface Window {
    Alpine: import("alpinejs").Alpine;
  }

  namespace App {
    interface Locals {
      user: SessionUser | null;
      session: unknown;
      locale: Locale;
      t: TFunction;
    }
  }
}

interface ImportMetaEnv {
  readonly ASTRO_DB_REMOTE_URL: string;
  readonly ASTRO_DB_APP_TOKEN: string;
  readonly BETTER_AUTH_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly EMAILS_ENABLED?: string;
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly CRON_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
