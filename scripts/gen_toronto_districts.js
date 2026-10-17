// Official City of Toronto former municipality boundaries for city/district search.
const fs = require("fs");
const path = require("path");
const service = "https://services3.arcgis.com/b9WvedVPoizGfvfD/arcgis/rest/services/FORMER_MUNICIPALITY/FeatureServer/0/query";
async function main() {
  const params = new URLSearchParams({ f: "geojson", where: "1=1", outFields: "AREA_NAME,AREA_SHORT_CODE", outSR: "4326", maxAllowableOffset: "0.0001", geometryPrecision: "5" });
  const response = await fetch(`${service}?${params}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.features?.length !== 6) throw new Error("Expected Toronto's six former municipalities");
  data.features.forEach((feature) => {
    const name = feature.properties.AREA_NAME.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    feature.properties = { name: /^toronto$/i.test(name) ? "Old Toronto" : name, type: "Toronto district (former municipality)" };
  });
  fs.writeFileSync(path.join(__dirname, "../data/toronto_districts.js"), `// Source: ${service}\nwindow.PJJ_TORONTO_DISTRICTS = ${JSON.stringify(data)};\n`);
  console.log(data.features.map((f) => f.properties.name).join(", "));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
