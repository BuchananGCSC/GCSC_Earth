/* ============================================================================
   Geoscience Globe — configuration.
   Every external address, layer, place and tunable lives in this file.
   Nothing else in the app hard-codes a URL. To add a layer or a place, edit here.

   Wording rule: `name` and `note` are read by intro-level students. Keep names
   plain and notes to one sentence that says what the student is looking at.
   ========================================================================== */
'use strict';

const APP = {
  // Pinned CesiumJS version, loaded from jsDelivr.
  cesiumVersion: '1.145.0',

  // How many overlays may be switched on at once (keeps school laptops cool).
  maxOverlays: 3,

  // Place search for Earth. The typed text is sent to this service.
  // {q} is replaced with the search text.
  search: {
    url: 'https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=5&accept-language=en',
    credit: 'Search by OpenStreetMap Nominatim',
  },

  // A click on the geologic map asks this service what rock is there. {lat} {lng}
  rockLookup: {
    url: 'https://macrostrat.org/api/v2/geologic_units/map?lat={lat}&lng={lng}&response=short',
    credit: 'Macrostrat (CC-BY 4.0)',
  },

  // The list of activities (guided tours). Each activity is its own JSON file; see docs/activities.md.
  activitiesIndex: 'activities/index.json',

  // Elevation for 3D terrain (Earth only). No key needed.
  terrain: {
    url: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    maxZoom: 12,            // deepest elevation tile level requested
    exaggeration: 2,        // heights are stretched so mountains show from far away
    credit: 'Elevation: Mapzen / AWS Terrain Tiles',
  },

  // Quality settings. "lite" matches what was benchmarked on the student laptops.
  quality: {
    lite: { label: 'Lite',    pixelRatio: 1,   detail: 4, atmosphere: false, antialias: false, tileCache: 60 },
    full: { label: 'Sharper', pixelRatio: 1.5, detail: 2, atmosphere: true,  antialias: true,  tileCache: 100 },
  },
};
APP.cesiumBase = `https://cdn.jsdelivr.net/npm/cesium@${APP.cesiumVersion}/Build/Cesium/`;

/* ----------------------------------------------------------------------------
   Worlds. For each: size, starting view, picture layers ("base", one at a time),
   overlays (switch on and off), and places to visit.

   base/overlay fields
     kind:   'tiles'  image tiles          (url, scheme, maxZoom, tileSize)
             'points' dots from a GeoJSON  (url, style: 'quakes' | 'volcanoes')
             'lines'  lines from a GeoJSON (url)
     scheme: 'webmercator' (standard web-map tiles) or 'geographic' (equirectangular)
     url placeholders: {z} {x} {y}, and {date} = a recent UTC date (dateOffsetDays back)
     opacity: starting see-through level, 0-100 (tiles only; gives the layer a slider)
     credit / license: shown on the globe and kept here for the record

   place fields: lon, lat in degrees (east and north positive), range = distance
   from the camera to the place in metres, pitch = camera tilt (-90 looks straight down).
   -------------------------------------------------------------------------- */
