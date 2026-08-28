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
  // Thumbnail + caption stay static; only media/content blocks animate.
  // Initial opacity/scale lives in CSS so blocks never paint fully then snap.
  const blocks = collectRevealBlocks(main);

  // Lenis fights touch scrolling; keep native scroll on coarse pointers
  const preferNativeScroll = window.matchMedia("(pointer: coarse)").matches;

  if (reduceMotion) {
    // Drop the CSS start pose (same as listing-scroll)
    blocks.forEach((el) => el.classList.add("scroll-reveal-block--done"));
  } else {
    if (!preferNativeScroll) {
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

      attachScrollSnap(main, lenis);
    }

    if (blocks.length) {
      requestAnimationFrame(() => {
        const { above, below } = splitByViewport(blocks);
        let cascadeStep = 0;
        let cascadeResetTimer = 0;

        above.forEach((element, i) => {
          reveal(element, AFTER_STATIC_S + Math.min(i, STAGGER_CAP) * STAGGER_S);
        });

        const armBelow = () => {
          // CSS already holds the start pose; only tip the compositor.
          below.forEach((el) => {
            if (el.classList.contains("scroll-reveal-block--done")) return;
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
setupCaseStudyToc();
mutePageVideos();
setupWalkthroughLightbox();
setupSeeAllToggles();
setupTldrDemoFocus();

function scrollBehavior() {
  return window.matchMedia("(pointer: coarse)").matches ? "auto" : "smooth";
}

/** Lenis owns the scroll, so CSS scroll-snap can't be used — register its Snap addon.
 *  Coarse pointers keep native scroll, and snap via CSS instead.
 *  Snap is landscape-only (width >= height), matching the full-bleed CSS stages. */
function attachScrollSnap(main, lenisInstance) {
  const targets = main.querySelectorAll("[data-scroll-snap]");
  if (!targets.length) return;

  const landscapeMq = window.matchMedia("(min-aspect-ratio: 1/1)");

  import("https://cdn.jsdelivr.net/npm/lenis@1.3.25/dist/lenis-snap.mjs")
    .then(({ default: Snap }) => {
      const snap = new Snap(lenisInstance, {
        type: "proximity",
        duration: 0.9,
        // evaluate after Lenis has coasted to a stop, and only pull from nearby,
        // so a deliberate scroll can still leave the clip behind
        debounce: 520,
        distanceThreshold: "32%",
      });
      // Snap to the video itself so center-align tracks the clip, not a 100vh frame
      targets.forEach((el) => {
        const snapTarget = el.querySelector("video") || el;
        snap.addElement(snapTarget, { align: ["center"], ignoreTransform: true });
        snapTarget.addEventListener("loadedmetadata", () => {
          if (landscapeMq.matches) snap.resize();
        });
      });

      const syncSnap = () => {
        if (landscapeMq.matches) {
          snap.start();
          snap.resize();
        } else {
          snap.stop();
        }
      };

      syncSnap();
      landscapeMq.addEventListener("change", syncSnap);
      window.addEventListener("resize", syncSnap);
    })
    .catch(() => {});
}

function scrollToTarget(target, offset = 0) {
  if (lenis) {
    lenis.scrollTo(target, {
      offset,
      duration: 1.2,
    });
    return;
  }

  const behavior = scrollBehavior();

  if (!offset) {
    target.scrollIntoView({ behavior, block: "start" });
    return;
  }

  window.scrollTo({
    top: target.getBoundingClientRect().top + window.scrollY + offset,
    behavior,
  });
}

function setupCaseStudyToc() {
  const page = document.querySelector(".case-study-toc-enabled");
  const caption = page?.querySelector(".project-caption");
  if (!caption) return;

  const sections = [...caption.querySelectorAll(":scope > section")].filter(
    (section) => section.querySelector("h3")
  );
  if (sections.length < 3) return;

  const rail = document.createElement("aside");
  rail.className = "case-study-toc";
  rail.setAttribute("role", "navigation");
  rail.setAttribute("aria-label", "Sections");

  const inner = document.createElement("div");
  inner.className = "case-study-toc__inner";

  // A plain div, not <nav>: the global header `nav`/`nav ul` rules would give
  // the rail a background and a horizontal bar layout. The wrapping <aside>
  // already carries role="navigation".
  const sidebar = document.createElement("div");
  sidebar.className = "line-sidebar";

  const list = document.createElement("ul");
  list.className = "line-sidebar__list";

  const items = sections.map((section, i) => {
    const label =
      section.dataset.tocLabel || section.querySelector("h3").textContent.trim();

    if (!section.id) {
      section.id = `section-${slugify(label) || i + 1}`;
    }

    const item = document.createElement("li");
    item.className = "line-sidebar__item";

    const marker = document.createElement("span");
    marker.className = "line-sidebar__marker";
    marker.setAttribute("aria-hidden", "true");

    const link = document.createElement("a");
    link.className = "line-sidebar__label";
    link.href = `#${section.id}`;

    const index = document.createElement("span");
    index.className = "line-sidebar__index";
    index.setAttribute("aria-hidden", "true");
    index.textContent = String(i + 1).padStart(2, "0");

    link.append(index, document.createTextNode(label));
    item.append(marker, link);
    list.appendChild(item);

    return { section, item };
  });

  sidebar.appendChild(list);
  inner.appendChild(sidebar);
  rail.appendChild(inner);
  caption.prepend(rail);

  const navHeight = () =>
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--nav-height")
    ) || 56;

  let activeIndex = -1;
  let frame = 0;

  const proximity = setupLineSidebarProximity(
    sidebar,
    list,
    items.map(({ item }) => item),
    () => activeIndex
  );

  const update = () => {
    frame = 0;
    const top = navHeight();
    const line = top + window.innerHeight * 0.3;
    const captionBox = caption.getBoundingClientRect();
    const pastOpening =
      items[0].section.getBoundingClientRect().bottom < top + 24;
    // Hide once the caption has scrolled away (fixed rail no longer tracks it)
    const withinCaption = captionBox.bottom > top + 120;

    rail.classList.toggle("is-visible", pastOpening && withinCaption);

    let next = 0;
    items.forEach(({ section }, i) => {
      if (section.getBoundingClientRect().top <= line) next = i;
    });

    if (next === activeIndex) return;
    items[activeIndex]?.item.classList.remove("is-active");
    items[activeIndex]?.item.removeAttribute("aria-current");
    items[next].item.classList.add("is-active");
    items[next].item.setAttribute("aria-current", "true");
    activeIndex = next;
    proximity.start();
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();

  rail.addEventListener("click", (e) => {
    // The item's widened hit area swallows clicks beside the label, so fall
    // back to the anchor inside whichever item was hit.
    const link =
      e.target.closest('a[href^="#"]') ||
      e.target.closest(".line-sidebar__item")?.querySelector('a[href^="#"]');
    if (!link) return;

    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;

    // Stop the page-wide hash handler, which scrolls without a nav offset
    e.preventDefault();
    e.stopPropagation();

    if (target.dataset.tocScroll === "top") {
      scrollToTop();
      return;
    }

    scrollToTarget(target, -(navHeight() + 32));
  });
}

/**
 * Cursor-proximity effect for the section rail (ported from react-bits
 * LineSidebar). One rAF loop eases every item's `--effect` toward its target
 * with frame-rate independent smoothing, so colour, shift and marker scale all
 * move together instead of staggering separate CSS transitions.
 */
function setupLineSidebarProximity(sidebar, list, elements, getActiveIndex) {
  const PROXIMITY_RADIUS = 50;
  const SMOOTHING_S = 0.1;
  const falloff = (p) => p * p * (3 - 2 * p);

  const targets = elements.map(() => 0);
  const current = elements.map(() => 0);
  let raf = 0;
  let last = 0;

  const runFrame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const k = 1 - Math.exp(-dt / SMOOTHING_S);
    const active = getActiveIndex();
    let moving = false;

    elements.forEach((el, i) => {
      const target = Math.max(targets[i], active === i ? 1 : 0);
      const next = current[i] + (target - current[i]) * k;
      const settled = Math.abs(target - next) < 0.0015;
      current[i] = settled ? target : next;
      el.style.setProperty("--effect", current[i].toFixed(4));
      if (!settled) moving = true;
    });

    raf = moving ? requestAnimationFrame(runFrame) : 0;
  };

  const start = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(runFrame);
  };

  const settleNow = () => {
    const active = getActiveIndex();
    elements.forEach((el, i) => {
      current[i] = active === i ? 1 : 0;
      el.style.setProperty("--effect", String(current[i]));
    });
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return { start: settleNow };
  }

  sidebar.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;

    const pointerY = e.clientY - list.getBoundingClientRect().top;
    elements.forEach((el, i) => {
      const center = el.offsetTop + el.offsetHeight / 2;
      const distance = Math.abs(pointerY - center);
      targets[i] = falloff(Math.max(0, 1 - distance / PROXIMITY_RADIUS));
    });
    start();
  });

  sidebar.addEventListener("pointerleave", () => {
    targets.fill(0);
    start();
  });

  return { start };
}

function scrollToTop() {
  if (lenis) {
    lenis.scrollTo(0, { duration: 1.2 });
    return;
  }

  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function setupWalkthroughLightbox() {
  const grid = document.querySelector(".walkthrough-image-grid");
  const certificate = document.querySelector(".nijimu-certificate");
  const elasticPoster = document.querySelector(".elastic-poster");
  if (!grid && !certificate && !elasticPoster) return;

  const overlay = document.createElement("div");
  overlay.className = "image-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Image preview");
  overlay.innerHTML = `
    <button type="button" class="image-lightbox__close" aria-label="Close">&times;</button>
    <img class="image-lightbox__img" alt="">
  `;
  document.body.appendChild(overlay);

  const preview = overlay.querySelector(".image-lightbox__img");

  const open = (source, { certificate = false, poster = false } = {}) => {
    preview.src = source.currentSrc || source.src;
    preview.alt = source.alt || "";
    overlay.classList.toggle("image-lightbox--certificate", certificate);
    overlay.classList.toggle("image-lightbox--poster", poster);
    overlay.classList.add("is-open");
    document.body.classList.add("is-lightbox-open");
    lenis?.stop();
  };

  const close = () => {
    if (!overlay.classList.contains("is-open")) return;
    overlay.classList.remove("is-open");
    overlay.classList.remove("image-lightbox--certificate");
    overlay.classList.remove("image-lightbox--poster");
    document.body.classList.remove("is-lightbox-open");
    lenis?.start();
  };

  grid?.addEventListener("click", (e) => {
    const source = e.target.closest("img");
    if (!source || !grid.contains(source)) return;
    open(source);
  });

  certificate?.addEventListener("click", () => {
    const source = certificate.querySelector("img");
    if (!source) return;
    open(source, { certificate: true });
  });

  elasticPoster?.addEventListener("click", () => {
    open(elasticPoster, { poster: true });
  });

  elasticPoster?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    open(elasticPoster, { poster: true });
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest(".image-lightbox__close")) {
      close();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

function mutePageVideos() {
  const videos = document.querySelectorAll(".main-projectpg video");
  if (!videos.length) return;

  videos.forEach((video) => {
    if (video.classList.contains("allows-sound")) return;

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.setAttribute("muted", "");

    // Keep silent even if the native controls unmute UI is used
    video.addEventListener("volumechange", () => {
      if (!video.muted || video.volume > 0) {
        video.muted = true;
        video.volume = 0;
      }
    });
  });
}

function setupTldrDemoFocus() {
  const row = document.querySelector(".flexbox-tldr-demo:has(.tldr-demo-item)");
  if (!row) return;

  const items = [...row.querySelectorAll(".tldr-demo-item")];
  const videos = items
    .map((item) => item.querySelector("video"))
    .filter(Boolean);
  if (videos.length < 2) return;

  const coarseMq = window.matchMedia("(pointer: coarse)");

  const activate = (activeItem) => {
    row.classList.add("is-focusing");
    items.forEach((item) => {
      const on = item === activeItem;
      item.classList.toggle("is-active", on);
      const video = item.querySelector("video");
      if (!video) return;
      if (on) video.play().catch(() => {});
      else video.pause();
    });
  };

  const clear = () => {
    row.classList.remove("is-focusing");
    items.forEach((item) => item.classList.remove("is-active"));
    videos.forEach((video) => video.play().catch(() => {}));
  };

  items.forEach((item) => {
    item.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      activate(item);
    });
    item.addEventListener("click", () => {
      if (!coarseMq.matches) return;
      if (item.classList.contains("is-active")) clear();
      else activate(item);
    });
  });

  row.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    clear();
  });
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

function setupSeeAllToggles() {
  const buttons = document.querySelectorAll(".btn-see-all[aria-controls]");
  if (!buttons.length) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  buttons.forEach((button) => {
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    if (!panel) return;

    const label = button.querySelector(".btn-see-all__label");
    const moreLabel = label?.textContent.trim() || "See all";
    const lessLabel = button.dataset.labelLess || "Show less";
    let animating = false;

    button.addEventListener("click", () => {
      if (animating) return;

      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      if (label) label.textContent = expanded ? moreLabel : lessLabel;

      if (reduceMotion) {
        panel.hidden = expanded;
        return;
      }

      const settle = () => {
        animating = false;
        panel.style.removeProperty("height");
        panel.style.removeProperty("opacity");
        panel.style.removeProperty("overflow");
      };

      animating = true;
      panel.style.overflow = "hidden";

      if (expanded) {
        const height = panel.scrollHeight;
        animate(
          panel,
          { height: [`${height}px`, "0px"], opacity: [1, 0] },
          REVEAL
        ).finished.then(() => {
          panel.hidden = true;
          settle();
        });
        return;
      }

      panel.hidden = false;
      const height = panel.scrollHeight;
      animate(
        panel,
        { height: ["0px", `${height}px`], opacity: [0, 1] },
        REVEAL
      ).finished.then(settle);
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
