# Geoscience Globe

A browser globe for **intro-level Earth/space science students** to study geologic features of Earth (and, as a bonus, the Moon and Mars). Planning history: `docs/planning-conversation.md`.

## Key decisions

- **Fully static site**, hosted on GitHub Pages. No backend, no accounts, **no student data** leaves the browser. Student work is exported (download/copy, share links), never sent to a server.
- **Target hardware:** MacBook Neo (A-series chip, 8 GB RAM, fanless) in **Safari and Chrome**, used with trackpads, on school Wi-Fi. Test in both browsers.
- **All external endpoints live in one config file**, `app/config.js`. Nothing else in the app hard-codes a URL. Record license and attribution per source. (`phase0/config.js` is the benchmark page's own, frozen copy.)
- **Performance rules (Lite mode):** render on demand, cap pixel ratio (1x–1.5x), coarser tile detail, no atmosphere/fog/lighting/shadows/AA/3D buildings, limit simultaneous layers (~3).
- **Engine: CesiumJS** (decided 2026-11-10 from the Phase 0 benchmark on student Neos; see `docs/phase0-results.md`). Both engines ran at the display cap, and only Cesium can show the Moon and Mars (equirectangular tiles). Loaded from jsDelivr, version pinned in `app/config.js`.
- **No build step.** Plain HTML, CSS and JS that GitHub Pages serves as-is.
- **Terrain is keyless**, decoded in the browser from image tiles; no Cesium ion token is used by the app. Earth uses the public AWS Terrarium tiles. The Moon and Mars use tiles built from NASA LOLA and MOLA grids by `scripts/build-planet-terrain.py` and stored in `app/data/terrain/` (about 40 MB, 1,364 small files; about 1.9 km per pixel on the Moon and 3.7 km on Mars). Heights are stretched 2x on every world so sizes compare fairly.
- **Color keys are measured, not guessed:** the keys for the Moon and Mars "Heights in color" pictures come from `scripts/calibrate-height-colors.py`, which compares NASA's color maps with the elevation grids.
- **Shared links** carry the body, camera view, layers and (if one is open) the activity and stop in the URL hash.
- **Browser storage is minimal:** "hint dismissed" (localStorage) and the student's in-progress activity answers and name (sessionStorage, cleared when the tab closes, so a reload does not lose work). Answers leave the browser only when the student copies or downloads them.
- **Place search on Earth sends the typed text to OpenStreetMap Nominatim.** This is the one thing a student types that leaves the browser; the page says so next to the search box. Moon and Mars search a built-in list.
- **Activities are topic-based** JSON files in `app/activities/`, listed in `index.json`, each with an empty `standards` field for later Indiana/NGSS alignment. Format: `docs/activities.md`. New activities need no code changes. On screen they are called "lessons".
- **Teachers author lessons in the built-in editor** (`/editor/`, which is the app with `?edit`; code in `app/editor.js`, loaded only then). It captures the globe's state as a stop and downloads the lesson file; the teacher uploads it to `app/activities/` on GitHub. Guide: `docs/lesson-editor.md`. The editor's draft lives in localStorage.
- **Lessons can travel in a link** (`#lesson=1.<data>`: the lesson JSON, deflate-compressed, base64url). Made by the editor's "Copy a link" button, they run without being published. Their content is untrusted: `cleanLesson()` cuts it to size, it is rendered as plain text only, and the panel labels it "Lesson from a link".
- **The lesson list is generated:** `scripts/build-activity-index.py` writes `index.json` from the lesson files, during the Pages deploy and by hand for local testing. Unreadable files are skipped with a warning.
- Never commit API tokens (the Phase 0 page takes a Cesium ion token pasted in at run time).
- **Student-facing wording is intro level:** plain names for layers, one sentence on what each shows.

## Layout

- `app/` — the globe students use. `config.js` (all sources, layers, places), `app.js`, `styles.css`, `index.html`, `data/` (local snapshots), `activities/` (guided tours). Published at the site root.
- `phase0/` — benchmark/validation page, kept for re-testing hardware and networks. Published at `/phase0/`.
- `scripts/` — refresh the local data snapshots (volcanoes, plate boundaries), build Moon and Mars terrain tiles, and measure the height color keys. Run from the repo root. Raw downloads go to `.cache/` (not committed).
- `docs/` — planning notes and the Phase 0 test record.
- Run locally: `python3 -m http.server 8000` from the repo root, then open `/app/` or `/phase0/`.

## Phases

0. Benchmark and choose the engine — done.
1. MVP globe: curated layers, Earth/Moon/Mars, search, shareable links, Lite mode — done, live.
2. Tour/activity system with the first three activities (volcanoes and hotspots, rocks and geologic maps, other worlds), plus a distance-measure tool — built; activity wording awaits teacher review.
3. Remaining activities (plate boundaries, mountains and rifts, rivers and deltas, glaciers, coastlines and karst), swipe compare.
4. Pilot with one class section.
