# Conversation export: Geoscience Globe web app

*Exported October 30, 2026. Tool activity (web search, file creation, testing) is summarized in italics rather than reproduced.*

---

## User

Would it be possible to create a webapp that reproduces some of the functions of Google Earth? What are some publically available sources of high-quality surface imagery that could be used?

## Claude

Yes, this is very doable, mostly because the hard parts (globe rendering, tile streaming, terrain) already exist as open-source libraries and free data services.

### Building blocks

**CesiumJS** is the closest match to Google Earth. It's open source (Apache 2.0) and provides a true 3D globe with terrain, 3D Tiles, KML/CZML import, camera fly-to, time-dynamic data, and measurement tools. You can feed it almost any imagery or terrain source, and it can handle non-Earth ellipsoids, which matters if you want to do the Moon or Mars.

Lighter alternatives:
- **MapLibre GL JS** now has a globe projection and is good for vector-heavy apps.
- **globe.gl / three-globe** is simple and quick for teaching visuals.
- **OpenLayers** and **Leaflet** are 2D only.

### Earth imagery and elevation

| Source | Resolution | Notes |
|---|---|---|
| **NASA GIBS** | ~250 m to 2 km daily | Free WMTS/WMS tiles with a time dimension, so you can build a date slider for hurricanes, fires, and snow cover. Includes Blue Marble and MODIS/VIIRS true color. |
| **Sentinel-2** (ESA Copernicus) | 10 m | Free, with open data on AWS and the Copernicus Data Space. EOX's "Sentinel-2 cloudless" mosaic is a ready-made global basemap, but check its license for non-commercial limits. |
| **Landsat** (USGS/NASA) | 30 m | Free, with a 50-year archive for time-lapse. Available through USGS, AWS, and Microsoft Planetary Computer. |
| **NAIP / USGS National Map** | ~0.6-1 m (US) | Excellent aerial imagery for the continental US, served through USGS tile services. |
| **IndianaMap** | down to ~6 in. | The state's orthoimagery and lidar are public and very high quality, great for local-scale demos. |
| **Maxar Open Data** | sub-meter | Released for disaster events only, not global coverage. |
| **OpenAerialMap** | varies | Crowd-sourced drone and aerial imagery. |

**Terrain:** Copernicus DEM (30 m, free), SRTM (30 m), the AWS Terrain Tiles dataset, and USGS 3DEP lidar-derived elevation for the US.

**Vector and 3D features:** OpenStreetMap, Natural Earth, and Overture Maps provide roads, labels, and building footprints that you can extrude into 3D buildings.

### Planetary surfaces

- **NASA Trek** (Moon, Mars, Mercury, Vesta, Ceres, and more) offers WMTS layers, including LRO and MESSENGER data.
- **USGS Astrogeology** hosts global mosaics and Mars CTX/HiRISE data.
- Cassini-based Titan and Saturn-moon maps are also publicly available.

### Caveats

- **Google, Bing, and Esri imagery** can't be used outside their own APIs and terms. Google's Map Tiles API does offer Photorealistic 3D Tiles that load in Cesium, but with usage limits and required attribution. Mapbox and Esri have free tiers with API keys.
- **The public OpenStreetMap tile server** prohibits heavy use, so use a provider like MapTiler or Stadia, or host your own tiles.
- **Google Earth's photogrammetric 3D cities** are proprietary, and no free global equivalent exists. Some cities publish their own open 3D models.
- **Hosting is the real cost.** For custom data, GDAL plus Cloud-Optimized GeoTIFFs or PMTiles lets you serve tiles from cheap static storage with no server.

Always check each source's current license and attribution requirements before you publish anything.

### A realistic first version

A Cesium app with Sentinel-2 or GIBS imagery, Copernicus terrain, and OSM labels would get you panning, tilting, search (via Nominatim), placemarks, KML import, a time slider, and measurement tools. That's a good weekend-to-few-weeks project, depending on polish.

Would you like me to build a working prototype? If so, tell me whether you'd like Earth only or planetary bodies too, and I can tailor the layers accordingly.

---

## User

I want a webapp that Earth space science students could use for studying and learnign about geologiccal features of the Earth. Including other planets and other kinds of scientific data would be a bonus if it is practical. I would need to host it on github or some appropriate free alternative. Without building anything yet, describe a suitable plan.

## Claude

# Plan: A Geoscience Globe for Students

