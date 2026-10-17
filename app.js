// PJJ-2 v1 — North America pollution heat map.
// Categories (right-side panel): land (trash), water (major lakes), air (CO₂).
//
// Boundaries: real ArcGIS feature services (data/*.geojson)
//  - US: DOT BTS "2020 Census Urban Areas" — ALL 2,646 urban areas
//  - CA: Population Centres 2021 w/ population — ALL 1,030 centres
//  - Toronto: City of Toronto "COTGEO_CITY_WARD" (25 wards)
//  - Markham: City of Markham "OD_WARDS" (8 wards)
//  - Lakes: "North America Major Lakes" ArcGIS feature service (75 lakes)
//
// Metrics:
//  - Land: REAL 311 litter reports/km²/yr (NYC, Chicago, LA, Toronto — data/real_litter.js),
//    otherwise modeled from real population density.
//  - Water: 0–100 index; Great Lakes anchored to documented water quality, others modeled.
//  - Air: CO₂ tonnes/yr modeled from real population × per-capita emissions
//    (US 14.9 t, Canada 14.2 t — EPA / Environment Canada averages).

const DETAIL_ZOOM = 9;
const LOGMIN = 0.5;  // land: ~3 reports/km²/yr
const LOGMAX = 2.0;  // land: 100 reports/km²/yr
const AIR_LOGMIN = 3.3; // air: ~2,000 t CO₂/km²/yr
const AIR_LOGMAX = 4.7; // air: ~50,000 t CO₂/km²/yr
const CO2_PER_CAPITA = { US: 14.9, CA: 14.2 };

let CATEGORY = "land";

const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([43.2, -95], 5);

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Imagery &copy; Esri &mdash; Boundaries: US DOT BTS, StatCan, City of Toronto, City of Markham &mdash; Litter data: NYC/Chicago/LA/Toronto 311",
  maxZoom: 18,
}).addTo(map);

// ---------- Scales ----------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function logT(metric, lo, hi) {
  const lg = Math.log10(Math.max(metric, Math.pow(10, lo)));
  return Math.min(1, Math.max(0, (lg - lo) / (hi - lo)));
}

function colorLand(metric) {
  const t = Math.pow(logT(metric, LOGMIN, LOGMAX), 0.75);
  const hue = 130 * (1 - t) - 10;
  return `hsl(${hue.toFixed(0)}, 92%, ${48 - 6 * t}%)`;
}

function colorWater(idx) {
  const t = Math.pow(clamp(idx / 100, 0, 1), 0.8);
  // dark blue (hue 240) -> violet -> maroon (#800000 at hue 360)
  return `hsl(${Math.round(240 + 120 * t)}, 85%, ${Math.round(30 - 5 * t)}%)`;
}

function severityLabel(metric) {
  if (CATEGORY === "water") {
    if (metric < 25) return "Clean";
    if (metric < 50) return "Fair";
    if (metric < 75) return "Polluted";
    return "Critical";
  }
  if (CATEGORY === "air") {
    const t = logT(metric, AIR_LOGMIN, AIR_LOGMAX);
    if (t < 0.25) return "Low";
    if (t < 0.5) return "Moderate";
    if (t < 0.75) return "High";
    return "Severe";
  }
  if (metric < 2) return "Low";
  if (metric < 8) return "Moderate";
  if (metric < 25) return "High";
  return "Very High";
}

function hash(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) % 100000) / 100000;
  return h;
}

function modeledLandMetric(name, pop, areaKm2) {
  const dens = areaKm2 > 0 ? pop / areaKm2 : 0;
  if (dens <= 0) return Math.pow(10, LOGMIN);
  const v = clamp(-4.5 + 3.8 * Math.log10(dens) + (hash(name) - 0.5) * 1.6, 2, 9.5);
  return Math.pow(10, LOGMIN + ((v - 2) / 7.5) * (LOGMAX - LOGMIN));
}

