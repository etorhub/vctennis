import type { Alpine } from "alpinejs";
// @ts-ignore - Has no associated types.
import intersect from "@alpinejs/intersect";
// @ts-ignore - Has no associated types.
import persist from "@alpinejs/persist";
// @ts-ignore - Has no associated types.
import collapse from "@alpinejs/collapse";
// @ts-ignore - Has no associated types.
import mask from "@alpinejs/mask";

const DISMISS_KEY = "pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Chromium/.test(ua);
  return ios && safari;
}

export default (Alpine: Alpine) => {
  Alpine.plugin(intersect);
  Alpine.plugin(persist);
  Alpine.plugin(collapse);
  Alpine.plugin(mask);

  Alpine.data("pwaInstall", () => ({
    deferredPrompt: null as BeforeInstallPromptEvent | null,
    canInstall: false,
    showIos: false,
    dismissed: false,
    get visible(): boolean {
      return !this.dismissed && (this.canInstall || this.showIos);
    },
    init() {
      if (isStandalone()) return;

      try {
        this.dismissed = localStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        /* ignore */
      }
      if (this.dismissed) return;

      if (isIosSafari()) this.showIos = true;

      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        this.deferredPrompt = event as BeforeInstallPromptEvent;
        this.canInstall = true;
        this.showIos = false;
      });

      window.addEventListener("appinstalled", () => {
        this.deferredPrompt = null;
        this.canInstall = false;
        this.showIos = false;
        this.dismissed = true;
        try {
          localStorage.setItem(DISMISS_KEY, "1");
        } catch {
          /* ignore */
        }
      });
    },
    async install() {
      if (!this.deferredPrompt) return;
      await this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      this.canInstall = false;
    },
    dismiss() {
      this.dismissed = true;
      this.canInstall = false;
      this.showIos = false;
      this.deferredPrompt = null;
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }));
};
