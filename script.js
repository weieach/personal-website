const btnMenu = document.querySelector(".btn-burger");
const sidebar = document.querySelector(".sidebar");
const btnMenuAnchors = document.querySelectorAll(".sidebar a");
const header = document.querySelector("header");
let closeBtnOn = false;

btnMenu.addEventListener("click", () => {
  sidebar.classList.toggle("no-display");
//   btnMenu.innerHTML = `<i class="ph ph-x"></i>`;
});



btnMenuAnchors.forEach((btnMenuAnchor) => {
  sidebar.classList.add("no-display");
});
