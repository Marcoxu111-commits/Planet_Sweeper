/*
  Generates data/coast.js — the true coastline (in lat/lng) of the Americas
  view, extracted from Natural Earth 50m land polygons (world-atlas, public
  domain).

  Output:
    window.PJJ_COAST_RINGS = [ [[lat,lng], ...], ... ]
      One ordered ring per kept land polygon. Every ring is normalised to be
      counter-clockwise in the (lng,lat) plane, so its interior (the land) is
      always to the LEFT of the walking direction and the sea is to the right.
      The water layer relies on this to build one-sided, seaward coastal bands.

    window.PJJ_COAST = [ [lat1,lng1,lat2,lng2], ... ]
      Flat segment list, kept for backwards compatibility.

  Pipeline:
    1. Download land-50m TopoJSON.
    2. Decode arcs -> polygons (skipping tiny islands < 50 km²).
    3. Keep polygons inside the mapped Americas box (excluding Iceland).
    4. Round coordinates; normalise ring winding to CCW.
*/
const fs = require("fs");
const path = require("path");
const https = require("https");

const LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json";
const OUT = path.join(__dirname, "..", "data", "coast.js");

const R_EARTH = 6371000; // m

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent: false, headers: { "User-Agent": "node" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode + " for " + url));
        }
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error("Bad JSON from " + url + ": " + e.message));
          }
        });
      })
      .on("error", reject);
  });
}

// ---------- TopoJSON decoding ----------
function decodeTopo(topo) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; // lng, lat
    });
  });
  const decodeArc = (idx) => (idx < 0 ? arcs[~idx].slice().reverse() : arcs[idx].slice());
  function ring(arcIndices) {
    const pts = [];
    for (const ai of arcIndices) {
      const ptsArc = decodeArc(ai);
      if (pts.length && pts[pts.length - 1][0] === ptsArc[0][0] && pts[pts.length - 1][1] === ptsArc[0][1]) {
        ptsArc.shift();
      }
      pts.push(...ptsArc);
    }
    if (pts.length && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return pts;
  }
  return { ring };
}

function bboxOf(coords) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const [lng, lat] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function ringAreaKm2(ringLL) {
  let a = 0;
  for (let i = 0; i < ringLL.length; i++) {
    const p = ringLL[i], q = ringLL[(i + 1) % ringLL.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  const rad = Math.PI / 180;
  const avgLat = ringLL.reduce((s, p) => s + p[1], 0) / ringLL.length;
  return Math.abs(a / 2) * rad * rad * (R_EARTH / 1000) * (R_EARTH / 1000) * Math.cos(avgLat * rad);
}

// Standard shoelace signed area in the (lng, lat) plane. > 0 means CCW.
function signedArea(ringLL) {
  let a = 0;
  for (let i = 0; i < ringLL.length; i++) {
    const p = ringLL[i], q = ringLL[(i + 1) % ringLL.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const round = (v, dec) => Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);

// Covers North/Central/South America, the Caribbean, Greenland, and nearby
// American islands. Iceland is not part of the Americas.
const isAmericas = (lat, lng) => lat > -58 && lat < 84 && lng < -10 && lng > -170 && !(lat > 59 && lat < 69 && lng > -30);

async function main() {
  console.log("Fetching land-50m TopoJSON ...");
  const topo = await fetchJSON(LAND_URL);
  if (!topo.objects || !topo.objects.land) throw new Error("topology has no objects.land");
  const { ring } = decodeTopo(topo);

  const landObj = topo.objects.land;
  const geoms = landObj.type === "GeometryCollection" ? landObj.geometries : [landObj];

  const rings = [];
  let kept = 0, skippedTiny = 0, skippedFar = 0;

  for (const g of geoms) {
    const polys = g.type === "MultiPolygon" ? g.arcs : Array.isArray(g) ? g : [];
    for (const poly of polys) {
      const outer = ring(poly[0]); // lng,lat, open
      if (outer.length < 4) continue;
      const bb = bboxOf(outer);
      const cLat = (bb.minLat + bb.maxLat) / 2;
      const cLng = (bb.minLng + bb.maxLng) / 2;
      if (!isAmericas(cLat, cLng)) { skippedFar++; continue; }
      if (ringAreaKm2(outer) < 50) { skippedTiny++; continue; }

      // normalise to CCW so the land is always on the left of travel
      let pts = outer.map(([lng, lat]) => [round(lng, 4), round(lat, 4)]);
      if (signedArea(pts) < 0) pts = pts.slice().reverse();
      // store as [lat, lng]
      rings.push(pts.map(([lng, lat]) => [lat, lng]));
      kept++;
    }
  }
  console.log(`kept ${kept} land rings, skipped ${skippedTiny} tiny, ${skippedFar} outside box`);

  // Flat segment list (back-compat)
  const segs = [];
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  }

  const out =
    `// True coastline of the mapped Americas view.\n` +
    `// Derived from Natural Earth land polygons (world-atlas, public domain), 50m.\n` +
    `// PJJ_COAST_RINGS = [[[lat,lng],...],...]; every ring is CCW, so the land\n` +
    `// (interior) is always to the left of travel and the sea to the right.\n` +
    `window.PJJ_COAST_RINGS = ${JSON.stringify(rings)};\n` +
    `window.PJJ_COAST = ${JSON.stringify(segs)};\n`;
  fs.writeFileSync(OUT, out);
  console.log(`Wrote ${OUT} (${(out.length / 1024).toFixed(0)} KB), ${segs.length} segments`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
