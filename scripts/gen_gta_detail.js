// Municipal ward detail outside Toronto. Markham deliberately remains unsplit.
// Population allocation and waste values are estimates, not ward measurements.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const sources = [
  ["Mississauga", "https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/Ward_Boundaries/FeatureServer/2", "WARD", 11],
  ["Brampton", "https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Local_Government/FeatureServer/3", "WARD", 10],
  ["Vaughan", "https://services2.arcgis.com/9LnN9037wYhPG904/arcgis/rest/services/Wards/FeatureServer/0", "WARD_NO", 5],
  ["Richmond Hill", "https://services5.arcgis.com/cu2HFDk7AqvG7e31/arcgis/rest/services/Ward_Boundary_read/FeatureServer/0", "WARD", 6],
  ["Oshawa", "https://map.oshawa.ca/arcgis/rest/services/Operational/OpenData/MapServer/11", "WARDNUMBER", 5],
  ["Oakville", "https://maps.oakville.ca/oakgis/rest/services/ArcGISOnline/AGO_Communications/MapServer/7", "WARD", 7],
];
async function main() {
  const context = { window: {} };
  vm.createContext(context);
  const response = await fetch("https://cdn.jsdelivr.net/npm/@turf/turf@7.2.0/turf.min.js");
  if (!response.ok) throw new Error(`Turf HTTP ${response.status}`);
  vm.runInContext(await response.text(), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../data/gta_regions.js"), "utf8"), context);
  const turf = context.turf;
  const features = [];
  for (const [city, url, field, expected] of sources) {
    const params = new URLSearchParams({ f: "geojson", where: "1=1", outFields: field, outSR: "4326", maxAllowableOffset: "0.00015", geometryPrecision: "5", resultRecordCount: "1000" });
    const res = await fetch(`${url}/query?${params}`);
    if (!res.ok) throw new Error(`${city}: HTTP ${res.status}`);
    const data = await res.json();
    if (data.error || data.features?.length !== expected) throw new Error(`${city}: expected ${expected} wards, received ${data.features?.length}: ${JSON.stringify(data.error)}`);
    const parent = context.window.PJJ_GTA_REGIONS.features.find((f) => f.properties.name === city);
    const regions = data.features.map((feature) => {
      const clipped = turf.intersect(turf.featureCollection([feature, parent]));
      if (!clipped) throw new Error(`${city}: ward does not intersect its municipality`);
      const ward = String(feature.properties[field]).replace(/^ward\s*/i, "").trim();
      clipped.properties = {
        city, ward,
        name: `${city} — Ward ${ward}`,
        areaKm2: turf.area(clipped) / 1e6, source: `${url}/query`,
        populationEstimated: true,
      };
      return clipped;
    });
    const area = regions.reduce((sum, f) => sum + f.properties.areaKm2, 0);
    regions.forEach((feature) => {
      feature.properties.population = Math.round(parent.properties.population * feature.properties.areaKm2 / area);
      feature.properties.areaKm2 = Math.round(feature.properties.areaKm2 * 100) / 100;
      features.push(turf.truncate(feature, { precision: 5 }));
    });
    console.log(`${city}: ${regions.length} land-clipped wards`);
  }
  const output = "// Official municipal ward geometry; population allocated from Census 2021 municipal totals by area.\n" +
    "// Population and pollution are modeled estimates, not ward-level measurements. Markham is not divided.\n" +
    "window.PJJ_GTA_DETAIL = " + JSON.stringify(turf.featureCollection(features)) + ";\n";
  fs.writeFileSync(path.join(__dirname, "../data/gta_detail.js"), output);
  console.log(`Wrote ${features.length} GTA ward regions`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
