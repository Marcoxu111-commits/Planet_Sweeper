// PJJ-2 v1 — North America litter heat map.
// Boundaries: real ArcGIS feature services (data/*.geojson)
//  - US: DOT BTS "2020 Census Urban Areas" — ALL 2,646 urban areas
//  - CA: Population Centres 2021 w/ population — ALL 1,030 centres
//  - Toronto: City of Toronto "COTGEO_CITY_WARD" (25 wards)
//  - Markham: City of Markham "OD_WARDS" (8 wards)
// Litter metric: REAL 311 litter-service-request density (reports/km²/yr)
// where open data exists (NYC, Chicago, LA, Toronto — see data/real_litter.js),
// otherwise a modeled estimate derived from real population density.
// Click any region for details.

const DETAIL_ZOOM = 9;
const LOGMIN = 0.5; // 10^0.5 = ~3 reports/km²/yr
const LOGMAX = 2.0; // 10^2   = 100 reports/km²/yr

const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([43.2, -95], 5);

// Esri World Imagery satellite basemap (no API key required)
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Imagery &copy; Esri &mdash; Boundaries: US DOT BTS (Census 2020), StatCan 2021, City of Toronto, City of Markham &mdash; Litter data: NYC/Chicago/LA/Toronto 311",
  maxZoom: 18,
}).addTo(map);

// ---------- Colour scale: log-normalized reports/km² -> green..red ----------
function tOf(metric) {
  const lg = Math.log10(Math.max(metric, Math.pow(10, LOGMIN)));
  return Math.min(1, Math.max(0, (lg - LOGMIN) / (LOGMAX - LOGMIN)));
}

function colorFor(metric) {
  const t = tOf(metric);
  const te = Math.pow(t, 0.75); // exaggerate: push mid values toward red faster
  const hue = 130 * (1 - te) - 10;
  return `hsl(${hue.toFixed(0)}, 92%, ${48 - 6 * t}%)`;
}

function severityLabel(metric) {
  const m = Math.pow(10, LOGMIN + tOf(metric) * (LOGMAX - LOGMIN));
  if (m < 2) return "Low";
  if (m < 8) return "Moderate";
  if (m < 25) return "High";
  return "Very High";
}

function hash(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) % 100000) / 100000;
  return h;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Modeled metric (reports/km² equivalent) from real population density.
function modeledMetric(name, pop, areaKm2) {
  const dens = areaKm2 > 0 ? pop / areaKm2 : 0;
  if (dens <= 0) return Math.pow(10, LOGMIN);
  const v = clamp(-4.5 + 3.8 * Math.log10(dens) + (hash(name) - 0.5) * 1.6, 2, 9.5);
  return Math.pow(10, LOGMIN + ((v - 2) / 7.5) * (LOGMAX - LOGMIN));
}

// Ward populations are not published in the ward services; estimate them
// deterministically (flagged as estimates in the panel).
function wardPopulation(name, kind) {
  const base = kind === "Toronto" ? 60000 : 25000;
  const range = kind === "Toronto" ? 100000 : 40000;
  return Math.round(base + hash(name) * range);
}

function wardMetric(name) {
  return modeledMetric(name, wardPopulation(name, "Markham"), 25);
}

// ---------- Geometry helpers ----------
function centroidOf(geometry) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  (function walk(c) {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
      return;
    }
    c.forEach(walk);
  })(geometry.coordinates);
  return [(minY + maxY) / 2, (minX + maxX) / 2];
}

// ---------- Real 311 data wiring ----------
const REAL311 = window.PJJ_REAL_311 || { cities: {}, torontoWards: {} };

// Real city data covers the city proper, while the map polygon is the whole
// urban area — normalize using the city's share of the urban-area population.
const CITY_MATCH = [
  { key: "New York", prefix: "New York" },
  { key: "Chicago", prefix: "Chicago" },
  { key: "Los Angeles", prefix: "Los Angeles" },
  { key: "Toronto", prefix: "Toronto", country: "CA" },
];