### 1. Guiding principles

- **Fully static site.** No backend, no accounts, no student data, so hosting is free and there are no privacy concerns.
- **Learning over data browsing.** The differentiator from Google Earth is guided activities, not more layers.
- **Data stays external.** Imagery and terrain are streamed from public services, so the repo holds only code and small config files.
- **Runs on school hardware.** Target Chromebooks and tablets, so performance and mobile controls matter.

### 2. Technology choice

The main decision is between two engines:

| | **CesiumJS** | **MapLibre GL JS (globe mode)** |
|---|---|---|
| Earth terrain | Needs a free Cesium ion token (domain-restricted) or a community terrain provider | Free terrain-RGB tiles, no key |
| Other planets | Native support for custom ellipsoids and the geographic tiling NASA Trek uses | Awkward, since many planetary tile sets aren't Web Mercator |
| Time-dynamic data, KML/CZML | Strong | Limited |
| Bundle weight | Heavy | Light |

**Recommendation:** CesiumJS. The planetary bodies are the "bonus" you want, and Cesium handles them far better. A shared token for the free tier is normal for static sites, but check the current ion terms and quotas before committing.

### 3. Hosting

- **GitHub Pages** for the app (the recommended repo size is about 1 GB, with soft bandwidth limits, which is plenty for code).
- A GitHub Actions workflow to build and deploy on every push, using Vite for bundling.
- If you ever need custom data (say, a local geologic map), serve it as **PMTiles** or Cloud-Optimized GeoTIFFs from Cloudflare R2 or similar free-tier object storage. Large files shouldn't live in the repo.

### 4. Data layers

**Earth**
- Base imagery: NASA GIBS, Sentinel-2 cloudless, and USGS NAIP/Landsat
- Terrain: Cesium World Terrain or Copernicus DEM
- Seismicity: USGS real-time earthquake GeoJSON feeds, which update constantly and are useful for plate tectonics
- Volcanoes: Smithsonian Global Volcanism Program
- Plate boundaries and motion vectors: public tectonic datasets
- Geologic maps: **Macrostrat** (global, with an API), USGS state geologic maps, and IndianaMap for local examples
- Bathymetry: GEBCO
- Crustal age, gravity, and magnetic anomaly grids as advanced layers

**Other worlds** (via NASA Trek and USGS Astrogeology)
- Moon, Mars (MOLA topography, THEMIS, CTX/HiRISE), Mercury, Venus (Magellan), Ceres, Vesta
- Stretch goals: Pluto, Titan, and the icy moons

### 5. Features, in phases

**Phase 1: Core globe (MVP)**
- Globe with terrain, a layer panel with opacity sliders, and place search
- Body selector (Earth, Moon, Mars)
- Shareable URLs that encode camera position and active layers, so students can submit links

**Phase 2: Analysis tools**
- Measure distance and area
- Elevation profile along a drawn line, as a basic cross-section
- Coordinate and elevation readout on hover
- Swipe or side-by-side comparison, such as geologic map vs. imagery, or Mars vs. Earth
- Vertical exaggeration slider

**Phase 3: Teaching layer (the differentiator)**
- **Guided tours/activities** defined as JSON or Markdown files in the repo. Each stop has a camera position, layers, and a prompt ("Why does this ridge parallel the trench?"). Teachers can author new ones without touching code.
- Built-in features library: rift valleys, subduction zones, hotspot chains, impact craters, glacial landforms, karst, and so on
- Time-based layers: a GIBS date slider for fires, floods, and snow cover, and a Landsat time-lapse
- Optional answer boxes that students export as text or a printable PDF, with nothing sent to a server

**Phase 4: Planetary comparisons**
- Side-by-side Earth/Mars/Moon scale comparisons for features like Olympus Mons vs. Mauna Kea
- Crater-counting activity using Moon imagery

### 6. Risks and mitigations

- **Service reliability.** Public tile servers can go down or change URLs. Keep all endpoints in a single config file, include fallback basemaps, and show a friendly error when a layer fails.
- **CORS.** Not every service allows browser requests. Test each source early, and proxy through a free Cloudflare Worker if one doesn't.
- **School networks.** Content filters may block some domains, so test on actual school networks before relying on it in class.
- **Performance.** Cap terrain detail on low-end devices and offer a "lite mode."
- **Licensing.** Record each layer's license and attribution in the config, and display it in the UI.

### 7. Suggested timeline

