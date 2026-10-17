// Shared accessible collapse controls. Minimize content without dismissing it or
// losing forms, chat state, or the selected city.
(() => {
  function setCollapsed(id, collapsed) {
    const panel = document.getElementById(id);
    const button = document.querySelector(`.panel-toggle[data-panel="${id}"]`);
    if (!panel || !button) return;
    const body = document.getElementById(button.getAttribute("aria-controls"));
    body.hidden = collapsed;
    panel.classList.toggle("is-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${button.dataset.panelName.toLowerCase()}`);
    button.textContent = collapsed ? "+" : "−";
    if (collapsed && body.contains(document.activeElement)) button.focus();
  }
  document.querySelectorAll(".panel-toggle").forEach((button) => {
    button.addEventListener("click", () => setCollapsed(button.dataset.panel, button.getAttribute("aria-expanded") === "true"));
  });
  window.PlanetPanels = { setCollapsed, expand: (id) => setCollapsed(id, false) };
})();