function realMetricFor(name, country, uaPop, areaKm2) {
  const match = CITY_MATCH.find((c) =>
    name.startsWith(c.prefix) && (c.country ? country === c.country : country === "US")
  );
  if (!match || !REAL311.cities[match.key]) return null;
  const r = REAL311.cities[match.key];
  const share = Math.min(1, r.cityPop / uaPop);
  return {
    metric: r.reports / (areaKm2 * share),
    reports: r.reports,
    period: r.period,
    source: r.source,
    types: r.types,
  };
}

// ---------- Faded polygon layer (canvas for 3,600+ shapes) ----------
const canvasRenderer = L.canvas({ padding: 0.3 });

const baseStyle = (metric) => ({
  renderer: canvasRenderer,
  stroke: false,
  fillColor: colorFor(metric),
  fillOpacity: 0.78,
  smoothFactor: 1.5,
});

const hoverStyle = (metric) => ({
  stroke: true,
  color: "#fff",
  weight: 2,
  fillColor: colorFor(metric),
  fillOpacity: 0.92,
});

// ---------- Details panel ----------
const panel = document.getElementById("info-panel");
const panelBody = document.getElementById("info-panel-body");

function fmtInt(n) {
  return Math.round(n).toLocaleString("en-CA");
}

function showPanel(d) {
  const sevColor = colorFor(d.metric);
  const popLine = d.population != null
    ? `${fmtInt(d.population)}${d.popEstimated ? ' <span class="est">(est.)</span>' : ""}`
    : "—";
  const dataBadge = d.real
    ? `<div class="row real"><span>Data</span><strong>Real 311 reports &middot; ${d.period}</strong></div>`
    : `<div class="row estrow"><span>Data</span><strong>Modeled estimate</strong></div>`;
  panelBody.innerHTML = `
    <h2>${d.name}</h2>
    <p class="sub">${d.sub}</p>
    <div class="sev" style="background:${sevColor}">${severityLabel(d.metric)}</div>
    <div class="row"><span>Reports per km²</span><strong>${d.metric.toFixed(1)}</strong></div>
    ${d.real ? `<div class="row"><span>Litter reports (${d.period})</span><strong>${fmtInt(d.reports)}</strong></div>` : ""}
    <div class="row"><span>Population</span><strong>${popLine}</strong></div>
    <div class="row"><span>Area</span><strong>${d.areaKm2.toFixed(1)} km²</strong></div>
    ${dataBadge}
    ${d.extra ? `<p class="extra">${d.extra}</p>` : ""}
    <p class="src">${d.source}</p>
  `;
  panel.classList.add("open");
}

document.getElementById("info-panel-close").addEventListener("click", () => {
  panel.classList.remove("open");
});

// ---------- City polygons ----------
const cityLayer = L.layerGroup();
const heatPoints = []; // [lat, lng, intensity, areaKm2]

function addCity(feature, name, sub, metric, areaKm2, population, source, extra, realInfo) {
  const poly = L.geoJSON(feature, { style: () => baseStyle(metric) }).getLayers()[0];
  poly.on("mouseover", () => poly.setStyle(hoverStyle(metric)).bringToFront());
  poly.on("mouseout", () => poly.setStyle(baseStyle(metric)));
  poly.bindTooltip(
    `<strong>${name}</strong><br>` +
      `${realInfo ? `Reports: <strong>${fmtInt(realInfo.reports)}/yr</strong> (${realInfo.period})<br>` : ""}` +
      `${metric.toFixed(1)} reports/km²/yr — ${severityLabel(metric)}${realInfo ? "" : "<br><em>modeled estimate</em>"}`,
    { sticky: true, className: "pjj-tip" }
  );
  poly.on("click", () =>
    showPanel({
      name, sub, metric, areaKm2, population, popEstimated: false, source, extra,
      real: !!realInfo, reports: realInfo && realInfo.reports, period: realInfo && realInfo.period,
    })
  );
  cityLayer.addLayer(poly);
  const c = centroidOf(feature.geometry);
  heatPoints.push([c[0], c[1], tOf(metric), areaKm2]);
}

