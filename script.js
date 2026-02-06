const btnMenu = document.querySelector(".btn-burger");
const sidebar = document.querySelector(".sidebar");
const btnMenuAnchors = document.querySelectorAll(".sidebar a");
const header = document.querySelector("header");
let closeBtnOn = false;

// --------------------------
// Mobile menu
// --------------------------
if (btnMenu && sidebar) {
  btnMenu.addEventListener("click", () => {
    sidebar.classList.toggle("no-display");
    // btnMenu.innerHTML = `<i class="ph ph-x"></i>`;
  });
}

btnMenuAnchors.forEach((btnMenuAnchor) => {
  btnMenuAnchor.addEventListener("click", () => {
    sidebar?.classList.add("no-display");
  });
});

// --------------------------
// Disabled-link toaster
// --------------------------
const DISABLED_LINK_TOAST_MESSAGE =
  "This project isn't fully available yet. Please come back later.";

function ensureToastStyles() {
  if (document.getElementById("toast-styles")) return;
  const style = document.createElement("style");
  style.id = "toast-styles";
  style.textContent = `
    .toast-container{
      position: fixed;
      left: 50%;
      bottom: 34px;
      transform: translateX(-50%);
      width: min(560px, calc(100vw - 32px));
      z-index: 9999;
      pointer-events: none;
    }
    .toast{
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 18px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(246, 246, 246, 1.0);
      color: #fff;
      box-shadow: 0 12px 40px rgba(0,0,0,.35);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      font: 500 14px/1.35 "Geist", system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      animation: toast-in 160ms ease-out;
    }
    .toast__message{ flex: 1; }
    .toast__close{
      appearance: none;
      border: none;
      background: transparent;
      color: black;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 8px;
      font: inherit;
      opacity: .85;
    }
    .toast__close:hover{ opacity: 1; background: rgba(255,255,255,.08); }
    .toast--out{ animation: toast-out 140ms ease-in forwards; }
    @keyframes toast-in{
      from { transform: translateY(8px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes toast-out{
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(8px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

function getToastContainer() {
  let container = document.querySelector(".toast-container");
  if (container) return container;

  container = document.createElement("div");
  container.className = "toast-container";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "true");
  document.body.appendChild(container);
  return container;
}

function showToast(message, { durationMs = 3200 } = {}) {
  ensureToastStyles();
  const container = getToastContainer();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");

  const msg = document.createElement("div");
  msg.className = "toast__message";
  msg.textContent = message;

  const close = document.createElement("button");
  close.className = "toast__close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "×";

  const removeToast = () => {
    if (!toast.isConnected) return;
    toast.classList.add("toast--out");
    window.setTimeout(() => toast.remove(), 170);
  };

  close.addEventListener("click", removeToast);
  toast.addEventListener("click", removeToast);

  toast.appendChild(msg);
  toast.appendChild(close);
  container.appendChild(toast);

  window.setTimeout(removeToast, durationMs);
}

document.addEventListener("click", (e) => {
  const link = e.target.closest?.(".disabled-link");
  if (!link) return;

  e.preventDefault();
  showToast(DISABLED_LINK_TOAST_MESSAGE);
});
