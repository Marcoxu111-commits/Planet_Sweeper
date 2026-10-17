// PJJ-2 v1 — North America litter heat map.
// Boundaries: real ArcGIS feature services (data/*.geojson)
//  - US: DOT BTS "2020 Census Urban Areas" — ALL 2,646 urban areas
//  - CA: Population Centres 2021 w/ population — ALL 1,030 centres
//  - Toronto: City of Toronto "COTGEO_CITY_WARD" (25 wards)
//  - Markham: City of Markham "OD_WARDS" (8 wards)
// Litter density (t/km2) is v1 sample data derived from real attributes.
// Click any region to open the details panel.

const DETAIL_ZOOM = 9;
const VMIN = 2.0;
const VMAX = 9.5;

const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([43.2, -95], 5);

// Esri World Imagery satellite basemap (no API key required)
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Imagery &copy; Esri &mdash; Boundaries: US DOT BTS (Census 2020), StatCan 2021, City of Toronto, City of Markham",
  maxZoom: 18,
}).addTo(map);

// ---------- Colour scale: green -> yellow -> red ----------
function colorFor(v) {
  const t = Math.min(1, Math.max(0, (v - VMIN) / (VMAX - VMIN)));
  const te = Math.pow(t, 0.75); // exaggerate: push mid values toward red faster
  const hue = 130 * (1 - te) - 10;
  return `hsl(${hue.toFixed(0)}, 92%, ${48 - 6 * t}%)`;
}

function severityLabel(v) {
  if (v < 3.5) return "Low";
  if (v < 5.5) return "Moderate";
  if (v < 7.5) return "High";
  return "Very High";
}

function hash(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) % 100000) / 100000;
  return h;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const norm = (v) => clamp((v - VMIN) / (VMAX - VMIN), 0.05, 1);

// ---------- Sample litter values ----------
// Driven by real population density (people per km2 of the actual boundary).
function cityValue(name, pop, areaKm2) {
  const densKm2 = areaKm2 > 0 ? pop / areaKm2 : 0;
  if (densKm2 <= 0) return VMIN;
  return clamp(-4.5 + 3.8 * Math.log10(densKm2) + (hash(name) - 0.5) * 1.6, VMIN, VMAX);
}

// Ward populations are not published in the ward services; estimate them
// deterministically (flagged as estimates in the panel).
function wardPopulation(name, kind) {
  const base = kind === "Toronto" ? 60000 : 25000;
  const range = kind === "Toronto" ? 100000 : 40000;
  return Math.round(base + hash(name) * range);
}

function wardValue(name) {
  return clamp(2.2 + hash(name) * 7.1, VMIN, VMAX);
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

// ---------- Faded polygon layer (canvas for 3,600+ shapes) ----------
const canvasRenderer = L.canvas({ padding: 0.3 });

const baseStyle = (v) => ({
  renderer: canvasRenderer,
  stroke: false,
  fillColor: colorFor(v),
  fillOpacity: 0.78,
  smoothFactor: 1.5,
});

const hoverStyle = (v) => ({
  stroke: true,
  color: "#fff",
  weight: 2,
  fillColor: colorFor(v),
  fillOpacity: 0.92,
});

function attachHover(layer, value) {
  layer.on("mouseover", () => layer.setStyle(hoverStyle(value)).bringToFront());
  layer.on("mouseout", () => layer.setStyle(baseStyle(value)));
}

// ---------- Details panel ----------
const panel = document.getElementById("info-panel");
const panelBody = document.getElementById("info-panel-body");

function fmtInt(n) {
  return Math.round(n).toLocaleString("en-CA");
}

function showPanel(d) {
  const total = d.value * d.areaKm2;
  const sevColor = colorFor(d.value);
  const popLine = d.population != null
    ? `${fmtInt(d.population)}${d.popEstimated ? ' <span class="est">(est.)</span>' : ""}`
    : "—";
  panelBody.innerHTML = `
    <h2>${d.name}</h2>
    <p class="sub">${d.sub}</p>
    <div class="sev" style="background:${sevColor}">${severityLabel(d.value)}</div>
    <div class="row"><span>Litter density</span><strong>${d.value.toFixed(1)} t/km²</strong></div>
    <div class="row"><span>Total litter</span><strong>${fmtInt(total)} tonnes</strong></div>
    <div class="row"><span>Population</span><strong>${popLine}</strong></div>
    <div class="row"><span>Area</span><strong>${d.areaKm2.toFixed(1)} km²</strong></div>
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

function addCity(feature, name, sub, value, areaKm2, population, source, extra) {
  const poly = L.geoJSON(feature, { style: () => baseStyle(value) }).getLayers()[0];
  attachHover(poly, value);
  poly.on("click", () =>
    showPanel({ name, sub, value, areaKm2, population, popEstimated: false, source, extra })
  );
  cityLayer.addLayer(poly);
  heatPoints.push([centroidOf(feature.geometry)[0], centroidOf(feature.geometry)[1], norm(value), areaKm2]);
}

(window.PJJ_US_CITIES.features || []).forEach((f) => {
  const p = f.properties;
  const areaKm2 = p.AREA * 2.58999;
  const v = cityValue(p.NAME, p.Population, areaKm2);
  addCity(f, p.NAME.replace(/--/g, " – "), "USA — urban area (Census 2020)", v, areaKm2,
    p.Population, "US Census Bureau 2020 Urban Areas via US DOT BTS ArcGIS");
});

(window.PJJ_CA_CITIES.features || []).forEach((f) => {
  const p = f.properties;
  const v = cityValue(p.pcname, p.population, p.landarea);
  addCity(f, p.pcname, "Canada — population centre (StatCan 2021)", v, p.landarea,
    p.population, "Statistics Canada 2021 Population Centres (ESDC ArcGIS)");
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
  });
}
map.on("zoomend", rebuildHeat);

// ---------- GTA detail: Toronto & Markham wards ----------
const detailLayers = { Toronto: L.layerGroup(), Markham: L.layerGroup() };

(window.PJJ_TORONTO_WARDS.features || []).forEach((f) => {
  const p = f.properties;
  const v = wardValue(p.AREA_NAME);
  const areaKm2 = p.Shape__Area / 1e6;
  const pop = wardPopulation(p.AREA_NAME, "Toronto");
  const name = `${p.AREA_SHORT_CODE} — ${p.AREA_NAME}`;
  const poly = L.geoJSON(f, { style: () => ({ ...baseStyle(v), fillOpacity: 0.8 }) }).getLayers()[0];
  attachHover(poly, v);
  poly.on("click", () =>
    showPanel({
      name, sub: "Toronto ward", value: v, areaKm2, population: pop,
      popEstimated: true, source: "City of Toronto COTGEO_CITY_WARD ArcGIS service",
    })
  );
  detailLayers.Toronto.addLayer(poly);
});

(window.PJJ_MARKHAM_WARDS.features || []).forEach((f) => {
  const p = f.properties;
  const v = wardValue("Markham Ward " + p.WARD);
  const areaKm2 = p.HECTARES / 100;
  const pop = wardPopulation("Markham Ward " + p.WARD, "Markham");
  const name = `Ward ${p.WARD}`;
  const poly = L.geoJSON(f, { style: () => ({ ...baseStyle(v), fillOpacity: 0.8 }) }).getLayers()[0];
  attachHover(poly, v);
  poly.on("click", () =>
    showPanel({
      name, sub: `Markham ward — Councillor ${p.COUNCILLOR}`, value: v, areaKm2,
      population: pop, popEstimated: true, source: "City of Markham OD_WARDS ArcGIS service",
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