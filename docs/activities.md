# Writing an activity

An activity is a guided tour: a list of stops, each with a view of the globe, a short reading and one or
more questions. Activities are plain JSON files in `app/activities/`. Adding one needs no code changes.

## Add an activity

1. Copy an existing file in `app/activities/`, for example `volcanoes-hotspots.json`, and rename it.
   The file name (without `.json`) is the activity's id. Use lowercase letters, numbers and hyphens only.
2. Edit the stops.
3. Add an entry to `app/activities/index.json` with the same `id`, plus the `title`, `minutes` and `summary`
   shown in the Activities list.

A link straight to an activity looks like `https://buchanangcsc.github.io/GCSC_Earth/#act=volcanoes-hotspots`.
Add `&stop=3` to open at the third stop.

## The file

```json
{
  "title": "Volcanoes and hotspots",
  "minutes": 20,
  "summary": "Why volcanoes are where they are.",
  "standards": [],
  "stops": [
    {
      "title": "The Ring of Fire",
      "body": "earth",
      "base": "bm",
      "layers": ["volc", "plates"],
      "terrain": false,
      "view": { "lon": -170, "lat": 15, "range": null, "pitch": -90 },
      "text": "First paragraph.\n\nSecond paragraph.",
      "questions": ["One question.", "Another question."]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `standards` | Empty for now. A place to list Indiana or NGSS standards later. The app does not show it. |
| `body` | `earth`, `moon` or `mars`. |
| `base` | The picture. Earth: `bm` (Earth from space), `s2` (sharper satellite), `usgs` (aerial photos), `modis` (a few days ago). Moon: `lro`, `lola` (heights in color). Mars: `viking`, `mola` (heights in color). |
| `layers` | Up to three of `geo`, `plates`, `quakes`, `volc` (Earth only). `geo.50` sets the geologic map to 50% solid. |
| `terrain` | `true` for 3D terrain (any world). |
| `view` | Where the camera looks. `lon` and `lat` in degrees (west and south are negative). `range` is the distance from the camera to that point in metres; `null` shows the whole globe. `pitch` is the tilt: `-90` looks straight down, `-45` looks at an angle. Optional `heading` turns the view (0 = north at the top). |
| `text` | The reading. Separate paragraphs with `\n\n`. Plain text only. |
| `questions` | Zero or more questions. Each gets an answer box. |

The ids for `base` and `layers` come from `app/config.js`.

**Finding the numbers for a view:** move the globe to the view you want and press "Copy link to this view".
The link contains `view=lon,lat,height,heading,pitch`. Those describe where the camera *is*, which differs from
the `view` in an activity file (the point the camera *looks at*) whenever the view is tilted. For a
straight-down view (`pitch` -90) the `lon` and `lat` are the same and `range` equals the height.

## What students see

- The panel has two tabs. **Lesson** holds the reading and questions; **Controls** holds everything that changes
  the globe. Starting a lesson opens the Lesson tab. The app calls activities "lessons" on screen.
- **Back** and **Next** stay pinned at the bottom of the Lesson tab. **Go back to this stop's view** resets the globe.
- After the last stop, a review page lists every answer, asks for a name, and offers **Copy my answers** and
  **Download my answers** (a text file).
- Answers are kept in the browser tab while it is open, so a reload does not lose them. They are never sent
  anywhere. Closing the tab clears them.

## Wording

Write for intro-level students: short sentences, one idea per paragraph, and define a term the first time it
appears. Ask for an observation before asking for an explanation.
