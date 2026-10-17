const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
function load(file) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return context.window;
}

test("Toronto search data contains all six former municipalities", () => {
  const data = load("data/toronto_districts.js").PJJ_TORONTO_DISTRICTS;
  assert.deepEqual(Array.from(data.features, (f) => f.properties.name).sort(), ["East York", "Etobicoke", "North York", "Old Toronto", "Scarborough", "York"]);
  assert.ok(data.features.every((f) => f.geometry.coordinates.length > 0));
});

test("Markham is a single municipal feature and its old ward script is not loaded", () => {
  const data = load("data/gta_regions.js").PJJ_GTA_REGIONS;
  const markham = data.features.filter((f) => f.properties.name === "Markham");
  assert.equal(markham.length, 1);
  assert.ok(markham[0].properties.areaKm2 > 0);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(!html.includes('src="data/markham_wards.js"'));
  assert.ok(!html.includes('id="featured-cities"'));
});

test("city photos resolve for selected cities and Etobicoke wards, with local assets and licenses", () => {
  const photos = load("city-photos.js").PlanetCityPhotos;
  for (const name of ["Toronto", "New York – Jersey City – Newark, NY – NJ", "Chicago, IL", "Markham", "Etobicoke", "1 — Etobicoke North"]) {
    const photo = photos.get(name);
    assert.ok(photo, `Missing photo for ${name}`);
    assert.ok(fs.existsSync(path.join(root, photo.src)));
    assert.ok(photo.source.startsWith("https://"));
    assert.ok(photo.license.startsWith("https://"));
  }
  assert.equal(photos.get("Unlisted city"), undefined);
});
