import Lenis from "https://cdn.jsdelivr.net/npm/lenis@1.3.25/+esm";
import { animate, inView } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

const REVEAL = {
  duration: 0.5,
  easing: [0.22, 1, 0.36, 1],
};

const STAGGER_S = 0.08;
const STAGGER_CAP = 3;
/** Pause after hero/caption paint before the first staggered reveal */
const AFTER_STATIC_S = 0.12;

let lenis = null;

const main = document.querySelector(".main-projectpg");
if (main) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  // Thumbnail + caption stay static; only media/content blocks animate
  const blocks = collectRevealBlocks(main);

  if (reduceMotion) {
    // leave content as-is
  } else {
    lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.1,
    });

    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    if (blocks.length) {
      requestAnimationFrame(() => {
        const { above, below } = splitByViewport(blocks);
        let cascadeStep = 0;
        let cascadeResetTimer = 0;

        above.forEach((element, i) => {
          reveal(element, AFTER_STATIC_S + Math.min(i, STAGGER_CAP) * STAGGER_S);
        });

        const armBelow = () => {
          below.forEach((el) => {
            if (el.classList.contains("scroll-reveal-block--done")) return;
            el.style.opacity = "0";
            el.style.transform = "scale(0.97)";
            el.style.willChange = "opacity, transform";
          });

          const pending = below.filter(
            (el) => !el.classList.contains("scroll-reveal-block--done")
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

              reveal(element, delay);
            },
            {
              margin: "0px 0px -8% 0px",
              amount: 0.15,
            }
          );

          window.setTimeout(() => showBlocks(pending), 12000);
        };

        if (document.readyState === "complete") {
          armBelow();
        } else {
          window.addEventListener("load", armBelow, { once: true });
        }
      });
    }
  }
}

// In-page hash links (e.g. .thumbnail-tooltip) ? Lenis disables native anchors
document.addEventListener("click", (e) => {
  const link = e.target.closest?.('a[href^="#"]');
  if (!link) return;

  const hash = link.getAttribute("href");
  if (!hash || hash === "#") return;

  const target = document.querySelector(hash);
  if (!target) return;

  e.preventDefault();
  scrollToTarget(target);
});

setupElasticThumbnailTooltip();

function scrollToTarget(target) {
  if (lenis) {
    lenis.scrollTo(target, {
      offset: 0,
      duration: 1.2,
    });
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupElasticThumbnailTooltip() {
  const thumb = document.querySelector(".page-thumbnail-elastic-mind");
  const tooltip = thumb?.querySelector(".thumbnail-tooltip");
  if (!thumb || !tooltip) return;

  const label = tooltip.querySelector(".thumbnail-tooltip__text");
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  thumb.addEventListener("click", (e) => {
    // Let the hash-link handler scroll when the tooltip itself is clicked
    if (e.target.closest(".thumbnail-tooltip") && tooltip.classList.contains("is-visible")) {
      return;
    }

    if (tooltip.classList.contains("is-visible")) return;

    tooltip.classList.add("is-visible");

    if (reduceMotion || !label) {
      tooltip.style.opacity = "1";
      tooltip.style.transform = "scale(1)";
      if (label) label.style.opacity = "1";
      return;
    }

    animate(
      tooltip,
      { opacity: [0, 1], scale: [0.85, 1] },
      { duration: 0.35, easing: [0.22, 1, 0.36, 1] }
    ).finished.then(() => {
      animate(
        label,
        { opacity: [0, 1] },
        { duration: 0.3, easing: [0.22, 1, 0.36, 1] }
      );
    });
  });
}

function reveal(element, delay = 0) {
  if (element.classList.contains("scroll-reveal-block--done")) return;

  animate(
    element,
    { opacity: [0, 1], scale: [0.97, 1] },
    {
      ...REVEAL,
      delay,
    }
  ).finished.then(() => {
    element.style.willChange = "auto";
    element.classList.add("scroll-reveal-block--done");
  });
}

function splitByViewport(blocks) {
  const limit = window.innerHeight * 0.92;
  const above = [];
  const below = [];

  blocks.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < limit && rect.bottom > 0) {
      above.push(el);
    } else {
      below.push(el);
    }
  });

  return { above, below };
}

function collectRevealBlocks(main) {
  const blocks = [];

  // Skip .page-thumbnail and .project-caption ? they show immediately.
  // Case-study sections inside the caption still stagger in.
  const cover = main.querySelector(":scope > .img-casestudy-cover");
  if (cover) blocks.push(cover);

  main
    .querySelectorAll(".project-caption > section")
    .forEach((section) => blocks.push(section));

  main.querySelectorAll(".project-pics > *").forEach((el) => {
    if (el.classList.contains("placeholder-caption")) return;
    blocks.push(el);
  });

  return blocks;
}

function showBlocks(blocks) {
  blocks.forEach((el) => {
    if (el.classList.contains("scroll-reveal-block--done")) return;
    el.style.opacity = "1";
    el.style.transform = "none";
    el.style.willChange = "auto";
    el.classList.add("scroll-reveal-block--done");
  });
}