(window.PJJ_US_CITIES.features || []).forEach((f) => {
  const p = f.properties;
  const areaKm2 = p.AREA * 2.58999;
  const real = realMetricFor(p.NAME, "US", p.Population, areaKm2);
  const metric = real ? real.metric : modeledMetric(p.NAME, p.Population, areaKm2);
  addCity(f, p.NAME.replace(/--/g, " – "), "USA — urban area (Census 2020)", metric, areaKm2,
    p.Population, real ? real.source : "Modeled from US Census 2020 population density",
    real ? `Includes: ${real.types}` : null, real);
});

(window.PJJ_CA_CITIES.features || []).forEach((f) => {
  const p = f.properties;
  const real = realMetricFor(p.pcname, "CA", p.population, p.landarea);
  const metric = real ? real.metric : modeledMetric(p.pcname, p.population, p.landarea);
  addCity(f, p.pcname, "Canada — population centre (StatCan 2021)", metric, p.landarea,
    p.population, real ? real.source : "Modeled from StatCan 2021 population density",
    real ? `Includes: ${real.types}` : null, real);
});

// ---------- Faded heat glow (leaflet.heat, zoom-scaled radii) ----------
// leaflet.heat has a single global radius, so cities are bucketed by area
// into small / medium / large layers, each with its own zoom-scaled radius.
const heatGradient = {
  0.0: "#00c853",
  0.35: "#7ccb3a",
  0.55: "#ffd600",
  0.75: "#ff6d00",
  1.0: "#d50000",
};

let heatLayers = [];

function heatRadiusPx(km2, mpp) {
  const rM = Math.sqrt((km2 * 1e6) / Math.PI) * 1.15;
  return clamp(rM / mpp, 6, 120);
}

