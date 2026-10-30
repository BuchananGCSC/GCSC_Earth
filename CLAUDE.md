# Geoscience Globe

A browser globe for **intro-level Earth/space science students** to study geologic features of Earth (and, as a bonus, the Moon and Mars). Planning history: `docs/planning-conversation.md`.

## Key decisions

- **Fully static site**, hosted on GitHub Pages. No backend, no accounts, **no student data** leaves the browser. Student work is exported (download/copy, share links), never sent to a server.
- **Target hardware:** MacBook Neo (A-series chip, 8 GB RAM, fanless) in **Safari and Chrome**, used with trackpads, on school Wi-Fi. Test in both browsers.
- **All external endpoints live in one config file** (`phase0/config.js` for now). Nothing else hard-codes a URL. Record license and attribution per source.
- **Performance rules (Lite mode):** render on demand, cap pixel ratio (1x–1.5x), coarser tile detail, no atmosphere/fog/lighting/shadows/AA/3D buildings, limit simultaneous layers (~3).
- **Engine (Cesium vs. MapLibre) is undecided** until the Phase 0 benchmark runs on a real Neo. Cesium is needed for Moon/Mars (equirectangular tiles).
- **Activities are topic-based**, authored as JSON/Markdown files, each with an optional empty `standards` field for later Indiana/NGSS alignment.
- Never commit API tokens (Cesium ion token is pasted into the page at run time).

## Layout

- `phase0/` — benchmark/validation page (plain HTML+JS, no build step). Run with `python3 -m http.server 8000` from `phase0/`.
- `docs/` — planning notes.
