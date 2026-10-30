/* ============================================================================
   Phase 0 configuration — every external endpoint and tunable lives here.
   Edit this file to add a source, fix a URL, or change the benchmark tour.
   Nothing else in the project hard-codes a URL.
   ========================================================================== */
'use strict';

const CFG = {
  // Pinned library versions (loaded from jsDelivr at run time).
  cesiumVersion: '1.145.0',
  maplibreVersion: '5.24.0',

  // Scripted-tour timing (milliseconds).
  flightMs: 8000,          // camera flight between stops
  dwellMs: 2500,           // pause after each stop has finished loading
  settleTimeoutMs: 15000,  // give up waiting for tiles after this long

  // Cesium terrain needs a free Cesium ion token (pasted into the page, never stored in the code).
};
CFG.cesiumBase  = `https://cdn.jsdelivr.net/npm/cesium@${CFG.cesiumVersion}/Build/Cesium/`;
CFG.cesiumJs    = CFG.cesiumBase + 'Cesium.js';
CFG.cesiumCss   = CFG.cesiumBase + 'Widgets/widgets.css';
CFG.maplibreJs  = `https://cdn.jsdelivr.net/npm/maplibre-gl@${CFG.maplibreVersion}/dist/maplibre-gl.js`;
CFG.maplibreCss = `https://cdn.jsdelivr.net/npm/maplibre-gl@${CFG.maplibreVersion}/dist/maplibre-gl.css`;

/* ----------------------------------------------------------------------------
   Data sources.
   kind:   'tiles' (image tiles), 'json' (data feed), 'cdn' (library file)
   role:   'base' imagery | 'overlay' | 'dem' (elevation) | 'feed' | 'lib'
   body:   'earth' | 'moon' | 'mars'
   scheme: 'webmercator' (standard web map tiles) or 'geographic' (equirectangular; Cesium only)
   tiles:  [z, x, y] test tiles. [0,0,0] is always valid, so a failure there means the URL
           pattern itself is wrong; failures only at higher levels point to indexing/zoom limits.
   URL placeholders: {z} {x} {y}  and  {date} (replaced with a recent UTC date, YYYY-MM-DD)
   tileSize: pixel size of each tile image (default 256).
   All endpoints passed a live check on 2026-10-30 (Chrome, macOS); the GVP feed is a local snapshot.
   -------------------------------------------------------------------------- */
const TEST_TILES_3857 = [[0,0,0],[3,2,3],[5,8,12],[7,33,48]];   // 33/48 at z7 and 8/12 at z5 are over Indiana
const TEST_TILES_EQ   = [[0,0,0],[2,4,2],[3,8,4],[4,16,8]];     // equirectangular grid: 2^(z+1) columns x 2^z rows

