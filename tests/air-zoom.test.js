const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

test("air smoke radii stay fixed at overview, city, and street zooms", () => {
  const fn = source.match(/function buildGlow\(points, gradient, areaMult, maxOpacity\) \{[\s\S]*?\n\}/)[0];
  let zoom = 2;
  const context = {
    CATEGORY: "air", DETAIL_ZOOM: 9, heatLayers: [],
    clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)),
    heatRadiusPx: () => { throw new Error("Air kernels must not scale from geographic area"); },
    map: { getZoom: () => zoom, getCenter: () => ({ lat: 43.7 }), addLayer() {} },
    L: { heatLayer: (points, options) => ({ points, options, _canvas: { style: {}, classList: { add(name) { this.added = name; } } } }) },
  };
  vm.createContext(context); vm.runInContext(fn, context);
  for (zoom of [2, 3, 4, 5, 6, 8, 10, 12, 16, 18]) {
    context.heatLayers = [];
    context.buildGlow([[43, -79, 0.5, 60], [44, -80, 0.7, 400], [45, -81, 1, 3500]], {}, 1.6, 0.6);
    assert.deepEqual(Array.from(context.heatLayers, (layer) => layer.options.radius), [12, 18, 24]);
    for (const layer of context.heatLayers) {
      assert.ok(layer.options.blur <= 22);
      assert.equal(layer.options.maxZoom, zoom);
      assert.equal(layer._canvas.classList.added, "air-smoke-layer");
    }
  }
});

test("zoom transitions hide the stretched previous smoke frame", () => {
  const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
  assert.match(css, /\.leaflet-zoom-anim \.air-smoke-layer\s*\{\s*visibility:\s*hidden;/);
});
