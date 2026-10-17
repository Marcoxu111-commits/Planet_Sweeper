const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const water = require("../water-utils.js");

test("water geometry area, bounds, and holes are handled consistently", () => {
  const outer = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  const hole = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75], [0.25, 0.25]];
  const polygon = { type: "Polygon", coordinates: [outer] };
  assert.deepEqual(water.bounds(polygon), [0, 0, 1, 1]);
  assert.ok(water.areaKm2(polygon) > 12300 && water.areaKm2(polygon) < 12400);
  const holed = { type: "Polygon", coordinates: [outer, hole] };
  assert.ok(water.areaKm2(holed) < water.areaKm2(polygon));
  assert.equal(water.areaKm2({ type: "MultiPolygon", coordinates: [polygon.coordinates] }), water.areaKm2(polygon));
});

test("coastal analysis regions have positive water areas and readable region labels", () => {
  const context = { window: {} }; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../data/coastal_areas.js"), "utf8"), context);
  const features = context.window.PJJ_COAST_AREAS.features;
  assert.equal(features.length, 148);
  features.forEach((feature, index) => {
    assert.ok(water.areaKm2(feature.geometry) > 0);
    assert.match(water.regionName(feature.properties.seed, index), /Region \d+$/);
  });
});

test("expanded GTA detail covers six municipalities without subdividing Markham", () => {
  const context = { window: {} }; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../data/gta_detail.js"), "utf8"), context);
  const features = context.window.PJJ_GTA_DETAIL.features;
  assert.equal(features.length, 44);
  const counts = {};
  for (const feature of features) {
    const p = feature.properties;
    counts[p.city] = (counts[p.city] || 0) + 1;
    assert.equal(p.populationEstimated, true);
    assert.ok(p.population > 0 && p.areaKm2 > 0);
    assert.ok(p.source.startsWith("https://"));
    assert.ok(!/Ward\s+Ward/i.test(p.name));
  }
  assert.deepEqual(counts, { Mississauga: 11, Brampton: 10, Vaughan: 5, "Richmond Hill": 6, Oshawa: 5, Oakville: 7 });
  assert.equal(counts.Markham, undefined);
});
