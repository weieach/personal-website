(() => {
  const running = new WeakMap();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  window.animateProjectFilterLabel = (button, { suffix, count, onComplete = () => {} }, animate = true) => {
    const startWidth = button.getBoundingClientRect().width;
    running.get(button)?.();
    const dynamic = button.querySelector(".project-filter__dynamic");
    const suffixLabel = button.querySelector(".project-filter__suffix");
    const countLabel = button.querySelector(".project-filter__count");
    button.setAttribute("aria-label", `All Projects${suffix} [${count}]`);
    button.classList.toggle("has-clear", !!suffix);
    suffixLabel.textContent = suffix;
    countLabel.textContent = ` [${count}]`;
    if (!animate || reducedMotion.matches || !startWidth) { onComplete(); return; }

    const endWidth = button.getBoundingClientRect().width;
    const height = button.getBoundingClientRect().height;
    const buttonRect = button.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    const mask = document.createElement("canvas");
    const width = Math.ceil(Math.max(startWidth, endWidth));
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    for (const layer of [canvas, mask]) {
      layer.width = Math.ceil(width * scale);
      layer.height = Math.ceil(height * scale);
    }
    const context = canvas.getContext("2d");
    const ink = mask.getContext("2d", { willReadFrequently: true });
    if (!context || !ink) { onComplete(); return; }

    ink.scale(scale, scale);
    ink.textBaseline = "middle";
    ink.fillStyle = "#fff";
    const particles = [];
    const step = Math.max(1, Math.round(scale * 1.4));
    // Rasterize only the suffix and count; the All prefix stays ordinary text.
    for (const [kind, segment] of [suffixLabel, countLabel].entries()) {
      const style = getComputedStyle(segment);
      const rect = segment.getBoundingClientRect();
      ink.clearRect(0, 0, width, height);
      ink.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ink.fillText(segment.textContent,
        rect.left - buttonRect.left - button.clientLeft,
        rect.top - buttonRect.top - button.clientTop + rect.height / 2);
      const pixels = ink.getImageData(0, 0, mask.width, mask.height).data;
      for (let y = 0; y < mask.height; y += step) {
        for (let x = 0; x < mask.width; x += step) {
          const alpha = pixels[(y * mask.width + x) * 4 + 3] / 255;
          if (alpha < 0.2) continue;
          const angle = Math.random() * Math.PI * 2;
          const distance = 18 + Math.random() * 65;
          particles.push({
            x: x / scale, y: y / scale, alpha, kind,
            dx: Math.cos(angle) * distance,
            dy: Math.sin(angle) * distance * 0.65,
            delay: Math.random() * 0.16,
          });
        }
      }
    }

    canvas.className = "project-filter__particles";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const dynamicLeft = dynamic.getBoundingClientRect().left - buttonRect.left - button.clientLeft;
    canvas.style.clipPath = `inset(0 0 0 ${dynamicLeft}px)`;
    button.appendChild(canvas);
    button.classList.add("is-label-animating");
    dynamic.style.opacity = "0";
    button.style.width = `${startWidth}px`;
    context.scale(scale, scale);

    let frame;
    const cleanup = () => {
      cancelAnimationFrame(frame);
      canvas.remove();
      button.classList.remove("is-label-animating");
      button.style.removeProperty("width");
      dynamic.style.removeProperty("opacity");
      running.delete(button);
    };
    running.set(button, cleanup);
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const clamp = (t) => Math.max(0, Math.min(1, t));

    function draw(now) {
      const progress = clamp((now - start) / 900);
      if (reducedMotion.matches || !button.isConnected) { cleanup(); onComplete(); return; }
      button.style.width = `${startWidth + (endWidth - startWidth) * ease(clamp(progress / 0.85))}px`;
      context.clearRect(0, 0, width, height);
      const colors = [getComputedStyle(suffixLabel).color, getComputedStyle(countLabel).color];
      const reveal = clamp((progress - 0.72) / 0.24);
      dynamic.style.opacity = String(reveal);
      particles.forEach((particle) => {
        const travel = clamp((progress - particle.delay) / 0.64);
        const remaining = 1 - ease(travel);
        context.fillStyle = colors[particle.kind];
        context.globalAlpha = particle.alpha * clamp(travel * 5) * (1 - reveal);
        context.fillRect(
          particle.x + particle.dx * remaining,
          particle.y + particle.dy * remaining,
          1.25, 1.25
        );
      });
      if (progress < 1) frame = requestAnimationFrame(draw);
      else { cleanup(); onComplete(); }
    }
    frame = requestAnimationFrame(draw);
  };
})();