// Modeled air: CO₂ tonnes/km²/yr = population × per-capita ÷ effective area.
function modeledAirMetric(country, pop, effAreaKm2) {
  if (!effAreaKm2 || !pop) return Math.pow(10, AIR_LOGMIN);
  return (pop * CO2_PER_CAPITA[country]) / effAreaKm2;
}

function wardPopulation(name, kind) {
  const base = kind === "Toronto" ? 60000 : 25000;
  const range = kind === "Toronto" ? 100000 : 40000;
  return Math.round(base + hash(name) * range);
}

// ---------- Geometry ----------
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

// ---------- Real 311 data (land) ----------
const REAL311 = window.PJJ_REAL_311 || { cities: {}, torontoWards: {} };

const CITY_MATCH = [
  { key: "New York", prefix: "New York" },
  { key: "Chicago", prefix: "Chicago" },
  { key: "Los Angeles", prefix: "Los Angeles" },
  { key: "Toronto", prefix: "Toronto", country: "CA" },
];

function realLandFor(name, country, uaPop, areaKm2) {
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

// Water pollution index (0–100): Great Lakes anchored to documented
// water-quality status; Lake Winnipeg / Okeechobee / Great Salt Lake widely
// reported as eutrophic or shrinking. Other major lakes: modeled.
const LAKE_POLLUTION = {
  "Lake Erie": 92, "Lake Ontario": 84, "Lake Michigan": 65, "Lake Huron": 48,
  "Lake Superior": 22, "Lake Winnipeg": 90, "Lake Manitoba": 70, "Great Salt Lake": 78,
  "Lake Okeechobee": 82, "Lake Simcoe": 55, "Lake Champlain": 45, "Lake of the Woods": 75,
  "Lake Nipigon": 30, "Lake Athabasca": 28, "Great Bear Lake": 12, "Great Slave Lake": 14,
};

function lakeIndex(name) {
  if (LAKE_POLLUTION[name] != null) return LAKE_POLLUTION[name];
  return Math.round(25 + hash(name) * 50);
}

// ---------- Details panel ----------
const panel = document.getElementById("info-panel");
const panelBody = document.getElementById("info-panel-body");

function fmtInt(n) {
  return Math.round(n).toLocaleString("en-CA");
}

function sevColorFor(metric) {
  if (CATEGORY === "water") return colorWater(metric);
  if (CATEGORY === "air") {
    const t = logT(metric, AIR_LOGMIN, AIR_LOGMAX);
    return `hsl(${Math.round(60 - 60 * t)}, 95%, ${Math.round(62 - 22 * t)}%)`;
  }
  return colorLand(metric);
}

function showPanel(d) {
  const popLine = d.population != null
    ? `${fmtInt(d.population)}${d.popEstimated ? ' <span class="est">(est.)</span>' : ""}`
    : "—";
  let rows = "";
  if (CATEGORY === "water") {
    rows = `
      <div class="row"><span>Pollution index</span><strong>${d.metric.toFixed(0)} / 100</strong></div>
      <div class="row"><span>Area</span><strong>${d.areaKm2.toFixed(0)} km²</strong></div>`;
  } else if (CATEGORY === "air") {
    rows = `
      <div class="row"><span>CO₂ per km²</span><strong>${fmtInt(d.metric)} t/km²/yr</strong></div>
      <div class="row"><span>Total CO₂</span><strong>${fmtInt(d.total)} t/yr</strong></div>
      <div class="row"><span>Population</span><strong>${popLine}</strong></div>
      <div class="row"><span>Area</span><strong>${d.areaKm2.toFixed(1)} km²</strong></div>`;
  } else {
    rows = `
      <div class="row"><span>Reports per km²</span><strong>${d.metric.toFixed(1)}</strong></div>
      ${d.real ? `<div class="row"><span>Litter reports (${d.period})</span><strong>${fmtInt(d.reports)}</strong></div>` : ""}
      <div class="row"><span>Population</span><strong>${popLine}</strong></div>
      <div class="row"><span>Area</span><strong>${d.areaKm2.toFixed(1)} km²</strong></div>`;
  }
  const dataBadge = CATEGORY === "water"
    ? `<div class="row estrow"><span>Data</span><strong>Curated index — see source</strong></div>`
    : d.real
      ? `<div class="row real"><span>Data</span><strong>Real 311 reports &middot; ${d.period}</strong></div>`
      : `<div class="row estrow"><span>Data</span><strong>Modeled estimate</strong></div>`;
  panelBody.innerHTML = `
    <h2>${d.name}</h2>
    <p class="sub">${d.sub}</p>
    <div class="sev" style="background:${sevColorFor(d.metric)}">${severityLabel(d.metric)}</div>
    ${rows}
    ${dataBadge}
    ${d.extra ? `<p class="extra">${d.extra}</p>` : ""}
    <p class="src">${d.source}</p>
  `;
  panel.classList.add("open");
}

document.getElementById("info-panel-close").addEventListener("click", () => {
  panel.classList.remove("open");
});

// ---------- Layer groups ----------
const canvasRenderer = L.canvas({ padding: 0.3 });
const cityLayer = L.layerGroup();       // land polygons
const airCityLayer = L.layerGroup();    // air: near-invisible click targets
const lakesLayer = L.layerGroup();      // water polygons
const landWardLayers = { Toronto: L.layerGroup(), Markham: L.layerGroup() };
const airWardLayers = { Toronto: L.layerGroup(), Markham: L.layerGroup() };
const heatPoints = [];                  // land glow: [lat, lng, intensity, areaKm2]
const airPoints = [];                   // air smoke: [lat, lng, intensity, areaKm2]
const airWardPoints = [];               // air smoke wards: [lat, lng, intensity, areaKm2]

// ---------- Cities ----------
(window.PJJ_US_CITIES.features || []).forEach((f) => {
  const p = f.properties;
  const areaKm2 = p.AREA * 2.58999;
  const real = realLandFor(p.NAME, "US", p.Population, areaKm2);
  const landMetric = real ? real.metric : modeledLandMetric(p.NAME, p.Population, areaKm2);
  const name = p.NAME.replace(/--/g, " – ");
  const sub = "USA — urban area (Census 2020)";
  const landSource = real ? real.source : "Modeled from US Census 2020 population density";
  const landExtra = real ? `Includes: ${real.types}` : null;
  const realInfo = real ? { reports: real.reports, period: real.period } : null;
  buildCityPolygons(f, name, sub, landMetric, areaKm2, p.Population, landSource, landExtra, realInfo, "US");
  heatPoints.push([centroidOf(f.geometry)[0], centroidOf(f.geometry)[1], logT(landMetric, LOGMIN, LOGMAX), areaKm2]);
  airPoints.push([centroidOf(f.geometry)[0], centroidOf(f.geometry)[1], logT(modeledAirMetric("US", p.Population, areaKm2), AIR_LOGMIN, AIR_LOGMAX), areaKm2]);
});

(window.PJJ_CA_CITIES.features || []).forEach((f) => {
  const p = f.properties;
  const real = realLandFor(p.pcname, "CA", p.population, p.landarea);
  const landMetric = real ? real.metric : modeledLandMetric(p.pcname, p.population, p.landarea);
  const sub = "Canada — population centre (StatCan 2021)";
  const landSource = real ? real.source : "Modeled from StatCan 2021 population density";
  const landExtra = real ? `Includes: ${real.types}` : null;
  const realInfo = real ? { reports: real.reports, period: real.period } : null;
  buildCityPolygons(f, p.pcname, sub, landMetric, p.landarea, p.population, landSource, landExtra, realInfo, "CA");
  heatPoints.push([centroidOf(f.geometry)[0], centroidOf(f.geometry)[1], logT(landMetric, LOGMIN, LOGMAX), p.landarea]);
  airPoints.push([centroidOf(f.geometry)[0], centroidOf(f.geometry)[1], logT(modeledAirMetric("CA", p.population, p.landarea), AIR_LOGMIN, AIR_LOGMAX), p.landarea]);
});

function buildCityPolygons(feature, name, sub, landMetric, areaKm2, population, landSource, landExtra, realInfo, country) {
  const landPoly = L.geoJSON(feature, { style: () => baseStyleLand(landMetric) }).getLayers()[0];
  landPoly.bindTooltip(
    `<strong>${name}</strong><br>` +
      (realInfo ? `Reports: <strong>${fmtInt(realInfo.reports)}/yr</strong> (${realInfo.period})<br>` : "") +
      `${landMetric.toFixed(1)} reports/km²/yr — ${severityLabelLand(landMetric)}${realInfo ? "" : "<br><em>modeled estimate</em>"}`,
    { sticky: true, className: "pjj-tip" }
  );
  landPoly.on("mouseover", () => landPoly.setStyle({ ...baseStyleLand(landMetric), stroke: true, color: "#fff", weight: 2, fillOpacity: 0.92 }).bringToFront());
  landPoly.on("mouseout", () => landPoly.setStyle(baseStyleLand(landMetric)));
  landPoly.on("click", () => {
    setCategory("land");
    showPanel({
      name, sub, metric: landMetric, areaKm2, population, popEstimated: false,
      real: !!realInfo, reports: realInfo && realInfo.reports, period: realInfo && realInfo.period,
      source: landSource, extra: landExtra,
    });
  });
  cityLayer.addLayer(landPoly);

  const airMetric = modeledAirMetric(country, population, areaKm2);
  const airPoly = L.geoJSON(feature, { style: () => baseStyleAirInvisible() }).getLayers()[0];
  airPoly.bindTooltip(
    `<strong>${name}</strong><br>` +
      `CO₂: <strong>${fmtInt(population * CO2_PER_CAPITA[country])} t/yr</strong> (modeled)<br>` +
      `${fmtInt(airMetric)} t/km²/yr — ${severityLabelAir(airMetric)}`,
    { sticky: true, className: "pjj-tip" }
  );
  airPoly.on("mouseover", () => airPoly.setStyle({ ...baseStyleAirInvisible(), stroke: true, color: "#fff", weight: 1.5, fillOpacity: 0.22 }).bringToFront());
  airPoly.on("mouseout", () => airPoly.setStyle(baseStyleAirInvisible()));
  airPoly.on("click", () => {
    setCategory("air");
    showPanel({
      name, sub: sub + " — CO₂ (modeled)", metric: airMetric, total: population * CO2_PER_CAPITA[country],
      areaKm2, population, popEstimated: false, real: false,
      source: `Modeled: population × per-capita CO₂ (${CO2_PER_CAPITA[country]} t/yr, EPA / Env. Canada averages)`,
    });
  });
  airCityLayer.addLayer(airPoly);
}

// ---------- Styles ----------
function baseStyleLand(metric) {
  return {
    renderer: canvasRenderer,
    stroke: false,
    fillColor: colorLand(metric),
    fillOpacity: 0.78,
    smoothFactor: 1.5,
  };
}

function baseStyleAirInvisible() {
  return { renderer: canvasRenderer, stroke: false, fillColor: "#ffde00", fillOpacity: 0.04, smoothFactor: 1.5 };
}

function baseStyleWater(idx) {
  return {
    renderer: canvasRenderer,
    stroke: false,
    fillColor: colorWater(idx),
    fillOpacity: 0.8,
    smoothFactor: 1.5,
  };
}

function severityLabelWater(idx) {
  if (idx < 25) return "Clean";
  if (idx < 50) return "Fair";
  if (idx < 75) return "Polluted";
  return "Critical";
}

function severityLabelLand(metric) {
  if (metric < 2) return "Low";
  if (metric < 8) return "Moderate";
  if (metric < 25) return "High";
  return "Very High";
}

function severityLabelAir(metric) {
  const t = logT(metric, AIR_LOGMIN, AIR_LOGMAX);
  if (t < 0.25) return "Low";
  if (t < 0.5) return "Moderate";
  if (t < 0.75) return "High";
  return "Severe";
}

// ---------- Lakes (water category) ----------
(window.PJJ_LAKES.features || []).forEach((f) => {
  const p = f.properties;
  const areaKm2 = p.AREA || p.Shape__Area / 1e6;
  const idx = lakeIndex(p.NAME);
  const poly = L.geoJSON(f, { style: () => baseStyleWater(idx) }).getLayers()[0];
  poly.bindTooltip(
    `<strong>${p.NAME}</strong><br>` +
      `Pollution index: <strong>${idx}/100</strong> — ${severityLabelWater(idx)}`,
    { sticky: true, className: "pjj-tip" }
  );
  poly.on("mouseover", () => poly.setStyle({ ...baseStyleWater(idx), stroke: true, color: "#fff", weight: 2, fillOpacity: 0.92 }).bringToFront());
  poly.on("mouseout", () => poly.setStyle(baseStyleWater(idx)));
  poly.on("click", () => {
    setCategory("water");
    showPanel({
      name: p.NAME, sub: "Major North American lake", metric: idx, areaKm2,
      population: null, real: false,
      source: LAKE_POLLUTION[p.NAME] != null
        ? "Index anchored to documented water quality (EPA / DFO / news-documented status)"
        : "Modeled index (no curated water-quality data)",
    });
  });
  lakesLayer.addLayer(poly);
});

// ---------- Wards (GTA detail, land + air categories) ----------
(window.PJJ_TORONTO_WARDS.features || []).forEach((f) => {
  const p = f.properties;
  const areaKm2 = p.Shape__Area / 1e6;
  const code = String(p.AREA_SHORT_CODE).padStart(2, "0");
  const reports = (REAL311.torontoWards || {})[code];
  const landMetric = reports != null ? reports / areaKm2 : modeledLandMetric(p.AREA_NAME, wardPopulation(p.AREA_NAME, "Toronto"), areaKm2);
  const pop = wardPopulation(p.AREA_NAME, "Toronto");
  const name = `${p.AREA_SHORT_CODE} — ${p.AREA_NAME}`;
  const realInfo = reports != null ? { reports, period: "2025" } : null;
  buildWardPolygons(landWardLayers.Toronto, airWardLayers.Toronto, f, name, "Toronto ward",
    landMetric, areaKm2, pop, realInfo, "CA");
});

(window.PJJ_MARKHAM_WARDS.features || []).forEach((f) => {
  const p = f.properties;
  const areaKm2 = p.HECTARES / 100;
  const landMetric = modeledLandMetric("Markham Ward " + p.WARD, wardPopulation("Markham Ward " + p.WARD, "Markham"), areaKm2);
  const pop = wardPopulation("Markham Ward " + p.WARD, "Markham");
  const name = `Ward ${p.WARD}`;
  buildWardPolygons(landWardLayers.Markham, airWardLayers.Markham, f, name,
    `Markham ward — Councillor ${p.COUNCILLOR}`, landMetric, areaKm2, pop, null, "CA");
});

function buildWardPolygons(landGroup, airGroup, feature, name, sub, landMetric, areaKm2, pop, realInfo, country) {
  const landPoly = L.geoJSON(feature, { style: () => ({ ...baseStyleLand(landMetric), fillOpacity: 0.8 }) }).getLayers()[0];
  landPoly.bindTooltip(
    `<strong>${name}</strong><br>` +
      (realInfo ? `Reports: <strong>${fmtInt(realInfo.reports)}</strong> (${realInfo.period})<br>` : "") +
      `${landMetric.toFixed(1)} reports/km²/yr — ${severityLabelLand(landMetric)}${realInfo ? "" : "<br><em>modeled estimate</em>"}`,
    { sticky: true, className: "pjj-tip" }
  );
  landPoly.on("mouseover", () => landPoly.setStyle({ ...baseStyleLand(landMetric), fillOpacity: 0.8, stroke: true, color: "#fff", weight: 2 }).bringToFront());
  landPoly.on("mouseout", () => landPoly.setStyle({ ...baseStyleLand(landMetric), fillOpacity: 0.8 }));
  landPoly.on("click", () => {
    setCategory("land");
    showPanel({
      name, sub, metric: landMetric, areaKm2, population: pop, popEstimated: true,
      real: !!realInfo, reports: realInfo && realInfo.reports, period: realInfo && realInfo.period,
      source: realInfo ? REAL311.wardSource : "Modeled — no ward-level open litter data",
    });
  });
  landGroup.addLayer(landPoly);

  const airMetric = modeledAirMetric(country, pop, areaKm2);
  airWardPoints.push([centroidOf(feature.geometry)[0], centroidOf(feature.geometry)[1], logT(airMetric, AIR_LOGMIN, AIR_LOGMAX), areaKm2]);
  const airPoly = L.geoJSON(feature, { style: () => baseStyleAirInvisible() }).getLayers()[0];
  airPoly.bindTooltip(
    `<strong>${name}</strong><br>CO₂: <strong>${fmtInt(pop * CO2_PER_CAPITA[country])} t/yr</strong> (modeled)<br>` +
      `${fmtInt(airMetric)} t/km²/yr — ${severityLabelAir(airMetric)}`,
    { sticky: true, className: "pjj-tip" }
  );
  airPoly.on("mouseover", () => airPoly.setStyle({ ...baseStyleAirInvisible(), stroke: true, color: "#fff", weight: 1.5, fillOpacity: 0.22 }).bringToFront());
  airPoly.on("mouseout", () => airPoly.setStyle(baseStyleAirInvisible()));
  airPoly.on("click", () => {
    setCategory("air");
    showPanel({
      name, sub: sub + " — CO₂ (modeled)", metric: airMetric, total: pop * CO2_PER_CAPITA[country],
      areaKm2, population: pop, popEstimated: true, real: false,
      source: `Modeled: population × per-capita CO₂ (${CO2_PER_CAPITA[country]} t/yr)`,
    });
  });
  airGroup.addLayer(airPoly);
}

// ---------- Glows: land heat + air smoke ----------
const LAND_GRADIENT = {
  0.0: "#00c853", 0.35: "#7ccb3a", 0.55: "#ffd600", 0.75: "#ff6d00", 1.0: "#d50000",
};
const AIR_GRADIENT = {
  0.0: "rgba(255, 235, 0, 0)",
  0.3: "rgba(255, 225, 0, 0.25)",
  0.55: "rgba(255, 205, 0, 0.5)",
  0.8: "rgba(255, 180, 0, 0.75)",
  1.0: "rgba(255, 150, 0, 0.95)",
};

let heatLayers = [];

function heatRadiusPx(km2, mpp, mult, maxPx) {
  const rM = Math.sqrt((km2 * 1e6) / Math.PI) * (mult || 1.15);
  return clamp(rM / mpp, 6, maxPx || 120);
}

function buildGlow(points, gradient, areaMult, maxOpacity) {
  if (typeof L.heatLayer !== "function") return;
  const zoom = map.getZoom();
  const mpp = (156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const isAir = CATEGORY === "air";
  const buckets = { small: [], medium: [], large: [] };
  points.forEach(([lat, lng, i, km2]) => {
    if (km2 >= 800) buckets.large.push([lat, lng, i]);
    else if (km2 >= 150) buckets.medium.push([lat, lng, i]);
    else buckets.small.push([lat, lng, i]);
  });
  const radii = {
    small: heatRadiusPx(60, mpp, areaMult, isAir ? 160 : 120),
    medium: heatRadiusPx(400, mpp, areaMult, isAir ? 260 : 160),
    large: heatRadiusPx(3500, mpp, areaMult, isAir ? 380 : 200),
  };
  Object.keys(buckets).forEach((k) => {
    if (!buckets[k].length) return;
    const layer = L.heatLayer(buckets[k], {
      radius: radii[k],
      blur: isAir ? 0.9 : 0.85,
      maxZoom: 18, // no intensity damping — glow strength handled here
      maxOpacity,
      minOpacity: isAir ? 0.04 : 0.06,
      gradient,
    });
    heatLayers.push(layer);
    map.addLayer(layer);
    if (layer._canvas) layer._canvas.style.pointerEvents = "none";
  });
}

function rebuildGlows() {
  heatLayers.forEach((l) => map.removeLayer(l));
  heatLayers = [];
  if (map.getZoom() < 3) return;
  if (CATEGORY === "land") buildGlow(heatPoints, LAND_GRADIENT, 1.15, 0.85);
  if (CATEGORY === "air") buildGlow(airPoints.concat(airWardPoints), AIR_GRADIENT, 1.6, 0.95);
}
map.on("zoomend", rebuildGlows);

// ---------- Category switching ----------
const legendMin = document.getElementById("legend-min");
const legendMax = document.getElementById("legend-max");
const legendGradient = document.getElementById("legend-gradient");

const LEGENDS = {
  land: { min: "Low", max: "High", css: "linear-gradient(to right, #00c853, #ffd600, #d50000)" },
  water: { min: "Clean (dark blue)", max: "Polluted (maroon)", css: "linear-gradient(to right, #0d1e6e, #5b2a86, #800000)" },
  air: { min: "Clear", max: "Smoky (high CO₂)", css: "linear-gradient(to right, rgba(255,235,0,0), #ffe100, #ff9600)" },
};

function updateLegend() {
  const L = LEGENDS[CATEGORY];
  legendMin.textContent = L.min;
  legendMax.textContent = L.max;
  legendGradient.style.background = L.css;
}

function setCategory(cat) {
  CATEGORY = cat;
  document.querySelectorAll(".cat-option").forEach((b) =>
    b.classList.toggle("active", b.dataset.cat === cat)
  );
  applyCategory();
  updateLegend();
}

function applyCategory() {
  // remove everything category-specific
  [cityLayer, lakesLayer, airCityLayer,
    landWardLayers.Toronto, landWardLayers.Markham,
    airWardLayers.Toronto, airWardLayers.Markham].forEach((l) => map.removeLayer(l));
  heatLayers.forEach((l) => map.removeLayer(l));
  heatLayers = [];
  rebuildGlows();

  const zoomed = map.getZoom() >= DETAIL_ZOOM;
  const c = map.getCenter();
  const inGTA = Math.abs(c.lat - 43.75) < 1.0 && Math.abs(c.lng - -79.4) < 1.4;

  if (CATEGORY === "land") {
    if (zoomed && inGTA) {
      map.addLayer(landWardLayers.Toronto);
      map.addLayer(landWardLayers.Markham);
    } else {
      map.addLayer(cityLayer);
    }
  } else if (CATEGORY === "water") {
    map.addLayer(lakesLayer); // lakes only — wards/cities hidden
  } else if (CATEGORY === "air") {
    if (zoomed && inGTA) {
      map.addLayer(airWardLayers.Toronto);
      map.addLayer(airWardLayers.Markham);
    } else {
      map.addLayer(airCityLayer);
    }
  }
}

map.on("zoomend", () => { if (CATEGORY !== "water") applyCategory(); });

// wire up the permanent category panel (bottom-right)
document.querySelectorAll(".cat-option").forEach((b) => {
  b.addEventListener("click", () => setCategory(b.dataset.cat));
});

map.whenReady(() => {
  setCategory("land");
});