const SOURCES = [
  // ---------------------------------------------------------------- Earth imagery
  { id:'gibs-bm', group:'Earth imagery', kind:'tiles', role:'base', body:'earth', scheme:'webmercator',
    name:'NASA GIBS — Blue Marble shaded relief + bathymetry',
    url:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
    maxZoom:8, tiles:TEST_TILES_3857, credit:'NASA EOSDIS GIBS',
    note:'Free; credit NASA GIBS. Static global base map (about 500 m).' },

  { id:'gibs-modis', group:'Earth imagery', kind:'tiles', role:'base', body:'earth', scheme:'webmercator',
    name:'NASA GIBS — MODIS Terra true color (recent daily)',
    url:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    maxZoom:9, tiles:TEST_TILES_3857, credit:'NASA EOSDIS GIBS / MODIS', dateOffsetDays:3,
    note:'Daily imagery with a date dimension (needed for the time-slider activities). Uses a date 3 days back.' },

  { id:'usgs-img', group:'Earth imagery', kind:'tiles', role:'base', body:'earth', scheme:'webmercator',
    name:'USGS National Map — Imagery (aerial/satellite)',
    url:'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    maxZoom:16, tiles:[...TEST_TILES_3857, [12,1067,1554]], credit:'USGS The National Map',
    note:'High-resolution for the US (z12 test tile is near Indianapolis). Public domain; credit USGS.' },

  { id:'eox-s2', group:'Earth imagery', kind:'tiles', role:'base', body:'earth', scheme:'webmercator',
    name:'EOX Sentinel-2 cloudless 2020',
    url:'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
    maxZoom:13, tiles:TEST_TILES_3857, credit:'Sentinel-2 cloudless by EOX (contains modified Copernicus Sentinel data 2020)',
    note:'Check license: older years carry non-commercial terms; fine for classroom use but confirm before wider release.' },

  // ---------------------------------------------------------------- Earth overlays + terrain
  { id:'macrostrat-tiles', group:'Overlays and terrain', kind:'tiles', role:'overlay', body:'earth', scheme:'webmercator',
    name:'Macrostrat geologic map tiles',
    url:'https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png',
    maxZoom:10, tileSize:512, tiles:TEST_TILES_3857, credit:'Macrostrat',
    note:'Raster geologic map for the swipe-compare and rock-type activities. Serves 512-px PNGs of about 200-300 KB each, the heaviest tiles here.' },

  { id:'aws-terrain', group:'Overlays and terrain', kind:'tiles', role:'dem', body:'earth', scheme:'webmercator',
    name:'AWS Terrain Tiles (Terrarium elevation)',
    url:'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
    maxZoom:15, tiles:TEST_TILES_3857, credit:'Mapzen / AWS Terrain Tiles',
    note:'Keyless elevation. Used for MapLibre terrain. Cesium would need a different terrain format (see ion token).' },

  // ---------------------------------------------------------------- Moon and Mars
  { id:'trek-moon', group:'Moon and Mars (NASA Trek)', kind:'tiles', role:'base', body:'moon', scheme:'geographic',
    name:'NASA Trek — Moon, LRO WAC global mosaic',
    url:'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
    maxZoom:7, tiles:TEST_TILES_EQ, credit:'NASA/GSFC/Arizona State University (LRO WAC)',
    note:'Equirectangular tiles: usable in Cesium, not in MapLibre.' },

  { id:'trek-mars', group:'Moon and Mars (NASA Trek)', kind:'tiles', role:'base', body:'mars', scheme:'geographic',
    name:'NASA Trek — Mars, Viking MDIM 2.1 color mosaic',
    url:'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
    maxZoom:7, tiles:TEST_TILES_EQ, credit:'NASA/JPL/USGS (Viking MDIM 2.1)',
    note:'Equirectangular tiles: usable in Cesium, not in MapLibre.' },

  // ---------------------------------------------------------------- Data feeds
  { id:'usgs-eq', group:'Data feeds', kind:'json', role:'feed', body:'earth',
    name:'USGS earthquakes — past day, magnitude 2.5+',
    url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
    count:(j)=> (j.features||[]).length + ' earthquakes',
    note:'Live feed for the plate-boundary activity. Public domain.' },

  { id:'gvp', group:'Data feeds', kind:'json', role:'feed', body:'earth',
    name:'Smithsonian Global Volcanism Program — Holocene volcanoes (local snapshot)',
    url:'data/gvp-holocene-volcanoes.geojson',
    count:(j)=> (j.features||[]).length + ' volcanoes, retrieved ' + ((j.metadata&&j.metadata.retrieved)||'?'),
    note:'The GVP web service sends no CORS headers, so the list is snapshotted into the site by scripts/snapshot-volcanoes.py. Check the Smithsonian terms of use.' },

  { id:'macrostrat-api', group:'Data feeds', kind:'json', role:'feed', body:'earth',
    name:'Macrostrat API — geologic unit at Indianapolis',
    url:'https://macrostrat.org/api/v2/geologic_units/map?lat=39.77&lng=-86.16&response=short',
    count:(j)=> ((j.success&&j.success.data)||[]).length + ' map units returned',
    note:'Lets a click on the globe report the rock unit underneath.' },

  { id:'nominatim', group:'Data feeds', kind:'json', role:'feed', body:'earth',
    name:'Nominatim place search (OpenStreetMap)',
    url:'https://nominatim.openstreetmap.org/search?q=Mount+Everest&format=json&limit=1',
    count:(j)=> (Array.isArray(j)?j.length:0) + ' result(s)',
    note:'Fine for light classroom use. A heavily used app needs its own geocoder or a paid provider.' },

  // ---------------------------------------------------------------- Library CDN files
  { id:'cdn-cesium',   group:'Library files (CDN)', kind:'cdn', role:'lib', name:'Cesium.js (jsDelivr)',       url:CFG.cesiumJs,    note:'If a school filter blocks the CDN, bundle the libraries with the site instead.' },
  { id:'cdn-cesium-c', group:'Library files (CDN)', kind:'cdn', role:'lib', name:'Cesium widgets.css (jsDelivr)', url:CFG.cesiumCss,  note:'' },
  { id:'cdn-maplibre', group:'Library files (CDN)', kind:'cdn', role:'lib', name:'MapLibre GL JS (jsDelivr)',  url:CFG.maplibreJs,  note:'' },
  { id:'cdn-maplibre-c',group:'Library files (CDN)',kind:'cdn', role:'lib', name:'MapLibre GL CSS (jsDelivr)', url:CFG.maplibreCss,note:'' },
];

