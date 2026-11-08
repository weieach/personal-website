// GVD redesign highlights: each before/after pair is a stack of two screens.
// The After/Before tabs below it bring that version to the front. When a mouse
// pointer leaves the figure (heading, caption, screens and tabs), the pair
// animates back to After 2s later.
document.querySelectorAll(".gvd-redesign-pair[data-compare-state]").forEach((pair) => {
  const screens = [...pair.querySelectorAll("[data-compare-version]")];
  const buttons = [...pair.querySelectorAll("[data-compare-target]")];

  const show = (version) => {
    if (pair.dataset.compareState === version) return;
    pair.dataset.compareState = version;

    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.compareTarget === version));
    });

    screens.forEach((screen) => screen.classList.remove("is-raising"));
    const incoming = screens.find((screen) => screen.dataset.compareVersion === version);
    if (!incoming) return;
    void incoming.offsetWidth; // restart the lift if it was mid-animation
    incoming.classList.add("is-raising");
  };

  // Leaving the figure waits this long before switching back; coming back in
  // (or clicking a tab) cancels it.
  const REVERT_DELAY = 2000;
  let revertTimer = null;
  const cancelRevert = () => {
    clearTimeout(revertTimer);
    revertTimer = null;
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      cancelRevert();
      show(button.dataset.compareTarget);
    });
  });

  // Mouse only: a touch tap also fires pointerleave right after it, which
  // would undo the tap.
  pair.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse" || pair.dataset.compareState === "after") return;
    cancelRevert();
    revertTimer = setTimeout(() => {
      revertTimer = null;
      show("after");
    }, REVERT_DELAY);
  });

  pair.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") cancelRevert();
  });

  screens.forEach((screen) => {
    screen.addEventListener("animationend", () => screen.classList.remove("is-raising"));
  });
});
