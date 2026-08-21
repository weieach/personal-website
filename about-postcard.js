import { animate } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

/**
 * About page postcard: front cover flips to reveal the about content.
 * - Click front → flip to back; click back (not links/bird) → flip to front.
 * - Subtle pointer tilt on the front, lerped in a single rAF loop that only
 *   runs while needed (performance-friendly: one composited transform).
 * - Mobile (<960px): skip the flip — show content + bird directly.
 * - COVER_HIDDEN: temporarily skip the cover on all viewports.
 * - Same-session revisit: restore open postcard without replaying the intro.
 */
const COVER_HIDDEN = true; // set false to bring the flip cover back

const FLIP = {
  duration: 0.85,
  easing: [0.22, 1, 0.36, 1],
};

const MAX_TILT_X = 4.5; // deg, pointer up/down
const MAX_TILT_Y = 6; // deg, pointer left/right
const TILT_LERP = 0.12;
const MOBILE_MQ = "(max-width: 959px)";

const postcard = document.getElementById("about-postcard");
const inner = postcard?.querySelector(".postcard__inner");
const front = postcard?.querySelector(".postcard__front");
const back = postcard?.querySelector(".postcard__back");
const hint = document.getElementById("postcard-hint");

if (postcard && inner && front && back) {
  const notifyFlipped = () => {
    window.dispatchEvent(new CustomEvent("about-postcard:flipped"));
  };

  const flipKey = window.NCWeiHub?.ABOUT_FLIP_KEY || "ncwei:about-flipped";
  const rememberFlip = (open) => {
    try {
      sessionStorage.setItem(flipKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  // Cover art is only worth downloading when the cover is actually shown
  const hydrateCover = () => {
    const img = front.querySelector("img[data-src]");
    if (!img) return;
    img.src = img.dataset.src;
    img.removeAttribute("data-src");
  };

  // Cover hidden / mobile: no flip UI — content and bird are shown immediately
  if (COVER_HIDDEN || window.matchMedia(MOBILE_MQ).matches) {
    postcard.classList.add("is-flipped", "is-static");
    front.setAttribute("aria-expanded", "true");
    front.setAttribute("aria-hidden", "true");
    front.setAttribute("tabindex", "-1");
    hint?.setAttribute("hidden", "");
    rememberFlip(true);
    notifyFlipped();
  } else {
    hydrateCover();

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const restoreOpen =
      document.documentElement.classList.contains("hub-warm") &&
      sessionStorage.getItem(flipKey) === "1";

    let flipDeg = restoreOpen ? 180 : 0; // 0 = front, 180 = back
    let flipped = restoreOpen;
    let flipAnimation = null;

    const tilt = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let tiltRaf = 0;
    let hovering = false;

    // Hover hint: show in footer after 2s without a click
    let hintTimer = 0;
    let hintDismissed = restoreOpen;

    if (restoreOpen) {
      postcard.classList.add("is-flipped");
      front.setAttribute("aria-expanded", "true");
      front.setAttribute("tabindex", "-1");
      hint?.setAttribute("hidden", "");
      inner.style.transform = "rotateX(0deg) rotateY(180deg)";
      notifyFlipped();
    }

    const clearHintTimer = () => {
      if (!hintTimer) return;
      window.clearTimeout(hintTimer);
      hintTimer = 0;
    };

    const hideHint = () => {
      hint?.classList.remove("is-visible");
    };

    const showHint = () => {
      if (hintDismissed || flipped) return;
      hint?.classList.add("is-visible");
    };

    const dismissHint = () => {
      hintDismissed = true;
      clearHintTimer();
      hideHint();
    };

    const scheduleHint = () => {
      if (hintDismissed || flipped) return;
      clearHintTimer();
      hintTimer = window.setTimeout(showHint, 2000);
    };

    const writeTransform = () => {
      inner.style.transform = `rotateX(${tilt.x.toFixed(
        2
      )}deg) rotateY(${(flipDeg + tilt.y).toFixed(2)}deg)`;

      // Sheen follows the tilt: highlight slides toward the raised edge and
      // the paper grain fades in with tilt magnitude
      const nx = tilt.y / MAX_TILT_Y; // -1..1, pointer left/right
      const ny = -tilt.x / MAX_TILT_X; // -1..1, pointer up/down
      const mag = Math.min(1, Math.hypot(nx, ny));
      postcard.style.setProperty("--sheen-x", `${(nx * 18).toFixed(2)}%`);
      postcard.style.setProperty("--sheen-y", `${(ny * 18).toFixed(2)}%`);
      postcard.style.setProperty("--sheen-o", (mag * 0.9).toFixed(3));
    };

    // --------------------------
    // Flip
    // --------------------------
    const setFlipped = (next) => {
      if (flipped === next) return;
      flipped = next;
      rememberFlip(next);

      if (next) dismissHint();

      // Kill tilt so the card rotates around a clean axis
      tilt.targetX = 0;
      tilt.targetY = 0;

      front.setAttribute("aria-expanded", String(next));
      if (next) {
        notifyFlipped();
        front.setAttribute("tabindex", "-1");
      } else {
        front.removeAttribute("tabindex");
      }

      if (reduceMotion) {
        flipDeg = next ? 180 : 0;
        tilt.x = 0;
        tilt.y = 0;
        postcard.classList.toggle("is-flipped", next);
        writeTransform();
        return;
      }

      postcard.classList.add("is-flipping");
      if (next) postcard.classList.add("is-flipped");

      flipAnimation?.stop();
      flipAnimation = animate(flipDeg, next ? 180 : 0, {
        ...FLIP,
        onUpdate: (latest) => {
          flipDeg = latest;
          writeTransform();
        },
      });

      flipAnimation.finished.then(() => {
        postcard.classList.remove("is-flipping");
        if (!next) postcard.classList.remove("is-flipped");
      });
    };

    front.addEventListener("click", () => setFlipped(true));

    back.addEventListener("click", (e) => {
      // Don't flip when using links, the bird, or selecting text
      if (e.target.closest("a, button, canvas")) return;
      if (window.getSelection()?.toString()) return;
      setFlipped(false);
    });

    // About nav / sidebar: if already on this page and still on the front,
    // clicking About again flips the postcard open.
    const sidebar = document.querySelector(".sidebar");
    document.querySelectorAll("nav a, .sidebar a").forEach((link) => {
      const label = link.textContent?.trim().toLowerCase();
      if (label !== "about") return;
      link.addEventListener("click", (e) => {
        if (flipped) return;
        e.preventDefault();
        setFlipped(true);
        sidebar?.classList.add("no-display");
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && flipped) setFlipped(false);
    });

    // --------------------------
    // Pointer tilt (front only)
    // --------------------------
    const tiltTick = () => {
      tilt.x += (tilt.targetX - tilt.x) * TILT_LERP;
      tilt.y += (tilt.targetY - tilt.y) * TILT_LERP;

      const settled =
        Math.abs(tilt.x - tilt.targetX) < 0.02 &&
        Math.abs(tilt.y - tilt.targetY) < 0.02;

      if (settled) {
        tilt.x = tilt.targetX;
        tilt.y = tilt.targetY;
      }

      // Skip writes mid-flip; the flip's onUpdate owns the transform then
      if (!flipAnimation || flipAnimation.state !== "running") {
        writeTransform();
      }

      if (!settled || hovering) {
        tiltRaf = requestAnimationFrame(tiltTick);
      } else {
        tiltRaf = 0;
      }
    };

    const startTiltLoop = () => {
      if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltTick);
    };

    postcard.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") scheduleHint();
      if (reduceMotion || flipped || e.pointerType !== "mouse") return;
      hovering = true;
      startTiltLoop();
    });

    postcard.addEventListener("pointermove", (e) => {
      if (reduceMotion || flipped || !hovering) return;
      const rect = postcard.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      tilt.targetY = nx * 2 * MAX_TILT_Y;
      tilt.targetX = -ny * 2 * MAX_TILT_X;
    });

    postcard.addEventListener("pointerleave", () => {
      clearHintTimer();
      hovering = false;
      tilt.targetX = 0;
      tilt.targetY = 0;
      startTiltLoop();
    });
  }
}
