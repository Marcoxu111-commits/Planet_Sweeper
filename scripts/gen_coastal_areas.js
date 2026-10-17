// Build clean, land-clipped sea areas instead of offsetting shoreline vertices.
// Turf is downloaded for this build only; the map has no new runtime dependency.
const fs = require("fs");
const https = require("https");
const path = require("path");
const vm = require("vm");

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent: false }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => resolve(text));
    }).on("error", reject);
  });
}

async function main() {
  const context = { console, window: {} };
  vm.createContext(context);
  vm.runInContext(await download("https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/turf.min.js"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../data/coast.js"), "utf8"), context);
  const turf = context.turf;
  const rings = context.window.PJJ_COAST_RINGS.map((ring) => {
    const points = ring.map(([lat, lng]) => [lng, lat]);
    points.push(points[0]);
    return [points];
  });
  const land = turf.multiPolygon(rings);
  console.log("Buffering shoreline 130 km out to sea...");
  const expanded = turf.buffer(land, 130, { units: "kilometers", steps: 24 });
  const sea = turf.difference(turf.featureCollection([expanded, land]));
  const bounds = [-170, 7, -50, 72];
  // Widely spaced coastal seeds form broad, natural-looking regions rather than
  // tiny shards. All regions are clipped to the same continuous sea-only band.
  const seeds = [];
  for (const ring of context.window.PJJ_COAST_RINGS) {
    for (const [lat, lng] of ring) {
      if (lat < 7 || lat > 72 || lng < -170 || lng > -50) continue;
      const p = turf.point([lng, lat]);
      if (seeds.every((q) => turf.distance(p, q) > 280)) seeds.push(p);
    }
  }
  console.log(`Clipping ${seeds.length} coastal regions...`);
  const cells = turf.voronoi(turf.featureCollection(seeds), { bbox: bounds });
  const areas = [];
  cells.features.forEach((cell, i) => {
    if (!cell) return;
    const clipped = turf.intersect(turf.featureCollection([sea, cell]));
    if (!clipped) return;
    clipped.properties = { seed: seeds[i].geometry.coordinates, modeled: true };
    areas.push(turf.truncate(clipped, { precision: 4 }));
  });
  const output = "// Modeled coastal areas: 130 km sea-only land buffer, Natural Earth coastline.\n" +
    "window.PJJ_COAST_AREAS = " + JSON.stringify(turf.featureCollection(areas)) + ";\n" +
    "window.PJJ_COAST_MASK = " + JSON.stringify(turf.truncate(turf.bboxClip(sea, bounds), { precision: 4 })) + ";\n";
  fs.writeFileSync(path.join(__dirname, "../data/coastal_areas.js"), output);
  console.log(`Wrote ${areas.length} areas (${Math.round(output.length / 1024)} KB).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