| Phase | Effort |
|---|---|
| 0. Validate every data source (CORS, tile format, license) | A few days |
| 1. MVP globe | 1-2 weeks |
| 2. Tools | 2-3 weeks |
| 3. Tour system and first 3-5 activities | 2-3 weeks |
| 4. Planetary comparisons | Ongoing |

Phase 0 matters most. A small test page confirming that each layer actually loads from a static site will head off most surprises.

To tailor the plan further, it would help to know the course level (intro Earth science vs. AP-level) and whether students will mostly use Chromebooks. Those two answers shape the tool priorities and the performance budget.

---

## User

Intro level. Students will be using through a browser (Safari or Chrome) on Macbook Neos.

## Claude

*(Claude searched the web for MacBook Neo specifications to size the performance budget.)*

# Revised Plan for Intro-Level Students on MacBook Neos

### What the hardware means for the design

The MacBook Neo is Apple's entry-level laptop with an A-series (iPhone-class) chip, specifically a 6-core CPU, a 5-core GPU, and 8 GB of RAM. It is fanless, and the display is 2,408 x 1,506 pixels. Reviewers describe the chip as fast for everyday work, but one analysis warns that the 8 GB of RAM and the lack of active cooling can both be limits on long workloads.

For a 3D globe, that translates into four design constraints:

- **GPU and memory headroom is modest.** A browser tab already competes with macOS and any other open tabs for 8 GB, so the globe must stay lean.
- **Sustained load can cause throttling.** A fanless laptop rendering a globe continuously for a 50-minute class period is the risky scenario.
- **The display has more pixels than the GPU should be asked to fill.** Rendering at full Retina density is wasted effort for this use.
- **Students will use trackpads.** Many globe controls assume a multi-button mouse, so navigation has to work with two-finger gestures and on-screen buttons.

### Engine decision, revisited

CesiumJS is still workable, but it needs a strict performance budget. MapLibre's globe mode is lighter, and I'd reconsider it if the budget can't be met.

| | CesiumJS | MapLibre globe |
|---|---|---|
| Other planets | Strong | Awkward |
| Weight on a Neo | Heavier, needs tuning | Lighter |
| Terrain and relief | Excellent | Good enough for intro level |

**Recommendation:** Build the Phase 0 test page in both engines and run it on a real Neo, in both Safari and Chrome, with several tabs open. Pick the engine from that result rather than from specs. If Cesium holds a smooth frame rate after 20 minutes of continuous use, keep it for the planetary bonus. If it doesn't, use MapLibre for Earth and treat other planets as a separate, simpler module.

### Performance budget (Cesium settings to apply)

These are standard levers, though the exact values should be tuned on real hardware:

- **Render on demand.** Redraw only when the camera moves or data changes. This is the biggest saver for heat and battery.
- **Cap pixel density.** Render at 1x or 1.5x instead of the full Retina ratio.
- **Raise the tile-detail tolerance** so the globe loads fewer, coarser tiles. At intro level students are looking at mountain ranges and plate boundaries, not individual houses.
- **Turn off the costly extras:** atmosphere, fog, sun lighting, shadows, antialiasing, and 3D buildings.
- **Limit the number of simultaneously active layers** (for example, three), and tell students why.
- **Keep a "Lite mode" switch** that applies the most aggressive settings.

### Safari and Chrome specifics

- **Saving student work:** Safari limits long-term browser storage and lacks some file-access APIs that Chrome has. Don't rely on browser storage. Use "Download my answers" (text or PDF) and "Copy share link" instead.
- **Shared links:** Camera and layer state encoded in the URL works identically in both browsers and doubles as the submission method.
- **Cross-browser testing:** Check every data source on both browsers early, because CORS and tile-format problems sometimes show up in only one.
- **Network load:** If 30 students load the same imagery at once, school Wi-Fi may be the real bottleneck. Test during an actual class period if you can.

### Scope trimmed for intro level

Fewer tools, more guidance.

**Keep, and make simple**
- Body selector (Earth, Moon, Mars)
- A small set of curated layers with plain-language names and a one-sentence "what am I looking at?" note
- Place search and "fly to" buttons
- Coordinate and elevation readout
- Simple distance measurement
- Vertical exaggeration slider
- Swipe comparison, for example geologic map vs. satellite image, which is a strong teaching tool

