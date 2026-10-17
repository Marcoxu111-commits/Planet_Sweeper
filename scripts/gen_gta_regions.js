// Official Ontario municipal boundaries; Census 2021 populations.
// Waste metrics are calculated by the app and explicitly labeled as modeled.
const fs = require("fs");
const path = require("path");
const SERVICE = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open03/MapServer/14/query";
const populations = {
  Toronto: 2794356, Mississauga: 717961, Brampton: 656480, Caledon: 76581,
  Vaughan: 323103, Markham: 338503, "Richmond Hill": 202022, Aurora: 62057,
  Newmarket: 87942, "East Gwillimbury": 34637, Georgina: 47642, King: 27333,
  "Whitchurch-Stouffville": 49546, Ajax: 126666, Pickering: 99186,
  Whitby: 138501, Oshawa: 175383, Clarington: 101427, Brock: 12843,
  Scugog: 21617, Uxbridge: 21556, Burlington: 186948, Oakville: 213759,
  Milton: 132979, "Halton Hills": 62951,
};

function areaKm2(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const rad = Math.PI / 180;
  const ringArea = (ring) => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      sum += (b[0] - a[0]) * rad * (2 + Math.sin(a[1] * rad) + Math.sin(b[1] * rad));
    }
    return Math.abs(sum * 6371.0088 ** 2 / 2);
  };
  return polygons.reduce((total, rings) => total + ringArea(rings[0]) - rings.slice(1).reduce((sum, r) => sum + ringArea(r), 0), 0);
}

async function main() {
  const params = new URLSearchParams({
    f: "geojson", outSR: "4326", returnGeometry: "true", geometryPrecision: "5",
    maxAllowableOffset: "0.00015", outFields: "MUNICIPAL_NAME,UPPER_TIER_MUNICIPALITY",
    where: "MUNICIPAL_AREA_EXTENT_TYPE <> 'Water' AND (UPPER_TIER_MUNICIPALITY IN ('REGIONAL MUNICIPALITY OF HALTON','REGIONAL MUNICIPALITY OF YORK','REGIONAL MUNICIPALITY OF PEEL','REGIONAL MUNICIPALITY OF DURHAM') OR MUNICIPAL_NAME = 'CITY OF TORONTO')",
  });
  const response = await fetch(`${SERVICE}?${params}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.error || !data.features) throw new Error(JSON.stringify(data));
  const regions = new Map();
  data.features.forEach((feature) => {
    const raw = feature.properties.MUNICIPAL_NAME;
    const name = Object.keys(populations).find((n) => raw.replace(/^(CITY|TOWN|TOWNSHIP|MUNICIPALITY) OF /, "").toLowerCase() === n.toLowerCase());
    if (!name) throw new Error(`Unknown municipality: ${raw}`);
    if (!regions.has(name)) regions.set(name, { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [] }, properties: {
      name, population: populations[name],
      region: feature.properties.UPPER_TIER_MUNICIPALITY || "Toronto",
    } });
    regions.get(name).geometry.coordinates.push(...(feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates));
  });
  const features = [...regions.values()];
  features.forEach((feature) => { feature.properties.areaKm2 = Math.round(areaKm2(feature.geometry) * 100) / 100; });
  if (new Set(features.map((f) => f.properties.name)).size !== 25) throw new Error("Expected all 25 GTA municipalities");
  const output = "// Boundaries: Ontario Land Information Ontario, municipal lower/single tier.\n" +
    "// Population: Statistics Canada, Census 2021 municipal counts. Waste values are modeled, not measured.\n" +
    `// Boundary source: ${SERVICE}\n` +
    "window.PJJ_GTA_REGIONS = " + JSON.stringify({ type: "FeatureCollection", features }) + ";\n";
  fs.writeFileSync(path.join(__dirname, "../data/gta_regions.js"), output);
  console.log(`Wrote ${features.length} GTA municipalities (${Math.round(output.length / 1024)} KB)`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
