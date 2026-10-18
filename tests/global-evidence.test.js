const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const waste = require("../waste-utils.js");
const root = path.join(__dirname, "..");
function load(file) {
  const context = { window: {} }; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return context.window;
}
const evidence = load("data/waste_evidence.js").PJJ_WASTE_EVIDENCE;

test("India and Switzerland use comparable MSW figures, not mixed industrial/all-waste totals", () => {
  assert.equal(evidence.CH.waste_tonnes, 5940000);
  assert.ok(evidence.IN.waste_tonnes > 200000000);
  const india = waste.management(evidence.IN), switzerland = waste.management(evidence.CH);
  assert.ok(india.t > switzerland.t);
  assert.equal(india.lowerBound, true);
  assert.equal(switzerland.completeManaged, true);
});
test("Middle East generation evidence has sources and observation years", () => {
  for (const iso of ["SA", "IR", "IQ", "AE", "IL", "JO", "LB", "SY", "YE", "OM", "QA", "KW", "BH", "TR"]) {
    const data = evidence[iso];
    assert.ok(data, `Missing evidence: ${iso}`);
    assert.ok(data.waste_tonnes > 0, `Missing MSW total: ${iso}`);
    assert.ok(data.year >= 2000 && data.year <= 2026);
    assert.match(data.source, /World Bank/);
  }
});
test("missing management observations are not classified as clean", () => {
  assert.equal(waste.management(null), null);
  assert.equal(waste.management({ management: {} }), null);
  assert.equal(waste.management({ management: { collection: 1 } }), null);
  assert.equal(waste.management(evidence.CA), null); // unspecified landfill isn't proof of safe disposal
});
test("derived collection gaps do not double-count reported dumping", () => {
  const risk = waste.management({ management: { collection: 0.842, openDump: 0.45 } });
  assert.equal(risk.share, 0.45);
  assert.equal(risk.lowerBound, true);
});
test("moderate modeled city activity is not labeled very high by the old fixed cutoffs", () => {
  assert.equal(waste.reportingLevel(30), "Moderate");
  assert.equal(waste.reportingLevel(100), "High");
  assert.equal(waste.reportingLevel(300), "Very High");
});
test("global coastal data retains Americas regions and reaches Asia, Europe, Africa, and Oceania", () => {
  const global = load("data/global_coastal_areas.js").PJJ_COAST_AREAS.features;
  const original = load("data/coastal_areas.js").PJJ_COAST_AREAS.features;
  assert.ok(global.length > original.length);
  for (let i = 0; i < original.length; i++) assert.equal(JSON.stringify(global[i]), JSON.stringify(original[i]));
  assert.ok(global.some((f) => f.properties.seed[0] >= 120 && f.properties.seed[1] > 0));
  assert.ok(global.some((f) => f.properties.seed[0] >= 0 && f.properties.seed[0] < 40 && f.properties.seed[1] > 40));
  assert.ok(global.some((f) => f.properties.seed[0] > 10 && f.properties.seed[1] < 0));
  assert.ok(global.some((f) => f.properties.seed[0] > 120 && f.properties.seed[1] < -20));
});
test("global major-city supplement covers the Middle East and all main inhabited continents", () => {
  const cities = load("data/global_cities.js").PJJ_GLOBAL_CITIES.features;
  assert.ok(cities.length >= 2000);
  for (const name of ["Riyadh", "Dubai", "Tehran", "Baghdad", "Paris", "Mumbai", "Tokyo", "Lagos", "Sydney"]) {
    const city = cities.find((f) => f.properties.name === name);
    assert.ok(city, `Missing major city ${name}`);
    assert.equal(city.properties.locationOnly, false, `Missing urban footprint for ${name}`);
    assert.ok(city.properties.population > 0 && city.properties.areaKm2 > 0);
  }
});
test("air overview uses reported emissions and keeps city haze visible without waste-derived totals", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert.ok(!source.includes("function countryCO2("));
  assert.ok(!source.includes("function countryAirStyle("));
  assert.match(source, /function countryAirOverviewStyle\(metric, zoom\)/);
  assert.match(source, /buildGlow\(airPoints\.concat\(airWardPoints\), AIR_GRADIENT, 1\.6, 0\.6\)/);
  assert.ok(!source.includes('airCountryPoints : airPoints.concat'));
});

test("air overview opacity stays visible at zooms 2–6 and fades before detailed views", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const fn = source.match(/function countryAirOverviewStyle\(metric, zoom\) \{[\s\S]*?\n\}/)[0];
  const context = { canvasRenderer: {}, logT: (v, lo, hi) => Math.min(1, Math.max(0, (Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo))) };
  vm.createContext(context); vm.runInContext(fn, context);
  for (const zoom of [2, 3, 4, 5, 6]) assert.ok(context.countryAirOverviewStyle(500, zoom).fillOpacity > 0.1);
  assert.equal(context.countryAirOverviewStyle(500, 7).fillOpacity, 0);
  assert.equal(context.countryAirOverviewStyle(0, 3).fillOpacity, 0);
});

test("water retains global coverage but returns to the original navy basemap", () => {
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(source, /Canvas\/World_Dark_Gray_Base/);
  assert.ok(!source.includes('World_Topo_Map'));
  assert.ok(html.includes('data/global_coastal_areas.js'));
});
