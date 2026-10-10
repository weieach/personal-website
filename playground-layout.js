(() => {
  const main = document.querySelector('.playground-project');
  if (!main) return;

  main.querySelectorAll('.project-caption').forEach((caption) => {
    const info = document.createElement('div');
    info.className = 'playground-summary-info';
    const description = document.createElement('div');
    description.className = 'playground-summary-description';
    const back = caption.querySelector(':scope > .btn-back');
    if (back) info.append(back);
    const metadata = [...caption.querySelectorAll(':scope > ul')];
    [...caption.children].forEach((child) => {
      if (child.matches('p')) description.append(child);
      else if (!child.matches('ul')) info.append(child);
    });
    metadata.forEach((list) => description.append(list));
    caption.classList.add('playground-summary');
    caption.append(info, description);
  });

  // Freeze the letterbox to the first decoded frame's edge color.
  const sampledBackgrounds = new WeakSet();
  function matchBackground(media, stage, tile) {
    if (sampledBackgrounds.has(stage)) return;
    if (tile?.dataset.mediaBg) {
      stage.style.backgroundColor = tile.dataset.mediaBg;
      sampledBackgrounds.add(stage);
      return;
    }
    if (main.classList.contains('fs-project') && media.tagName === 'VIDEO') {
      stage.style.backgroundColor = tile?.dataset.mediaBg || '#E08494';
      sampledBackgrounds.add(stage);
      return;
    }
    if (main.classList.contains('tldr-project') && media.tagName === 'VIDEO') {
      stage.style.backgroundColor = '#000';
      sampledBackgrounds.add(stage);
      return;
    }
    if (media.tagName === 'VIDEO' && media.readyState < 2) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(media, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;
      const colors = new Map();
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (x > 1 && x < 30 && y > 1 && y < 30) continue;
        const i = (y * 32 + x) * 4;
        if (pixels[i + 3] < 240) continue;
        const rgb = [...pixels.slice(i, i + 3)];
        const key = rgb.map((v) => Math.round(v / 16)).join(',');
        const bucket = colors.get(key) || { count: 0, sum: [0, 0, 0] };
        bucket.count++;
        rgb.forEach((v, c) => bucket.sum[c] += v);
        colors.set(key, bucket);
      }
      const dominant = [...colors.values()].sort((a, b) => b.count - a.count)[0];
      if (dominant) {
        stage.style.backgroundColor = `rgb(${dominant.sum.map((v) => Math.round(v / dominant.count)).join(',')})`;
        sampledBackgrounds.add(stage);
      }
    } catch { /* Transparent or unavailable frames retain the dark fallback. */ }
  }

  function watchMedia(media, tile, stage) {
    const update = () => {
      const width = media.naturalWidth || media.videoWidth || Number(media.getAttribute('width'));
      const height = media.naturalHeight || media.videoHeight || Number(media.getAttribute('height'));
      if (!width || !height) return;
      tile.classList.toggle('playground-tile--portrait', height > width);
      matchBackground(media, stage, tile);
    };
    media.addEventListener('load', update);
    media.addEventListener('loadedmetadata', update);
    media.addEventListener('loadeddata', update);
    if (media.tagName === 'VIDEO') {
      // A decoded frame avoids sampling an unpainted black video buffer.
      media.addEventListener('playing', () => {
        if (media.requestVideoFrameCallback) media.requestVideoFrameCallback(update);
        else update();
      }, { once: true });
    }
    update();
    // Reparenting media into its grid stage can interrupt native autoplay.
    if (media.tagName === 'VIDEO' && (media.autoplay || media.hasAttribute('data-media-autoplay'))) {
      const thumbnail = Boolean(media.closest('.page-thumbnail'));
      if (thumbnail) media.controls = false;
      if (window.SiteMedia) { window.SiteMedia.refresh(); return; }
      media.play().catch(() => {
        if (!thumbnail) media.controls = true;
      });
    }
  }

  function makeTiles(container) {
    const roots = [...container.querySelectorAll('picture, img, video')]
      .filter((el) => !el.parentElement.closest('picture'));
    if (!roots.length) return;
    const captions = [...container.children].filter((el) => el.matches('.floating-caption, .floating-caption-wrap'));
    let previous = container;
    roots.forEach((root, index) => {
      const tile = index === 0 ? container : document.createElement('div');
      if (index) {
        tile.className = 'captioned-item';
        previous.after(tile);
        captions.forEach((caption) => tile.append(caption.cloneNode(true)));
      }
      tile.classList.add('playground-tile');
      const stage = document.createElement('div');
      stage.className = 'playground-media';
      const media = root.matches('picture') ? root.querySelector('img') : root;
      const mirror = media.nextElementSibling?.matches('canvas.pictogram-visual') ? media.nextElementSibling : null;
      const chipRow = root.parentElement?.querySelector(':scope > .thumbnail-cta');
      stage.append(root);
      if (mirror) stage.append(mirror);
      if (chipRow) stage.append(chipRow);
      tile.prepend(stage);
      watchMedia(media, tile, stage);
      previous = tile;
    });
    // Remove obsolete scroll/view wrappers after their media has been moved.
    [...container.children].forEach((el) => {
      if (!el.matches('.playground-media, .floating-caption, .floating-caption-wrap, .thumbnail-tooltip, .thumbnail-cta')) el.remove();
    });
  }

  const hero = main.querySelector('.page-thumbnail');
  if (hero?.matches('.page-thumbnail-nijimu')) {
    // This intentionally composed animation remains one landscape asset.
    hero.classList.add('playground-tile', 'playground-tile--composite');
  } else if (hero?.matches('.page-thumbnail-hurricane')) {
    const desktop = hero.querySelector('.hurricane-thumb-desktop');
    const mobile = hero.querySelector('.hurricane-thumb-mobile');
    if (desktop && mobile) {
      const picture = document.createElement('picture');
      const source = document.createElement('source');
      source.media = '(width < 960px)';
      source.dataset.mediaSrcset = mobile.dataset.mediaSrc || mobile.getAttribute('src');
      if (desktop.src) source.srcset = window.SiteMedia?.url(source.dataset.mediaSrcset) || source.dataset.mediaSrcset;
      desktop.classList.remove('hurricane-thumb-desktop');
      picture.append(source, desktop);
      mobile.remove();
      hero.append(picture);
    }
    makeTiles(hero);
  } else if (hero) makeTiles(hero);

  const demoRow = main.querySelector('.flexbox-tldr-demo');
  if (demoRow) {
    demoRow.parentElement.classList.add('playground-group');
    demoRow.classList.add('playground-group');
    demoRow.querySelectorAll('.tldr-demo-item').forEach(makeTiles);
  }
  main.querySelectorAll('.project-pics .captioned-item:not(.playground-group):not(.sf-spreads-item), :scope > .work-wu-poster').forEach(makeTiles);

  const spreadCycle = main.querySelector('.sf-spread-cycle');
  if (spreadCycle && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const spreadCount = 15;
    const spreadPath = (n) => `assets/superfast/scanned%20spreads/${n}.png`;
    const spreadNumber = (src) => {
      const match = decodeURIComponent(src || '').match(/(\d+)\.png$/);
      return match ? Number(match[1]) : 1;
    };
    const resolve = (path) => window.SiteMedia?.url(path) || path;
    const cache = new Map();
    const ensure = (url) => {
      let record = cache.get(url);
      if (record) return record;
      const probe = new Image();
      record = { loaded: false, failed: false };
      cache.set(url, record);
      probe.onload = () => { record.loaded = true; };
      probe.onerror = () => { record.failed = true; };
      probe.src = url;
      if (probe.complete && probe.naturalWidth) record.loaded = true;
      return record;
    };
    spreadCycle.querySelectorAll('.playground-media').forEach((stage) => {
      const img = stage.querySelector('img');
      if (!img) return;
      const original = img.dataset.mediaSrc;
      const originalAlt = img.alt;
      let index = spreadNumber(original);
      let timer = 0;
      let session = 0;
      let painted = '';
      const holdPrevious = () => {
        const current = (img.naturalWidth && (img.currentSrc || img.src)) || painted;
        if (!current) return;
        if (img.offsetWidth) img.style.width = `${img.offsetWidth}px`;
        img.style.backgroundImage = `url("${current}")`;
      };
      img.addEventListener('load', () => {
        if (img.naturalWidth) painted = img.currentSrc || img.src;
        const clearHold = () => {
          if (!img.naturalWidth) return;
          img.style.backgroundImage = '';
          img.style.width = '';
        };
        if (img.decode) img.decode().then(() => requestAnimationFrame(clearHold)).catch(() => requestAnimationFrame(clearHold));
        else requestAnimationFrame(clearHold);
      });
      const show = (n) => {
        const url = resolve(spreadPath(n));
        const record = ensure(url);
        if (!record.loaded) return false;
        holdPrevious();
        img.dataset.mediaSrc = spreadPath(n);
        img.alt = `Scanned book spread ${n}`;
        if (img.src !== url) img.src = url;
        return true;
      };
      stage.addEventListener('pointerenter', () => {
        if (timer) return;
        const active = ++session;
        for (let n = 1; n <= spreadCount; n += 1) ensure(resolve(spreadPath(n)));
        timer = window.setInterval(() => {
          if (active !== session) return;
          const next = index % spreadCount + 1;
          ensure(resolve(spreadPath(next % spreadCount + 1)));
          const record = ensure(resolve(spreadPath(next)));
          if (record.failed) {
            index = next;
            return;
          }
          if (!show(next)) return;
          index = next;
        }, 500);
      });
      stage.addEventListener('pointerleave', () => {
        session += 1;
        window.clearInterval(timer);
        timer = 0;
        index = spreadNumber(original);
        if (spreadNumber(img.currentSrc || img.src) === spreadNumber(original)) {
          img.dataset.mediaSrc = original;
          img.alt = originalAlt;
          return;
        }
        holdPrevious();
        img.dataset.mediaSrc = original;
        img.alt = originalAlt;
        img.src = resolve(original);
      });
    });
  }

  window.SiteMedia?.refresh();
})();
