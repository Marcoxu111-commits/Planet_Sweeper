// World Bank What a Waste 3.0 (2026 release), CC BY 4.0. Build-time only XLSX
// reader; no spreadsheet package or external request is needed in the map.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const URL = "https://datacatalogfiles.worldbank.org/ddh-published/0039597/DR0095901/What_a_Waste_3.0_COUNTRY_Dataset_&_Codebook.xlsx";
async function main() {
  const [response, library] = await Promise.all([
    fetch(URL), fetch("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"),
  ]);
  if (!response.ok || !library.ok) throw new Error("Could not download waste workbook/reader");
  const context = {}; vm.createContext(context); vm.runInContext(await library.text(), context);
  const book = context.XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: "array" });
  if (process.argv.includes("--countries")) {
    const rows = context.XLSX.utils.sheet_to_json(book.Sheets["Country dataset"], { header: 1 });
    const keys = rows[1];
    for (const row of rows.slice(2).filter((r) => ["CHE", "IND", "CAN", "SAU", "IRN", "IRQ", "ARE", "ISR", "JOR", "YEM", "SYR"].includes(r[0]))) {
      const record = Object.fromEntries(keys.map((k, i) => [k, row[i]]));
      console.log(JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k]) => /iso3|country_name|collection_coverage_total|waste_treatment_|uncollected_percent/.test(k)))));
    }
    return;
  }
  if (process.argv.includes("--inspect")) {
    console.log(book.SheetNames);
    for (const name of book.SheetNames) console.log(name, JSON.stringify(context.XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1 }).slice(0, 5)));
    return;
  }
  const rows = context.XLSX.utils.sheet_to_json(book.Sheets["Country dataset"], { header: 1 });
  const headers = rows[1];
  const countries = await (await fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson")).json();
  const iso2 = new Map(countries.features.map((f) => [f.properties.ADM0_A3, f.properties.ISO_A2_EH]));
  const codebook = context.XLSX.utils.sheet_to_json(book.Sheets.Codebook);
  const numeric = (v) => typeof v === "number" && Number.isFinite(v) ? v : null;
  const result = {};
  for (const row of rows.slice(2)) {
    const r = Object.fromEntries(headers.map((key, i) => [key, row[i]]));
    const code = iso2.get(r.iso3c) || ({ PSE: "PS", XKX: "XK", SSD: "SS", COD: "CD" })[r.iso3c];
    if (!code || code === "-99") continue;
    const total = numeric(r.msw_total_msw_generated_tonnes_year);
    const fields = {
      uncollected: "waste_uncollected_percent", openDump: "waste_treatment_open_dumpsite_percent",
      collection: "waste_collection_coverage_total_percent_of_waste",
      sanitary: "waste_treatment_sanitary_landfill_landfill_gas_system_percent",
      controlled: "waste_treatment_controlled_landfill_percent",
      compost: "waste_treatment_compost_percent", recycled: "waste_treatment_recycling_percent",
      incinerated: "waste_treatment_incineration_percent", digestion: "waste_treatment_anaerobic_digestion_percent",
      unspecified: "waste_treatment_landfill_unspecified_percent", unaccounted: "waste_treatment_unaccounted_for_percent",
    };
    const management = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, numeric(r[field])]));
    // Workbook cells are fractional shares (e.g. 0.9544 = 95.44%), despite the
    // percent column headings. Never reinterpret blanks as zero.
    if (Object.values(management).some((v) => v !== null && (v < 0 || v > 1.02))) throw new Error(`Unexpected share units for ${r.country_name}`);
    const measures = new Set([...Object.values(fields), "msw_total_msw_generated_tonnes_year"]);
    const provenance = codebook.filter((source) => source.iso3c === r.iso3c && measures.has(source.measurement)).map((source) => ({
      field: source.measurement, year: source.date_of_measurement || null,
      source: source["source/reference"] || "", url: source["source/reference_url"] || "",
    }));
    result[code] = {
      name: r.country_name, iso3: r.iso3c, region: r.region_id,
      waste_tonnes: total, year: r.msw_total_msw_generation_year || null,
      population: numeric(r.population_number_of_people), management, provenance,
      source: "World Bank What a Waste 3.0, March 2026 compilation (observation years vary)",
    };
  }
  const output = "// World Bank What a Waste 3.0 (March 2026), CC BY 4.0. Observation years vary.\n" +
    `// Source: ${URL}\n` + "window.PJJ_WASTE_EVIDENCE = " + JSON.stringify(result) + ";\n";
  fs.writeFileSync(path.join(__dirname, "../data/waste_evidence.js"), output);
  console.log(`Wrote ${Object.keys(result).length} countries with comparable MSW/management evidence`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
