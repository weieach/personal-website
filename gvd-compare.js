// GVD redesign highlights: each before/after pair is a stack of two screens.
// The Before/After tabs above it bring that version to the front.
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

  buttons.forEach((button) => {
    button.addEventListener("click", () => show(button.dataset.compareTarget));
  });

  screens.forEach((screen) => {
    screen.addEventListener("animationend", () => screen.classList.remove("is-raising"));
  });
});