const WORLDS = {
  earth: {
    name: 'Earth',
    radii: null,                                   // null = Cesium's built-in Earth shape
    home: { lon: -40, lat: 20 },
    minZoomM: 1500,
    hasTerrain: true,
    searchRemote: true,
    base: [
      { id: 'bm', name: 'Earth from space', kind: 'tiles', scheme: 'webmercator', maxZoom: 8,
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
        note: 'A cloud-free picture of Earth made from many satellite photos, with the shape of the sea floor shaded in.',
        credit: 'NASA EOSDIS GIBS (Blue Marble)', license: 'Public domain; credit NASA GIBS' },
      { id: 's2', name: 'Sharper satellite view', kind: 'tiles', scheme: 'webmercator', maxZoom: 13,
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
        note: 'Cloud-free satellite photos that stay sharp when you zoom in on a valley, a river or a city.',
        credit: 'Sentinel-2 cloudless by EOX (contains modified Copernicus Sentinel data 2020)',
        license: 'CC BY-NC-SA 4.0 for the 2020 mosaic; fine for classroom use, confirm before wider release' },
      { id: 'usgs', name: 'Aerial photos (best in the USA)', kind: 'tiles', scheme: 'webmercator', maxZoom: 16,
        url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
        note: 'Photos taken from aircraft and satellites, detailed enough inside the USA to see single fields and roads.',
        credit: 'USGS The National Map', license: 'Public domain; credit USGS' },
      { id: 'modis', name: 'Earth a few days ago', kind: 'tiles', scheme: 'webmercator', maxZoom: 9, dateOffsetDays: 3,
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
        note: 'What a NASA satellite really saw on {date}: clouds, storms, smoke and snow included.',
        credit: 'NASA EOSDIS GIBS (MODIS Terra)', license: 'Public domain; credit NASA GIBS' },
    ],
    overlays: [
      { id: 'geo', name: 'Geologic map', kind: 'tiles', scheme: 'webmercator', maxZoom: 10, tileSize: 512, opacity: 60,
        url: 'https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png',
        note: 'Each color is a different kind or age of rock at the surface. Click the map to find out what the rock is.',
        clickLookup: true,
        credit: 'Macrostrat', license: 'CC-BY 4.0' },
      { id: 'plates', name: 'Plate boundaries', kind: 'lines', url: 'data/plate-boundaries.geojson',
        note: 'The yellow lines are the edges of the giant plates that make up Earth\'s outer shell.',
        credit: 'Plate boundaries: Peter Bird (2003); H. Ahlenius, Nordpil', license: 'ODC Attribution License 1.0' },
      { id: 'quakes', name: 'Earthquakes, past 30 days', kind: 'points', style: 'quakes',
        url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson',
        moreUrlPrefix: 'https://earthquake.usgs.gov/', moreLabel: 'More at the USGS',
        note: 'Each dot is an earthquake of magnitude 4.5 or more. Bigger dots were stronger. Click a dot for details.',
        legend: [['#ffb000', 'Shallow (less than 70 km deep)'], ['#dc267f', 'Middle (70 to 300 km)'], ['#648fff', 'Deep (more than 300 km)']],
        credit: 'USGS Earthquake Hazards Program', license: 'Public domain; credit USGS' },
      { id: 'volc', name: 'Volcanoes', kind: 'points', style: 'volcanoes', url: 'data/gvp-holocene-volcanoes.geojson',
        moreUrl: 'https://volcano.si.edu/volcano.cfm?vn={number}', moreLabel: 'More at the Smithsonian',
        note: 'Each triangle is a volcano that has erupted in the last 12,000 years. Click one for details.',
        credit: 'Global Volcanism Program, Smithsonian Institution', license: 'See volcano.si.edu terms of use' },
    ],
    places: [
      { name: 'Himalaya',           lon: 86.9,    lat: 28.0,  range: 900000,  pitch: -45, note: 'The highest mountains on Earth, where two plates collide.' },
      { name: 'Andes and trench',   lon: -70.5,   lat: -23.5, range: 1500000, pitch: -50, note: 'A mountain chain beside a deep ocean trench.' },
      { name: 'Hawaii',             lon: -155.5,  lat: 19.6,  range: 600000,  pitch: -50, note: 'A chain of volcanic islands in the middle of a plate.' },
      { name: 'Iceland',            lon: -19.0,   lat: 64.8,  range: 800000,  pitch: -50, note: 'An island where two plates pull apart.' },
      { name: 'East African Rift',  lon: 36.0,    lat: -3.0,  range: 1200000, pitch: -50, note: 'A continent slowly splitting.' },
      { name: 'San Andreas Fault',  lon: -119.83, lat: 35.27, range: 200000,  pitch: -50, note: 'Two plates sliding past each other.' },
      { name: 'Grand Canyon',       lon: -112.1,  lat: 36.1,  range: 150000,  pitch: -45, note: 'Layers of rock cut open by a river.' },
      { name: 'Mississippi Delta',  lon: -89.4,   lat: 29.2,  range: 300000,  pitch: -60, note: 'Land built from mud a river carried to the sea.' },
      { name: 'Indiana',            lon: -86.15,  lat: 39.8,  range: 600000,  pitch: -70, note: 'Home. Flat land shaped by ice sheets.' },
    ],
  },

  moon: {
    name: 'Moon',
    radii: 'MOON',                                 // Cesium's built-in Moon shape
    home: { lon: 0, lat: 0 },
    minZoomM: 20000,
    base: [
      { id: 'lro', name: 'Moon from orbit', kind: 'tiles', scheme: 'geographic', maxZoom: 7,
        url: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
        note: 'Photos from NASA\'s Lunar Reconnaissance Orbiter, joined into one map of the whole Moon.',
        credit: 'NASA/GSFC/Arizona State University (LRO WAC), via NASA Trek', license: 'Public domain; credit NASA' },
      { id: 'lola', name: 'Heights in color', kind: 'tiles', scheme: 'geographic', maxZoom: 5,
        url: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/{z}/{y}/{x}.png',
        note: 'Colors show how high the ground is: blue and purple are low, green and yellow are in between, red and white are high.',
        credit: 'NASA/GSFC (LRO LOLA), via NASA Trek', license: 'Public domain; credit NASA' },
    ],
    overlays: [],
    places: [
      { name: 'Tycho crater',       lon: -11.4,  lat: -43.3, range: 500000,  pitch: -50, note: 'A young crater with bright rays.' },
      { name: 'Copernicus crater',  lon: -20.08, lat: 9.62,  range: 500000,  pitch: -50, note: 'A large crater with stepped walls.' },
      { name: 'Mare Imbrium',       lon: -15.0,  lat: 33.0,  range: 1500000, pitch: -60, note: 'A dark plain of old lava.' },
      { name: 'Apollo 11 site',     lon: 23.47,  lat: 0.67,  range: 300000,  pitch: -60, note: 'Where people first walked on the Moon.' },
      { name: 'South Pole-Aitken',  lon: -169.0, lat: -53.0, range: 2500000, pitch: -70, note: 'One of the biggest impact basins known.' },
    ],
  },

  mars: {
    name: 'Mars',
    radii: [3396190, 3396190, 3376200],            // metres: equator, equator, pole
    home: { lon: -80, lat: 0 },
    minZoomM: 20000,
    base: [
      { id: 'viking', name: 'Mars from orbit', kind: 'tiles', scheme: 'geographic', maxZoom: 7,
        url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
        note: 'Color photos from NASA\'s Viking orbiters, joined into one map of the whole planet.',
        credit: 'NASA/JPL/USGS (Viking MDIM 2.1), via NASA Trek', license: 'Public domain; credit NASA' },
      { id: 'mola', name: 'Heights in color', kind: 'tiles', scheme: 'geographic', maxZoom: 7,
        url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
        note: 'Colors show how high the ground is: blue is low, green and yellow are in between, red and white are high.',
        credit: 'NASA/JPL/GSFC (MGS MOLA), via NASA Trek', license: 'Public domain; credit NASA' },
    ],
    overlays: [],
    places: [
      { name: 'Olympus Mons',       lon: -134.0, lat: 18.65, range: 1500000, pitch: -50, note: 'The tallest volcano in the solar system.' },
      { name: 'Tharsis volcanoes',  lon: -113.0, lat: 1.0,   range: 2500000, pitch: -60, note: 'Three giant volcanoes in a row.' },
      { name: 'Valles Marineris',   lon: -59.0,  lat: -13.9, range: 2000000, pitch: -50, note: 'A canyon as long as the USA is wide.' },
      { name: 'Hellas basin',       lon: 70.0,   lat: -42.0, range: 3000000, pitch: -65, note: 'A huge, deep impact basin.' },
      { name: 'Gale crater',        lon: 137.4,  lat: -5.4,  range: 500000,  pitch: -55, note: 'Where the Curiosity rover is exploring.' },
    ],
  },
};
