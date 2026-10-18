# PROJECT V3 FINAL - PLANET-SWEEPER

PlanetSweeper is an interactive environmental map made using ArcGIS, providing visuals for littering and pollution frequencies around the world.
Our model allows users to report local littering hotspots and request volunteer help.

## v1 — Americas pollution map

Run `node serve.js` and open `http://localhost:5173` (no build step or dependencies).

- **Coverage**: the existing 2,646 US urban areas + 1,030 Canadian population centres, supplemented by 1,400+ named city locations and 600+ mapped urban footprints across Mexico, Central America, South America, the Caribbean, and other American territories. This is broad continental reference coverage, not every settlement or municipality.
- **Basemap**: Esri World Imagery satellite tiles
- **Heat scale**: yellow → red polygons (log-scaled reports/km²/yr); haze only at overview zooms
- **GTA detail**: 25 municipal regions, plus Toronto wards at zoom ≥ 9. Markham stays one municipal region, not separate wards.
- **Expanded GTA wards**: 44 additional official wards in Mississauga, Brampton, Vaughan, Richmond Hill, Oshawa, and Oakville appear at zoom ≥ 9 and are searchable. These new ward populations are area-allocated estimates from municipal Census 2021 totals, not measured ward counts; waste values are modeled. Geometry is clipped to municipal land boundaries.
- **City search**: Toronto's six former municipalities (Old Toronto, Etobicoke, York, North York, East York, Scarborough) and all 25 Toronto wards are searchable alongside cities.
- **Panels**: city/initiatives, pollution layers, and region details can be minimized independently. Region details occupy the top-right panel rail, separate from the bottom-right layer controls.
  - Toronto wards use **real ward-level 311 report counts**
- **Click any region** for the details panel (reports/km², total reports, population, area, data source)

## Data sources (all real)

| Layer | Source |
| --- | --- |
| US city boundaries | US DOT BTS — 2020 Census Urban Areas (ArcGIS feature service) |
| Canada city boundaries + population | Statistics Canada 2021 Population Centres (ESDC ArcGIS feature service) |
| Toronto wards | City of Toronto `COTGEO_CITY_WARD` ArcGIS feature service |
| GTA municipalities, including Markham | Ontario Land Information Ontario, lower/single-tier municipal boundaries |
| Toronto districts for search | City of Toronto Former Municipality boundaries (six pre-amalgamation municipalities) |
| NYC litter reports | NYC 311 Open Data (Socrata `erm2-nwe9`), trailing 12 months |
| Chicago litter reports | Chicago 311 Service Requests (Socrata `v6vf-nfxy`), trailing 12 months |
| LA litter reports | MyLA311 2025 (Socrata `h73f-gn57`) |
| Toronto litter reports (incl. per ward) | Toronto 311 Service Requests 2025 (open data ZIP) |
| Supplementary Americas cities and lakes | Natural Earth 1:10m populated places, urban areas, and lakes (public domain); clipped to Natural Earth country land polygons |
| Supplementary national CO₂ factors | World Bank 2022, indicator `EN.GHG.CO2.PC.CE.AR5` (CO₂ excluding land-use change, per capita); some territories use their sovereign's factor |

Regions without published 311/open litter data are labeled **modeled estimate** —
modeled from the real population density of each boundary, not real litter counts.

## Water layers

The continuous coastal gradient style is retained and extends across the Americas. Its analysis regions are
clickable, with very faint boundaries. Region details show the modeled index at
the clicked point, sea-region area, coordinates, and provenance. These are
illustrative map-analysis regions, not official water-management boundaries or
live water samples. Region area is calculated from the displayed geometry.

Lakes now use a world-aligned gradient clipped to each lake's polygon, with their
white outlines and click details retained. In-lake colour variation is visual,
not spatially measured water quality; the popup retains the lake's single index
and explicitly explains this. No blur is applied outside lake boundaries.

Additional named Natural Earth lakes/reservoirs extend the water layer through
Central and South America (including Titicaca). Their indices are illustrative
settlement-proximity estimates, not measured water samples. Coastline coverage
extends to Patagonia and Greenland, with the same land-clipped gradient approach.

### Continental coverage limits

