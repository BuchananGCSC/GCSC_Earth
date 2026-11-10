# Geoscience Globe

A browser globe for intro-level Earth and space science students: Earth, the Moon and Mars, with a small set
of geology layers. Static site, no accounts, no build step.

- **Live site:** https://buchanangcsc.github.io/GCSC_Earth/
- **Benchmark page (Phase 0):** https://buchanangcsc.github.io/GCSC_Earth/phase0/

## What it does

- Earth, Moon and Mars, switched from the panel.
- Earth pictures: a cloud-free view, a sharper satellite view, US aerial photos, and a recent daily satellite image.
- Layers to add: geologic map (click for the rock at that spot), plate boundaries, earthquakes of the past
  30 days (click a dot), and volcanoes (click a triangle). Up to three at once.
- Optional 3D terrain on Earth, with heights stretched 2x.
- Place search (Earth) and "places to visit" buttons for each world.
- On-screen zoom, tilt and turn buttons for trackpads.
- "Copy link to this view": the link reopens the same world, view and layers. This is how students hand in a view.
- Lite quality by default; "Sharper picture" is optional.
- A distance-measure tool (the ↔ button), on all three worlds.
- **Activities:** guided tours with a reading and questions at each stop. Students copy or download their answers
  at the end. Three so far: volcanoes and hotspots, rocks and geologic maps, and other worlds. To write more,
  see [docs/activities.md](docs/activities.md).

## Privacy

Nothing is stored on a server. The only thing a student types that leaves the browser is the text in the place
search box, which goes to OpenStreetMap's search service. Activity answers and the student's name stay in the
browser tab until the student copies or downloads them, and are cleared when the tab closes. The browser also
remembers that the "How to move" hint was dismissed.

## Run it locally

```bash
python3 -m http.server 8010
```

Then open http://localhost:8010/app/ (or `/phase0/`).

## Change layers, places or wording

Everything is in [app/config.js](app/config.js): data addresses, layer names and notes, credits, and the
places to visit. No other file contains a web address.

## Refresh the local data snapshots

```bash
python3 scripts/snapshot-volcanoes.py
```

```bash
python3 scripts/snapshot-plates.py
```

See [CLAUDE.md](CLAUDE.md) for project decisions and [docs/phase0-results.md](docs/phase0-results.md) for the
hardware test record.
