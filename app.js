// PJJ-2 v1 — Americas pollution heat map.
// Categories (right-side panel): land (waste), water (major lakes), air (CO₂).
//
// Boundaries: real ArcGIS feature services (data/*.geojson)
//  - US: DOT BTS "2020 Census Urban Areas" — ALL 2,646 urban areas
//  - CA: Population Centres 2021 w/ population — ALL 1,030 centres
//  - Toronto: City of Toronto "COTGEO_CITY_WARD" (25 wards)
//  - Markham: one official Ontario municipal boundary (no ward divisions)
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
const AMERICAS_COUNTRIES = new Map((window.PJJ_AMERICAS_COUNTRIES || []).map((country) => [country.code, country]));
AMERICAS_COUNTRIES.forEach((country) => { CO2_PER_CAPITA[country.code] = country.co2PerCapita ?? 3.5; });

function airFactorSource(country) {
  if (country === "US" || country === "CA") return "EPA / Environment Canada per-capita averages";
  const data = AMERICAS_COUNTRIES.get(country);
  return data?.co2PerCapita != null
    ? `World Bank 2022 national/sovereign per-capita CO₂ factor for ${data.co2FactorCode || country} (${data.co2PerCapita.toFixed(2)} t/person/year). Applied to Natural Earth reference population; not measured city emissions.`
    : "Illustrative fallback of 3.5 t CO₂/person/year; no national factor was available. Not measured city emissions.";
}

let CATEGORY = "land";

const map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([12, -85], 3);
map.zoomControl.setPosition("bottomleft");

// Category basemaps: land = satellite imagery; water = navy-scale (oceans dark
// blue, land near-black via CSS filter); air = NASA Black Marble night lights.
const BASEMAPS = {
  land: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Imagery &copy; Esri &mdash; Boundaries: US DOT BTS, StatCan, Ontario, Toronto, Natural Earth (public domain), Esri World Countries &mdash; CO₂ factors: World Bank 2022 &mdash; Litter: NYC/Chicago/LA/Toronto 311; waste stats: national statistics offices",
    maxZoom: 18,
  }),
  water: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Basemap &copy; Esri Dark Gray Canvas",
    maxZoom: 16,
    maxNativeZoom: 16,
  }),
  air: L.tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png", {
    attribution: "Night lights: NASA Black Marble (VIIRS) via GIBS",
    maxZoom: 18,
    maxNativeZoom: 8,
  }),
};
function setBasemap(cat) {
  Object.entries(BASEMAPS).forEach(([key, layer]) => {
    if (key === cat) { if (!map.hasLayer(layer)) map.addLayer(layer); }
    else map.removeLayer(layer);
  });
  document.getElementById("map").classList.toggle("navy", cat === "water");
}

// ---------- Scales ----------
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function logT(metric, lo, hi) {
  const lg = Math.log10(Math.max(metric, Math.pow(10, lo)));
  return Math.min(1, Math.max(0, (lg - lo) / (hi - lo)));
}

function colorLand(metric) {
  const t = Math.pow(logT(metric, LOGMIN, LOGMAX), 0.75);
  // yellow (low) -> orange -> red (high); no green so it stands out on imagery
  const hue = 52 * (1 - t);
  return `hsl(${hue.toFixed(0)}, 95%, ${52 - 8 * t}%)`;
}

function colorWater(idx) {
  const t = Math.pow(clamp(idx / 100, 0, 1), 0.8);
  // dark blue (clean, hue 240) -> violet -> orange (polluted, hue 30)
  const hue = Math.round((240 + 150 * t) % 360);
  return `hsl(${hue}, 85%, ${Math.round(28 + 27 * t)}%)`;
}