function rebuildHeat() {
  if (typeof L.heatLayer !== "function") return;
  heatLayers.forEach((l) => map.removeLayer(l));
  heatLayers = [];
  if (map.getZoom() < 3) return;
  const zoom = map.getZoom();
  const mpp = (156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const buckets = { small: [], medium: [], large: [] };
  heatPoints.forEach(([lat, lng, i, km2]) => {
    if (km2 >= 800) buckets.large.push([lat, lng, i]);
    else if (km2 >= 150) buckets.medium.push([lat, lng, i]);
    else buckets.small.push([lat, lng, i]);
  });
  const radii = {
    small: heatRadiusPx(60, mpp),
    medium: heatRadiusPx(400, mpp),
    large: heatRadiusPx(3500, mpp),
  };
  Object.keys(buckets).forEach((k) => {
    if (!buckets[k].length) return;
    const layer = L.heatLayer(buckets[k], {
      radius: radii[k],
      blur: 0.85,
      maxZoom: 12,
      maxOpacity: 0.85,
      minOpacity: 0.06,
      gradient: heatGradient,
    });
    heatLayers.push(layer);
    map.addLayer(layer);
    if (layer._canvas) layer._canvas.style.pointerEvents = "none";
  });
}
map.on("zoomend", rebuildHeat);

// ---------- GTA detail: Toronto & Markham wards ----------
// Toronto wards: REAL ward-level 311 report counts. Markham: modeled.
const detailLayers = { Toronto: L.layerGroup(), Markham: L.layerGroup() };

(window.PJJ_TORONTO_WARDS.features || []).forEach((f) => {
  const p = f.properties;
  const areaKm2 = p.Shape__Area / 1e6;
  const code = String(p.AREA_SHORT_CODE).padStart(2, "0");
  const reports = (REAL311.torontoWards || {})[code];
  const metric = reports != null
    ? reports / areaKm2
    : wardMetric(p.AREA_NAME);
  const pop = wardPopulation(p.AREA_NAME, "Toronto");
  const name = `${p.AREA_SHORT_CODE} — ${p.AREA_NAME}`;
  const realInfo = reports != null
    ? { reports, period: "2025", source: REAL311.wardSource }
    : null;
  const poly = L.geoJSON(f, { style: () => ({ ...baseStyle(metric), fillOpacity: 0.8 }) }).getLayers()[0];
  poly.on("mouseover", () => poly.setStyle(hoverStyle(metric)).bringToFront());
  poly.on("mouseout", () => poly.setStyle({ ...baseStyle(metric), fillOpacity: 0.8 }));
  poly.bindTooltip(
    `<strong>${name}</strong><br>` +
      (realInfo
        ? `Reports: <strong>${fmtInt(reports)}</strong> (${realInfo.period})<br>`
        : "") +
      `${metric.toFixed(1)} reports/km²/yr — ${severityLabel(metric)}${realInfo ? "" : "<br><em>modeled estimate</em>"}`,
    { sticky: true, className: "pjj-tip" }
  );
  poly.on("click", () =>
    showPanel({
      name, sub: "Toronto ward", metric, areaKm2, population: pop, popEstimated: true,
      real: !!realInfo, reports: realInfo && realInfo.reports, period: realInfo && realInfo.period,
      source: realInfo ? REAL311.wardSource : "Modeled — no ward-level open litter data",
    })
  );
  detailLayers.Toronto.addLayer(poly);
});

(window.PJJ_MARKHAM_WARDS.features || []).forEach((f) => {
  const p = f.properties;
  const areaKm2 = p.HECTARES / 100;
  const metric = wardMetric("Markham Ward " + p.WARD);
  const pop = wardPopulation("Markham Ward " + p.WARD, "Markham");
  const name = `Ward ${p.WARD}`;
  const poly = L.geoJSON(f, { style: () => ({ ...baseStyle(metric), fillOpacity: 0.8 }) }).getLayers()[0];
  poly.on("mouseover", () => poly.setStyle(hoverStyle(metric)).bringToFront());
  poly.on("mouseout", () => poly.setStyle({ ...baseStyle(metric), fillOpacity: 0.8 }));
  poly.bindTooltip(
    `<strong>${name}</strong><br>Markham — Councillor ${p.COUNCILLOR}<br>` +
      `${metric.toFixed(1)} reports/km²/yr — ${severityLabel(metric)}<br><em>modeled estimate</em>`,
    { sticky: true, className: "pjj-tip" }
  );
  poly.on("click", () =>
    showPanel({
      name, sub: `Markham ward — Councillor ${p.COUNCILLOR}`, metric, areaKm2,
      population: pop, popEstimated: true, real: false,
      source: "Modeled — no ward-level open litter data",
    })
  );
  detailLayers.Markham.addLayer(poly);
});

// ---------- Zoom-based switching (GTA shows ward detail) ----------
const detailCityLayers = [detailLayers.Toronto, detailLayers.Markham];

function updateLayers() {
  const zoomed = map.getZoom() >= DETAIL_ZOOM;
  const c = map.getCenter();
  const inGTA = Math.abs(c.lat - 43.75) < 1.0 && Math.abs(c.lng - -79.4) < 1.4;
  if (zoomed && inGTA) {
    map.removeLayer(cityLayer);
    heatLayers.forEach((l) => map.removeLayer(l)); // clean ward view, no glow
    detailCityLayers.forEach((l) => map.addLayer(l));
  } else {
    detailCityLayers.forEach((l) => map.removeLayer(l));
    heatLayers.forEach((l) => { if (!map.hasLayer(l)) map.addLayer(l); });
    map.addLayer(cityLayer);
  }
}

map.on("zoomend", updateLayers);
map.whenReady(() => {
  updateLayers();
  rebuildHeat();
});