**Defer or drop**
- Area measurement, elevation profile drawing, and KML import. These are better suited to an advanced course.
- Crater counting and the Landsat time-lapse. Fine to add later.

**Navigation for trackpads**
- On-screen zoom, tilt, and rotate buttons
- A "reset view" button
- A short first-run hint showing the gestures that work
- Tours that move the camera for students, which reduces the need for manual navigation

### The teaching layer is now the core of the project

At this level the tours and activities carry most of the value. Each activity should be a short, self-contained task of about 10 to 20 minutes:

1. **Plate boundaries:** find a convergent, divergent, and transform boundary, with earthquake dots from the USGS live feed
2. **Volcanoes and hotspots:** the Ring of Fire, the Hawaiian chain, and age progression
3. **Mountains and rifts:** the Himalayas, the East African Rift, and the Appalachians
4. **Rivers and deltas:** erosion, deposition, and meanders
5. **Glaciers and ice sheets:** landforms, and change over time with GIBS
6. **Coastlines and karst:** a mix of processes
7. **Rock types and geologic maps:** Macrostrat plus a local Indiana example
8. **Comparative planetology:** craters and volcanoes on the Moon and Mars versus Earth, plus Olympus Mons vs. Mauna Kea

Each tour stop would carry a camera view, active layers, a short reading, and a question. Authoring should be via plain JSON or Markdown files so you can add activities without touching code. Answers would be exported by the student, with nothing sent to a server.

### Revised phases

| Phase | Content | Effort |
|---|---|---|
| 0 | Validate data sources and **benchmark on a real Neo** (Safari and Chrome), choose the engine | A few days |
| 1 | MVP: globe, curated layers, Earth/Moon/Mars, shareable URLs, Lite mode | 1-2 weeks |
| 2 | Tour/activity system, with the first 3 activities | 2-3 weeks |
| 3 | Remaining activities, swipe compare, basic measurement | 2-3 weeks |
| 4 | Pilot with one class section, gather feedback, tune performance | 1-2 weeks |

I moved the tour system ahead of the analysis tools, since it matters more at this level.

### Risks specific to this setup

- **Thermal throttling in a long class period.** Mitigate with render-on-demand and activities that include natural pauses.
- **A single heavy tab.** Test with realistic multitasking, such as a document and a video call open at the same time.
- **Reading level and accessibility.** Keep prose short, use color-blind-safe palettes, and support keyboard navigation and a text alternative for key views.
- **Data source changes.** Keep all endpoints in one config file with fallback basemaps.

### Suggested next step

The most valuable first step is the Phase 0 benchmark page. If you can get access to a Neo, even a single borrowed one, a 20-minute stress test with a Cesium globe and a MapLibre globe would settle the engine question with real numbers instead of estimates.

One question that would help me refine the activity list: should the activities align to specific Indiana or NGSS standards (as you do for your other courses), or stay topic-based for now?

---

## User

Topic-based for now. I'll worry about standards later.

## Claude

Topic-based works well. I'd make one small design choice now so standards are painless later: give each activity's JSON file an optional `standards` field, empty for now. When you're ready, you can fill in the Indiana and NGSS codes without restructuring anything, and the app can later display them or generate your alignment table from the same files.

The plan stays as written, with the eight activities organized by topic:

1. Plate boundaries
2. Volcanoes and hotspots
3. Mountains and rifts
4. Rivers and deltas
5. Glaciers and ice sheets
6. Coastlines and karst
7. Rock types and geologic maps
8. Comparative planetology

This also leaves you free to reorder or merge topics based on your course sequence without redoing any alignment work.

When you're ready to start building, the Phase 0 benchmark page is the logical first step. It would be a small static page with a Cesium globe and a MapLibre globe, each loading a few of the candidate data sources (GIBS imagery, terrain, the USGS earthquake feed, and Moon and Mars layers from NASA Trek). That would test engine performance and data-source compatibility at once. Do you want me to build it?

---

## User

Yes. Build phase zero.

## Claude

*(Claude checked current library versions on npm, downloaded the pinned Cesium 1.145.0 and MapLibre 5.24.0 packages to verify the API names used, wrote four files, and smoke-tested the page logic in a simulated browser with stubbed network and a fake engine. Two fixes came out of that process: switching from MapLibre 6.x, which is ES-module-only, to 5.24.0, and correcting the Cesium FXAA property path.)*

**Files produced** (in `phase0/`): `index.html`, `config.js`, `app.js`, `README.md`

