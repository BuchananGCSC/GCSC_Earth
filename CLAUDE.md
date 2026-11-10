# Geoscience Globe

A browser globe for **intro-level Earth/space science students** to study geologic features of Earth (and, as a bonus, the Moon and Mars). Planning history: `docs/planning-conversation.md`.

## Key decisions

- **Fully static site**, hosted on GitHub Pages. No backend, no accounts, **no student data** leaves the browser. Student work is exported (download/copy, share links), never sent to a server.
- **Target hardware:** MacBook Neo (A-series chip, 8 GB RAM, fanless) in **Safari and Chrome**, used with trackpads, on school Wi-Fi. Test in both browsers.
- **All external endpoints live in one config file**, `app/config.js`. Nothing else in the app hard-codes a URL. Record license and attribution per source. (`phase0/config.js` is the benchmark page's own, frozen copy.)
- **Performance rules (Lite mode):** render on demand, cap pixel ratio (1x–1.5x), coarser tile detail, no atmosphere/fog/lighting/shadows/AA/3D buildings, limit simultaneous layers (~3).
- **Engine: CesiumJS** (decided 2026-11-10 from the Phase 0 benchmark on student Neos; see `docs/phase0-results.md`). Both engines ran at the display cap, and only Cesium can show the Moon and Mars (equirectangular tiles). Loaded from jsDelivr, version pinned in `app/config.js`.
- **No build step.** Plain HTML, CSS and JS that GitHub Pages serves as-is.
- **Terrain is keyless:** AWS Terrarium elevation tiles decoded in the browser. No Cesium ion token is used by the app.
- **Shared links** carry the body, camera view and layers in the URL hash. Nothing is saved in the browser except "hint dismissed".
- **Place search on Earth sends the typed text to OpenStreetMap Nominatim.** This is the one thing a student types that leaves the browser; the page says so next to the search box. Moon and Mars search a built-in list.
- **Activities are topic-based**, authored as JSON/Markdown files, each with an optional empty `standards` field for later Indiana/NGSS alignment.
- Never commit API tokens (the Phase 0 page takes a Cesium ion token pasted in at run time).
- **Student-facing wording is intro level:** plain names for layers, one sentence on what each shows.

## Layout

- `app/` — the globe students use (Phase 1). `config.js` (all sources, layers, places), `app.js`, `styles.css`, `index.html`, `data/` (local snapshots). Published at the site root.
- `phase0/` — benchmark/validation page, kept for re-testing hardware and networks. Published at `/phase0/`.
- `scripts/` — refresh the local data snapshots (volcanoes, plate boundaries). Run from the repo root.
- `docs/` — planning notes and the Phase 0 test record.
- Run locally: `python3 -m http.server 8000` from the repo root, then open `/app/` or `/phase0/`.

## Phases

0. Benchmark and choose the engine — done.
1. MVP globe: curated layers, Earth/Moon/Mars, search, shareable links, Lite mode — in progress.
2. Tour/activity system with the first three activities.
3. Remaining activities, swipe compare, basic measurement.
4. Pilot with one class section.
