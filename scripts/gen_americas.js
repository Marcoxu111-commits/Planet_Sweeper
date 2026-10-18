// Supplement US/Canada detail with Natural Earth city footprints/locations and
// named lakes throughout the Americas. National CO2 factors: World Bank, 2022.
// These reference populations and modeled pollution values are NOT live counts.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}
const inBox = ([lng, lat]) => lng >= -170 && lng <= -10 && lat >= -57 && lat <= 84;
const worldMode = process.argv.includes("--world");

async function main() {
  console.log("Downloading public-domain Natural Earth layers and World Bank factors...");
  const [countries, places, urban, lakes, emissions, bundle] = await Promise.all([
    json(BASE + "ne_50m_admin_0_countries.geojson"),
    json(BASE + "ne_10m_populated_places.geojson"),
    json(BASE + "ne_10m_urban_areas.geojson"),
    json(BASE + "ne_10m_lakes.geojson"),
    json("https://api.worldbank.org/v2/country/all/indicator/EN.GHG.CO2.PC.CE.AR5?format=json&date=2022&per_page=400"),
    fetch("https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/turf.min.js").then((r) => { if (!r.ok) throw new Error("Turf download failed"); return r.text(); }),
  ]);
  const context = { window: {} }; vm.createContext(context); vm.runInContext(bundle, context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../data/lakes.js"), "utf8"), context);
  const turf = context.turf;
  const factors = new Map((emissions[1] || []).filter((r) => Number.isFinite(r.value)).map((r) => [r.countryiso3code, r.value]));
  const allCountries = countries.features.filter((f) => worldMode
    ? !["North America", "South America", "Antarctica"].includes(f.properties.CONTINENT)
    : ["North America", "South America"].includes(f.properties.CONTINENT) || f.properties.ADM0_A3 === "FRA").flatMap((f) => {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const selected = polygons.filter((polygon) => worldMode
      ? !inBox(turf.centroid(turf.polygon(polygon)).geometry.coordinates)
      : inBox(turf.centroid(turf.polygon(polygon)).geometry.coordinates));
    if (!selected.length) return [];
    const code = f.properties.ADM0_A3;
    const factorCode = [code, f.properties.WB_A3, f.properties.SOV_A3].find((id) => factors.has(id));
    const metadata = {
      code, name: f.properties.NAME_EN || f.properties.ADMIN,
      sovereign: f.properties.SOV_A3,
      co2PerCapita: factorCode ? factors.get(factorCode) : null,
      co2Year: 2022, co2FactorCode: factorCode || null,
    };
    if (code !== "FRA" || worldMode) return [turf.multiPolygon(selected, metadata)];
    // France's Natural Earth feature combines its overseas parts. Keep their
    // geographic identities rather than labeling Caribbean cities as Guiana.
    return [["GUF", "French Guiana (France)", -57, 10], ["GLP", "Guadeloupe (France)", 15, 20], ["MTQ", "Martinique (France)", 10, 15]].map(([id, name, minLat, maxLat]) => {
      const parts = selected.filter((polygon) => { const lat = turf.centroid(turf.polygon(polygon)).geometry.coordinates[1]; return lat >= minLat && lat < maxLat; });
      return parts.length ? turf.multiPolygon(parts, { ...metadata, code: id, name }) : null;
    }).filter(Boolean);
  });
  const supplements = allCountries.filter((f) => !["USA", "CAN"].includes(f.properties.code));
  const countryBoxes = supplements.map((f) => turf.bbox(f));
  const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  const countryPlaces = new Map(supplements.map((f) => [f.properties.code, []]));
  const cities = [];
  const existingIDs = new Set();
  if (worldMode) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../data/americas.js"), "utf8"), context);
    context.window.PJJ_AMERICAS_CITIES.features.forEach((f) => existingIDs.add(f.properties.id));
  }
  for (const feature of places.features) {
    if ((!worldMode && !inBox(feature.geometry.coordinates)) || ["USA", "CAN"].includes(feature.properties.ADM0_A3)) continue;
    if (worldMode && (existingIDs.has(String(feature.properties.NE_ID)) || !(feature.properties.POP_MAX >= 100000 || feature.properties.ADM0CAP === 1 || feature.properties.WORLDCITY === 1))) continue;
    const frenchRegion = feature.geometry.coordinates[1] < 10 ? "GUF" : feature.geometry.coordinates[1] >= 15 ? "GLP" : "MTQ";
    const country = supplements.find((c) => c.properties.code === feature.properties.ADM0_A3) || supplements.find((c) => turf.booleanPointInPolygon(feature, c)) || (feature.properties.ADM0_A3 === "FRA" && supplements.find((c) => c.properties.code === frenchRegion));
    if (!country) continue;
    const p = feature.properties;
    const city = {
      type: "Feature", geometry: feature.geometry,
      properties: {
        id: String(p.NE_ID), name: p.NAME_EN || p.NAME, aliases: [p.NAME, p.NAMEASCII, p.NAME_ES, p.NAME_PT].filter(Boolean),
        country: country.properties.code, countryName: country.properties.name, population: Math.max(0, p.POP_MAX || 0),
        center: feature.geometry.coordinates, locationOnly: true, source: "Natural Earth 1:10m populated places and urban areas; reference population estimates of varying source years, not current census counts.",
      },
    };
    cities.push(city); countryPlaces.get(country.properties.code).push(city);
  }
  const footprints = new Map();
  for (const feature of urban.features) {
    const box = turf.bbox(feature);
    if (!worldMode && !overlaps(box, [-170, -57, -10, 84])) continue;
    for (let i = 0; i < supplements.length; i++) {
      if (!overlaps(box, countryBoxes[i])) continue;
      const candidates = countryPlaces.get(supplements[i].properties.code);
      if (!candidates.length) continue;
      const clipped = turf.intersect(turf.featureCollection([feature, supplements[i]]));
      if (!clipped || turf.area(clipped) < 1000000) continue;
      const center = turf.centroid(clipped);
      let best = null, distance = Infinity;
      for (const city of candidates) {
        const d = turf.booleanPointInPolygon(turf.point(city.properties.center), clipped) ? 0 : turf.distance(turf.point(city.properties.center), center);
        if (d < distance || (d === distance && city.properties.population > best?.properties.population)) { best = city; distance = d; }
      }
      if (!best || distance > 40) continue;
      if (!footprints.has(best.properties.id)) footprints.set(best.properties.id, []);
      footprints.get(best.properties.id).push(...(clipped.geometry.type === "Polygon" ? [clipped.geometry.coordinates] : clipped.geometry.coordinates));
    }
  }
  for (const city of cities) {
    const polygons = footprints.get(city.properties.id);
    if (!polygons) continue;
    city.geometry = { type: "MultiPolygon", coordinates: polygons };
    city.properties.areaKm2 = Math.round(turf.area(city) / 1e4) / 100;
    city.properties.locationOnly = false;
  }
  const existing = context.window.PJJ_LAKES.features;
  const pressurePlaces = places.features.filter((feature) => inBox(feature.geometry.coordinates) && feature.properties.POP_MAX > 0);
  const extraLakes = [];
  for (const feature of lakes.features) {
    if (worldMode) break; // Existing world_lakes.js remains the global lake source.
    const name = feature.properties.name_en || feature.properties.name;
    if (!name || turf.area(feature) < 25000000) continue;
    const center = turf.pointOnFeature(feature);
    if (!inBox(center.geometry.coordinates) || !allCountries.some((c) => turf.booleanPointInPolygon(center, c))) continue;
    if (existing.some((lake) => turf.booleanPointInPolygon(center, lake))) continue;
    let pressure = 0;
    for (const city of pressurePlaces) {
      const km = turf.distance(center, city);
      if (km < 200) pressure = Math.max(pressure, Math.min(1, Math.log10(Math.max(1, city.properties.POP_MAX)) / 7) * (1 - km / 200));
    }
    extraLakes.push({ ...feature, properties: { NAME: name, modeledIndex: Math.round(20 + 60 * pressure), source: "Natural Earth 1:10m lakes. Illustrative settlement-proximity index, not measured water quality." } });
  }
  const cleanCities = cities.map((city) => turf.truncate(city, { precision: 4 }));
  const cleanLakes = extraLakes.map((lake) => turf.truncate(lake, { precision: 4 }));
  const countryMetadata = supplements.map((c) => c.properties);
  const prefix = worldMode ? "PJJ_GLOBAL" : "PJJ_AMERICAS";
  const output = "// Natural Earth public-domain urban footprints, reference populations, and lakes; World Bank 2022 national CO2 factors.\n" +
    "// Pollution is modeled, not measured. Point-only cities are searchable but have no invented polygon or circular heat area.\n" +
    `window.${prefix}_COUNTRIES = ` + JSON.stringify(countryMetadata) + ";\n" +
    `window.${prefix}_CITIES = ` + JSON.stringify(turf.featureCollection(cleanCities)) + ";\n" +
    (worldMode ? "" : `window.${prefix}_LAKES = ` + JSON.stringify(turf.featureCollection(cleanLakes)) + ";\n");
  fs.writeFileSync(path.join(__dirname, worldMode ? "../data/global_cities.js" : "../data/americas.js"), output);
  console.log(`${countryMetadata.length} country/territory areas; ${cities.length} city locations, ${footprints.size} mapped city footprints; ${extraLakes.length} additional lakes; ${Math.round(output.length / 1024)} KB`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
