// Initiative workflow for the static map. Reports and messages never leave this
// browser. Only explicit address searches contact Nominatim. No device tracking.
(() => {
  const $ = (id) => document.getElementById(id);
  const drawer = $("initiative-panel");
  const broomie = BroomieCursor.create(map.getContainer());
  const reportMarkers = L.layerGroup().addTo(map);
  const profileKey = "planet-sweeper.profile.v1";
  let profile, store;
  const state = { city: "", origin: null, picking: null, draft: null, marker: null, selected: null, focus: null, addressRequest: null, lastLookup: 0, generation: 0 };
  const initialCity = window.PlanetCity?.get();
  if (initialCity) {
    state.city = initialCity.name;
    state.origin = { ...initialCity.center, label: initialCity.name };
  }
  const addressCache = new Map();
  const hotspotIcon = (draft = false) => L.divIcon({
    className: `initiative-pin${draft ? " initiative-pin-draft" : ""}`,
    html: '<span class="initiative-pin-symbol" aria-hidden="true">+</span>',
    iconSize: [34, 42], iconAnchor: [17, 40], tooltipAnchor: [0, -38],
  });
  const uuid = () => crypto.randomUUID();
  try {
    profile = JSON.parse(localStorage.getItem(profileKey) || "null") || { id: uuid(), name: "" };
    localStorage.setItem(profileKey, JSON.stringify(profile));
    store = PlanetInitiatives.createStore(localStorage, { id: profile.id, uuid });
  } catch {
    profile = { id: uuid(), name: "" };
  }
  function status(message, error = false) {
    $("initiative-status").textContent = message;
    $("initiative-status").classList.toggle("is-error", error);
  }
  function run(action) { try { action(); } catch (error) { status(error.message, true); } }
  function requireStore() { if (!store) throw new Error("Browser storage is unavailable. Enable local storage to use this prototype."); }
  function rememberName(name) {
    const clean = name.trim().slice(0, 60);
    if (!clean) throw new Error("Please enter your display name.");
    const updated = { ...profile, name: clean };
    try { localStorage.setItem(profileKey, JSON.stringify(updated)); }
    catch { throw new Error("Could not save your display name. Browser storage may be full or disabled."); }
    profile = updated;
  }
  function section(id) {
    ["initiative-location", "hotspot-form", "nearby-initiatives", "initiative-detail"].forEach((key) => { $(key).hidden = key !== id; });
    $("report-steps").hidden = !(id === "hotspot-form" || (id === "initiative-location" && state.picking === "report"));
    $("report-step-location").toggleAttribute("aria-current", id === "initiative-location");
    $("report-step-details").toggleAttribute("aria-current", id === "hotspot-form");
    if (id === "initiative-location") $("report-step-location").setAttribute("aria-current", "step");
    if (id === "hotspot-form") $("report-step-details").setAttribute("aria-current", "step");
  }
  function open(title) {
    if (drawer.hidden) {
      state.focus = document.activeElement;
      window.PlanetPanels?.setCollapsed("category-panel", true);
    }
    drawer.hidden = false;
    window.PlanetPanels?.expand("initiative-panel");
    document.body.classList.add("initiative-open");
    $("initiative-heading").textContent = title;
    panel.classList.remove("open");
    drawer.focus({ preventScroll: true });
    status("");
  }
  function stopPicking() {
    state.picking = null;
    broomie.setActive(false);
    map.getContainer().classList.remove("report-picking");
  }
  function clearDraft() {
    state.generation++;
    if (state.marker) map.removeLayer(state.marker);
    state.marker = null;
    state.draft = null;
  }
  function close() {
    stopPicking(); clearDraft();
    state.addressRequest?.abort();
    drawer.hidden = true;
    document.body.classList.remove("initiative-open");
    state.focus?.focus?.({ preventScroll: true });
  }
  function selectLocation(latlng, label) {
    const mode = state.picking;
    stopPicking();
    const location = { lat: latlng.lat, lng: latlng.lng, label: label || "Selected map location" };
    if (mode === "nearby") {
      state.origin = location;
      showNearby();
      return;
    }
    state.draft = location;
    if (state.marker) map.removeLayer(state.marker);
    state.marker = L.marker(latlng, { draggable: true, title: "Hotspot location — drag to adjust", icon: hotspotIcon(true) }).addTo(map);
    state.marker.on("dragend", () => {
      const ll = state.marker.getLatLng();
      state.draft = { lat: ll.lat, lng: ll.lng, label: "Adjusted map location" };
      locationSummary();
    });
    section("hotspot-form");
    window.PlanetPanels?.expand("initiative-panel");
    locationSummary();
    $("hotspot-title").focus({ preventScroll: true });
    status("Spot selected. Tell volunteers what needs cleaning up.");
  }
  function locationSummary() {
    if (state.draft) $("hotspot-coordinates").textContent = `${state.draft.label} · ${state.draft.lat.toFixed(5)}, ${state.draft.lng.toFixed(5)}`;
  }
  function pick(mode) {
    stopPicking();
    state.picking = mode;
    section("initiative-location");
    $("location-heading").textContent = mode === "nearby" ? "Where would you like to volunteer?" : "Where is the hotspot?";
    $("location-instructions").textContent = mode === "report"
      ? "Broomie is ready. Click a spot on the map, or switch to address search. Escape cancels."
      : "Choose how you'd like to find the spot. No GPS or device location needed.";
    $("address-results").replaceChildren();
    $("broomie-map-preview").hidden = mode !== "report";
    $("map-location-icon").hidden = mode === "report";
    locationMethod(mode === "report" ? "map" : "address");
  }
  function locationMethod(method) {
    const useMap = method === "map";
    if (useMap) state.addressRequest?.abort();
    map.getContainer().classList.toggle("report-picking", useMap && !!state.picking);
    broomie.setActive(useMap && state.picking === "report");
    $("location-method-address").setAttribute("aria-pressed", String(!useMap));
    $("location-method-map").setAttribute("aria-pressed", String(useMap));
    $("address-search").hidden = useMap;
    $("address-results").hidden = useMap;
    $("map-location-help").hidden = !useMap;
    status(useMap ? "Click a spot on the map. The little reticle marks the exact location; drag the pin afterwards to adjust it." : "");
  }
  function beginReport() {
    open("Report a hotspot");
    run(() => {
      requireStore(); clearDraft();
      $("hotspot-form").reset();
      $("reporter-name").value = profile.name;
      $("hotspot-photo-previews").replaceChildren();
      pick("report");
    });
  }
  $("report-hotspot").addEventListener("click", beginReport);
  $("initiative-close").addEventListener("click", close);
  $("change-hotspot-location").addEventListener("click", () => pick("report"));
  $("use-map-center").addEventListener("click", () => selectLocation(map.getCenter(), "Map centre"));
  $("location-method-address").addEventListener("click", () => locationMethod("address"));
  $("location-method-map").addEventListener("click", () => locationMethod("map"));
  $("pick-volunteer-location").addEventListener("click", () => pick("nearby"));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !drawer.hidden) { event.preventDefault(); close(); } });
  document.addEventListener("planet:city-set", (event) => {
    state.city = event.detail.name;
    state.origin = { ...event.detail.center, label: event.detail.name };
    $("report-hotspot").title = `Report a hotspot in ${state.city}`;
    if (!drawer.hidden && !$("nearby-initiatives").hidden) run(renderNearby);
  });
  // Capture the placement click before the pollution polygons open their details.
  map.getContainer().addEventListener("click", (event) => {
    if (!state.picking || !map.getContainer().classList.contains("report-picking") || event.target.closest(".leaflet-control")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (map.dragging.moved()) return;
    selectLocation(map.mouseEventToLatLng(event));
  }, true);

  $("address-search").addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = $("hotspot-address").value.trim();
    if (!query || !state.picking) return;
    if (Date.now() - state.lastLookup < 1200) { status("Please wait a moment between address searches."); return; }
    const generation = state.generation;
    state.addressRequest?.abort();
    const controller = new AbortController();
    state.addressRequest = controller;
    const button = event.submitter || $("address-search").querySelector("button");
    button.disabled = true;
    $("address-results").replaceChildren();
    status("Looking up that address…");
    try {
      let results = addressCache.get(query);
      if (!results) {
        state.lastLookup = Date.now();
        const params = new URLSearchParams({
          q: query, format: "jsonv2", limit: "5",
          countrycodes: "us,ca,mx,gl,bm,pm,gt,bz,sv,hn,ni,cr,pa,cu,jm,ht,do,bs,tc,ky,pr,vi,vg,ai,kn,ag,ms,gp,mf,bl,dm,mq,lc,vc,bb,gd,tt,aw,cw,bq,sx,co,ve,gy,sr,gf,ec,pe,bo,br,py,cl,ar,uy,fk",
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Address lookup is unavailable. Please try again later or choose a spot on the map.");
        results = await response.json();
        addressCache.set(query, results);
      }
      if (generation !== state.generation || !state.picking) return;
      for (const result of results) {
        const lat = Number(result.lat), lng = Number(result.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const li = document.createElement("li"), choice = document.createElement("button");
        choice.type = "button"; choice.textContent = result.display_name;
        choice.addEventListener("click", () => {
          map.setView([lat, lng], 16, { animate: false });
          selectLocation({ lat, lng }, result.display_name);
        });
        li.append(choice); $("address-results").append(li);
      }
      status(results.length ? "Select an address below, then adjust the pin if needed." : "No address found. Try adding the city and country, or choose a spot on the map.");
    } catch (error) { if (error.name !== "AbortError") status(error.message, true); }
    finally { button.disabled = false; }
  });

  async function resizePhoto(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Use JPEG, PNG, or WebP photos smaller than 10 MB each.");
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.65);
      if (data.length > 350000) throw new Error("One photo is still too large. Please choose a smaller image.");
      return data;
    } finally { bitmap.close(); }
  }
  function renderImages(container, images, title) {
    container.replaceChildren();
    images.forEach((src, i) => {
      if (!/^data:image\/jpeg;base64,/.test(src)) return;
      const image = document.createElement("img"); image.src = src;
      image.alt = `${title}, photo ${i + 1}`; image.loading = "lazy";
      container.append(image);
    });
  }
  let photos = [], photoTask = Promise.resolve(), photoRevision = 0;
  $("hotspot-images").addEventListener("change", () => {
    const revision = ++photoRevision;
    photos = [];
    $("hotspot-photo-previews").replaceChildren();
    const files = [...$("hotspot-images").files];
    photoTask = (async () => {
      if (files.length > 3) throw new Error("Choose no more than three photos.");
      const images = await Promise.all(files.map(resizePhoto));
      if (revision !== photoRevision) return;
      photos = images;
      renderImages($("hotspot-photo-previews"), photos, "Hotspot preview");
    })();
    photoTask.catch((error) => status(error.message, true));
  });
  $("hotspot-form").addEventListener("reset", () => {
    photoRevision++; photos = []; photoTask = Promise.resolve();
  });
  $("hotspot-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("hotspot-form").querySelector('[type="submit"]');
    const generation = state.generation;
    button.disabled = true;
    try {
      requireStore(); await photoTask;
      if (generation !== state.generation || !state.draft) return;
      rememberName($("reporter-name").value);
      const report = store.create({
        title: $("hotspot-title").value, name: profile.name, role: $("reporter-role").value,
        description: $("hotspot-description").value, needed: $("volunteers-needed").value,
        images: photos, location: state.draft,
      });
      state.origin ||= { ...state.draft };
      clearDraft(); refreshMarkers(); showDetail(report.id);
      status("Hotspot saved on this browser. It is not publicly published.");
    } catch (error) { status(error.message, true); }
    finally { button.disabled = false; }
  });

  function distance(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  function showNearby() {
    stopPicking(); clearDraft();
    open("Volunteer nearby"); section("nearby-initiatives");
    if (state.origin) map.setView([state.origin.lat, state.origin.lng], Math.max(10, Math.min(12, map.getZoom())), { animate: false });
    run(renderNearby);
  }
  function renderNearby() {
    requireStore();
    $("nearby-location-label").textContent = state.origin ? `${state.origin.label || "Your selected location"}` : "Set your city, or choose an address or map location.";
    $("use-home-city").disabled = !window.PlanetCity?.get();
    $("use-home-city").textContent = state.city ? `Use ${state.city}` : "Use your city";
    const container = $("initiative-cards"); container.replaceChildren();
    const radius = Number($("initiative-radius").value);
    const reports = state.origin ? store.load().map((report) => ({ report, km: distance(state.origin, report.location) })).filter((r) => r.km <= radius).sort((a, b) => a.km - b.km) : [];
    $("nearby-result-count").textContent = state.origin ? `${reports.length} local ${reports.length === 1 ? "opportunity" : "opportunities"} within ${radius} km` : "";
    if (!reports.length) {
      const empty = document.createElement("div"), icon = document.createElement("span"), heading = document.createElement("h4"), description = document.createElement("p"), action = document.createElement("button");
      empty.className = "initiative-empty";
      icon.textContent = "✧"; icon.setAttribute("aria-hidden", "true");
      heading.textContent = state.origin ? "Be the first to make a difference" : "Your community is waiting";
      description.textContent = state.origin ? "No cleanups saved nearby yet. Widen your radius, or bring people together around a spot that needs some care." : "Set your city above, or choose a specific address or map location to explore.";
      action.type = "button"; action.textContent = "＋ Report a hotspot";
      action.addEventListener("click", beginReport);
      empty.append(icon, heading, description, action);
      container.append(empty);
    }
    reports.forEach(({ report, km }) => {
      const card = document.createElement("button"); card.type = "button"; card.className = "initiative-card";
      const title = document.createElement("strong"), meta = document.createElement("span"), content = document.createElement("div"), thumbnail = document.createElement(report.images.length ? "img" : "span");
      thumbnail.className = "initiative-card-thumbnail";
      if (report.images.length && /^data:image\/jpeg;base64,/.test(report.images[0])) { thumbnail.src = report.images[0]; thumbnail.alt = ""; }
      else { thumbnail.textContent = "♡"; thumbnail.setAttribute("aria-hidden", "true"); }
      title.textContent = report.title;
      const remaining = Math.max(0, report.needed - report.members.length);
      meta.textContent = `${km.toFixed(1)} km away · ${remaining ? `${remaining} volunteers needed` : "Fully signed up"}`;
      content.append(title, meta); card.append(thumbnail, content); card.addEventListener("click", () => showDetail(report.id));
      container.append(card);
    });
  }
  $("find-initiatives").addEventListener("click", showNearby);
  $("back-to-initiatives").addEventListener("click", showNearby);
  $("initiative-radius").addEventListener("change", () => run(renderNearby));
  $("use-home-city").addEventListener("click", () => {
    const city = window.PlanetCity?.get();
    if (!city) return;
    state.origin = { ...city.center, label: city.name };
    map.setView(city.center, 11, { animate: false });
    run(renderNearby);
  });
  $("choose-volunteer-city").addEventListener("click", () => {
    close(); document.dispatchEvent(new CustomEvent("planet:choose-city"));
  });
  function refreshMarkers() {
    requireStore(); reportMarkers.clearLayers();
    store.load().forEach((report) => {
      const marker = L.marker([report.location.lat, report.location.lng], {
        title: report.title,
        icon: hotspotIcon(),
      });
      const label = document.createElement("span"); label.textContent = report.title;
      marker.bindTooltip(label);
      marker.on("click", () => run(() => showDetail(report.id)));
      reportMarkers.addLayer(marker);
    });
  }
  function showDetail(id) {
    requireStore();
    const report = store.load().find((r) => r.id === id);
    if (!report) throw new Error("This initiative is no longer available.");
    state.selected = id;
    stopPicking(); open("Cleanup initiative"); section("initiative-detail");
    $("detail-title").textContent = report.title;
    $("detail-author").textContent = `Reported by ${report.author} · ${report.role} · ${new Date(report.createdAt).toLocaleDateString()}`;
    $("detail-location").textContent = `${report.location.label} (${report.location.lat.toFixed(5)}, ${report.location.lng.toFixed(5)})`;
    $("detail-description").textContent = report.description;
    renderImages($("detail-images"), report.images, report.title);
    const joined = report.members.some((member) => member.id === profile.id);
    const remaining = Math.max(0, report.needed - report.members.length);
    $("detail-volunteers").textContent = `${report.members.length} / ${report.needed} volunteers signed up · ${remaining} still needed`;
    $("volunteer-name").value = profile.name;
    $("join-initiative").textContent = joined ? "You're signed up · Group chat below" : remaining ? "Sign up & enter group chat" : "All places filled";
    $("join-initiative").disabled = joined || !remaining;
    $("leave-initiative").hidden = !joined;
    $("initiative-chat").hidden = !joined && report.authorId !== profile.id;
    renderChat(report);
  }
  function renderChat(report) {
    const messages = $("chat-messages"); messages.replaceChildren();
    if (!report.messages.length) {
      const empty = document.createElement("p"); empty.textContent = "No local messages yet. Plan a meeting point, supplies, and a safe cleanup.";
      messages.append(empty);
    }
    report.messages.forEach((message) => {
      const row = document.createElement("article"), author = document.createElement("strong"), body = document.createElement("p"), time = document.createElement("time");
      author.textContent = message.author; body.textContent = message.body;
      time.dateTime = message.createdAt; time.textContent = new Date(message.createdAt).toLocaleString();
      row.append(author, time, body); messages.append(row);
    });
    messages.scrollTop = messages.scrollHeight;
  }
  $("join-initiative").addEventListener("click", () => run(() => {
    requireStore(); rememberName($("volunteer-name").value);
    store.join(state.selected, profile.name); showDetail(state.selected);
    status("You're signed up locally. The chat is a local demo, not a live group.");
    $("chat-message").focus();
  }));
  $("leave-initiative").addEventListener("click", () => run(() => {
    requireStore(); store.leave(state.selected); showDetail(state.selected);
    status("Your local volunteer sign-up was removed.");
  }));
  $("chat-form").addEventListener("submit", (event) => {
    event.preventDefault(); run(() => {
      requireStore();
      const report = store.message(state.selected, profile.name, $("chat-message").value);
      $("chat-message").value = ""; renderChat(report);
      status("Message saved locally — not sent to other devices.");
    });
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== PlanetInitiatives.KEY) return;
    run(() => {
      refreshMarkers();
      if (!drawer.hidden && !$("initiative-detail").hidden && state.selected) showDetail(state.selected);
      else if (!drawer.hidden && !$("nearby-initiatives").hidden) renderNearby();
    });
  });
  L.DomEvent.disableClickPropagation(drawer);
  L.DomEvent.disableScrollPropagation(drawer);
  run(() => { if (store) refreshMarkers(); });
})();
