# Phase 0 results and the engine decision

**Decision (2026-11-10): build on CesiumJS.**

## What was tested

Two student MacBook Neos (A18 Pro, 8 GB), on school Wi-Fi under normal school conditions, using the
benchmark page in `phase0/` served from GitHub Pages. Chrome ran on one Neo and Safari on the other.

| Browser | Runs | Result |
|---|---|---|
| Chrome 157 | 8 runs across Cesium and MapLibre, Lite and Full, including a 20-minute Full Cesium heat soak | About 60 fps (the display cap) in every run, no stalls, no heat throttling, JS memory peak about 112 MB |
| Safari 26.5 | 3 one-pass Cesium runs: Lite, Full, Full with geologic map and earthquakes | 59.9, 57.3 and 57.3 fps; no stalls; no tile errors |

All 16 data sources passed in both browsers through the school filter.

## Why Cesium

- Performance does not separate the engines: both hold the display cap on the Neo.
- Only Cesium can show the Moon and Mars, whose NASA Trek tiles are equirectangular.
- In a forced-error test MapLibre drew missing tiles as blank without reporting them.

## Still open

- **181 tile errors in the Chrome heat soak** (Cesium, Full, MODIS daily imagery, geologic map, earthquakes;
  23,256 requests). Cause unknown: NASA's server turning requests away, or the school network. The benchmark page
  now records the source and reason of each error; repeat that run to find out.
- **A full class at once.** Only one machine at a time has been tested on the network.
- **A long Safari run.** Heat throttling in Safari is untested.
- The Chrome-versus-Safari gap in Full mode (60 vs. 51-53 fps at the first two stops) may be the machine, not the browser.
- **Phase 1 additions not yet run on a Neo:** keyless terrain (AWS Terrarium tiles decoded in the browser) and the
  "Sharper" quality setting (1.5x pixel density).
