(() => {
  const grid = document.querySelector("[data-project-grid]");
  const filters = document.querySelector(".project-filters");
  const status = document.querySelector(".project-filter-status");
  if (!grid || !filters || !status) return;

  // Captions remain the source of tags, without displaying a second text line.
  const aliases = new Map([
    ["ui / ux", "UI / UX"],
    ["front-end", "Web Development"],
    ["motion", "Motion Graphics"],
    ["motion graphics", "Motion Graphics"],
    ["3d poster", "Poster"],
    ["poster design", "Poster"],
    ["poster", "Poster"],
    ["graphic", "Graphic Design"],
    ["graphic design", "Graphic Design"],
    ["web dev", "Web Development"],
    ["web development", "Web Development"],
    ["branding", "Branding & Identity"],
    ["branding & identity", "Branding & Identity"],
    ["book design", "Book"],
    ["book", "Book"],
    ["creative coding", "Creative Coding"],
    ["vibe code", "Vibe Coding"],
  ]);

  const cards = [...grid.querySelectorAll(":scope > .card")]
    .filter((card) => !card.classList.contains("no-display") &&
      card.querySelector(".work-title")?.textContent.trim())
    .map((card) => {
      const caption = card.querySelector(".work-caption")?.cloneNode(true);
      caption?.querySelectorAll(".dev-note").forEach((note) => note.remove());
      const tags = new Set((caption?.textContent || "").split(",")
        .map((tag) => tag.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .map((tag) => aliases.get(tag.toLowerCase()) || tag.replace(/\b\w/g, (letter) => letter.toUpperCase()))
        .filter((tag) => tag !== "Graphic Design"));
      return { card, tags, collection: card.dataset.collection?.toLowerCase() };
    });

  if (!cards.length) return;

  const pageCollection = grid.dataset.projectCollection || null;
  // Other listing pages must navigate normally so their assets load separately.
  const collectionLinks = [...document.querySelectorAll("[data-collection-nav]")]
    .filter(link => new URL(link.href).pathname === location.pathname);
  let collection = null;
  let buttons = [];
  let navigationSequence = 0;
  const allGroup = document.createElement("span");
  allGroup.className = "project-filter-group";
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "project-filter-clear";
  clearButton.textContent = "×";
  clearButton.hidden = true;
  clearButton.addEventListener("click", () => {
    navigationSequence++;
    window.ProjectTagIcons?.cancel();
    if (pageCollection) { location.assign("work.html"); return; }
    const url = new URL(location.href);
    url.searchParams.delete("collection");
    history.pushState(null, "", url);
    renderCollection(true);
  });
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.dataset.shapeKey = "All Projects";
  allButton.className = "project-filter project-filter--all";
  allButton.setAttribute("aria-controls", grid.id);
  const allLabel = document.createElement("span");
  allLabel.className = "project-filter__label";
  allLabel.setAttribute("aria-hidden", "true");
  const allPrefix = document.createElement("span");
  allPrefix.className = "project-filter__prefix";
  allPrefix.textContent = "All Projects";
  const allDynamic = document.createElement("span");
  allDynamic.className = "project-filter__dynamic";
  const allSuffix = document.createElement("span");
  allSuffix.className = "project-filter__suffix";
  const allCount = document.createElement("span");
  allCount.className = "project-filter__count";
  allCount.textContent = ` [${cards.length}]`;
  allDynamic.append(allSuffix, allCount);
  allLabel.append(allPrefix, allDynamic);
  allButton.appendChild(allLabel);
  allButton.addEventListener("click", () => {
    navigationSequence++;
    window.ProjectTagIcons?.cancel();
    if (!pageCollection && collection && allButton.getAttribute("aria-pressed") === "true") {
      const url = new URL(location.href);
      url.searchParams.delete("collection");
      history.pushState(null, "", url);
      renderCollection(true);
    } else selectTag(null);
  });
  allGroup.append(allButton, clearButton);
  filters.appendChild(allGroup);

  function inCollection(project) {
    return collection === null || project.collection === collection;
  }

  function selectTag(tag) {
    let count = 0;
    cards.forEach((project) => {
      const { card, tags } = project;
      const visible = inCollection(project) && (tag === null || tags.has(tag));
      card.hidden = !visible;
      if (visible) count += 1;
      // Stop hidden thumbnails consuming video playback; resume visible loops.
      card.querySelectorAll("video").forEach((video) => {
        if (!visible) video.pause();
        else if (video.autoplay && getComputedStyle(video).display !== "none") {
          video.play().catch(() => {});
        }
      });
    });
    buttons.forEach(({ button, value }) => {
      button.setAttribute("aria-pressed", String(value === tag));
    });
    window.dispatchEvent(new CustomEvent('project-filters:selected'));
    status.textContent = `${count} ${collection ? `${collection} ` : ""}${count === 1 ? "project" : "projects"}${tag ? ` tagged ${tag}` : " shown"}.`;
  }

  function renderCollection(animate = false, pendingIntro = false) {
    const requested = new URLSearchParams(location.search).get("collection");
    collection = pageCollection || (!pendingIntro && ["work", "playground"].includes(requested) ? requested : null);
    const scopedCards = cards.filter(inCollection);
    const tagCounts = new Map();
    scopedCards.forEach(({ tags }) => tags.forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }));
    const tags = [...tagCounts.keys()]
      .sort((a, b) => tagCounts.get(b) - tagCounts.get(a) || a.localeCompare(b));

    // Keep the All button mounted so its current width can animate to the new label.
    [...filters.children].forEach((child) => {
      if (child !== allGroup) child.remove();
    });
    buttons = [{ button: allButton, value: null }];
    tags.forEach((tag) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-filter";
      button.dataset.shapeKey = tag;
      button.setAttribute("aria-pressed", String(tag === null));
      button.setAttribute("aria-controls", grid.id);
      const count = tagCounts.get(tag);
      const countLabel = document.createElement("span");
      countLabel.className = "project-filter__count";
      countLabel.textContent = ` [${count}]`;
      button.append(document.createTextNode(tag), countLabel);
      button.addEventListener("click", () => {
        navigationSequence++;
        window.ProjectTagIcons?.cancel();
        selectTag(tag);
      });
      buttons.push({ button, value: tag });
      filters.appendChild(button);
    });

    collectionLinks.forEach((link) => {
      if (link.dataset.collectionNav === collection) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    allButton.dataset.collectionShape = collection || '';
    allButton.dataset.shapeKey = collection || 'All Projects';
    window.ProjectTagIcons?.setCollection(allButton, collection);
    window.dispatchEvent(new CustomEvent('project-filters:rendered'));
    selectTag(null);
    filters.hidden = false;
    const suffix = collection ? `: ${collection[0].toUpperCase()}${collection.slice(1)}` : "";
    const count = scopedCards.length;
    clearButton.hidden = true;
    clearButton.setAttribute("aria-label", `Clear ${collection || "collection"} filter`);
    const revealClear = () => {
      if (!collection) return;
      clearButton.hidden = false;
      if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        clearButton.animate({ opacity: [0, 1], transform: ['scale(.6)', 'scale(1)'] },
          { duration: 180, easing: 'ease-out' });
      }
    };
    if (window.animateProjectFilterLabel) window.animateProjectFilterLabel(allButton, { suffix, count, onComplete: revealClear }, animate);
    else {
      allButton.setAttribute("aria-label", `All Projects${suffix} [${count}]`);
      allSuffix.textContent = suffix;
      allCount.textContent = ` [${count}]`;
      allButton.classList.toggle("has-clear", !!collection);
      revealClear();
    }
  }

  collectionLinks.forEach((link) => {
    link.addEventListener("click", async (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      window.AboutDrawer?.leave();
      const sequence = ++navigationSequence;
      window.ProjectTagIcons?.cancel();
      const nextCollection = link.dataset.collectionNav;
      if (nextCollection !== collection && window.ProjectTagIcons) {
        const arrived = await window.ProjectTagIcons.transfer(link, allButton, nextCollection);
        if (!arrived || sequence !== navigationSequence) return;
      }
      const url = new URL(link.href);
      if (link.dataset.collectionNav === collection) url.searchParams.delete("collection");
      if (url.href !== location.href) history.pushState(null, "", url);
      renderCollection(true);
    });
  });

  window.addEventListener("popstate", () => {
    navigationSequence++;
    window.ProjectTagIcons?.cancel();
    renderCollection(true);
  });
  let pendingArrival;
  try {
    pendingArrival = sessionStorage.getItem('project-shape-arrival');
    sessionStorage.removeItem('project-shape-arrival');
  } catch {}
  pendingArrival = !pageCollection && pendingArrival === new URLSearchParams(location.search).get('collection') ? pendingArrival : null;
  renderCollection(false, !!pendingArrival);
  if (pendingArrival) {
    let started = false;
    const arrive = async () => {
      if (started || !window.ProjectTagIcons || document.body.classList.contains('is-loading')) return;
      started = true;
      const sequence = ++navigationSequence;
      const source = collectionLinks.find(link => link.dataset.collectionNav === pendingArrival && link.closest('header'));
      const arrived = source && await window.ProjectTagIcons.transfer(source, allButton, pendingArrival);
      if (sequence === navigationSequence && arrived) renderCollection(true);
    };
    window.addEventListener('tag-shapes:ready', arrive, { once: true });
    window.addEventListener('page-loader:hidden', arrive, { once: true });
    arrive();
    window.addEventListener('load', () => {
      if (!started && !window.ProjectTagIcons) { started = true; renderCollection(false); }
    }, { once: true });
    setTimeout(() => { if (!started) { started = true; renderCollection(false); } }, 23000);
  }
})();
