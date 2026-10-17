const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
function load(file) {
  const context = { window: {} }; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return context.window;
}
const data = load("data/americas.js");
const normalize = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

test("supplementary city coverage reaches Mexico, Central America, the Caribbean, and South America", () => {
  assert.ok(data.PJJ_AMERICAS_CITIES.features.length >= 1000);
  assert.ok(data.PJJ_AMERICAS_COUNTRIES.length >= 45);
  for (const name of ["Mexico City", "São Paulo", "Buenos Aires", "Bogotá", "Lima", "Havana", "Guatemala City", "Kingston"]) {
    assert.ok(data.PJJ_AMERICAS_CITIES.features.some((f) => normalize(f.properties.name) === normalize(name)), `Missing ${name}`);
  }
  assert.ok(!data.PJJ_AMERICAS_COUNTRIES.some((c) => ["USA", "CAN"].includes(c.code)), "Existing US/Canada detail should not be replaced");
});

test("city points are not replaced by invented circular pollution regions", () => {
  let footprints = 0, points = 0;
  for (const feature of data.PJJ_AMERICAS_CITIES.features) {
    const p = feature.properties;
    assert.ok(p.center.every(Number.isFinite));
    assert.ok(p.population >= 0);
    if (p.locationOnly) { points++; assert.equal(feature.geometry.type, "Point"); }
    else { footprints++; assert.equal(feature.geometry.type, "MultiPolygon"); assert.ok(p.areaKm2 > 0); }
  }
  assert.ok(footprints >= 500);
  assert.ok(points > 0);
});

test("national factors retain their year and missing factors remain explicit", () => {
  for (const country of data.PJJ_AMERICAS_COUNTRIES) {
    assert.equal(country.co2Year, 2022);
    assert.ok(country.co2PerCapita === null || (Number.isFinite(country.co2PerCapita) && country.co2PerCapita >= 0));
  }
  const brazil = data.PJJ_AMERICAS_COUNTRIES.find((c) => c.code === "BRA");
  assert.ok(brazil.co2PerCapita > 0);
});

test("southern lakes and coastline regions extend below the equator without removing northern coverage", () => {
  const lakes = data.PJJ_AMERICAS_LAKES.features;
  assert.ok(lakes.length >= 200);
  assert.ok(lakes.some((f) => /titicaca/i.test(f.properties.NAME)));
  lakes.forEach((f) => assert.ok(f.properties.modeledIndex >= 0 && f.properties.modeledIndex <= 100));
  const regions = load("data/coastal_areas.js").PJJ_COAST_AREAS.features;
  assert.ok(regions.some((f) => f.properties.seed[1] < -50));
  assert.ok(regions.some((f) => f.properties.seed[1] > 70));
});

test("zoom controls use the bottom left and hotspot icons have a simple dot", () => {
  assert.match(fs.readFileSync(path.join(root, "app.js"), "utf8"), /zoomControl\.setPosition\("bottomleft"\)/);
  const initiatives = fs.readFileSync(path.join(root, "initiatives.js"), "utf8");
  assert.match(initiatives, /initiative-pin-symbol/);
  assert.ok(!initiatives.includes("initiative-pin-dot"));
});

test("initiative reports accept locations in the southern hemisphere", () => {
  const { createStore } = require("../initiatives-store.js");
  let saved = null;
  const storage = { getItem: () => saved, setItem: (key, value) => { saved = value; } };
  const store = createStore(storage, { id: "demo", uuid: () => "south-report" });
  store.create({ title: "Cleanup in Santiago", description: "Local litter cleanup", name: "Demo", needed: 5, location: { lat: -33.45, lng: -70.66 }, images: [] });
  assert.equal(store.load()[0].location.lat, -33.45);
  assert.equal(store.load()[0].location.lng, -70.66);
});
