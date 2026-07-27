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

// ClientRouter's own `submit`/`click` listeners on `document` run before ours
// (its script is in <head>, attached first) and call preventDefault() on every
// navigation it takes over — including the ones we *want* to show a spinner
// for. That makes `event.defaultPrevented` useless for telling "cancelled by
// onsubmit=confirm()" apart from "handled as a soft nav". Astro only fires
// `astro:before-preparation` once it has already decided a navigation is
// really happening (confirm()-cancelled and otherwise-prevented submits never
// reach it), and its `sourceElement` is the exact submit button when the
// navigation came from a form (see astro's ClientRouter.astro: `sourceElement:
// submitter ?? form`) — so this is the correct, race-free signal to hook.
function applyButtonLoading(btn: HTMLButtonElement) {
  if (btn.dataset.loadingOriginalHtml !== undefined) return;
  const size = btn.classList.contains("btn-xs") || btn.classList.contains("btn-sm") ? "loading-xs" : "loading-sm";
  btn.dataset.loadingOriginalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.insertAdjacentHTML("afterbegin", `<span class="loading ${size} loading-spinner"></span> `);
}

function resetButtonLoadingState() {
  document.querySelectorAll<HTMLButtonElement>("[data-loading-original-html]").forEach((btn) => {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.loadingOriginalHtml ?? "";
    delete btn.dataset.loadingOriginalHtml;
  });
}

// Registered once at module load; document/window persist across Astro
// soft navigations (ClientRouter), so this keeps working without re-init.
document.addEventListener("astro:before-preparation", (e) => {
  if (e.sourceElement instanceof HTMLButtonElement) applyButtonLoading(e.sourceElement);
});
window.addEventListener("pageshow", resetButtonLoadingState);
document.addEventListener("astro:page-load", resetButtonLoadingState);

export default (Alpine: Alpine) => {
  Alpine.plugin(intersect);
  Alpine.plugin(persist);
  Alpine.plugin(collapse);
  Alpine.plugin(mask);

  Alpine.data("navProgress", () => ({
    active: false,
    progress: 0,
    timer: null as ReturnType<typeof setInterval> | null,
    start() {
      if (this.timer) clearInterval(this.timer);
      this.active = true;
      this.progress = 10;
      this.timer = setInterval(() => {
        this.progress = Math.min(this.progress + (90 - this.progress) * 0.1, 90);
      }, 200);
    },
    reset() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.active = false;
      this.progress = 0;
    },
    init() {
      // astro:before-preparation only fires once Astro has committed to a real
      // navigation (see the comment above applyButtonLoading), so it covers
      // both link and form navigations without re-deriving that filtering here.
      document.addEventListener("astro:before-preparation", () => this.start());
      document.addEventListener("astro:page-load", () => this.reset());
      window.addEventListener("pageshow", () => this.reset());
    }
  }));

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
