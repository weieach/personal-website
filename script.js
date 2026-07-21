const btnMenu = document.querySelector(".btn-burger");
const sidebar = document.querySelector(".sidebar");
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
let navScrollLocked = false;
let navLockedScrollY = 0;

function lockNavScroll() {
  if (navScrollLocked) return;
  navScrollLocked = true;
  navLockedScrollY = window.scrollY;
  document.body.classList.add("is-nav-open");
  document.body.style.top = `-${navLockedScrollY}px`;
}

function unlockNavScroll() {
  if (!navScrollLocked) return;
  navScrollLocked = false;
  document.body.classList.remove("is-nav-open");
  document.body.style.top = "";
  window.scrollTo(0, navLockedScrollY);
}

function syncSidebarViewport() {
  if (!sidebar || sidebar.classList.contains("no-display")) return;
  const vv = window.visualViewport;
  const height = vv?.height ?? window.innerHeight;
  const top = vv?.offsetTop ?? 0;
  sidebar.style.height = `${Math.round(height)}px`;
  sidebar.style.top = `${Math.round(top)}px`;
  sidebar.style.bottom = "auto";
}

function clearSidebarViewport() {
  if (!sidebar) return;
  sidebar.style.height = "";
  sidebar.style.top = "";
  sidebar.style.bottom = "";
}

function syncSidebarOpenState() {
  const open = Boolean(sidebar && !sidebar.classList.contains("no-display"));
  if (open) {
    syncSidebarViewport();
    lockNavScroll();
  } else {
    clearSidebarViewport();
    unlockNavScroll();
  }
}

// Mirror footer social icons into the mobile overlay (below About)
if (sidebar && !sidebar.querySelector(".icons")) {
  const footerIcons = document.querySelector("footer .icons");
  if (footerIcons) {
    const clone = footerIcons.cloneNode(true);
    clone.classList.remove("icons--animate");
    sidebar.appendChild(clone);
  }
}

if (btnMenu && sidebar) {
  btnMenu.addEventListener("click", () => {
    sidebar.classList.toggle("no-display");
    syncSidebarOpenState();
  });
}

sidebar?.addEventListener("click", (e) => {
  if (!e.target.closest("a")) return;
  sidebar.classList.add("no-display");
  syncSidebarOpenState();
});

// Catch closes from other scripts (e.g. about-postcard.js)
if (sidebar) {
  new MutationObserver(syncSidebarOpenState).observe(sidebar, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

window.visualViewport?.addEventListener("resize", syncSidebarViewport);
window.visualViewport?.addEventListener("scroll", syncSidebarViewport);
window.addEventListener("resize", syncSidebarViewport);

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
// Pictogram videos: bt709-tagged H.264 paints a different blue than CSS sRGB
// depending on OS/GPU (iOS, Windows, macOS all disagree). Mirror frames onto a
// canvas (same color pipeline as CSS) and tint the surrounding backgrounds to
// the sampled frame color so the seam disappears everywhere.
// --------------------------
(() => {
  const videos = document.querySelectorAll(
    [
      ".card-pictogram video",
      ".pictogram-main-projectpg .page-thumbnail video",
      "video.pictogram-motion",
    ].join(", ")
  );
  if (!videos.length) return;

  const backgroundsFor = (video) => {
    const targets = [];
    if (video.classList.contains("pictogram-motion")) {
      // Background lives on the replacement canvas (same class).
      const visual = video.nextElementSibling;
      if (visual?.classList?.contains("pictogram-visual")) targets.push(visual);
    }
    const thumb = video.closest(".card-thumbnail, .page-thumbnail");
    if (thumb) targets.push(thumb);
    const recorded = video
      .closest(".item-pictogram-recorded")
      ?.querySelector(":scope > div");
    if (recorded) targets.push(recorded);
    return targets;
  };

  videos.forEach((video) => {
    if (video.dataset.pictogramSynced) return;
    video.dataset.pictogramSynced = "1";

    const canvas = document.createElement("canvas");
    canvas.className = `${video.className} pictogram-visual`.trim();
    canvas.setAttribute("aria-hidden", "true");
    video.insertAdjacentElement("afterend", canvas);
    video.classList.add("pictogram-source");

    const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!ctx) return;

    let tinted = false;

    const paint = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(video, 0, 0, w, h);

      if (!tinted) {
        try {
          const [r, g, b] = ctx.getImageData(8, 8, 1, 1).data;
          if (r + g + b > 30) {
            const color = `rgb(${r}, ${g}, ${b})`;
            backgroundsFor(video).forEach((el) => {
              el.style.backgroundColor = color;
            });
            tinted = true;
          }
        } catch {
          // Ignore tainted-canvas failures; CSS fallback remains.
        }
      }
    };

    const tick = () => {
      paint();
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(tick);
      } else {
        requestAnimationFrame(tick);
      }
    };

    const start = () => {
      paint();
      tick();
    };

    if (video.readyState >= 2) start();
    else video.addEventListener("loadeddata", start, { once: true });
  });
})();

