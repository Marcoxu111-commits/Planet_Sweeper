// Extend the existing Americas sea mask globally without changing its geometry.
// Local buffered tiles avoid projecting an entire planet into one flat buffer.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
async function main() {
  const [library, response] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/turf.min.js"),
    fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"),
  ]);
  if (!library.ok || !response.ok) throw new Error("Unable to download coastline inputs");
  const context = { window: {} }; vm.createContext(context); vm.runInContext(await library.text(), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../data/coastal_areas.js"), "utf8"), context);
  const turf = context.turf;
  const countries = (await response.json()).features.filter((f) => f.properties.ADMIN !== "Antarctica");
  const boxes = countries.map((f) => turf.bbox(f));
  const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  const cleanGeometry = (feature) => {
    if (!feature?.geometry) return null;
    const parts = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const cleaned = parts.filter((polygon) => polygon[0]?.length >= 4).map((polygon) => polygon.filter((ring) => ring.length >= 4 && ring.every((point) => point.every(Number.isFinite))));
    const valid = cleaned.filter((polygon) => polygon[0]?.length >= 4);
    return valid.length ? turf.multiPolygon(valid, feature.properties || {}) : null;
  };
  const americaBox = [-170, -58, -10, 84];
  // Subtract the existing SEA geometry, not its rectangular extent: Iceland
  // and the coast of western Africa share that longitude range but must be added.
  const america = context.window.PJJ_COAST_MASK;
  const areas = [...context.window.PJJ_COAST_AREAS.features];
  const mask = context.window.PJJ_COAST_MASK.geometry;
  const polygons = mask.type === "Polygon" ? [mask.coordinates] : [...mask.coordinates];
  let completed = 0;
  for (let lat = -60; lat < 84; lat += 30) {
    for (let lng = -180; lng < 180; lng += 30) {
      const cell = [lng, lat, lng + 30, Math.min(84, lat + 30)];
      if (cell[0] >= americaBox[0] && cell[1] >= americaBox[1] && cell[2] <= americaBox[2] && cell[3] <= americaBox[3]) continue;
      const margin = Math.min(25, 2 / Math.cos(Math.max(Math.abs(cell[1]), Math.abs(cell[3])) * Math.PI / 180));
      const padded = [Math.max(-180, cell[0] - margin), Math.max(-85, cell[1] - 2), Math.min(180, cell[2] + margin), Math.min(85, cell[3] + 2)];
      const landParts = [];
      countries.forEach((country, i) => {
        if (!overlaps(boxes[i], padded)) return;
        const clipped = cleanGeometry(turf.bboxClip(country, padded));
        if (clipped && turf.area(clipped) > 10000) landParts.push(clipped);
      });
      if (!landParts.length) continue;
      const land = cleanGeometry(landParts.length === 1 ? landParts[0] : turf.union(turf.featureCollection(landParts)));
      const expanded = cleanGeometry(turf.buffer(land, 130, { units: "kilometers", steps: 12 }));
      if (!expanded) continue;
      // Unwrap buffered dateline coordinates into this tile's longitude range
      // before clipping them back to canonical [-180, 180] GeoJSON coordinates.
      const centre = lng + 15;
      turf.coordEach(expanded, (coord) => {
        while (coord[0] - centre > 180) coord[0] -= 360;
        while (coord[0] - centre < -180) coord[0] += 360;
      });
      const sea = turf.difference(turf.featureCollection([expanded, land]));
      if (!sea) continue;
      const inCell = cleanGeometry(turf.bboxClip(sea, cell));
      if (!inCell) continue;
      const outsideAmericas = turf.difference(turf.featureCollection([inCell, america]));
      if (!outsideAmericas || turf.area(outsideAmericas) < 10000) continue;
      for (let y = cell[1]; y < cell[3]; y += 10) {
        for (let x = cell[0]; x < cell[2]; x += 10) {
          const region = cleanGeometry(turf.bboxClip(outsideAmericas, [x, y, Math.min(x + 10, cell[2]), Math.min(y + 10, cell[3])]));
          if (!region || turf.area(region) < 10000) continue;
          region.properties = { seed: [x + 5, y + 5], modeled: true };
          const clean = turf.truncate(region, { precision: 4 });
          areas.push(clean);
          polygons.push(...(clean.geometry.type === "Polygon" ? [clean.geometry.coordinates] : clean.geometry.coordinates));
        }
      }
      completed++;
      console.log(`Buffered global coastal tile ${cell.join(",")} (${completed})`);
    }
  }
  const output = "// Global coastal sea areas: Natural Earth land, local ~130 km buffers.\n" +
    "// Original Americas coastal polygons retained unchanged; data are illustrative, not measured water quality.\n" +
    "window.PJJ_COAST_AREAS = " + JSON.stringify(turf.featureCollection(areas)) + ";\n" +
    "window.PJJ_COAST_MASK = " + JSON.stringify(turf.multiPolygon(polygons)) + ";\n";
  fs.writeFileSync(path.join(__dirname, "../data/global_coastal_areas.js"), output);
  console.log(`Wrote ${areas.length} global regions (${Math.round(output.length / 1024)} KB)`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
