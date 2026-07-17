import { animate } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

/**
 * About postcard: Motion flip + CSS-variable tilt (rAF / GPU transforms only).
 * Bird mounts after the first open via `about:postcard-opened`.
 */
const postcard = document.querySelector("[data-postcard]");
if (postcard) {
  const tiltEl = postcard.querySelector(".postcard__tilt");
  const cardEl = postcard.querySelector(".postcard__card");
  const frontBtn = postcard.querySelector(".postcard__face--front");
  const backFace = postcard.querySelector(".postcard__face--back");

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)")
    .matches;

  const MAX_TILT = 9; // degrees ? subtle
  const LERP = 0.14;

  let flipped = false;
  let flipping = false;
  let birdRequested = false;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let rafId = 0;
  let hovering = false;

  function setTilt(rx, ry) {
    tiltEl.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
    tiltEl.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
  }

  function tick() {
    currentX += (targetX - currentX) * LERP;
    currentY += (targetY - currentY) * LERP;
    setTilt(currentX, currentY);

    const settling =
      Math.abs(targetX - currentX) < 0.02 &&
      Math.abs(targetY - currentY) < 0.02;

    if (!hovering && settling) {
      setTilt(0, 0);
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function ensureTick() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function onPointerMove(e) {
    if (flipped || flipping || reduceMotion || !canHover) return;
    const rect = tiltEl.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    // Invert axes so the card leans toward the cursor
    targetY = px * MAX_TILT * 2;
    targetX = -py * MAX_TILT * 2;
    hovering = true;
    ensureTick();
  }

  function onPointerLeave() {
    hovering = false;
    targetX = 0;
    targetY = 0;
    ensureTick();
  }

  function requestBird() {
    if (birdRequested) return;
    birdRequested = true;
    window.dispatchEvent(new CustomEvent("about:postcard-opened"));
  }

  async function setFlipped(next) {
    if (flipping || next === flipped) return;
    flipping = true;

    // Flatten tilt before flipping so faces stay readable
    targetX = 0;
    targetY = 0;
    currentX = 0;
    currentY = 0;
    setTilt(0, 0);

    const to = next ? 180 : 0;
    if (reduceMotion) {
      cardEl.style.transform = `rotateY(${to}deg)`;
    } else {
      await animate(
        cardEl,
        { rotateY: to },
        { duration: 0.72, easing: [0.22, 1, 0.36, 1] }
      ).finished;
    }

    flipped = next;
    postcard.classList.toggle("is-flipped", flipped);
    frontBtn.setAttribute("aria-expanded", String(flipped));
    backFace.setAttribute("aria-hidden", String(!flipped));
    backFace.tabIndex = flipped ? 0 : -1;
    flipping = false;

    if (flipped) {
      // Content is already in the DOM; mount the 3D bird after the reveal
      requestAnimationFrame(() => requestBird());
    }
  }

  function isInteractiveTarget(target) {
    const el = target?.closest?.(
      "a, button, canvas, input, textarea, select, label, .about-bird-wrap"
    );
    return Boolean(el);
  }

  frontBtn.addEventListener("click", () => setFlipped(true));

  // Click empty areas of the back to flip closed; keep links / bird usable
  backFace.addEventListener("click", (e) => {
    if (!flipped || isInteractiveTarget(e.target)) return;
    setFlipped(false);
  });

  backFace.addEventListener("keydown", (e) => {
    if (!flipped) return;
    if (e.key === "Enter" || e.key === " ") {
      if (isInteractiveTarget(e.target) && e.target !== backFace) return;
      e.preventDefault();
      setFlipped(false);
    }
  });

  if (canHover && !reduceMotion) {
    tiltEl.addEventListener("pointermove", onPointerMove, { passive: true });
    tiltEl.addEventListener("pointerleave", onPointerLeave);
  }

  frontBtn.setAttribute("aria-expanded", "false");
  backFace.tabIndex = -1;
}