/* ----------------------------------------------------------------------------
   Scripted tour. Cesium uses range (metres from the target) and pitch (degrees);
   MapLibre uses zoom and mlPitch. Views are approximately matched, not identical.
   range:null means "whole globe" (computed from the body's radius).
   -------------------------------------------------------------------------- */
const WAYPOINTS = {
  earth: [
    { name:'Whole globe',        lon:-40.0,  lat:20.0,  range:null,    pitch:-90, zoom:1.3, mlPitch:0  },
    { name:'Himalaya',           lon:86.9,   lat:28.0,  range:600000,  pitch:-45, zoom:6.0, mlPitch:60 },
    { name:'Hawaii',             lon:-155.5, lat:19.6,  range:500000,  pitch:-50, zoom:6.0, mlPitch:55 },
    { name:'Iceland rift',       lon:-19.0,  lat:64.8,  range:700000,  pitch:-50, zoom:5.5, mlPitch:55 },
    { name:'East African Rift',  lon:36.0,   lat:-3.0,  range:800000,  pitch:-50, zoom:5.5, mlPitch:55 },
    { name:'Mississippi delta',  lon:-89.4,  lat:29.2,  range:300000,  pitch:-55, zoom:7.0, mlPitch:50 },
    { name:'Indiana',            lon:-86.15, lat:39.8,  range:120000,  pitch:-60, zoom:8.0, mlPitch:50 },
  ],
  moon: [
    { name:'Whole Moon',         lon:0.0,    lat:0.0,   range:null,    pitch:-90 },
    { name:'Tycho crater',       lon:-11.4,  lat:-43.3, range:400000,  pitch:-50 },
    { name:'Mare Imbrium',       lon:-15.0,  lat:33.0,  range:900000,  pitch:-50 },
    { name:'Apollo 11 site',     lon:23.47,  lat:0.67,  range:300000,  pitch:-55 },
    { name:'South pole',         lon:0.0,    lat:-89.5, range:600000,  pitch:-50 },
  ],
  mars: [
    { name:'Whole Mars',         lon:0.0,    lat:0.0,   range:null,    pitch:-90 },
    { name:'Olympus Mons',       lon:-134.0, lat:18.65, range:900000,  pitch:-45 },
    { name:'Valles Marineris',   lon:-59.0,  lat:-13.9, range:1200000, pitch:-45 },
    { name:'Hellas basin',       lon:70.0,   lat:-42.0, range:1500000, pitch:-50 },
    { name:'Gale crater',        lon:137.4,  lat:-5.4,  range:400000,  pitch:-55 },
  ],
};

// Reference ellipsoid radii in metres (equatorial a, polar b). Moon uses Cesium's built-in constant.
const MARS_RADII = [3396190, 3396190, 3376200];
