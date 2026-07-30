import { animate } from "https://cdn.jsdelivr.net/npm/motion@12.42.2/+esm";

/**
 * Nijimu project thumbnail: looping collage.
 * 1) Title image fades + zooms in
 * 2) Three snippet videos pop in one-by-one at fixed positions
 * 3) Hold ~5s while they play
 * 4) Everything blurs out, then the sequence restarts
 */
const EASE = [0.22, 1, 0.36, 1];
const HOLD_S = 5;
const STAGGER_S = 0.55;
const POP_S = 0.65;
const BLUR_S = 0.85;
const RESTART_GAP_S = 0.35;

const thumb = document.querySelector(".page-thumbnail-nijimu");
const stage = thumb?.querySelector(".nijimu-thumb-stage");
const hero = thumb?.querySelector(".nijimu-thumb-hero");
const clips = thumb ? [...thumb.querySelectorAll(".nijimu-thumb-clip")] : [];

if (thumb && stage && hero && clips.length) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (reduceMotion) {
    hero.style.opacity = "1";
    hero.style.transform = "none";
  } else {
    let running = false;
    let generation = 0;
    let inView = true;

    const sleep = (ms) =>
      new Promise((resolve) => {
        window.setTimeout(resolve, ms);
      });

    const resetPose = () => {
      stage.style.filter = "blur(0px)";
      stage.style.opacity = "1";
      hero.style.opacity = "0";
      hero.style.transform = "scale(0.88)";
      clips.forEach((clip) => {
        clip.pause();
        clip.currentTime = 0;
        clip.style.opacity = "0";
        clip.style.transform = "scale(0.88)";
      });
    };

    const waitForClipSize = (clip) =>
      new Promise((resolve) => {
        if (clip.videoWidth && clip.offsetWidth) {
          resolve();
          return;
        }
        const done = () => resolve();
        clip.addEventListener("loadeddata", done, { once: true });
        window.setTimeout(done, 1200);
      });

    const playClip = async (clip) => {
      try {
        clip.muted = true;
        await clip.play();
      } catch {
        // Autoplay can still fail in some environments; keep silent.
      }
    };

    const runCycle = async (gen) => {
      resetPose();

      await Promise.all(clips.map((clip) => waitForClipSize(clip)));
      if (gen !== generation || !inView) return;

      await animate(
        hero,
        { opacity: [0, 1], scale: [0.88, 1] },
        { duration: POP_S, easing: EASE }
      ).finished;
      if (gen !== generation || !inView) return;

      for (const clip of clips) {
        if (gen !== generation || !inView) return;
        await playClip(clip);
        await animate(
          clip,
          { opacity: [0, 1], scale: [0.88, 1] },
          { duration: POP_S * 0.85, easing: EASE }
        ).finished;
        await sleep(STAGGER_S * 1000);
        if (gen !== generation || !inView) return;
      }

      await sleep(HOLD_S * 1000);
      if (gen !== generation || !inView) return;

      await animate(
        stage,
        { filter: ["blur(0px)", "blur(18px)"], opacity: [1, 0] },
        { duration: BLUR_S, easing: EASE }
      ).finished;
      if (gen !== generation || !inView) return;

      clips.forEach((clip) => {
        clip.pause();
        clip.currentTime = 0;
      });

      await sleep(RESTART_GAP_S * 1000);
    };

    const loop = async () => {
      if (running) return;
      running = true;
      const gen = ++generation;

      while (gen === generation && inView) {
        await runCycle(gen);
      }

      if (gen === generation) running = false;
    };

    const stop = () => {
      generation += 1;
      running = false;
      clips.forEach((clip) => {
        clip.pause();
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = Boolean(entry?.isIntersecting);
        if (inView) {
          loop();
        } else {
          stop();
          resetPose();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(thumb);
  }
}

// Black nav over the thumbnail; restore default once the nav bottom hits the thumbnail end.
// Initial dark state is on <html class="nijimu-nav-dark"> + critical CSS in <head> (no FOUC).
{
  const header = document.querySelector("header");
  const root = document.documentElement;
  if (header && thumb) {
    const syncNav = () => {
      const pastThumb =
        thumb.getBoundingClientRect().bottom <=
        header.getBoundingClientRect().bottom;
      root.classList.toggle("nijimu-nav-dark", !pastThumb);
    };

    syncNav();

    window.addEventListener("scroll", syncNav, { passive: true });
    window.addEventListener("resize", syncNav, { passive: true });

    const navObserver = new IntersectionObserver(syncNav, {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    navObserver.observe(thumb);
  }
}
