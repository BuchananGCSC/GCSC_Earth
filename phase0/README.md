# Geoscience Globe — Phase 0 check

A static test page that answers two questions before any real building starts:

1. **Do the data sources actually load from a browser app?** (URL patterns, CORS, tile formats, school-network filters)
2. **Can Cesium or MapLibre hold up on the student laptops** (MacBook Neo, Safari and Chrome)?

No build step, no server, no student data. Files:

| File | Purpose |
|---|---|
| `index.html` | Page layout and styles |
| `config.js` | **Every endpoint, library version, and tour waypoint.** Fix URLs here. |
| `app.js` | Device report, source checks, both engines, scripted test, results export |
| `data/gvp-holocene-volcanoes.geojson` | Snapshot of the Smithsonian volcano list (refresh with `scripts/snapshot-volcanoes.py`) |
| `README.md` | This file |

## Run it

**Quick check on your Mac** (localhost counts as a secure context):

```bash
cd phase0
python3 -m http.server 8000
# open http://localhost:8000
```

**On the real student laptops:** use GitHub Pages so each Neo opens a normal https URL. Put the `phase0` folder in a repository, then Settings → Pages → deploy from the branch. Opening `index.html` by double-click (`file://`) will not work reliably.

Libraries (Cesium 1.145.0, MapLibre 5.24.0) load from jsDelivr at run time. If that CDN is blocked on a school network, the **Data sources** tab will show it, which is itself a useful finding.

## Test protocol

Do this in **Safari and Chrome** on at least one Neo, on the school network, with a couple of ordinary tabs open (Docs, a video call).

1. **This device.** Note WebGL 2 is available and which GPU is reported.
2. **Data sources → Run all checks.** Record anything that is not Pass. Repeat on the school network and off it.
3. **Cesium globe**, then **MapLibre globe**. In each, fill in *Test conditions* (device label, macOS version, plugged in, Low Power Mode), then run:
   - Lite, native sharpness, one pass
   - Full, native sharpness, one pass
   - Lite, 1× sharpness, one pass
   - Lite, native sharpness, **20-minute heat soak** (the fanless Neo is the concern)
   - Cesium only: Moon and Mars one pass each
4. **Results → Copy as Markdown**, and paste into Obsidian. Download the JSON too if you want the raw numbers.

Keep the browser tab in front while a test runs; background tabs are slowed by the browser and the run is flagged as unreliable.

## How to read the numbers

- **Frames/s while moving** is measured only during the camera flights. In Lite mode the globe draws only when something changes, so the on-screen counter shows 0 while it is idle. That is intended.
- **Load time per visit** is how long a view took to finish loading its tiles after the camera arrived. This mostly reflects network and tile-server speed. About 0.6 s is the floor (the check waits briefly, then needs three loaded readings in a row), so 0.6 s means "already loaded".
- **Stalls** are gaps of more than a second between drawn frames during a flight.
- **Errors by source** lists each kind of tile or data error in a run: which source, the reason (for example HTTP 429 or 503), how many, when in the run, and a few example tiles. In Chrome it also lists failed requests the browser saw per server; MapLibre stays silent about missing tiles (HTTP 404), so that tally is the only place they show. Safari does not report HTTP statuses to the page, so that cross-check is Chrome-only.
- **Possible heat throttling** is flagged when speed in the last minute of a 3+ minute run is more than 20% below the first minute.
- **JS memory** appears in Chrome only. GPU memory cannot be read from a web page.

Suggested starting thresholds for an intro-level classroom (adjust to taste, they are not hard rules): about 30 frames/s or better in Lite mode, p95 frame time under 50 ms, no stalls, typical view loading in under 5 s on school Wi-Fi, no throttling flag after 20 minutes, and zero errors on the sources the activities depend on.

## Known limits and things to verify

- **Checked in a real browser on 2026-10-30** (Chrome on macOS, off the school network): all 16 data sources pass, and both engines ran the scripted tour, including Cesium on the Moon and Mars. Safari and the Neo itself are still untested.
- **Smithsonian volcano feed:** the web service sends no CORS headers, so the page uses a local snapshot (`data/`) instead. Re-run `python3 scripts/snapshot-volcanoes.py` from the repo root a few times a year.
- **Macrostrat tiles** are 512 px and about 200-300 KB each, the heaviest layer here. Watch for slow loading on school Wi-Fi.
- A failure at tile 0/0/0 means the URL pattern is wrong; a failure only at higher levels suggests a zoom or numbering limit.
- **Cesium terrain** needs a free Cesium ion token (paste it in the page; it is kept only for the browser tab session and never written to any file). Without one, Cesium runs without 3D relief.
- **MapLibre 5.24.0** is used rather than 6.x because version 6 ships only as an ES module, which is awkward to load from a CDN. **Terrain together with the globe projection** is one of the things this page tests in MapLibre.
- **Moon and Mars** layers use equirectangular tiles, so they work in Cesium only. This is a real constraint on the engine choice.
- The Nominatim search request is fine for one test, but the public server's usage policy rules out heavy use in the finished app.
- Check each source's current license and attribution terms before wider release. The notes in `config.js` are reminders, not legal review.
