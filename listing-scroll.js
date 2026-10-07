import { animate, inView } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

/**
 * Listing pages (index / intern): related to project-page motion, but distinct.
 * Project pages → fade + scale in place.
 * Listings → rise only (no fade), decelerating ease, short cascade.
 *
 * Initial Y offset lives in CSS so cards never paint at rest then jump down.
 */
const REVEAL = {
  duration: 0.7,
  easing: [0.16, 1, 0.3, 1],
};

const RISE_PX_DEFAULT = 28;
const RISE_PX_SINGLE = 72;
const STAGGER_S = 0.07;
const STAGGER_CAP = 3;

const cardsRoot =
  document.querySelector(".cards") ||
  document.querySelector(".cards-single-column");

const isSingleColumn = Boolean(
  cardsRoot?.classList.contains("cards-single-column")
);
const RISE_PX = isSingleColumn ? RISE_PX_SINGLE : RISE_PX_DEFAULT;

if (cardsRoot) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  // Empty placeholders stay put (CSS :not(.done) would otherwise leave them offset)
  [...cardsRoot.querySelectorAll(":scope > .card")].forEach((card) => {
    if (isEmptyCard(card)) card.classList.add("scroll-reveal-card--done");
  });

  const cards = [...cardsRoot.querySelectorAll(":scope > .card")].filter(
    (card) => !card.classList.contains("scroll-reveal-card--done")
  );

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  if (location.hash !== "#about") window.scrollTo(0, 0);

  if (reduceMotion) {
    cards.forEach((card) => card.classList.add("scroll-reveal-card--done"));
  } else if (
    document.documentElement.classList.contains("hub-warm") &&
    cards.length
  ) {
    // Same-session revisit: show cards at rest (no rise choreography)
    cards.forEach((card) => card.classList.add("scroll-reveal-card--done"));
  } else if (cards.length) {
    whenListingReady(() => startListingReveals(cards));
  }
}

setupProjectsCta();

function startListingReveals(cards) {
  let cascadeStep = 0;
  let cascadeResetTimer = 0;

  const { above, below } = splitByViewport(cards);

  above.forEach((card, i) => {
    revealCard(card, Math.min(i, STAGGER_CAP) * STAGGER_S);
  });

  const pending = below.filter(
    (card) => !card.classList.contains("scroll-reveal-card--done")
  );
  if (!pending.length) return;

  inView(
    pending,
    (element) => {
      window.clearTimeout(cascadeResetTimer);
      const delay = cascadeStep * STAGGER_S;
      cascadeStep = Math.min(cascadeStep + 1, STAGGER_CAP);
      cascadeResetTimer = window.setTimeout(() => {
        cascadeStep = 0;
      }, 180);

      revealCard(element, delay);
    },
    {
      margin: "0px 0px -12% 0px",
      amount: 0.2,
    }
  );

  window.setTimeout(() => showCards(pending), 12000);
}

function revealCard(element, delay = 0) {
  if (element.classList.contains("scroll-reveal-card--done")) return;

  // Rise from the CSS start pose to layout Y (0). Mark done first so the
  // CSS offset rule drops before we clear the inline transform.
  animate(
    element,
    { y: [RISE_PX, 0] },
    {
      ...REVEAL,
      delay,
    }
  ).finished.then(() => {
    element.classList.add("scroll-reveal-card--done");
    element.style.removeProperty("transform");
    element.style.willChange = "auto";
  });
}

function whenListingReady(callback) {
  let started = false;
  const run = () => {
    if (started) return;
    started = true;
    requestAnimationFrame(callback);
  };

  const loader = document.getElementById("page-loader");
  const loaderGone =
    !loader || loader.dataset.falling === "true" || loader.classList.contains("page-loader--hidden");

  // Reveal underneath the sheet as soon as it starts falling.
  if (loaderGone) {
    if (document.readyState === "complete") {
      run();
    } else {
      window.addEventListener("load", run, { once: true });
    }
    return;
  }

  window.addEventListener("page-loader:falling", run, { once: true });
  window.addEventListener("page-loader:hidden", run, { once: true });
  // Safety if the loader never fires (matches script.js fallback)
  window.setTimeout(run, 22000);
}

function splitByViewport(blocks) {
  const limit = window.innerHeight * 0.92;
  const above = [];
  const below = [];

  blocks.forEach((el) => {
    const rect = el.getBoundingClientRect();
    // Undo the CSS start offset so fold splitting uses layout position
    const top = rect.top - RISE_PX;
    const bottom = rect.bottom - RISE_PX;
    if (top < limit && bottom > 0) above.push(el);
    else below.push(el);
  });

  return { above, below };
}

function isEmptyCard(card) {
  const title = card.querySelector(".work-title");
  const text = title?.textContent?.replace(/\s+/g, "") ?? "";
  const hasMedia = card.querySelector("img, video");
  return !text && !hasMedia;
}

function showCards(cards) {
  cards.forEach((el) => {
    if (el.classList.contains("scroll-reveal-card--done")) return;
    el.classList.add("scroll-reveal-card--done");
    el.style.removeProperty("transform");
    el.style.willChange = "auto";
  });
}

function setupProjectsCta() {
  const cta = document.querySelector(".projects-cta");
  const link = cta?.querySelector(".projects-cta__link");
  const arrow = link?.querySelector(".projects-cta__button i");
  const caption = cta?.querySelector(".projects-cta__caption");
  if (!cta || !link || !arrow) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const skipReveal = document.documentElement.classList.contains("hub-warm");

  const showCaptionRest = () => {
    if (!caption) return;
    caption.classList.add("is-revealed");
    caption.querySelectorAll(".projects-cta__line").forEach((line) => {
      line.style.removeProperty("transform");
      line.style.willChange = "auto";
    });
  };

  const prepareCaptionLines = () => {
    if (!caption) return [];
    return [...caption.querySelectorAll(".projects-cta__line")];
  };

  if (reduceMotion || skipReveal) {
    showCaptionRest();
  } else {
    const startCaptionReveal = () => {
      const lines = prepareCaptionLines();
      if (!lines.length) {
        showCaptionRest();
        return;
      }

      inView(
        caption,
        () => {
          if (caption.classList.contains("is-revealed")) return;

          const reveals = lines.map((line, i) =>
            animate(
              line,
              { y: ["115%", "0%"] },
              {
                duration: 0.75,
                delay: 0.08 + i * 0.12,
                easing: [0.16, 1, 0.3, 1],
              }
            ).finished
          );

          Promise.all(reveals).then(() => {
            showCaptionRest();
          });
        },
        { amount: 0.55, margin: "0px 0px -6% 0px" }
      );
    };

    if (document.fonts?.ready) {
      document.fonts.ready.then(() => startCaptionReveal());
    } else {
      startCaptionReveal();
    }
  }

  if (reduceMotion) return;

  const nudge = (x) =>
    animate(arrow, { x }, { duration: 0.35, easing: [0.22, 1, 0.36, 1] });

  link.addEventListener("pointerenter", () => nudge(5));
  link.addEventListener("pointerleave", () => nudge(0));
  link.addEventListener("focusin", () => nudge(5));
  link.addEventListener("focusout", () => nudge(0));
}