function colorAir(metric) {
  const t = logT(metric, AIR_LOGMIN, AIR_LOGMAX);
  return `hsl(${Math.round(60 - 60 * t)}, 95%, ${Math.round(62 - 22 * t)}%)`;
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

function lakeIndex(name, modeledIndex) {
  if (LAKE_POLLUTION[name] != null) return LAKE_POLLUTION[name];
  if (Number.isFinite(modeledIndex)) return modeledIndex;
  const extra = window.PJJ_AMERICAS_LAKES?.features.find((feature) => feature.properties.NAME === name);
  if (Number.isFinite(extra?.properties.modeledIndex)) return extra.properties.modeledIndex;
  return Math.round(25 + hash(name) * 50);
}

// ---------- Details panel ----------
const panel = document.getElementById("info-panel");
const panelBody = document.getElementById("info-panel-body");

function fmtInt(n) {
  return Math.round(n).toLocaleString("en-CA");
}

function colorLandT(t) {
  const te = Math.pow(t, 0.75);
  return `hsl(${(52 * (1 - te)).toFixed(0)}, 95%, ${(52 - 8 * t).toFixed(0)}%)`;
}

function colorAirT(t) {
  return `hsl(${Math.round(60 - 60 * t)}, 95%, ${Math.round(62 - 22 * t)}%)`;
}

function severityLabelWaste(t) {
  if (t < 0.25) return "Low";
  if (t < 0.5) return "Moderate";
  if (t < 0.75) return "High";
  return "Very High";
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
  if (d.countryLevel) {
    rows = `
      <div class="row"><span>Waste per km²</span><strong>${d.metric.toFixed(1)} t/km²/yr</strong></div>
      <div class="row"><span>Total waste</span><strong>${fmtInt(d.wasteTotal)} t/yr</strong></div>
      ${d.regionTotal != null ? `<div class="row"><span>${(d.sub || "").split(" — ")[0]} total</span><strong>${fmtInt(d.regionTotal)} t/yr</strong></div>` : ""}
      ${d.regionAvg != null ? `<div class="row"><span>Region avg density</span><strong>${d.regionAvg.toFixed(1)} t/km²/yr</strong></div>` : ""}
      <div class="row"><span>Year</span><strong>${d.year}</strong></div>
      <div class="row"><span>Coverage</span><strong>${d.coverage}</strong></div>`;
  } else if (CATEGORY === "water") {
    rows = `
      <div class="row"><span>${d.indexLabel || "Pollution index"}</span><strong>${d.metric.toFixed(0)} / 100</strong></div>
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
  const dataBadge = d.countryLevel
    ? (d.real
        ? `<div class="row real"><span>Data</span><strong>Official national statistics &middot; ${d.year}</strong></div>`
        : `<div class="row estrow"><span>Data</span><strong>Estimate &middot; ${d.year}</strong></div>`)
    : CATEGORY === "water"
    ? `<div class="row estrow"><span>Data</span><strong>${d.waterDataLabel || "Modeled estimate"}</strong></div>`
    : d.real
      ? `<div class="row real"><span>Data</span><strong>Real 311 reports &middot; ${d.period}</strong></div>`
      : `<div class="row estrow"><span>Data</span><strong>Modeled estimate</strong></div>`;
  panelBody.innerHTML = `
    <h2>${d.name}</h2>
    <p class="sub">${d.sub}</p>
    <div class="sev" style="background:${d.countryLevel ? colorLandT(logT(d.metric, WASTE_LOGMIN, WASTE_LOGMAX)) : sevColorFor(d.metric)}">${d.countryLevel ? severityLabelWaste(logT(d.metric, WASTE_LOGMIN, WASTE_LOGMAX)) : severityLabel(d.metric)}</div>
    ${rows}
    ${dataBadge}
    ${d.extra ? `<p class="extra">${d.extra}</p>` : ""}
    <p class="src">${d.source}</p>
  `;
  const photo = window.PlanetCityPhotos?.figure(d.name);
  if (photo) panelBody.prepend(photo);
  window.PlanetPanels?.expand("info-panel");
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
const gtaWasteLayer = L.layerGroup();  // all 25 GTA municipalities
const gtaDetailLayer = L.layerGroup(); // additional ward detail; Markham is unsplit
const landWardLayers = { Toronto: L.layerGroup() };
const airWardLayers = { Toronto: L.layerGroup() };
const markhamAirLayer = L.layerGroup(); // one municipal region, no ward splits
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

// Coarser supplementary coverage outside the existing US/Canada datasets. Do
// not invent circular regions for cities whose source has only a point location.
(window.PJJ_AMERICAS_CITIES?.features || []).forEach((feature) => {
  const p = feature.properties;
  if (p.locationOnly || !p.areaKm2 || !p.population) return;
  const metric = modeledLandMetric(p.name, p.population, p.areaKm2);
  buildCityPolygons(feature, p.name, `${p.countryName} — Natural Earth urban footprint`, metric,
    p.areaKm2, p.population, p.source, "Urban footprint matched to a nearby named populated place. This is not an official municipal boundary or measured litter count.", null, p.country,
    { populationEstimated: true });
  const [lng, lat] = p.center;
  heatPoints.push([lat, lng, logT(metric, LOGMIN, LOGMAX), p.areaKm2]);
  airPoints.push([lat, lng, logT(modeledAirMetric(p.country, p.population, p.areaKm2), AIR_LOGMIN, AIR_LOGMAX), p.areaKm2]);
});

function buildCityPolygons(feature, name, sub, landMetric, areaKm2, population, landSource, landExtra, realInfo, country, options = {}) {
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
      name, sub, metric: landMetric, areaKm2, population, popEstimated: !!options.populationEstimated,
      real: !!realInfo, reports: realInfo && realInfo.reports, period: realInfo && realInfo.period,
      source: landSource, extra: landExtra,
    });
  });
  cityLayer.addLayer(landPoly);

  const airMetric = modeledAirMetric(country, population, areaKm2);
  const airPoly = L.geoJSON(feature, { style: () => baseStyleAir(airMetric) }).getLayers()[0];
  airPoly.bindTooltip(
    `<strong>${name}</strong><br>` +
      `CO₂: <strong>${fmtInt(population * CO2_PER_CAPITA[country])} t/yr</strong> (modeled)<br>` +
      `${fmtInt(airMetric)} t/km²/yr — ${severityLabelAir(airMetric)}`,
    { sticky: true, className: "pjj-tip" }
  );
  airPoly.on("mouseover", () => airPoly.setStyle({ ...baseStyleAir(airMetric), stroke: true, color: "#fff", weight: 1.5, fillOpacity: 0.7 }).bringToFront());
  airPoly.on("mouseout", () => airPoly.setStyle(baseStyleAir(airMetric)));
  airPoly.on("click", () => {
    setCategory("air");
    showPanel({
      name, sub: sub + " — CO₂ (modeled)", metric: airMetric, total: population * CO2_PER_CAPITA[country],
      areaKm2, population, popEstimated: !!options.populationEstimated, real: false,
      source: `Modeled: population × per-capita CO₂ (${CO2_PER_CAPITA[country]} t/person/year). ${airFactorSource(country)}`,
    });
  });
  airCityLayer.addLayer(airPoly);
}

// ---------- Styles ----------
function baseStyleLand(metric) {
  return {
    renderer: canvasRenderer,
    stroke: true,
    color: "rgba(255, 255, 255, 0.5)",
    weight: 0.8,
    fillColor: colorLand(metric),
    fillOpacity: 0.7,
    smoothFactor: 1.5,
  };
}

function baseStyleAir(metric) {
  return { renderer: canvasRenderer, stroke: true, color: "rgba(255, 255, 255, 0.5)", weight: 0.8, fillColor: colorAir(metric), fillOpacity: 0.55, smoothFactor: 1.5 };
}

function baseStyleWater(idx) {
  return {
    renderer: canvasRenderer,
    stroke: true,
    color: "rgba(255, 255, 255, 0.35)",
    weight: 1.2,
    fillColor: colorWater(idx),
    fillOpacity: 0.72,
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
// The source repeats seven complete lake outlines. Rendering both would double
// the gradient opacity, so use one outline per named lake.
const originalLakeFeatures = [...new Map((window.PJJ_LAKES.features || []).map((feature) => [feature.properties.NAME, feature])).values()];
// Supplementary lakes may share a name or have separate reservoir arms. Keep
// every source geometry rather than dropping distinct bodies with the same name.
const waterLakeFeatures = [...originalLakeFeatures, ...(window.PJJ_AMERICAS_LAKES?.features || []), ...(window.PJJ_WORLD_LAKES?.features || [])];
waterLakeFeatures.forEach((f) => {
  const p = f.properties;
  // The source's AREA column is in square miles, not km². Measure the displayed
  // geographic polygon instead of relabeling those values as square kilometres.
  const areaKm2 = PlanetWater.areaKm2(f.geometry);
  const idx = lakeIndex(p.NAME, p.modeledIndex);
  // The gradient supplies the fill. Keep these paths as outlines/click targets.
  const lakeStyle = () => ({ ...baseStyleWater(idx), fillOpacity: 0 });
  const poly = L.geoJSON(f, { style: lakeStyle }).getLayers()[0];
  poly.bindTooltip(
    `<strong>${p.NAME}</strong><br>` +
      `Pollution index: <strong>${idx}/100</strong> — ${severityLabelWater(idx)}`,
    { sticky: true, className: "pjj-tip" }
  );
  poly.on("mouseover", () => poly.setStyle({ ...lakeStyle(), color: "#fff", weight: 2 }).bringToFront());
  poly.on("mouseout", () => poly.setStyle(lakeStyle()));
  poly.on("click", () => {
    setCategory("water");
    showPanel({
      name: p.NAME, sub: p.source ? "Americas lake / reservoir — Natural Earth" : "Major North American lake", metric: idx, areaKm2,
      population: null, real: false,
      waterDataLabel: LAKE_POLLUTION[p.NAME] != null ? "Curated illustrative index" : "Modeled lake index",
      extra: "Within-lake colour variation is illustrative, not location-specific water sampling. The index is not a measured contaminant concentration.",
      source: p.source || (LAKE_POLLUTION[p.NAME] != null
        ? "Index anchored to documented water quality (EPA / DFO / news-documented status)"
        : "Modeled index (no curated water-quality data)"),
    });
  });
  lakesLayer.addLayer(poly);
});

// ---------- World countries (waste by country, land + air categories) ----------
const WASTE_LOGMIN = 0.6; // ~4 t/km²/yr
const AIR_C_LOGMIN = 1.8; // country haze: ~63 t CO₂/km²/yr
const AIR_C_LOGMAX = 3.6; // country haze: ~4,000 t CO₂/km²/yr
const WASTE_LOGMAX = 4.0; // ~10,000 t/km²/yr
const WORLD_WASTE = window.PJJ_WORLD_WASTE || {};
const WORLD_AIR = window.PJJ_WORLD_AIR || {};
const countriesLandLayer = L.layerGroup();
const countriesAirLayer = L.layerGroup();
const countriesGreyLayer = L.layerGroup(); // countries with no publicized waste data
const airCountryPoints = [];
const REGION_STATS = {};

(function () {
  const areaByName = {};
  (window.PJJ_COUNTRIES?.features || []).forEach((f) => {
    areaByName[f.properties.COUNTRY] = f.properties.area_km2;
  });
  Object.entries(WORLD_WASTE).forEach(([name, d]) => {
    const area = areaByName[name];
    if (!area) return;
    const density = d.waste_tonnes / area;
    const s = (REGION_STATS[d.region] = REGION_STATS[d.region] || { total: 0, count: 0, sumDensity: 0, avgDensity: 0 });
    s.total += d.waste_tonnes;
    s.count += 1;
    s.sumDensity += density;
  });
  Object.values(REGION_STATS).forEach((s) => { s.avgDensity = s.sumDensity / s.count; });
})();

// Countries without a reported CO₂ total: estimate population from their own
// solid-waste generation (World Bank average ≈ 0.23 t MSW per person per year),
// then apply a conservative 2.0 t per-capita CO₂ (World Bank low/middle-income
// average). This keeps low-emission countries low instead of painting them
// with a dense regional average. Countries with no data at all: negligible.
function countryCO2(name, areaKm2) {
  const mt = WORLD_AIR[name];
  if (mt != null && areaKm2) {
    return { metric: (mt * 1e6) / areaKm2, real: true, source: "Global Carbon Budget — national fossil CO₂ totals (approx.)" };
  }
  const w = WORLD_WASTE[name];
  if (w && areaKm2) {
    const popEst = w.waste_tonnes / 0.23;
    return { metric: (popEst * 2.0) / areaKm2, real: false, source: "Modeled: waste-based population estimate × 2.0 t per-capita CO₂ (World Bank averages)" };
  }
  return { metric: 3, real: false, source: "No publicized emissions or waste data — negligible modeled CO₂ density" };
}

(window.PJJ_COUNTRIES?.features || []).forEach((f) => {
  const name = f.properties.COUNTRY;
  if (name === "Antarctica") return;
  const d = WORLD_WASTE[name];
  const areaKm2 = f.properties.area_km2;
  const centroid = centroidOf(f.geometry);

  if (d && areaKm2) {
    const metric = d.waste_tonnes / areaKm2;
    const t = logT(metric, WASTE_LOGMIN, WASTE_LOGMAX);
    const style = () => ({
      renderer: canvasRenderer,
      stroke: true,
      color: "rgba(255, 255, 255, 0.4)",
      weight: 0.6,
      fillColor: colorLandT(t),
      fillOpacity: 0.75,
      smoothFactor: 2,
    });
    const stats = REGION_STATS[d.region];
    const poly = L.geoJSON(f, { style }).getLayers()[0];
    poly.bindTooltip(
      `<strong>${name}</strong><br>Waste: <strong>${fmtInt(d.waste_tonnes)} t/yr</strong><br>` +
        `${metric.toFixed(1)} t/km²/yr${d.estimate ? "<br><em>estimate — see source</em>" : ""}`,
      { sticky: true, className: "pjj-tip" }
    );
    poly.on("mouseover", () => poly.setStyle({ ...style(), stroke: true, color: "#fff", weight: 2 }).bringToFront());
    poly.on("mouseout", () => poly.setStyle(style()));
    poly.on("click", () => {
      setCategory("land");
      showPanel({
        name,
        sub: `${d.region} — country waste`,
        metric, metricLabel: "Waste per km²",
        wasteTotal: d.waste_tonnes,
        regionTotal: stats ? stats.total : null,
        regionAvg: stats ? stats.avgDensity : null,
        areaKm2, population: null, real: !d.estimate,
        year: d.year, coverage: d.coverage,
        source: d.source + (d.estimate ? " (estimate)" : ""),
        countryLevel: true,
      });
    });
    countriesLandLayer.addLayer(poly);
  }

  // Air haze for EVERY country — real totals where published, regional
  // average model where not. Visible at every zoom level.
  if (areaKm2) {
    const co2 = countryCO2(name, areaKm2);
    const co2T = logT(co2.metric, AIR_C_LOGMIN, AIR_C_LOGMAX);
    const poly = L.geoJSON(f, { style: () => countryAirStyle(co2T) }).getLayers()[0];
    poly.bindTooltip(
      `<strong>${name}</strong><br>` +
        (co2.real ? `CO₂: <strong>${fmtInt(co2.metric * areaKm2)} t/yr</strong> (Global Carbon Budget)<br>` : "") +
        `${fmtInt(co2.metric)} t/km²/yr — ${severityLabelAir(co2.metric)}${co2.real ? "" : "<br><em>modeled estimate</em>"}`,
      { sticky: true, className: "pjj-tip" }
    );
    poly.on("mouseover", () => poly.setStyle({ ...countryAirStyle(co2T), stroke: true, color: "#fff", weight: 1.5, fillOpacity: Math.min(0.9, 0.18 + 0.5 * co2T + 0.15) }).bringToFront());
    poly.on("mouseout", () => poly.setStyle(countryAirStyle(co2T)));
    poly.on("click", () => {
      setCategory("air");
      showPanel({
        name, sub: co2.real ? "Country CO₂ emissions (Global Carbon Budget, ~2023)" : "Country CO₂ — modeled estimate",
        metric: co2.metric, total: co2.metric * areaKm2, areaKm2, population: null,
        real: co2.real, period: "~2023", source: co2.source,
      });
    });
    countriesAirLayer.addLayer(poly);
  }

  // Grey overlay for countries with no publicized waste data.
  if (!d && areaKm2) {
    const greyStyle = () => ({
      renderer: canvasRenderer,
      stroke: true,
      color: "rgba(255, 255, 255, 0.35)",
      weight: 0.6,
      fillColor: "#6b7280",
      fillOpacity: 0.55,
      smoothFactor: 2,
    });
    const grey = L.geoJSON(f, { style: greyStyle }).getLayers()[0];
    grey.bindTooltip(`<strong>${name}</strong><br>No publicized waste data`, { sticky: true, className: "pjj-tip" });
    grey.on("mouseover", () => grey.setStyle({ ...greyStyle(), color: "#fff", weight: 2 }).bringToFront());
    grey.on("mouseout", () => grey.setStyle(greyStyle()));
    grey.on("click", () => {
      setCategory("land");
      showPanel({
        name, sub: "Country waste", metric: 0, areaKm2,
        population: null, real: false,
        source: "No publicized waste-generation total could be verified for this country. Shown grey until data is available.",
      });
    });
    countriesGreyLayer.addLayer(grey);
  }
});

// Country haze is a POLYGON fill, not a heat kernel: identical visibility at
// every zoom level, no circles. Intensity drives fill colour + opacity.
function countryAirStyle(t) {
  return {
    renderer: canvasRenderer,
    stroke: true,
    color: "rgba(255, 255, 255, 0.25)",
    weight: 0.6,
    fillColor: colorAirT(t),
    fillOpacity: 0.18 + 0.5 * t,
    smoothFactor: 2,
  };
}

// ---------- Water: coastal bands (sea only, no inland color) ----------
let coastBandLayers = [];
let lakeGradientLayer = null;

const COAST_HOTSPOTS = [
  [29.0, -92.0, 0.95, 800], [27.5, -81.5, 0.75, 600], [37.3, -76.8, 0.8, 400],
  [40.5, -74.0, 0.62, 300], [40.8, -72.5, 0.55, 300], [36.0, -76.0, 0.6, 300],
  [43.6, -79.4, 0.8, 260], [32.8, -117.2, 0.75, 300], [37.9, -122.8, 0.65, 250],
  [47.7, -122.8, 0.7, 250], [31.5, -114.5, 0.6, 300],
  [48.3, -64.5, 0.6, 350], [45.0, -66.0, 0.66, 320], [58.5, -85.0, 0.25, 600],
  [70.0, -105.0, 0.18, 800], [57.5, -148.0, 0.3, 500],
];

// smooth value noise, so the coast isn't painted one flat colour
function coastNoise(lat, lng, freq) {
  const x = lng * freq, y = lat * freq;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const h = (a, b) => {
    let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const v00 = h(x0, y0), v10 = h(x0 + 1, y0), v01 = h(x0, y0 + 1), v11 = h(x0 + 1, y0 + 1);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
}

function coastStrength(lat, lng) {
  let hot = 0;
  for (const [hlat, hlng, s, r] of COAST_HOTSPOTS) {
    const d = Math.hypot((lat - hlat) * 111, (lng - hlng) * 111 * Math.cos((lat * Math.PI) / 180));
    if (d < r) hot = Math.max(hot, s * (1 - d / r));
  }
  // Modeled regional variation, not measured coastal water-quality data. Arctic
  // offshore areas are treated as very clean; no Arctic hotspot is defined.
  if (lat > 72) return 0.02;
  let s = 0.05 + 0.65 * hot;
  s += 0.42 * coastNoise(lat, lng, 0.13) + 0.2 * coastNoise(lat, lng, 0.5);
  return Math.max(0.03, Math.min(1, s));
}

// cyan (clean) -> amber -> red (polluted); deliberately no green so it does not
// melt into the satellite imagery the way the land layer would.
const COAST_BAND_COLORS = ["#0d1e6e", "#3c3a80", "#8a3d72", "#c65a3a", "#ff8c1a", "#ffb14d"];

function coastRGB(strength) {
  const position = clamp(strength, 0, 1) * (COAST_BAND_COLORS.length - 1);
  const index = Math.min(COAST_BAND_COLORS.length - 2, Math.floor(position));
  const fraction = position - index;
  const a = parseInt(COAST_BAND_COLORS[index].slice(1), 16);
  const b = parseInt(COAST_BAND_COLORS[index + 1].slice(1), 16);
  return [16, 8, 0].map((shift) => Math.round(((a >> shift) & 255) * (1 - fraction) + ((b >> shift) & 255) * fraction));
}

// Colour interpolation happens BEFORE the sea-only mask is applied. Neither
// smoothing nor interpolation can spread the overlay onto the land.
const CoastalGradient = L.GridLayer.extend({
  createTile(coords) {
    const size = this.getTileSize().x;
    const tile = document.createElement("canvas");
    tile.width = tile.height = size;
    const ctx = tile.getContext("2d");
    const origin = L.point(coords.x * size, coords.y * size);
    const step = 8;
    const samples = size / step + 3;
    const field = document.createElement("canvas");
    field.width = field.height = samples;
    const fieldCtx = field.getContext("2d");
    const image = fieldCtx.createImageData(samples, samples);
    for (let y = 0; y < samples; y++) {
      for (let x = 0; x < samples; x++) {
        const ll = map.unproject(origin.add([(x - 1) * step, (y - 1) * step]), coords.z);
        const rgb = coastRGB(coastStrength(ll.lat, ll.lng));
        const offset = (y * samples + x) * 4;
        image.data.set([...rgb, 184], offset);
      }
    }
    fieldCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(field, -step * 1.5, -step * 1.5, samples * step, samples * step);
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    const geometry = window.PJJ_COAST_MASK.geometry;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        ring.forEach(([lng, lat], i) => {
          const p = map.project([lat, lng], coords.z).subtract(origin);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      }
    }
    ctx.fillStyle = "#fff";
    ctx.fill("evenodd");
    return tile;
  },
});

// A world-aligned gradient for each lake, clipped to its exact polygon. Unlike
// a heat kernel, this cannot add a circular glow or blur onto neighbouring land.
const lakeGradientFeatures = waterLakeFeatures.map((feature) => ({
  feature, box: PlanetWater.bounds(feature.geometry), index: lakeIndex(feature.properties.NAME, feature.properties.modeledIndex),
}));
const LakeGradient = L.GridLayer.extend({
  createTile(coords) {
    const size = this.getTileSize().x;
    const tile = document.createElement("canvas");
    tile.width = tile.height = size;
    const ctx = tile.getContext("2d");
    const origin = L.point(coords.x * size, coords.y * size);
    ctx.globalAlpha = 0.72;
    for (const { feature, box, index } of lakeGradientFeatures) {
      const nw = map.project([box[3], box[0]], coords.z).subtract(origin);
      const se = map.project([box[1], box[2]], coords.z).subtract(origin);
      if (se.x < 0 || nw.x > size || se.y < 0 || nw.y > size) continue;
      const gradient = ctx.createLinearGradient(nw.x, nw.y, se.x, se.y);
      for (const [position, variation] of [[0, -0.08], [0.5, 0], [1, 0.06]]) {
        gradient.addColorStop(position, `rgb(${coastRGB(index / 100 + variation).join(",")})`);
      }
      ctx.fillStyle = gradient;
      ctx.beginPath();
      for (const polygon of PlanetWater.polygons(feature.geometry)) {
        for (const ring of polygon) {
          ring.forEach(([lng, lat], i) => {
            const point = map.project([lat, lng], coords.z).subtract(origin);
            if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
        }
      }
      ctx.fill("evenodd");
    }
    return tile;
  },
});

function buildLakeGradient() {
  if (lakeGradientLayer) return;
  const pane = map.createPane("lakeGradient");
  pane.style.zIndex = 391;
  pane.style.pointerEvents = "none";
  lakeGradientLayer = new LakeGradient({ pane: "lakeGradient", noWrap: true, tileSize: 256, updateWhenIdle: true });
  lakesLayer.addLayer(lakeGradientLayer);
}

function buildCoastBands() {
  if (!window.PJJ_COAST_MASK) return;
  if (!map.getPane("coastalGradient")) {
    const pane = map.createPane("coastalGradient");
    pane.style.zIndex = 390;
    pane.style.pointerEvents = "none";
  }
  const gradient = new CoastalGradient({
    pane: "coastalGradient", tileSize: 256, bounds: [[-58, -170], [84, -10]],
    noWrap: true, updateWhenIdle: true,
  });
  const outline = L.geoJSON(window.PJJ_COAST_MASK, {
    style: () => ({ ...baseStyleWater(0), fill: false, smoothFactor: 0.6, lineJoin: "round", interactive: false }),
    interactive: false,
  });
  let regionIndex = 0;
  const regions = L.geoJSON(window.PJJ_COAST_AREAS, {
    style: () => ({ renderer: canvasRenderer, color: "#fff", opacity: 0.045, weight: 0.6, fill: true, fillOpacity: 0, smoothFactor: 0.6 }),
    onEachFeature(feature, layer) {
      const seed = feature.properties.seed;
      const name = PlanetWater.regionName(seed, regionIndex++);
      const areaKm2 = PlanetWater.areaKm2(feature.geometry);
      layer.bindTooltip(`<strong>${name}</strong><br>Click for modeled water-pollution data`, { sticky: true, className: "pjj-tip" });
      layer.on("click", (event) => {
        const point = event.latlng || L.latLng(seed[1], seed[0]);
        showPanel({
          name, sub: "Coastal water region · up to 130 km offshore",
          metric: coastStrength(point.lat, point.lng) * 100, indexLabel: "Index at selected point",
          areaKm2, population: null, real: false, waterDataLabel: "Modeled coastal index",
          extra: `Selected point: ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}. This illustrative index matches the colour model, not measured water samples. Region boundaries are map-analysis areas, not official water-management districts.`,
          source: "Geometry: Natural Earth coastline, buffered and clipped to sea only. Index: modeled hotspot proximity and regional variation; no live water-quality measurements are available.",
        });
      });
    },
  });
  coastBandLayers = [gradient, outline, regions];
}

// Official municipal boundaries and Census 2021 populations. Do not present
// modeled regional estimates as newly collected litter reports.
(window.PJJ_GTA_REGIONS?.features || []).forEach((feature) => {
  const p = feature.properties;
  const real = realLandFor(p.name, "CA", p.population, p.areaKm2);
  const metric = real ? real.metric : modeledLandMetric(p.name, p.population, p.areaKm2);
  const style = () => baseStyleLand(metric);
  const layer = L.geoJSON(feature, { style });
  layer.bindTooltip(`<strong>${p.name}</strong><br>${metric.toFixed(1)} reports/km²/yr<br>${real ? "Real 311 reports" : "Modeled regional estimate"}`, {
    sticky: true, className: "pjj-tip",
  });
  layer.on("mouseover", () => layer.setStyle({ ...style(), color: "#fff", weight: 2 }));
  layer.on("mouseout", () => layer.setStyle(style()));
  layer.on("click", () => showPanel({
    name: p.name, sub: "Greater Toronto Area — municipal region",
    metric, areaKm2: p.areaKm2, population: p.population,
    real: !!real, reports: real?.reports, period: real?.period,
    source: real ? real.source : "Modeled from Census 2021 population density; official Ontario municipal boundaries. No municipal litter-report dataset is available in this map.",
  }));
  gtaWasteLayer.addLayer(layer);
  if (p.name === "Markham") {
    const airMetric = modeledAirMetric("CA", p.population, p.areaKm2);
    const airStyle = () => baseStyleAir(airMetric);
    const airLayer = L.geoJSON(feature, { style: airStyle });
    airLayer.bindTooltip(`<strong>Markham</strong><br>${fmtInt(airMetric)} t CO₂/km²/yr — modeled`, { sticky: true, className: "pjj-tip" });
    airLayer.on("click", () => showPanel({
      name: "Markham", sub: "Greater Toronto Area — municipal region",
      metric: airMetric, total: p.population * CO2_PER_CAPITA.CA,
      population: p.population, areaKm2: p.areaKm2, real: false,
      source: "Modeled CO₂ from Census 2021 population; official Ontario municipal boundary.",
    }));
    markhamAirLayer.addLayer(airLayer);
  }
});

// More detail across Peel, York, Durham, and Halton. These are official ward
// shapes but their population allocation and waste values are clearly modeled.
(window.PJJ_GTA_DETAIL?.features || []).forEach((feature) => {
  const p = feature.properties;
  const metric = modeledLandMetric(p.name, p.population, p.areaKm2);
  const style = () => baseStyleLand(metric);
  const layer = L.geoJSON(feature, { style });
  layer.bindTooltip(`<strong>${p.name}</strong><br>${metric.toFixed(1)} reports/km²/yr — modeled estimate`, { sticky: true, className: "pjj-tip" });
  layer.on("mouseover", () => layer.setStyle({ ...style(), color: "#fff", weight: 1.5 }));
  layer.on("mouseout", () => layer.setStyle(style()));
  layer.on("click", () => showPanel({
    name: p.name, sub: `${p.city} — municipal ward`, metric,
    areaKm2: p.areaKm2, population: p.population, popEstimated: true, real: false,
    source: `Modeled waste estimate, not local litter counts. Population allocated from Census 2021 municipal totals by ward area; not measured ward populations. Boundary source: ${p.source}`,
  }));
  gtaDetailLayer.addLayer(layer);
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
  const airPoly = L.geoJSON(feature, { style: () => baseStyleAir(airMetric) }).getLayers()[0];
  airPoly.bindTooltip(
    `<strong>${name}</strong><br>CO₂: <strong>${fmtInt(pop * CO2_PER_CAPITA[country])} t/yr</strong> (modeled)<br>` +
      `${fmtInt(airMetric)} t/km²/yr — ${severityLabelAir(airMetric)}`,
    { sticky: true, className: "pjj-tip" }
  );
  airPoly.on("mouseover", () => airPoly.setStyle({ ...baseStyleAir(airMetric), stroke: true, color: "#fff", weight: 1.5, fillOpacity: 0.7 }).bringToFront());
  airPoly.on("mouseout", () => airPoly.setStyle(baseStyleAir(airMetric)));
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
  0.0: "#ffd600", 0.2: "#ffb800", 0.4: "#ff9a00", 0.6: "#ff6d00", 0.8: "#e53935", 1.0: "#c62828",
};
const AIR_GRADIENT = {
  0.0: "rgba(255, 235, 0, 0)",
  0.3: "rgba(255, 225, 0, 0.25)",
  0.55: "rgba(255, 205, 0, 0.5)",
  0.8: "rgba(255, 150, 0, 0.75)",
  0.92: "rgba(255, 90, 0, 0.9)",
  1.0: "rgba(255, 30, 0, 0.95)",
};
const WATER_GRADIENT = {
  0.0: "#26c6da",
  0.45: "#ffa726",
  0.78: "#ef5350",
  1.0: "#c62828",
};

let heatLayers = [];

function heatRadiusPx(km2, mpp, mult, maxPx) {
  const rM = Math.sqrt((km2 * 1e6) / Math.PI) * (mult || 1.15);
  return clamp(rM / mpp, 6, maxPx || 120);
}

function buildGlow(points, gradient, areaMult, maxOpacity) {
  if (typeof L.heatLayer !== "function") return;
  const zoom = map.getZoom();
  // Land: at detail zooms the region polygons carry the heat, so point kernels
  // (which would be enormous disks) are dropped. Air: the smoke is ALWAYS
  // rendered at every zoom, with constant opacity, per spec.
  if (zoom >= DETAIL_ZOOM - 1 && CATEGORY !== "air") return;
  const mpp = (156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const isAir = CATEGORY === "air";
  // Log-area bucketing, but for AIR the kernel radius is FIXED IN PIXELS
  // (scaled from region area once, never recomputed from zoom). The haze looks
  // identical zoomed out and zoomed in — constant size, constant opacity.
  const buckets = {};
  points.forEach(([lat, lng, i, km2]) => {
    const key = clamp(Math.floor(Math.log10(Math.max(km2, 10))), 2, 8);
    (buckets[key] = buckets[key] || []).push([lat, lng, i, km2]);
  });
  const radii = {};
  Object.keys(buckets).forEach((k) => {
    radii[k] = isAir
      ? clamp(Math.sqrt(Math.pow(10, Number(k) + 0.5)) * 0.9, 10, 90)
      : heatRadiusPx(Math.pow(10, Number(k) + 0.5), mpp, areaMult, 200);
  });
  Object.keys(buckets).forEach((k) => {
    if (!buckets[k].length) return;
    const layer = L.heatLayer(buckets[k].map((p) => [p[0], p[1], p[2]]), {
      radius: radii[k],
      blur: isAir ? Math.max(8, radii[k] * 0.55) : Math.max(12, radii[k] * 0.85),
      // NOTE: leaflet.heat scales every point's intensity by
      // 1 / 2^(maxZoom - zoom). With maxZoom pinned to 18 that factor hit
      // 1/4096 at low zoom and pushed every point under minOpacity, so the
      // glow faded out at both extremes. Pinning maxZoom to the *current*
      // zoom makes the factor exactly 1 and the glow strength is ours to set.
      maxZoom: zoom,
      maxOpacity,
      minOpacity: isAir ? 0.06 : 0.09,
      gradient,
    });
    heatLayers.push(layer);
    map.addLayer(layer);
    if (layer._canvas) {
      layer._canvas.style.pointerEvents = "none";
      layer._canvas.style.opacity = "1"; // constant smoke presence at all zooms
    }
  });
}

// Haze strength tapers at world-scale zooms, where every pixel is packed with
// overlapping cities, but it is never switched off.
function maxOpacityForZoom(zoom) {
  if (zoom < 4) return 0.18;
  if (zoom < 7) return 0.25;
  return 0.3;
}

function rebuildGlows() {
  heatLayers.forEach((l) => map.removeLayer(l));
  heatLayers = [];
  if (CATEGORY === "air") {
    // Country haze is carried by the polygon fills (countriesAirLayer) at every
    // zoom. City-level smoke kernels render at EVERY zoom too, with fixed
    // pixel size and opacity, so the detail never disappears zoomed out.
    buildGlow(airPoints.concat(airWardPoints), AIR_GRADIENT, 1.0, 0.45);
    return;
  }
  if (CATEGORY === "land") buildGlow(heatPoints, LAND_GRADIENT, 1.15, maxOpacityForZoom(map.getZoom()));
}

// ---------- Category switching ----------
const legendMin = document.getElementById("legend-min");
const legendMax = document.getElementById("legend-max");
const legendGradient = document.getElementById("legend-gradient");

const LEGENDS = {
  land: { min: "Low", max: "High", css: "linear-gradient(to right, #ffd600, #ff8f00, #d50000)" },
  water: { min: "Clean (dark blue)", max: "Polluted (orange)", css: "linear-gradient(to right, #0d1e6e, #3c3a80, #8a3d72, #ff8c1a, #ffb14d)" },
  air: { min: "Clear", max: "Smoky (high CO₂)", css: "linear-gradient(to right, rgba(255,235,0,0), #ffe100, #ff9600, #ff3d00, #c62828)" },
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
  setBasemap(cat);
  applyCategory();
  updateLegend();
}

function applyCategory() {
  // remove everything category-specific
  [cityLayer, lakesLayer, airCityLayer, gtaWasteLayer, gtaDetailLayer, markhamAirLayer,
    countriesLandLayer, countriesAirLayer, countriesGreyLayer,
    landWardLayers.Toronto, airWardLayers.Toronto].forEach((l) => map.removeLayer(l));
  coastBandLayers.forEach((l) => map.removeLayer(l));
  heatLayers.forEach((l) => map.removeLayer(l));
  heatLayers = [];
  rebuildGlows();

  const zoomed = map.getZoom() >= DETAIL_ZOOM;
  const worldView = map.getZoom() <= 4;
  if (CATEGORY === "land") {
    // Country heat + grey no-data overlay are ALWAYS visible (any zoom).
    map.addLayer(countriesLandLayer);
    map.addLayer(countriesGreyLayer);
    if (!worldView) {
      // Keep surrounding city coverage; detail layers are overlays, not a
      // replacement for all city data inside a broad GTA bounding box.
      map.addLayer(cityLayer);
      if (map.getZoom() >= DETAIL_ZOOM - 1) map.addLayer(gtaWasteLayer);
      if (zoomed) {
        map.addLayer(gtaDetailLayer);
        map.addLayer(landWardLayers.Toronto);
      }
    }
  } else if (CATEGORY === "water") {
    buildLakeGradient();
    if (!coastBandLayers.length) buildCoastBands();
    coastBandLayers.forEach((l) => map.addLayer(l));
    map.addLayer(lakesLayer); // lakes on top of the sea-side coastal bands
  } else if (CATEGORY === "air") {
    // Country haze polygons are ALWAYS visible (any zoom level).
    map.addLayer(countriesAirLayer);
    if (!worldView) {
      map.addLayer(airCityLayer);
      if (map.getZoom() >= DETAIL_ZOOM - 1) map.addLayer(markhamAirLayer);
      if (zoomed) {
        map.addLayer(airWardLayers.Toronto);
      }
    }
  }
}

map.on("zoomend", () => { if (CATEGORY !== "water") applyCategory(); });

// wire up the permanent category panel (bottom-right)
document.querySelectorAll(".cat-option").forEach((b) => {
  b.addEventListener("click", () => setCategory(b.dataset.cat));
});

// ---------- Loading screen ----------
const loadingOverlay = document.getElementById("loading-overlay");
document.getElementById("loading-continue").addEventListener("click", () => {
  loadingOverlay.classList.add("hidden");
  setTimeout(() => loadingOverlay.remove(), 600);
});

// ---------- Potential funding panel ----------
const fundingPanel = document.getElementById("funding-panel");
document.getElementById("open-funding").addEventListener("click", () => {
  const body = document.getElementById("funding-body");
  const data = window.PJJ_FUNDING || {};
  body.innerHTML =
    `<p class="funding-note">Environmental organizations across all provinces and territories — potential cleanup partners and sponsors.</p>` +
    Object.entries(data).map(([prov, orgs]) =>
      `<h3>${prov}</h3>` + orgs.map(([name, url]) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>`).join("")
    ).join("");
  fundingPanel.hidden = false;
});
document.getElementById("funding-close").addEventListener("click", () => {
  fundingPanel.hidden = true;
});

map.whenReady(() => {
  setCategory("land");
});
