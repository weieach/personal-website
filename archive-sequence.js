(() => {
  const roots = document.querySelectorAll("[data-archive-sequence]");
  if (!roots.length || typeof gsap === "undefined") return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  roots.forEach((root) => {
    const frames = [...root.querySelectorAll("img")];
    if (frames.length < 2) return;

    const frameDuration = frames.length <= 3 ? 1 : 0.6;

    let index = 0;
    const show = (next) => {
      frames.forEach((frame, frameIndex) => {
        const active = frameIndex === next;
        frame.style.opacity = active ? "1" : "0";
        frame.style.visibility = active ? "visible" : "hidden";
      });
    };

    show(0);
    if (reduceMotion) return;

    const timeline = gsap.timeline({ repeat: -1 });
    timeline.call(() => {
      index = (index + 1) % frames.length;
      show(index);
    }, null, frameDuration);

    const sync = () => {
      if (root.closest(".card")?.hidden) timeline.pause();
      else timeline.play();
    };
    window.addEventListener("project-filters:selected", sync);
  });
})();
