const btnMenu = document.querySelector(".btn-burger");
const sidebar = document.querySelector(".sidebar");
const btnMenuAnchors = document.querySelectorAll(".sidebar a");
const header = document.querySelector("header");
let closeBtnOn = false;

// --------------------------
// Gallery pages (index / intern): always start at top on refresh
// --------------------------
const isGalleryPage = Boolean(
  document.querySelector(".cards, .cards-single-column")
);
if (isGalleryPage) {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  window.scrollTo(0, 0);
  window.addEventListener("load", () => window.scrollTo(0, 0), { once: true });
}

// --------------------------
// Keep --nav-height in sync with the fixed nav bar
// (used as margin-top for main / .page-thumbnail)
// --------------------------
function syncNavHeight() {
  // Measure the fixed header (not only nav) so main clears the full bar
  const header = document.querySelector("header");
  if (!header) return;
  const height = Math.ceil(header.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--nav-height", `${height}px`);
}

syncNavHeight();
window.addEventListener("resize", syncNavHeight);
if (document.fonts?.ready) {
  document.fonts.ready.then(syncNavHeight);
}

// --------------------------
// Mobile menu
// --------------------------
if (btnMenu && sidebar) {
  btnMenu.addEventListener("click", () => {
    sidebar.classList.toggle("no-display");
    // btnMenu.innerHTML = `<i class="ph ph-x"></i>`;
  });
}

btnMenuAnchors.forEach((btnMenuAnchor) => {
  btnMenuAnchor.addEventListener("click", () => {
    sidebar?.classList.add("no-display");
  });
});

// --------------------------
// Disabled-link toaster
// --------------------------
const DISABLED_LINK_TOAST_MESSAGE =
  "This project isn't fully available yet. Please come back later.";

function ensureToastStyles() {
  if (document.getElementById("toast-styles")) return;
  const style = document.createElement("style");
  style.id = "toast-styles";
  style.textContent = `
    .toast-container{
      position: fixed;
      left: 50%;
      bottom: 34px;
      transform: translateX(-50%);
      width: min(560px, calc(100vw - 32px));
      z-index: 9999;
      pointer-events: none;
    }
    .toast{
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 18px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(246, 246, 246, 1.0);
      color: #fff;
      box-shadow: 0 12px 40px rgba(0,0,0,.35);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      font: 500 14px/1.35 "Geist", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      animation: toast-in 160ms ease-out;
    }
    .toast__message{ flex: 1; }
    .toast__close{
      appearance: none;
      border: none;
      background: transparent;
      color: black;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 8px;
      font: inherit;
      opacity: .85;
    }
    .toast__close:hover{ opacity: 1; background: rgba(255,255,255,.08); }
    .toast--out{ animation: toast-out 140ms ease-in forwards; }
    @keyframes toast-in{
      from { transform: translateY(8px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes toast-out{
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(8px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

function getToastContainer() {
  let container = document.querySelector(".toast-container");
  if (container) return container;

  container = document.createElement("div");
  container.className = "toast-container";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "true");
  document.body.appendChild(container);
  return container;
}

function showToast(message, { durationMs = 3200 } = {}) {
  ensureToastStyles();
  const container = getToastContainer();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");

  const msg = document.createElement("div");
  msg.className = "toast__message";
  msg.textContent = message;

  const close = document.createElement("button");
  close.className = "toast__close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "×";

  const removeToast = () => {
    if (!toast.isConnected) return;
    toast.classList.add("toast--out");
    window.setTimeout(() => toast.remove(), 170);
  };

  close.addEventListener("click", removeToast);
  toast.addEventListener("click", removeToast);

  toast.appendChild(msg);
  toast.appendChild(close);
  container.appendChild(toast);

  window.setTimeout(removeToast, durationMs);
}

document.addEventListener("click", (e) => {
  const link = e.target.closest?.(".disabled-link");
  if (!link) return;

  e.preventDefault();
  showToast(DISABLED_LINK_TOAST_MESSAGE);
});

// --------------------------
// Thumbnail CTAs: for any thumbnail that has a "Visit site" button AND whose
// card links to its own project page, stack a "Project details" button above
// "Visit site". Runs generically, so future cards using the same markup
// (a project-page link wrapping a .card-thumbnail that contains .btn-visit-site)
// get the second button automatically — no per-card markup needed.
// --------------------------
(() => {
  document.querySelectorAll(".btn-visit-site").forEach((visitBtn) => {
    // Already wrapped (idempotent / avoids double-processing)
    if (visitBtn.closest(".thumbnail-cta")) return;

    const parent = visitBtn.parentNode;
    if (!parent) return;

    const group = document.createElement("div");
    group.className = "thumbnail-cta";
    parent.insertBefore(group, visitBtn);

    // The card's own project-page link (the anchor that isn't the visit button)
    const card = visitBtn.closest(".card");
    const projectLink = card?.querySelector('a[href]:not(.btn-visit-site)');
    const href = projectLink?.getAttribute("href");

    if (href) {
      const detailsBtn = document.createElement("a");
      detailsBtn.className = "btn-visit-site btn-project-details";
      detailsBtn.href = href;
      // Mirror "coming soon" behaviour if the project page is gated
      if (projectLink.classList.contains("disabled-link")) {
        detailsBtn.classList.add("disabled-link");
      }
      detailsBtn.innerHTML =
        '<i class="ph-bold ph-arrow-right icon-cta-lead" aria-hidden="true"></i>Project details';
      group.appendChild(detailsBtn);
    }

    group.appendChild(visitBtn);
  });
})();

// --------------------------
// Fullscreen page loader (index.html)
// Waits for page load + 3D logo, then holds briefly so the
// rotation is visible. Safety timeout prevents a stuck overlay.
// --------------------------
(() => {
  const loader = document.getElementById("page-loader");
  if (!loader) return;

  let pageReady = document.readyState === "complete";
  let modelReady = loader.dataset.modelReady === "true";
  let hidden = false;
  const HOLD_MS = 1800;

  const hide = () => {
    if (hidden || !loader.isConnected) return;
    hidden = true;
    loader.classList.add("page-loader--hidden");
    document.body.classList.remove("is-loading");
    window.setTimeout(() => loader.remove(), 450);
  };

  const tryHide = () => {
    if (!(pageReady && modelReady)) return;
    window.setTimeout(hide, HOLD_MS);
  };

  window.addEventListener(
    "load",
    () => {
      pageReady = true;
      tryHide();
    },
    { once: true }
  );

  window.addEventListener(
    "page-loader:model-ready",
    () => {
      modelReady = true;
      tryHide();
    },
    { once: true }
  );

  // Safety fallback (large GLB / hung network).
  window.setTimeout(hide, 20000);
})();

// --------------------------
// Footer social icons: one-shot bounce / stretch / shake
// - About page: play on entry
// - Project / gallery pages: play the first time the footer is scrolled into view
// --------------------------
(() => {
  const icons = document.querySelector("footer .icons");
  if (!icons) return;
  if (!icons.querySelector(".icon-instagram, .icon-x, .icon-linkedin")) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let played = false;
  const play = () => {
    if (played || reduceMotion) return;
    played = true;
    icons.classList.add("icons--animate");
    window.setTimeout(() => {
      icons.classList.remove("icons--animate");
    }, 3200);
  };

  const isAboutPage = Boolean(document.querySelector("main.main-aboutpg"));

  // About: animate shortly after landing on the page
  if (isAboutPage) {
    window.requestAnimationFrame(() => {
      window.setTimeout(play, 280);
    });
    return;
  }

  // Everywhere else (project gallery / project pages): first time footer enters view
  const footer = icons.closest("footer") || icons;
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      play();
      observer.disconnect();
    },
    { threshold: 0.45, rootMargin: "0px 0px -4% 0px" }
  );
  observer.observe(footer);
})();
