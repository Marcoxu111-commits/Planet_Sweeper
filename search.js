// Local search: no geocoding account, API key, or network request required.
(() => {
  const form = document.getElementById("city-search");
  const input = document.getElementById("city-query");
  const list = document.getElementById("city-results");
  const status = document.getElementById("city-search-status");
  const homeKey = "planet-sweeper.city.v1";
  const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const entries = [];
  const seen = new Set();
  function add(feature, name, region) {
    const key = normalize(`${name} ${region}`);
    if (seen.has(key)) return;
    seen.add(key);
    const aliases = feature.properties?.aliases || [];
    entries.push({ feature, name, region, key: `${key} ${normalize(aliases.join(" "))}`, normalizedName: normalize(name), population: feature.properties?.population || feature.properties?.Population || 0 });
  }
  (window.PJJ_GTA_REGIONS?.features || []).forEach((f) => add(f, f.properties.name, "Ontario, Canada"));
  (window.PJJ_GTA_DETAIL?.features || []).forEach((f) => add(f, f.properties.name, `${f.properties.city}, Ontario, Canada`));
  (window.PJJ_TORONTO_DISTRICTS?.features || []).forEach((f) => add(f, f.properties.name, "Toronto district, Ontario, Canada"));
  (window.PJJ_TORONTO_WARDS?.features || []).forEach((f) => add(f, f.properties.AREA_NAME, `Toronto ward ${f.properties.AREA_SHORT_CODE}, Ontario, Canada`));
  (window.PJJ_CA_CITIES?.features || []).forEach((f) => {
    // Municipality bounds provide better destinations for GTA searches than
    // Toronto's single sprawling population-centre boundary.
    if (window.PJJ_GTA_REGIONS?.features.some((g) => normalize(g.properties.name) === normalize(f.properties.pcname))) return;
    add(f, f.properties.pcname, "Canada");
  });
  (window.PJJ_US_CITIES?.features || []).forEach((f) => add(f, f.properties.NAME.replace(/--/g, " – "), "USA"));
  (window.PJJ_AMERICAS_CITIES?.features || []).forEach((f) => add(f, f.properties.name, f.properties.countryName));
  (window.PJJ_GLOBAL_CITIES?.features || []).forEach((f) => add(f, f.properties.name, f.properties.countryName));

  let matches = [], active = -1, preview = null, home = null;
  const cityName = (entry) => {
    if (entry.normalizedName.startsWith("new york ")) return "New York";
    if (entry.normalizedName.startsWith("chicago ")) return "Chicago";
    return entry.name;
  };
  function cityData(entry) {
    const reference = entry.feature.properties?.center;
    const center = reference ? L.latLng(reference[1], reference[0]) : L.geoJSON(entry.feature).getBounds().getCenter();
    return { name: cityName(entry), datasetName: entry.name, region: entry.region, center: { lat: center.lat, lng: center.lng } };
  }
  window.PlanetCity = { get: () => home ? { ...home, center: { ...home.center } } : null };
  function refreshHome() {
    document.getElementById("home-city-bar").hidden = !home;
    document.getElementById("home-city-name").textContent = home?.name || "";
    const isHome = preview && home?.datasetName === preview.name && home?.region === preview.region;
    const button = document.getElementById("set-home-city");
    button.textContent = isHome ? "✓ Your city is set" : "Set as your city";
    button.disabled = !!isHome;
  }
  function showPreview(entry, moveMap = true) {
    preview = entry;
    const bounds = L.geoJSON(entry.feature).getBounds();
    if (!bounds.isValid()) return;
    input.value = cityName(entry);
    close();
    panel.classList.remove("open");
    if (moveMap) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 12, animate: false });
    window.PlanetPanels?.expand("main-panel");
    document.getElementById("city-preview").hidden = false;
    document.getElementById("city-preview-name").textContent = cityName(entry);
    const properties = entry.feature.properties;
    document.getElementById("city-preview-region").textContent = properties?.locationOnly
      ? `${entry.region} · City location only; no mapped urban footprint in this dataset.`
      : properties?.center && !properties.population
        ? `${entry.region} · Urban footprint available; no positive reference population for pollution modeling.` : entry.region;
    document.getElementById("city-set-status").textContent = "";
    const image = document.getElementById("city-preview-photo");
    const photo = window.PlanetCityPhotos?.get(entry.name);
    const credit = document.getElementById("city-preview-credit");
    credit.replaceChildren();
    if (photo) credit.append(PlanetCityPhotos.caption(photo));
    image.hidden = !photo;
    if (photo) { image.src = photo.src; image.alt = photo.alt; }
    else { image.removeAttribute("src"); image.alt = ""; }
    refreshHome();
    status.textContent = `${cityName(entry)} selected. Choose Set as your city to use it for local volunteering.`;
    document.dispatchEvent(new CustomEvent("planet:city-preview", { detail: cityData(entry) }));
  }
  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }
  function select(index) {
    const entry = matches[index];
    if (!entry) return;
    showPreview(entry);
  }
  function highlight(index) {
    active = (index + matches.length) % matches.length;
    [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    input.setAttribute("aria-activedescendant", `city-result-${active}`);
    list.children[active]?.scrollIntoView({ block: "nearest" });
  }
  function update() {
    const query = normalize(input.value);
    if (!query) { matches = []; status.textContent = ""; close(); return; }
    matches = entries.filter((e) => query.split(" ").every((word) => e.key.includes(word)))
      .sort((a, b) => {
        const score = (e) => e.normalizedName === query ? 0 : e.normalizedName.startsWith(query) ? 1 : 2;
        return score(a) - score(b) || b.population - a.population || a.name.localeCompare(b.name);
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
  document.getElementById("set-home-city").addEventListener("click", () => {
    if (!preview) return;
    home = cityData(preview);
    let saved = true;
    try { localStorage.setItem(homeKey, JSON.stringify({ datasetName: preview.name, region: preview.region })); }
    catch { saved = false; }
    refreshHome();
    document.getElementById("city-set-status").textContent = saved ? `${home.name} is your city. You're ready to explore local initiatives.` : `${home.name} is set for this visit. Browser storage is unavailable.`;
    document.dispatchEvent(new CustomEvent("planet:city-set", { detail: window.PlanetCity.get() }));
  });
  function chooseCity() {
    window.PlanetPanels?.expand("main-panel");
    document.getElementById("city-preview").hidden = true;
    input.value = ""; matches = []; close(); input.focus();
  }
  document.getElementById("change-home-city").addEventListener("click", chooseCity);
  document.addEventListener("planet:choose-city", chooseCity);
  try {
    const saved = JSON.parse(localStorage.getItem(homeKey) || "null");
    const entry = entries.find((e) => e.name === saved?.datasetName && e.region === saved?.region);
    if (entry) { home = cityData(entry); showPreview(entry); }
  } catch { /* A stored preference is optional; keep city search usable. */ }
  L.DomEvent.disableClickPropagation(form);
  L.DomEvent.disableScrollPropagation(form);
})();