- Existing detailed US, Canada, and GTA sources remain in place.
- New city populations are Natural Earth reference estimates with varying source
  years, **not current census counts**. Matched urban footprints are generalized
  physical built-up areas, not municipal or ward boundaries. Pollution is modeled.
- Named places with no matched urban footprint remain searchable and can be set
  as your city for initiatives, but do not get an invented circle/polygon or a
  fabricated pollution measurement. Their preview explains this limitation.
- Air totals are estimates from population × a 2022 national/sovereign World Bank
  factor. These are not monitored city emissions. When no factor is available,
  the popup explicitly labels an illustrative 3.5 t/person/year fallback.
- Country boundaries and naming follow the Natural Earth reference dataset;
  they are not a statement about disputed sovereignty.
- City photos remain available for the selected demo cities/regions; this is
  not a photo catalogue for every city.

Sources: [Natural Earth vector data](https://github.com/nvkelso/natural-earth-vector),
[Natural Earth public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/),
[World Bank indicator/API](https://api.worldbank.org/v2/country/all/indicator/EN.GHG.CO2.PC.CE.AR5?format=json&date=2022&per_page=400).
Rebuild supplementary cities/lakes with `node scripts/gen_americas.js`; rebuild
the wider sea mask with `node scripts/gen_coast.js`, then
`node scripts/gen_coastal_areas.js`.

## Initiative system (local prototype)

1. Find a city or Toronto district, then select **Set as your city**.
   Browsing a different city does not replace your saved city until you confirm.
2. Choose **Report a hotspot**, then **Search an address** or **Pick on the map**.
   The map option uses a normal crosshair cursor; you can also use its centre.
3. Adjust the draggable pin, add your display name/role, description, optional photos,
   and a target number of volunteers. Save the report locally.
4. Open **Volunteer nearby**. Use your saved city or choose a specific address/map
   location. Filter by distance. No device geolocation is requested or used.
5. Open an initiative, sign up, and enter its local group-chat demonstration.

**Important:** This static site has no backend, authentication, public report feed,
or real-time messaging service. Reports, resized photos, volunteer sign-ups, and
messages are stored in this browser's `localStorage`, not sent to other volunteers.
They survive reloads on the same origin, but will not appear on another device or
domain. Matching tabs on the same browser/origin refresh through storage events.
Display names are not verified identities. The interface labels these limits.
Saved and draft hotspot pins use a plain solid-teal teardrop with a white dot;
a dashed white border distinguishes a draggable draft. Zoom controls live in the
bottom-left corner. Address lookup includes American countries/territories, and
nearby search supports radii up to 500 km without device geolocation.

For a public launch, add authenticated accounts, a shared database with geographic
queries, private photo storage, server-enforced membership/capacity permissions,
real-time chat, moderation/reporting, and privacy/retention controls. Do not treat
the local prototype as a deployed volunteer coordination service.

Address search uses OpenStreetMap Nominatim only on explicit submission (no
autocomplete); the typed address is sent to that service. Results are cached for
the page session and lookups are rate-limited. OpenStreetMap attribution appears
in the location picker. Your manually selected city is stored locally as a
preference. Address/map search origins are session-only. GPS is not used.

Photos are limited to three images, resized to 800 px and re-encoded as JPEG;
they are never uploaded. Storage errors are shown rather than silently dropping
reports. Keep real personal or sensitive information out of this prototype.

### City photos

City images are bundled locally in `assets/cities/` (cropped/resized from
Unsplash), so viewing them does not request a third-party image server:

- Toronto: https://images.unsplash.com/photo-1517935706615-2717063c2225
- New York: https://images.unsplash.com/photo-1485871981521-5b1fd3805eee
- Chicago: https://images.unsplash.com/photo-1494522358652-f30e61a60313

License: https://unsplash.com/license. Photos are illustrative city images, not
images of reported pollution hotspots.

Markham and Etobicoke photos are from Wikimedia Commons, credited with their
individual Creative Commons licenses in the interface and in
[`assets/cities/ATTRIBUTION.md`](assets/cities/ATTRIBUTION.md). Images appear only
after selecting a matching city/region, not as featured demo-city buttons.

### Tests

Run `node --test tests/*.test.js` for persistence, validation, duplicate sign-ups,
capacity, leaving, local chat membership, quota handling, district coverage, and
city-photo assets.