The Phase 0 benchmark is built, but I haven't run it in a real browser against the live services. I verified the library API names against the pinned packages and ran the page logic in a simulated browser with stubbed network. That run passed, with only the expected jsdom canvas warnings. Your first real run may still turn up a bug.

**What it does**
- **This device:** reports the browser, screen, pixel density, and WebGL 2 and GPU details.
- **Data sources:** requests 16 sources the way the globe would and checks that each decodes or parses. They are GIBS, USGS, EOX, NASA Trek Moon and Mars, Macrostrat, AWS terrain, the earthquake and volcano feeds, Nominatim, and the jsDelivr library files.
  - Failures are classified as no CORS headers, can't connect (offline or filtered), or bad HTTP status.
- **Cesium and MapLibre tabs:** each runs a scripted camera tour (Himalaya, Hawaii, Iceland, the African Rift, and so on) and records speed, stalls, tile load time, and errors.
  - Lite and Full profiles, three sharpness levels, and runs of one pass up to 20 minutes are available.
  - Long runs flag possible heat throttling.
  - Cesium can also tour the Moon and Mars.
- **Results:** copies everything as Markdown for Obsidian, or as JSON.

**How to run it**
- **Locally:** run `python3 -m http.server 8000` in the `phase0` folder.
- **On the Neos:** use GitHub Pages, so each Neo opens a normal https page. Opening `index.html` by double-click won't work reliably.
- **Protocol:** the README lays out the test protocol and suggested pass thresholds, which are starting points rather than hard rules.

**What to watch for**
- **Unverified URLs:** EOX, Macrostrat tiles, NASA Trek, and the Smithsonian volcano feed are marked "verify" in `config.js`. Fixing one is a one-line edit there.
- **MapLibre version:** I pinned 5.24.0 instead of the newest 6.x, because 6.x only ships as an ES module and is awkward to load from a CDN.
- **Cesium terrain:** it needs a free Cesium ion token pasted into the page, and the token is never written to a file.
- **Moon and Mars:** NASA Trek's equirectangular tiles work in Cesium only. If planets matter to you, that constraint will drive the engine choice.

Run the Sources tab first, in both browsers, on the school network. It's the fastest way to find out whether anything the plan depends on is blocked.

---

## User

Would this be an appropriate project to tackle with Claude Code?

## Claude

Yes, and I think it's a better fit than this chat for most of the remaining work.

**Why Claude Code suits it**
- **It runs in your real environment.** Here I couldn't open a browser or reach the live tile servers, so the Phase 0 page is untested against them. Claude Code can run the page in a headless browser (Playwright), see the actual errors, and fix the "verify" URLs in `config.js` in a tight loop.
- **The project is a long series of small, connected changes.** The tour system, activity files, layer panel, measurement tools, and build and deploy setup all touch several files. Claude Code handles that with git history, so each change is easy to review or undo.
- **The tooling is its home turf.** Vite, GitHub Actions for Pages deployment, and automated checks are routine terminal work.
- **Playwright also ships a WebKit engine.** It gives a rough approximation of Safari for catching browser-specific bugs between your device sessions.

**What it can't replace**
- **The Neo benchmark.** Frame rate, heat throttling, and Safari behavior on that fanless 8 GB machine can only be measured on the hardware itself. Headless tests can't answer the engine question.
- **The teaching content.** Which landforms, which questions, and what reading level works for your students is your call. Claude Code can build the tour system, but the activities are where your expertise matters most.
- **Judgment on the first run.** Review what it builds, especially anything involving API tokens or licensing.

**A sensible way to start**
1. Put the `phase0` folder in a new GitHub repository.
2. Add a short `CLAUDE.md` with the key decisions: static site, no student data, intro-level audience, Safari and Chrome on MacBook Neos, all endpoints in `config.js`, topic-based activities with an empty `standards` field, and the lite-mode performance rules.
3. First task: "Run the data-source checks in a real browser, report which fail, and fix the URLs."
4. Then you run the benchmark on a Neo and bring the Markdown results back to decide between Cesium and MapLibre.
5. After that, build Phase 1 (the MVP globe) and the tour system in the repo.

I'd keep using this chat for planning and writing: drafting the activity prompts, designing the tour JSON format, working through the engine decision once you have benchmark numbers, and reviewing student-facing wording. That split plays to each tool's strengths.

---

## User

Export this conversation as a md file
