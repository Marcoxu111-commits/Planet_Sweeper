# Map interpretation and sources

## Waste: countries are not ranked by total generation per square kilometre

That older comparison mixed India's municipal waste with Switzerland's all-waste
total (including other waste streams). It also confused waste *generated* with
waste mismanaged. Those are different quantities.

Country colours now use a **documented unmanaged-MSW indicator** from the World
Bank's *What a Waste 3.0* country workbook (March 2026 release, CC BY 4.0):
https://datacatalog.worldbank.org/search/dataset/0039597/What-a-Waste-Global-Database

The generated `data/waste_evidence.js` retains reported municipal solid waste
generation, its observation year, fractional management categories, and codebook
source references. It does not substitute 2022/2030 projections for reported
generation. The release date is **not** the observation year; management measures
can refer to different years. Coverage and definitions vary.

- Reported open dumping and explicitly reported uncollected shares are added.
- When only collection coverage is available, its inverse is an estimated gap.
  If dumping is also reported, the larger of the two is used rather than adding
  potentially overlapping/different-year categories. This is a lower bound.
- If documented managed treatment pathways cover at least 98%, a low documented
  unmanaged share can be shown. Missing categories alone never imply clean.
- Unspecified landfill is not automatically counted as either safe or open dumping.
- Grey means insufficient comparable management evidence, even if a generation
  total exists. It does **not** mean zero waste or low pollution.
- Colours use a log-scaled share (`log(1 + 100 × share) / log(101)`) for visibility.
  This is a descriptive map indicator, not a validated health/pollution score.

For example, the compilation reports approximately 202.3 million tonnes/year of
MSW for India (2021), with an explicitly uncollected share of 4.6% (a lower-bound
indicator), versus 5.94 million tonnes/year for Switzerland (2022), whose reported
composting/recycling/incineration pathways cover its MSW total. The old Swiss
87-million-tonne all-waste figure is not used for this like-for-like comparison.

Local city/ward colours remain reporting-intensity proxies or 311 report density,
not the national management indicator. Their display range is 10–about 400
reports/km²/year, so a density-derived estimate around 30 is Moderate, not Very
High. Counts and modeled numeric estimates are not reduced simply to make a place
look cleaner. Higher report activity is not proof of dirtier streets.

Rebuild the evidence with `node scripts/gen_waste_evidence.js`. The XLSX reader is
downloaded only at build time; the app has no new runtime package dependency.

## Global major cities and oceans

`node scripts/gen_americas.js --world` supplements the existing Americas data with
major cities/capitals elsewhere using Natural Earth populated places and matched
urban polygons. Population is a reference estimate, not a current census count;
local waste pressure is modeled, not a new measured litter dataset. Locations
without a matched footprint remain searchable without invented circles.

`node scripts/gen_global_coasts.js` retains the original Americas sea geometry,
then adds country-land-clipped, locally buffered coastal regions worldwide.
Buffers are approximately 130 km and generalized, not navigation-grade coastlines.
There is no blanket pollution estimate for the deep ocean or Antarctica. Global
regions are analysis tiles, not official marine jurisdictions. Underlying data:
Natural Earth 1:50m countries (public domain).

The coastal palette/index remains illustrative, not water sampling. Above 72°N,
neutral grey-blue and an **Insufficient data** popup replace the unsupported
assumption that Arctic water is definitely very clean or very polluted. Colour
interpolation is clipped to sea geometry; it does not intentionally add inland haze.

The original dark navy water basemap is restored. Worldwide sea coverage,
existing global lakes, and their gradients are retained.

## Air visibility at overview zooms

The earlier rollback exposed a scale mismatch: national CO₂ densities were being
normalized against dense-city thresholds, so nearly all overview values became
invisible. Reported national data now use their own overview range (roughly
16–4,000 t/km²/year) and a light geographic country underlay at zooms 2–6. The
underlay fades before detail zooms; missing totals are not invented from waste.

City smoke remains visible at overview zooms too, including the supplementary
global cities using the same reference-population/national-factor method as the
Americas cities. Smoke kernels stay at 12–24 pixels at every zoom rather than
expanding into country/city-centroid circles. The previous canvas is hidden during
zoom transitions so it cannot flash up as an oversized disk before the new frame.
The night basemap is unchanged. National and city density scales are labeled
separately; this is a CO₂ emissions visualization, not ambient air-quality data.
