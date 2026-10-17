# Planet_Sweeper (PJJ-2 v1)

PlanetSweeper is an interactive environmental map made using ArcGIS, providing visuals for littering and pollution frequencies around the world.
Our model allows users to report local littering hotspots and request volunteer help.

## v1 — North America litter heat map

Open `index.html` in a browser (no build step, no server required).

- **Coverage**: all 2,646 US urban areas + all 1,030 Canadian population centres
- **Basemap**: Esri World Imagery satellite tiles
- **Heat scale**: faded polygons + blurred glow, green → yellow → red (log-scaled reports/km²/yr)
- **GTA detail**: zoom ≥ 9 into Toronto/Markham for ward-level regions
  - Toronto wards use **real ward-level 311 report counts**
- **Click any region** for the details panel (reports/km², total reports, population, area, data source)

## Data sources (all real)

| Layer | Source |
| --- | --- |
| US city boundaries | US DOT BTS — 2020 Census Urban Areas (ArcGIS feature service) |
| Canada city boundaries + population | Statistics Canada 2021 Population Centres (ESDC ArcGIS feature service) |
| Toronto wards | City of Toronto `COTGEO_CITY_WARD` ArcGIS feature service |
| Markham wards | City of Markham `OD_WARDS` ArcGIS feature service |
| NYC litter reports | NYC 311 Open Data (Socrata `erm2-nwe9`), trailing 12 months |
| Chicago litter reports | Chicago 311 Service Requests (Socrata `v6vf-nfxy`), trailing 12 months |
| LA litter reports | MyLA311 2025 (Socrata `h73f-gn57`) |
| Toronto litter reports (incl. per ward) | Toronto 311 Service Requests 2025 (open data ZIP) |

Regions without published 311/open litter data are labeled **modeled estimate** —
modeled from the real population density of each boundary, not real litter counts.