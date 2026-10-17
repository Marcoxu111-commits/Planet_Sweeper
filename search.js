// Local search: no geocoding account, API key, or network request required.
(() => {
  const form = document.getElementById("city-search");
  const input = document.getElementById("city-query");
  const list = document.getElementById("city-results");
  const status = document.getElementById("city-search-status");
  const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const entries = [];
  const seen = new Set();
  function add(feature, name, region) {
    const key = normalize(`${name} ${region}`);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ feature, name, region, key, normalizedName: normalize(name) });
  }
  (window.PJJ_GTA_REGIONS?.features || []).forEach((f) => add(f, f.properties.name, "Ontario, Canada"));
  (window.PJJ_CA_CITIES?.features || []).forEach((f) => {
    // Municipality bounds provide better destinations for GTA searches than
    // Toronto's single sprawling population-centre boundary.
    if (window.PJJ_GTA_REGIONS?.features.some((g) => normalize(g.properties.name) === normalize(f.properties.pcname))) return;
    add(f, f.properties.pcname, "Canada");
  });
  (window.PJJ_US_CITIES?.features || []).forEach((f) => add(f, f.properties.NAME.replace(/--/g, " – "), "USA"));

  let matches = [], active = -1;
  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }
  function select(index) {
    const entry = matches[index];
    if (!entry) return;
    const bounds = L.geoJSON(entry.feature).getBounds();
    if (!bounds.isValid()) return;
    input.value = entry.name;
    close();
    panel.classList.remove("open");
    map.fitBounds(bounds, { padding: [45, 45], maxZoom: 12, animate: false });
    status.textContent = `Map centered on ${entry.name}, ${entry.region}.`;
  }
  function highlight(index) {
    active = (index + matches.length) % matches.length;
    [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", `city-result-${active}`);
    list.children[active]?.scrollIntoView({ block: "nearest" });
  }
  function update() {
    const query = normalize(input.value);
    if (!query) { status.textContent = ""; close(); return; }
    matches = entries.filter((e) => query.split(" ").every((word) => e.key.includes(word)))
      .sort((a, b) => {
        const score = (e) => e.normalizedName === query ? 0 : e.normalizedName.startsWith(query) ? 1 : 2;
        return score(a) - score(b) || a.name.localeCompare(b.name);
      }).slice(0, 8);
    list.replaceChildren();
    active = -1;
    input.removeAttribute("aria-activedescendant");
    matches.forEach((entry, index) => {
      const li = document.createElement("li");
      li.id = `city-result-${index}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      const name = document.createElement("strong");
      const region = document.createElement("span");
      name.textContent = entry.name;
      region.textContent = entry.region;
      li.append(name, region);
      li.addEventListener("mousedown", (event) => event.preventDefault());
      li.addEventListener("click", () => select(index));
      list.append(li);
    });
    if (!matches.length) {
      const empty = document.createElement("li");
      empty.textContent = "No matching city in the map's dataset.";
      empty.setAttribute("role", "presentation");
      list.append(empty);
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    status.textContent = matches.length ? `${matches.length} matching cities. Use arrow keys and Enter to select.` : "No matching cities.";
  }
  input.addEventListener("input", update);
  input.addEventListener("focus", () => { if (input.value) update(); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (["ArrowDown", "ArrowUp"].includes(event.key) && matches.length) {
      event.preventDefault();
      if (list.hidden) update();
      highlight(active < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : active + (event.key === "ArrowDown" ? 1 : -1));
    }
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); if (!list.hidden) select(active < 0 ? 0 : active); });
  document.addEventListener("click", (event) => { if (!form.contains(event.target)) close(); });
  form.addEventListener("focusout", (event) => { if (!form.contains(event.relatedTarget)) close(); });
  L.DomEvent.disableClickPropagation(form);
  L.DomEvent.disableScrollPropagation(form);
})();