// --------------------------
// Thumbnail CTAs: ensure every listing card gets a "Project details" button.
// Cards that already have "Visit site" keep it (left) with details on the right.
// Cards with no CTA (e.g. pictogram) get details only. Hidden below 500px via CSS.
// --------------------------
(() => {
  const cards = document.querySelectorAll(
    ".cards > .card, .cards-single-column > .card"
  );

  cards.forEach((card) => {
    if (card.querySelector(".thumbnail-cta")) return;

    const thumb = card.querySelector(".card-thumbnail");
    if (!thumb) return;

    // Skip empty placeholder cards
    const titleText =
      card.querySelector(".work-title")?.textContent?.replace(/\s+/g, "") ?? "";
    if (!titleText) return;

    const projectLink = [...card.querySelectorAll("a[href]")].find(
      (a) => !a.classList.contains("btn-visit-site")
    );
    if (!projectLink) return;

    const href = projectLink.getAttribute("href");
    if (!href) return;

    const visitBtn = thumb.querySelector(":scope > .btn-visit-site");

    if (visitBtn) {
      const favicon = visitBtn.querySelector(".icon-visit-site");
      visitBtn.querySelector(".ph-arrow-up-right")?.remove();
      visitBtn.querySelector(".ph-arrow-right")?.remove();

      let label = visitBtn.querySelector(".btn-visit-site__label");
      let trail = visitBtn.querySelector(".btn-visit-site__trail");

      if (!label) {
        label = document.createElement("span");
        label.className = "btn-visit-site__label";
        label.textContent = "Visit site";
        visitBtn.insertBefore(label, visitBtn.firstChild);
      }

      if (!trail) {
        trail = document.createElement("span");
        trail.className = "btn-visit-site__trail";
        visitBtn.appendChild(trail);
      }
      if (favicon) trail.appendChild(favicon);
    }

    const group = document.createElement("div");
    group.className = "thumbnail-cta";

    if (visitBtn) {
      thumb.insertBefore(group, visitBtn);
      group.appendChild(visitBtn);
    } else {
      thumb.appendChild(group);
    }

    const detailsBtn = document.createElement("a");
    detailsBtn.className = "btn-visit-site btn-project-details";
    detailsBtn.href = href;

    if (projectLink.classList.contains("disabled-link")) {
      detailsBtn.classList.add("disabled-link");
      detailsBtn.innerHTML =
        '<span class="btn-visit-site__label">Project details</span><i class="ph-fill ph-lock-simple" aria-hidden="true"></i>';
    } else {
      detailsBtn.innerHTML =
        '<span class="btn-visit-site__label">Project details</span><i class="ph-bold ph-arrow-up-right" aria-hidden="true"></i>';
    }

    group.appendChild(detailsBtn);
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
    // Unlock scroll before tear-down so the first touch isn't blocked
    document.body.classList.remove("is-loading");
    loader.classList.add("page-loader--hidden");
    window.dispatchEvent(new CustomEvent("page-loader:hidden"));
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
