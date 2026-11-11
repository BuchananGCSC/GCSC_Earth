/* ============================================================================
   Geoscience Globe — application logic (Phase 1).
   Plain JavaScript, no build step. All addresses and layer definitions come
   from config.js (APP and WORLDS). The view is saved only in the page address
   (after the #), so a copied link reopens the same view.
   ========================================================================== */
'use strict';
(() => {
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids) if (kid != null) n.append(kid);
    return n;
  }

  /* ------------------------------------------------------------ state + link */
  // overlays: Map of overlay id -> opacity (0-100). view: camera position or null (= starting view).
  const state = { body: 'earth', base: null, overlays: new Map(), terrain: false, quality: 'lite', view: null };
  // An activity named in the link, waiting to be opened: { id, stop (1-based), keepView }.
  let linkActivity = null;

  const world = () => WORLDS[state.body];
  const byId = (list, id) => list.find((x) => x.id === id);

  function readLink() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    const body = p.get('body');
    state.body = WORLDS[body] ? body : 'earth';
    const w = world();
    state.base = byId(w.base, p.get('base')) ? p.get('base') : w.base[0].id;
    state.overlays = new Map();
    for (const part of (p.get('layers') || '').split(',')) {
      const [id, op] = part.split('.');
      const def = byId(w.overlays, id);
      if (!def || state.overlays.size >= APP.maxOverlays) continue;
      const n = Number(op);
      state.overlays.set(id, op !== undefined && Number.isFinite(n) ? clamp(Math.round(n), 10, 100) : (def.opacity || 100));
    }
    state.terrain = p.get('terrain') === '1' && !!w.terrain;
    state.quality = p.get('q') === 'full' ? 'full' : 'lite';
    const v = (p.get('view') || '').split(',').map(Number);
    state.view = (v.length === 5 && v.every(Number.isFinite))
      ? { lon: clamp(v[0], -180, 180), lat: clamp(v[1], -90, 90), height: clamp(v[2], 100, 1e9), heading: v[3], pitch: clamp(v[4], -90, 90) }
      : null;
    const actId = p.get('act') || '';
    linkActivity = /^[a-z0-9-]{1,60}$/.test(actId)
      ? { id: actId, stop: Math.max(1, parseInt(p.get('stop'), 10) || 1), keepView: !!state.view } : null;
  }

  function linkText() {
    const p = [];
    p.push('body=' + state.body);
    if (state.view) {
      const v = state.view;
      p.push('view=' + [v.lon.toFixed(4), v.lat.toFixed(4), Math.round(v.height), v.heading.toFixed(1), v.pitch.toFixed(1)].join(','));
    }
    p.push('base=' + state.base);
    if (state.overlays.size) {
      p.push('layers=' + [...state.overlays].map(([id, op]) => byId(world().overlays, id).opacity ? `${id}.${op}` : id).join(','));
    }
    if (state.terrain) p.push('terrain=1');
    if (state.quality === 'full') p.push('q=full');
    if (act.def) p.push('act=' + act.def.id, 'stop=' + (act.i + 1));
    return '#' + p.join('&');
  }

  let lastWritten = '';
  function writeLink() {
    lastWritten = linkText();
    if (location.hash !== lastWritten) history.replaceState(null, '', lastWritten);
  }

  /* ------------------------------------------------------------ messages */
  let bannerTimer = 0;
  function banner(msg, sticky) {
    const b = $('#banner');
    b.textContent = msg; b.hidden = false;
    clearTimeout(bannerTimer);
    if (!sticky) bannerTimer = setTimeout(() => { b.hidden = true; }, 9000);
  }
  function fatal(msg) { $('#loading').hidden = false; $('#loading').textContent = msg; }

  /* ------------------------------------------------------------ Cesium loading */
  let C = null;
  function loadCesium() {
    return new Promise((ok, fail) => {
      window.CESIUM_BASE_URL = APP.cesiumBase;
      document.head.append(el('link', { rel: 'stylesheet', href: APP.cesiumBase + 'Widgets/widgets.css' }));
      const s = el('script', { src: APP.cesiumBase + 'Cesium.js' });
      s.onload = () => { C = window.Cesium; ok(); };
      s.onerror = () => fail(new Error('script blocked'));
      document.head.append(s);
    });
  }

  /* ------------------------------------------------------------ data files (fetched once) */
  const dataCache = new Map();
  function getJson(url) {
    if (!dataCache.has(url)) {
      dataCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch((e) => { dataCache.delete(url); throw e; }));
    }
    return dataCache.get(url);
  }

  function recentDate(daysBack) { return new Date(Date.now() - daysBack * 864e5).toISOString().slice(0, 10); }
  const niceDate = (def) => new Date(recentDate(def.dateOffsetDays || 3) + 'T12:00:00Z')
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const fillDate = (text, def) => text.split('{date}').join(recentDate(def.dateOffsetDays || 3));

  /* ------------------------------------------------------------ 3D terrain (keyless)
     Elevation arrives as image tiles with the height packed into the colors.
     Earth's come from a public service as standard web-map tiles; the Moon's and
     Mars's are stored with the site as latitude/longitude tiles. Cesium asks for
     elevation in its own latitude/longitude grid, and the two functions below fill
     each request by sampling the right image tile. */
  const demCache = new Map();          // tile address -> Promise<{ data: Int16Array, size }>
  const DEM_KEEP = 80;
  let demCanvas = null;
  function demTile(cfg, z, x, y) {
    const key = cfg.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    let p = demCache.get(key);
    if (p) { demCache.delete(key); demCache.set(key, p); return p; }      // move to newest
    p = new Promise((ok, fail) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const n = img.naturalWidth;
          if (!demCanvas) demCanvas = document.createElement('canvas');
          if (demCanvas.width !== n) demCanvas.width = demCanvas.height = n;
          const ctx = demCanvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const px = ctx.getImageData(0, 0, n, n).data;
          const data = new Int16Array(n * n);
          for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768;
          ok({ data, size: n });
        } catch (e) { fail(e); }
      };
      img.onerror = () => fail(new Error('elevation tile failed'));
      img.src = key;
    });
    p.catch(() => demCache.delete(key));
    demCache.set(key, p);
    if (demCache.size > DEM_KEEP) demCache.delete(demCache.keys().next().value);
    return p;
  }

  const POSTS = 65;                    // height samples along each side of a Cesium terrain tile

  // Earth: sample one or two web-map (Mercator) tiles.
  function mercatorHeights(cfg, tiling) {
    const W = POSTS, MAXLAT = rad(85.0511);
    const mercY = (lat) => (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2;   // 0 at the top, 1 at the bottom
    return (x, y, level) => {
      const r = tiling.tileXYToRectangle(x, y, level);
      const yN = mercY(clamp(r.north, -MAXLAT, MAXLAT)), yS = mercY(clamp(r.south, -MAXLAT, MAXLAT));
      // Web-map zoom: columns line up exactly at level+1; go lower near the poles so
      // the tile's latitude range fits inside two web-map rows.
      let z = Math.min(level + 1, cfg.maxZoom);
      if (yS - yN > 1e-9) z = Math.min(z, Math.floor(Math.log2(1 / (yS - yN))));
      z = Math.max(0, z);
      const n = 2 ** z;
      const tx = clamp(Math.floor((r.west + Math.PI) / (2 * Math.PI) * n + 1e-6), 0, n - 1);
      const ty0 = clamp(Math.floor(yN * n), 0, n - 1);
      const ty1 = clamp(Math.floor(yS * n - 1e-9), ty0, n - 1);
      const jobs = [demTile(cfg, z, tx, ty0)];
      if (ty1 !== ty0) jobs.push(demTile(cfg, z, tx, ty1));
      return Promise.all(jobs).then((tiles) => {
        const S = tiles[0].size, out = new Float32Array(W * W);
        for (let j = 0; j < W; j++) {
          const lat = clamp(r.north - (r.north - r.south) * j / (W - 1), -MAXLAT, MAXLAT);
          const gy = mercY(lat) * n * S;
          const t = clamp(Math.floor(gy / S), ty0, ty0 + tiles.length - 1);
          const py = clamp(Math.floor(gy - t * S), 0, S - 1);
          const src = tiles[t - ty0].data;
          for (let i = 0; i < W; i++) {
            const lon = r.west + (r.east - r.west) * i / (W - 1);
            const px = clamp(Math.floor((lon + Math.PI) / (2 * Math.PI) * n * S - tx * S), 0, S - 1);
            out[j * W + i] = src[py * S + px];
          }
        }
        return out;
      });
    };
  }

  // Moon and Mars: the stored tiles use the same latitude/longitude grid as Cesium, so each
  // request is one stored tile, or a window inside one when Cesium wants more detail than is stored.
  function geographicHeights(cfg) {
    const W = POSTS;
    return (x, y, level) => {
      if (level > cfg.maxZoom + 3) return undefined;      // finer than the data: keep the parent tile
      const z = clamp(level - 1, 0, cfg.maxZoom), k = 2 ** (level - z);
      return demTile(cfg, z, Math.floor(x / k), Math.floor(y / k)).then(({ data, size: S }) => {
        const win = S / k, x0 = (x % k) * win, y0 = (y % k) * win, out = new Float32Array(W * W);
        for (let j = 0; j < W; j++) {
          const fy = clamp(y0 + win * j / (W - 1) - 0.5, 0, S - 1), ya = Math.floor(fy), yb = Math.min(S - 1, ya + 1), wy = fy - ya;
          for (let i = 0; i < W; i++) {
            const fx = clamp(x0 + win * i / (W - 1) - 0.5, 0, S - 1), xa = Math.floor(fx), xb = Math.min(S - 1, xa + 1), wx = fx - xa;
            const top = data[ya * S + xa] * (1 - wx) + data[ya * S + xb] * wx;
            const bot = data[yb * S + xa] * (1 - wx) + data[yb * S + xb] * wx;
            out[j * W + i] = top * (1 - wy) + bot * wy;
          }
        }
        return out;
      });
    };
  }

  function makeTerrain(ell, cfg) {
    const tiling = new C.GeographicTilingScheme({ ellipsoid: ell });
    const heights = cfg.grid === 'geographic' ? geographicHeights(cfg) : mercatorHeights(cfg, tiling);
    return new C.CustomHeightmapTerrainProvider({
      width: POSTS, height: POSTS, tilingScheme: tiling, ellipsoid: ell, credit: cfg.credit,
      callback(x, y, level) {
        const job = heights(x, y, level);
        return job && job.catch(() => undefined);     // on failure Cesium keeps showing the coarser parent tile
      },
    });
  }

  /* ------------------------------------------------------------ the globe */
  let viewer = null, ell = null, build = 0;
  let live = { base: null, overlays: new Map() };     // what is currently drawn
  const tileErrors = new Map();

  function tileProvider(def) {
    const p = new C.UrlTemplateImageryProvider({
      url: fillDate(def.url, def), maximumLevel: def.maxZoom, credit: def.credit,
      tileWidth: def.tileSize || 256, tileHeight: def.tileSize || 256,
      tilingScheme: def.scheme === 'geographic' ? new C.GeographicTilingScheme({ ellipsoid: ell }) : new C.WebMercatorTilingScheme({ ellipsoid: ell }),
    });
    p.errorEvent.addEventListener((e) => {
      e.retry = false;
      const n = (tileErrors.get(def.id) || 0) + 1;
      tileErrors.set(def.id, n);
      if (n === 12) banner(`Parts of "${def.name}" are not loading. Try another choice, or check the internet connection.`);
    });
    return p;
  }

  function homeHeight() { return ell.maximumRadius * 2.2; }

  function buildViewer() {
    const mine = ++build;
    if (viewer) { try { viewer.destroy(); } catch (e) { /* already gone */ } viewer = null; }
    live = { base: null, overlays: new Map() };
    closeInfo();
    measure.prims = null; measure.pts = [];
    if (measure.on) setMeasure(true);

    const w = world(), q = APP.quality[state.quality];
    ell = w.radii === 'MOON' ? C.Ellipsoid.MOON : Array.isArray(w.radii) ? new C.Ellipsoid(...w.radii) : C.Ellipsoid.WGS84;
    C.Ellipsoid.default = ell;

    const opts = {
      baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false, vrButton: false,
      infoBox: false, selectionIndicator: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,          // draw only when something changes
      skyBox: false, skyAtmosphere: (q.atmosphere && state.body === 'earth') ? undefined : false,
    };
    if (state.body !== 'earth') { opts.globe = new C.Globe(ell); opts.mapProjection = new C.GeographicProjection(ell); }
    viewer = new C.Viewer('globe', opts);

    const scene = viewer.scene, globe = scene.globe;
    scene.backgroundColor = C.Color.fromCssColorString('#05090b');
    globe.baseColor = C.Color.fromCssColorString('#16242c');
    globe.enableLighting = false;
    globe.showGroundAtmosphere = q.atmosphere && state.body === 'earth';
    globe.maximumScreenSpaceError = q.detail;
    globe.tileCacheSize = q.tileCache;
    if (scene.fog) scene.fog.enabled = false;
    scene.msaaSamples = q.antialias ? 4 : 1;
    scene.postProcessStages.fxaa.enabled = false;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    viewer.useBrowserRecommendedResolution = false;
    viewer.resolutionScale = Math.min(q.pixelRatio, window.devicePixelRatio || 1) / (window.devicePixelRatio || 1);

    const ctl = scene.screenSpaceCameraController;
    ctl.minimumZoomDistance = w.minZoomM;
    ctl.maximumZoomDistance = ell.maximumRadius * 8;

    // Layers
    setBase(state.base);
    for (const [id] of state.overlays) addOverlay(id, mine);
    applyTerrain();

    // Camera
    if (state.view) {
      const v = state.view;
      viewer.camera.setView({
        destination: C.Cartesian3.fromDegrees(v.lon, v.lat, v.height, ell),
        orientation: { heading: rad(v.heading), pitch: rad(v.pitch), roll: 0 },
      });
    } else {
      viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(w.home.lon, w.home.lat, homeHeight(), ell) });
    }
    viewer.camera.moveEnd.addEventListener(() => { if (mine === build) { captureView(); writeLink(); } });

    // Pointer: click for details, move for the latitude/longitude readout
    const handler = new C.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((ev) => onClick(ev.position), C.ScreenSpaceEventType.LEFT_CLICK);
    let pending = null;
    handler.setInputAction((ev) => {
      const first = !pending; pending = ev.endPosition.clone();
      if (first) requestAnimationFrame(() => { if (mine === build) showReadout(pending); pending = null; });
    }, C.ScreenSpaceEventType.MOUSE_MOVE);
    scene.canvas.addEventListener('mouseleave', () => showReadout(null));

    // Keep the "Loading" note up until the first pictures of the globe have arrived.
    $('#loading').textContent = 'Loading the globe…'; $('#loading').hidden = false;
    const stopLoading = globe.tileLoadProgressEvent.addEventListener((left) => {
      if (left === 0 && mine === build) { $('#loading').hidden = true; stopLoading(); }
    });
    setTimeout(() => { if (mine === build) $('#loading').hidden = true; }, 20000);
    scene.requestRender();
  }

  function captureView() {
    const cam = viewer.camera, c = cam.positionCartographic;
    state.view = { lon: deg(c.longitude), lat: deg(c.latitude), height: c.height, heading: (deg(cam.heading) % 360 + 360) % 360 % 359.95, pitch: deg(cam.pitch) };
  }

  /* ------------------------------------------------------------ layers */
  function setBase(id) {
    const def = byId(world().base, id);
    state.base = def.id;
    if (live.base) viewer.imageryLayers.remove(live.base, true);
    live.base = viewer.imageryLayers.addImageryProvider(tileProvider(def), 0);
    viewer.scene.requestRender();
  }

  let triangleImg = null;
  function volcanoIcon() {
    if (triangleImg) return triangleImg;
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const g = c.getContext('2d');
    g.beginPath(); g.moveTo(12, 3); g.lineTo(22, 21); g.lineTo(2, 21); g.closePath();
    g.fillStyle = '#ff5a36'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#ffffff'; g.stroke();
    return (triangleImg = c);
  }
  const quakeColor = (depthKm) => depthKm < 70 ? '#ffb000' : depthKm < 300 ? '#dc267f' : '#648fff';

  function addOverlay(id, mine = build) {
    const def = byId(world().overlays, id);
    if (!def || live.overlays.has(id)) return;
    const scene = viewer.scene;
    if (def.kind === 'tiles') {
      const layer = viewer.imageryLayers.addImageryProvider(tileProvider(def));
      layer.alpha = (state.overlays.get(id) || 100) / 100;
      live.overlays.set(id, { layer });
      scene.requestRender();
      return;
    }
    const shrinkFar = new C.NearFarScalar(2e6, 1, 2.5e7, 0.55);      // smaller symbols when the whole globe is in view
    const entry = { prims: [], credit: new C.Credit(def.credit) };
    live.overlays.set(id, entry);
    viewer.creditDisplay.addStaticCredit(entry.credit);
    getJson(def.url).then((json) => {
      if (mine !== build || live.overlays.get(id) !== entry) return;      // switched off or rebuilt while loading
      if (def.kind === 'lines') {
        const lines = scene.primitives.add(new C.PolylineCollection());
        const material = C.Material.fromType('Color', { color: C.Color.fromCssColorString('#ffe45c') });
        for (const f of json.features) {
          lines.add({ positions: C.Cartesian3.fromDegreesArray(f.geometry.coordinates.flat(), ell), width: 2, material });
        }
        entry.prims.push(lines);
      } else if (def.style === 'quakes') {
        const pts = scene.primitives.add(new C.PointPrimitiveCollection());
        for (const f of json.features) {
          const [lon, lat, depth] = f.geometry.coordinates, p = f.properties || {};
          const mag = Number(p.mag) || 4.5;
          pts.add({
            position: C.Cartesian3.fromDegrees(lon, lat, 0, ell),
            pixelSize: clamp(5 + (mag - 4.5) * 4.5, 5, 18),
            color: C.Color.fromCssColorString(quakeColor(depth)).withAlpha(0.9),
            outlineColor: C.Color.BLACK.withAlpha(0.6), outlineWidth: 1,
            scaleByDistance: shrinkFar,
            id: { kind: 'quake', def, lon, lat, depth, mag, place: p.place, time: p.time, url: p.url },
          });
        }
        entry.prims.push(pts);
      } else if (def.style === 'volcanoes') {
        const bbs = scene.primitives.add(new C.BillboardCollection());
        for (const f of json.features) {
          const [lon, lat] = f.geometry.coordinates;
          bbs.add({
            position: C.Cartesian3.fromDegrees(lon, lat, 0, ell), image: volcanoIcon(), scale: 0.55, scaleByDistance: shrinkFar,
            id: { kind: 'volcano', def, lon, lat, ...f.properties },
          });
        }
        entry.prims.push(bbs);
      }
      scene.requestRender();
    }).catch(() => {
      if (mine !== build) return;
      banner(`"${def.name}" could not be loaded. Check the internet connection and switch it on again.`);
      removeOverlay(id); state.overlays.delete(id); renderLayers(); writeLink();
    });
  }

  function removeOverlay(id) {
    const entry = live.overlays.get(id);
    if (!entry) return;
    if (entry.layer) viewer.imageryLayers.remove(entry.layer, true);
    for (const p of entry.prims || []) viewer.scene.primitives.remove(p);
    if (entry.credit) viewer.creditDisplay.removeStaticCredit(entry.credit);
    live.overlays.delete(id);
    viewer.scene.requestRender();
  }

  function applyTerrain() {
    const on = state.terrain && !!world().terrain;
    viewer.terrainProvider = on ? makeTerrain(ell, world().terrain) : new C.EllipsoidTerrainProvider({ ellipsoid: ell });
    viewer.scene.verticalExaggeration = on ? world().terrain.exaggeration : 1;
    viewer.scene.requestRender();
  }

  /* ------------------------------------------------------------ camera moves */
  function flyTo(lon, lat, range, pitchDeg, done, headingDeg = 0) {
    const target = C.Cartesian3.fromDegrees(lon, lat, 0, ell);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target, 1), {
      duration: reduceMotion ? 0 : 2.5,
      offset: new C.HeadingPitchRange(rad(headingDeg), rad(pitchDeg), range),
      complete: done,
    });
  }
  function flyHome() {
    const w = world();
    viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(w.home.lon, w.home.lat, homeHeight(), ell), duration: reduceMotion ? 0 : 1.5 });
  }

  // Where the middle of the screen meets the globe, plus the camera's heading, tilt and distance around that point.
  function orbitState() {
    const cam = viewer.camera, cv = viewer.scene.canvas;
    const target = cam.pickEllipsoid(new C.Cartesian2(cv.clientWidth / 2, cv.clientHeight / 2), ell);
    if (!target) return null;
    const inv = C.Matrix4.inverse(C.Transforms.eastNorthUpToFixedFrame(target, ell), new C.Matrix4());
    const p = C.Matrix4.multiplyByPoint(inv, cam.positionWC, new C.Cartesian3());
    const range = C.Cartesian3.magnitude(p);
    const flat = Math.hypot(p.x, p.y);
    return { target, range, pitch: -Math.asin(clamp(p.z / range, -1, 1)), heading: flat < range * 0.02 ? cam.heading : Math.atan2(-p.x, -p.y) };
  }
  function orbit(change) {
    const o = orbitState();
    if (!o) { flyHome(); return; }
    const cam = viewer.camera;
    const heading = change.heading != null ? change.heading : o.heading + (change.dHeading || 0);
    const pitch = clamp(o.pitch + (change.dPitch || 0), -Math.PI / 2, rad(-15));
    const ctl = viewer.scene.screenSpaceCameraController;
    const range = clamp(o.range * (change.zoom || 1), ctl.minimumZoomDistance, ctl.maximumZoomDistance);
    cam.cancelFlight();
    cam.lookAt(o.target, new C.HeadingPitchRange(heading, pitch, range));
    cam.lookAtTransform(C.Matrix4.IDENTITY);
    viewer.scene.requestRender();
    captureView(); writeLink();
  }
  const NAV = {
    'zoom-in':   () => orbit({ zoom: 0.6 }),
    'zoom-out':  () => orbit({ zoom: 1 / 0.6 }),
    'tilt-up':   () => orbit({ dPitch: rad(15) }),
    'tilt-down': () => orbit({ dPitch: rad(-15) }),
    'turn-left': () => orbit({ dHeading: rad(-20) }),
    'turn-right':() => orbit({ dHeading: rad(20) }),
    'measure':   () => setMeasure(!measure.on),
    'north':     () => orbit({ heading: 0 }),
    'home':      () => flyHome(),
    'help':      () => { $('#hint').hidden = false; $('#hint-close').focus(); },
  };

  /* ------------------------------------------------------------ readout + details */
  function fmtLatLon(lat, lon) {
    return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
  }
  function showReadout(pos) {
    const box = $('#readout');
    if (!pos || !viewer) { box.textContent = ''; return; }
    const hit = groundAt(pos);
    if (!hit) { box.textContent = ''; return; }
    const c = C.Cartographic.fromCartesian(hit, ell);
    let text = fmtLatLon(deg(c.latitude), deg(c.longitude));
    // With 3D terrain on, add the height of the ground (from the terrain currently drawn, so it is approximate).
    if (state.terrain && world().terrain) {
      const drawn = viewer.scene.globe.getHeight(c);
      if (Number.isFinite(drawn)) {
        const m = drawn / world().terrain.exaggeration, r = Math.abs(m) >= 1000 ? Math.round(m / 100) * 100 : Math.round(m / 10) * 10;
        text += ` · about ${num(Math.abs(r))} m ${r < 0 ? 'below' : 'above'} ${world().terrain.zeroName}`;
      }
    }
    box.textContent = text;
  }

  // The point on the ground under a screen position (follows 3D terrain when it is on).
  function groundAt(pos) {
    const ray = viewer.camera.getPickRay(pos);
    return (ray && viewer.scene.globe.pick(ray, viewer.scene)) || viewer.camera.pickEllipsoid(pos, ell);
  }

  function closeInfo() { $('#info').hidden = true; }
  function showInfo(title, rows, extras) {
    $('#info-title').textContent = title;
    const body = $('#info-body'); body.textContent = '';
    const dl = el('dl');
    for (const [k, v] of rows) if (v != null && v !== '') dl.append(el('dt', { text: k }), el('dd', { text: String(v) }));
    if (dl.children.length) body.append(dl);
    for (const x of extras || []) if (x) body.append(x);
    $('#info').hidden = false;
  }
  const link = (href, text) => el('p', null, el('a', { href, target: '_blank', rel: 'noopener noreferrer', text }));
  const num = (n) => Number(n).toLocaleString('en-US');

  function eruptionText(y) {
    if (y == null) return 'Not known';
    return y < 0 ? `About ${num(-y)} BCE` : String(y);
  }

  let lookupSeq = 0;
  function onClick(pos) {
    if (measure.on) { measureClick(pos); return; }
    const picked = viewer.scene.pick(pos);
    const d = picked && picked.id && picked.id.kind ? picked.id : null;
    if (d && d.kind === 'quake') {
      const safe = typeof d.url === 'string' && d.url.startsWith(d.def.moreUrlPrefix);
      showInfo('Earthquake', [
        ['Where', d.place], ['Strength', 'Magnitude ' + d.mag.toFixed(1)],
        ['Depth', Math.round(d.depth) + ' km below the surface'],
        ['When', d.time ? new Date(d.time).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : null],
        ['Location', fmtLatLon(d.lat, d.lon)],
      ], [safe ? link(d.url, d.def.moreLabel) : null]);
      return;
    }
    if (d && d.kind === 'volcano') {
      showInfo(d.name || 'Volcano', [
        ['Kind', d.type], ['Country', d.country],
        ['Height', d.elevation_m != null ? num(d.elevation_m) + ' m' : null],
        ['Last eruption', eruptionText(d.last_eruption)],
        ['Setting', d.tectonic_setting], ['Main rock', d.rock_type],
        ['Location', fmtLatLon(d.lat, d.lon)],
      ], [d.number ? link(d.def.moreUrl.replace('{number}', encodeURIComponent(d.number)), d.def.moreLabel) : null]);
      return;
    }
    // Nothing clicked: if a layer supports "what is here?", ask.
    const lookupDef = world().overlays.find((o) => o.clickLookup && state.overlays.has(o.id));
    const hit = lookupDef && groundAt(pos);
    if (!hit) { closeInfo(); return; }
    const c = C.Cartographic.fromCartesian(hit, ell), lat = deg(c.latitude), lon = deg(c.longitude);
    const seq = ++lookupSeq;
    showInfo('Rock at this spot', [['Location', fmtLatLon(lat, lon)]], [el('p', { text: 'Looking it up…' })]);
    fetch(APP.rockLookup.url.replace('{lat}', lat.toFixed(4)).replace('{lng}', lon.toFixed(4)))
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((j) => {
        if (seq !== lookupSeq) return;
        const units = ((j.success && j.success.data) || []).filter((u) => u && (u.name || u.lith));
        if (!units.length) {
          showInfo('Rock at this spot', [['Location', fmtLatLon(lat, lon)]], [el('p', { text: 'The map has no rock information here. Try a spot on land.' })]);
          return;
        }
        const ma = (v) => v >= 1 ? num(Math.round(v)) + ' million' : num(Math.round(v * 1e6));
        const ageName = (u) => (u.b_int_name && u.t_int_name)
          ? (u.b_int_name === u.t_int_name ? u.b_int_name : `${u.b_int_name} to ${u.t_int_name}`) : null;
        const ageYears = (u) => (u.b_int_age != null && u.t_int_age != null) ? `about ${ma(u.b_int_age)} to ${ma(u.t_int_age)} years old` : null;
        const rockType = (u) => (u.lith || '').replace(/^Major:\{|\}$/g, '').replace(/,(?=\S)/g, ', ');
        const u = units[0];
        const desc = (u.descrip || '').trim();
        // Different maps of the same spot can show different things: often loose sand, gravel or
        // soil on top, and the solid rock underneath. List the others so students can find the bedrock.
        const seen = new Set([u.name]), others = [];
        for (const x of units.slice(1)) {
          if (!x.name || seen.has(x.name) || others.length >= 3) continue;
          seen.add(x.name);
          others.push(el('li', { text: [x.name, rockType(x), [ageName(x), ageYears(x)].filter(Boolean).join(', ')].filter(Boolean).join(' — ') }));
        }
        const years = ageYears(u);
        showInfo('Rock at this spot', [
          ['Name', u.name || u.strat_name], ['Rock type', rockType(u)],
          ['Age', ageName(u)], ['', years ? years[0].toUpperCase() + years.slice(1) : null], ['Location', fmtLatLon(lat, lon)],
        ], [
          desc ? el('p', { text: desc.length > 320 ? desc.slice(0, 320).replace(/\s+\S*$/, '') + '…' : desc }) : null,
          others.length ? el('p', { class: 'fine', text: 'Other maps of this spot also show:' }) : null,
          others.length ? el('ul', { class: 'units' }, ...others) : null,
          el('p', { class: 'fine', text: 'Source: ' + APP.rockLookup.credit }),
        ]);
      })
      .catch(() => {
        if (seq !== lookupSeq) return;
        showInfo('Rock at this spot', [['Location', fmtLatLon(lat, lon)]], [el('p', { text: 'The rock lookup did not answer. Try again in a moment.' })]);
      });
  }

  /* ------------------------------------------------------------ measure a distance */
  const measure = { on: false, pts: [], prims: null };
  function clearMeasureGraphics() {
    if (measure.prims && viewer && !viewer.isDestroyed()) {
      for (const p of measure.prims) viewer.scene.primitives.remove(p);
      viewer.scene.requestRender();
    }
    measure.prims = null;
  }
  function setMeasure(on) {
    measure.on = on; measure.pts = [];
    clearMeasureGraphics();
    $('#globe').classList.toggle('measuring', on);
    $('[data-nav=measure]').setAttribute('aria-pressed', String(on));
    $('#measure').hidden = !on;
    $('#measure-text').textContent = 'Click the first place on the globe.';
    $('#measure-again').hidden = true;
    if (on) closeInfo();
  }
  function measureClick(pos) {
    const hit = groundAt(pos);
    if (!hit) return;
    if (measure.pts.length >= 2) { measure.pts = []; clearMeasureGraphics(); }
    const c = C.Cartographic.fromCartesian(hit, ell); c.height = 0;
    measure.pts.push(c);
    const scene = viewer.scene;
    if (!measure.prims) {
      measure.prims = [scene.primitives.add(new C.PolylineCollection()), scene.primitives.add(new C.PointPrimitiveCollection())];
    }
    const [lines, dots] = measure.prims;
    dots.add({ position: C.Cartesian3.fromRadians(c.longitude, c.latitude, 0, ell), pixelSize: 9,
      color: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 2 });
    if (measure.pts.length === 1) {
      $('#measure-text').textContent = 'Now click the second place.';
    } else {
      try {
        const g = new C.EllipsoidGeodesic(measure.pts[0], measure.pts[1], ell);
        const path = [];
        for (let i = 0; i <= 64; i++) {
          const q = g.interpolateUsingFraction(i / 64);
          path.push(C.Cartesian3.fromRadians(q.longitude, q.latitude, 0, ell));
        }
        lines.add({ positions: path, width: 3, material: C.Material.fromType('Color', { color: C.Color.WHITE }) });
        const km = g.surfaceDistance / 1000;
        $('#measure-text').textContent = 'Distance: ' + (km < 10 ? km.toFixed(1) : num(Math.round(km))) + ' km';
      } catch (e) {
        $('#measure-text').textContent = 'Those two places are too far apart to measure. Try again.';
      }
      $('#measure-again').hidden = false;
    }
    scene.requestRender();
  }

  /* ------------------------------------------------------------ activities (guided tours)
     An activity is a JSON file: a list of stops, each with a view, layers, a short
     reading and questions. Answers stay in this browser tab until the student copies
     or downloads them. See docs/activities.md for the file format. */
  let actIndex = [];
  const act = { def: null, i: 0, review: false };
  let answers = {};                                  // { activityId: { name, a: { "stop.question": text } } }
  try { answers = JSON.parse(sessionStorage.getItem('gg-answers') || '{}') || {}; } catch (e) { answers = {}; }
  const saveAnswers = () => { try { sessionStorage.setItem('gg-answers', JSON.stringify(answers)); } catch (e) { /* kept in memory only */ } };
  const myAnswers = () => (answers[act.def.id] = answers[act.def.id] || { name: '', a: {} });
  const questionsOf = (stop) => Array.isArray(stop.questions) ? stop.questions.map(String) : [];

  async function loadActivities() {
    try {
      const idx = await getJson(APP.activitiesIndex);
      actIndex = (idx.activities || []).filter((a) => a && /^[a-z0-9-]{1,60}$/.test(a.id) && a.title);
    } catch (e) { actIndex = []; }
    const box = $('#act-list'); box.textContent = '';
    for (const a of actIndex) {
      box.append(el('button', { type: 'button', onclick: () => startActivity(a.id, 1, false) },
        el('b', { text: a.title }),
        el('span', { text: [a.minutes ? `About ${a.minutes} minutes` : null, a.summary].filter(Boolean).join(' · ') })));
    }
    $('#act-none').hidden = actIndex.length > 0;
  }

  async function startActivity(id, stopNo, keepView) {
    if (!actIndex.some((a) => a.id === id)) { banner('That lesson is not on this site.'); return; }
    let def;
    try { def = await getJson(APP.activitiesIndex.replace(/[^/]*$/, '') + id + '.json'); }
    catch (e) { banner('That lesson could not be loaded. Check the internet connection.'); return; }
    if (!def || !Array.isArray(def.stops) || !def.stops.length) { banner('That lesson has no stops yet.'); return; }
    act.def = Object.assign({}, def, { id });
    act.i = clamp(stopNo - 1, 0, def.stops.length - 1); act.review = false;
    $('#app').classList.add('in-activity');
    $('#act-panel').hidden = false; $('#act-bar').hidden = false;
    setTab('lesson');
    renderStop();
    if (!keepView) applyStop(); else writeLink();
  }

  function leaveActivity() {
    act.def = null; act.review = false;
    $('#app').classList.remove('in-activity');
    $('#act-panel').hidden = true; $('#act-bar').hidden = true;
    renderAll(); writeLink();
  }

  // Put the globe the way the current stop asks: world, picture, layers, terrain, view.
  function applyStop() {
    const st = act.def.stops[act.i];
    const body = WORLDS[st.body] ? st.body : state.body, w = WORLDS[body];
    const base = byId(w.base, st.base) ? st.base : (body === state.body ? state.base : w.base[0].id);
    const wanted = new Map();
    for (const item of Array.isArray(st.layers) ? st.layers : []) {
      const [id, op] = String(item).split('.');
      const d = byId(w.overlays, id);
      if (d && wanted.size < APP.maxOverlays) wanted.set(id, clamp(Number(op) || d.opacity || 100, 10, 100));
    }
    const terrain = !!st.terrain && !!w.terrain;
    if (body !== state.body) {
      Object.assign(state, { body, base, overlays: wanted, terrain, view: null });
      buildViewer();
    } else {
      if (base !== state.base) setBase(base);
      for (const id of [...state.overlays.keys()]) if (!wanted.has(id)) removeOverlay(id);
      state.overlays = wanted;
      for (const [id, op] of wanted) {
        const entry = live.overlays.get(id);
        if (!entry) addOverlay(id); else if (entry.layer) entry.layer.alpha = op / 100;
      }
      if (terrain !== state.terrain) { state.terrain = terrain; applyTerrain(); }
    }
    renderAll();
    const v = st.view || {};
    if (Number.isFinite(v.lon) && Number.isFinite(v.lat)) {
      flyTo(v.lon, v.lat, Number.isFinite(v.range) ? v.range : homeHeight(), Number.isFinite(v.pitch) ? clamp(v.pitch, -90, -10) : -90,
        undefined, Number.isFinite(v.heading) ? v.heading : 0);
    } else flyHome();
    writeLink();
  }

  function answersText() {
    const d = act.def, mine = myAnswers(), out = [];
    out.push(`Geoscience Globe: ${d.title}`);
    out.push(`Name: ${mine.name || ''}`);
    out.push(`Date: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`);
    d.stops.forEach((st, si) => {
      const qs = questionsOf(st);
      if (!qs.length) return;
      out.push('', `Stop ${si + 1}: ${st.title || ''}`);
      qs.forEach((q, qi) => out.push(`Q: ${q}`, `A: ${(mine.a[`${si}.${qi}`] || '').trim() || '(no answer)'}`));
    });
    return out.join('\n') + '\n';
  }

  function renderStop() {
    const d = act.def, n = d.stops.length, mine = myAnswers();
    const body = $('#act-body'); body.textContent = '';
    $('#act-msg').textContent = ''; $('#act-export').hidden = true;
    if (act.review) {
      $('#act-progress').textContent = d.title;
      $('#act-title').textContent = 'Your answers';
      body.append(el('p', { text: 'Check your answers. Then copy or download them and hand them in the way your teacher asked.' }));
      body.append(el('p', { class: 'q', text: 'Your name' }),
        el('input', { type: 'text', maxlength: 80, value: mine.name || '', 'aria-label': 'Your name', autocomplete: 'off',
          oninput: (ev) => { mine.name = ev.target.value; saveAnswers(); } }));
      d.stops.forEach((st, si) => questionsOf(st).forEach((q, qi) => {
        const a = (mine.a[`${si}.${qi}`] || '').trim();
        body.append(el('div', { class: 'review' },
          el('p', { class: 'fine', text: `Stop ${si + 1}: ${st.title || ''}` }),
          el('p', { text: q }),
          el('p', { class: 'a' + (a ? '' : ' empty'), text: a || 'No answer yet.' })));
      }));
      body.append(el('div', { class: 'act-buttons' },
        el('button', { type: 'button', class: 'primary', text: 'Copy my answers', onclick: copyAnswers }),
        el('button', { type: 'button', text: 'Download my answers', onclick: downloadAnswers })));
    } else {
      const st = d.stops[act.i];
      $('#act-progress').textContent = `${d.title} · Stop ${act.i + 1} of ${n}`;
      $('#act-title').textContent = st.title || `Stop ${act.i + 1}`;
      for (const para of String(st.text || '').split(/\n\s*\n/)) if (para.trim()) body.append(el('p', { text: para.trim() }));
      questionsOf(st).forEach((q, qi) => {
        const key = `${act.i}.${qi}`;
        const box = el('textarea', { rows: 3, maxlength: 2000, 'aria-label': 'Your answer', placeholder: 'Type your answer here' });
        box.value = mine.a[key] || '';
        box.addEventListener('input', () => { mine.a[key] = box.value; saveAnswers(); });
        body.append(el('p', { class: 'q', text: q }), box);
      });
    }
    $('#act-back').disabled = !act.review && act.i === 0;
    $('#act-next').hidden = act.review;
    $('#act-next').textContent = act.i === n - 1 ? 'Finish' : 'Next';
    $('#act-view').hidden = act.review;
    $('#act-step').textContent = act.review ? '' : `${act.i + 1} of ${n}`;
    $('#lesson-scroll').scrollTop = 0;
    if (ui.tab === 'lesson') $('#act-title').focus({ preventScroll: true });
  }

  function stepActivity(dir) {
    if (!act.def) return;
    const n = act.def.stops.length;
    if (act.review) { if (dir < 0) { act.review = false; renderStop(); } return; }
    if (dir > 0 && act.i === n - 1) { act.review = true; renderStop(); return; }
    act.i = clamp(act.i + dir, 0, n - 1);
    renderStop(); applyStop();
  }

  function showExportBox(text, msg) {
    const box = $('#act-export');
    box.hidden = false; box.value = text; box.focus(); box.select();
    $('#act-msg').textContent = msg;
  }
  function copyAnswers() {
    const text = answersText();
    const fallback = () => showExportBox(text, 'Copy the text in the box below (Command + C).');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => { $('#act-export').hidden = true; $('#act-msg').textContent = 'Answers copied. Paste them wherever your teacher asked.'; }, fallback);
    } else fallback();
  }
  function downloadAnswers() {
    const text = answersText();
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = el('a', { href: url, download: `${act.def.id}-answers.txt` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      $('#act-msg').textContent = 'Saved to your Downloads folder.';
    } catch (e) { showExportBox(text, 'Copy the text in the box below (Command + C).'); }
  }

  /* ------------------------------------------------------------ panel: worlds, layers, options */
  function renderWorlds() {
    const box = $('#worlds'); box.textContent = '';
    for (const [id, w] of Object.entries(WORLDS)) {
      box.append(el('button', { type: 'button', 'aria-pressed': String(id === state.body), text: w.name, onclick: () => setWorld(id) }));
    }
  }

  function setWorld(id) {
    if (id === state.body) return;
    state.body = id;
    const w = world();
    state.base = w.base[0].id; state.overlays = new Map(); state.terrain = false; state.view = null;
    renderAll(); buildViewer(); writeLink();
  }

  // A color bar with labeled values, for pictures whose colors stand for numbers.
  function colorKey(sc) {
    const lo = sc.stops[0][0], hi = sc.stops[sc.stops.length - 1][0];
    const pct = (v) => ((v - lo) / (hi - lo) * 100).toFixed(1) + '%';
    const colorAt = (v) => sc.stops.reduce((best, st) => Math.abs(st[0] - v) < Math.abs(best[0] - v) ? st : best)[1];
    const sign = (v) => (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v);
    const bar = el('div', { class: 'key-bar', role: 'img',
      'aria-label': `Color key from ${sign(lo)} ${sc.unit} to ${sign(hi)} ${sc.unit}`,
      style: `background:linear-gradient(to right, ${sc.stops.map(([v, c]) => `${c} ${pct(v)}`).join(', ')})` });
    const ticks = el('div', { class: 'key-ticks', 'aria-hidden': 'true' },
      ...sc.ticks.map((v) => el('span', { style: `left:${pct(v)}`, text: sign(v) })));
    const marks = el('ul', { class: 'legend' }, ...(sc.marks || []).map(([v, text]) =>
      el('li', null, el('i', { style: `background:${colorAt(v)}` }), el('span', { text: `${text}: about ${sign(v)} ${sc.unit}` }))));
    return el('div', { class: 'extra key' }, el('p', { class: 'fine', text: `Height in ${sc.unit === 'km' ? 'kilometers' : sc.unit}` }), bar, ticks, marks);
  }

  function renderLayers() {
    const w = world();
    const count = state.overlays.size, badge = $('#tab-count');
    badge.hidden = !count; badge.textContent = count || '';
    badge.title = count ? `${count} added to the globe` : '';
    badge.setAttribute('aria-label', count ? `, ${count} added to the globe` : '');
    const baseBox = $('#base-list'); baseBox.textContent = '';
    for (const def of w.base) {
      const on = def.id === state.base;
      baseBox.append(el('div', { class: 'layer' + (on ? ' on' : '') },
        el('label', null,
          el('input', { type: 'radio', name: 'base', value: def.id, checked: on, onchange: () => { setBase(def.id); renderLayers(); writeLink(); } }),
          el('span', null, el('span', { text: def.name }), el('p', { class: 'fine note', text: def.note.split('{date}').join(niceDate(def)) }))),
        on && def.scale ? colorKey(def.scale) : null));
    }

    $('#overlay-section').hidden = !w.overlays.length;
    const box = $('#overlay-list'); box.textContent = '';
    for (const def of w.overlays) {
      const on = state.overlays.has(def.id);
      const row = el('div', { class: 'layer' + (on ? ' on' : '') },
        el('label', null,
          el('input', { type: 'checkbox', checked: on, onchange: (ev) => toggleOverlay(def, ev.target.checked) }),
          el('span', null, el('span', { text: def.name }), el('p', { class: 'fine note', text: def.note }))));
      const extra = el('div', { class: 'extra' });
      if (def.opacity) {
        const val = state.overlays.get(def.id) || def.opacity;
        extra.append(el('label', { class: 'slider' }, el('span', { text: 'See-through' }),
          el('input', { type: 'range', min: 10, max: 100, step: 5, value: val, 'aria-label': `How solid the ${def.name} looks`,
            oninput: (ev) => {
              const v = Number(ev.target.value);
              state.overlays.set(def.id, v);
              const entry = live.overlays.get(def.id);
              if (entry && entry.layer) { entry.layer.alpha = v / 100; viewer.scene.requestRender(); }
            },
            onchange: writeLink }),
          el('span', { text: 'Solid' })));
      }
      if (def.legend) {
        extra.append(el('ul', { class: 'legend' }, ...def.legend.map(([color, text]) =>
          el('li', null, el('i', { style: `background:${color}` }), el('span', { text })))));
      }
      if (extra.children.length) row.append(extra);
      box.append(row);
    }
  }

  function toggleOverlay(def, on) {
    $('#overlay-msg').textContent = '';
    if (on) {
      if (state.overlays.size >= APP.maxOverlays) {
        $('#overlay-msg').textContent = `You can have ${APP.maxOverlays} of these on at once. Switch one off first.`;
        renderLayers(); return;
      }
      state.overlays.set(def.id, def.opacity || 100);
      addOverlay(def.id);
    } else {
      state.overlays.delete(def.id);
      removeOverlay(def.id);
    }
    renderLayers(); writeLink();
  }

  function renderOptions() {
    const w = world();
    $('#terrain-row').hidden = !w.terrain;
    $('#opt-terrain').checked = state.terrain;
    $('#terrain-note').textContent = w.terrain ? `(heights stretched ${w.terrain.exaggeration}× so they show)` : '';
    $('#opt-sharp').checked = state.quality === 'full';
  }

  /* ------------------------------------------------------------ panel: places + search */
  function goToPlace(p) {
    $('#place-note').textContent = p.note ? `${p.name}: ${p.note}` : p.name;
    flyTo(p.lon, p.lat, p.range, p.pitch);
  }
  function renderPlaces() {
    const box = $('#places'); box.textContent = '';
    for (const p of world().places) box.append(el('button', { type: 'button', text: p.name, title: p.note || '', onclick: () => goToPlace(p) }));
    $('#place-note').textContent = '';
    $('#search-results').textContent = '';
    $('#search-box').value = '';
    $('#search-box').placeholder = world().places[0] ? world().places[0].name : 'Place name';
    $('#search-note').textContent = world().searchRemote
      ? 'Your search words are sent to OpenStreetMap to find the place.'
      : `Search looks through the places listed below for ${world().name === 'Earth' ? 'Earth' : world().name === 'Moon' ? 'the Moon' : world().name}.`;
  }

  let searchSeq = 0;
  function runSearch(text) {
    const q = text.trim().slice(0, 80);
    const list = $('#search-results'); list.textContent = '';
    if (!q) return;
    const seq = ++searchSeq, w = world();
    const local = w.places.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    const addLocal = () => local.forEach((p) => list.append(el('li', null, el('button', { type: 'button', text: p.name, onclick: () => goToPlace(p) }))));
    const note = (t) => list.append(el('li', { class: 'fine', text: t }));
    if (!w.searchRemote) {
      addLocal();
      if (!local.length) note('No match. Try one of the places listed below.');
      return;
    }
    addLocal();
    const go = $('#search-go'); go.disabled = true;
    note('Searching…');
    fetch(APP.search.url.replace('{q}', encodeURIComponent(q)))
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((rows) => {
        if (seq !== searchSeq) return;
        list.textContent = ''; addLocal();
        const good = (Array.isArray(rows) ? rows : []).filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)));
        for (const r of good) {
          list.append(el('li', null, el('button', { type: 'button', text: String(r.display_name || q).slice(0, 120), onclick: () => {
            let range = 60000;
            const b = (r.boundingbox || []).map(Number);
            if (b.length === 4 && b.every(Number.isFinite)) {
              const dLat = Math.abs(b[1] - b[0]), dLon = Math.abs(b[3] - b[2]) * Math.cos(rad(Number(r.lat)));
              range = clamp(Math.hypot(dLat, dLon) * 111000 * 1.3, 60000, ell.maximumRadius * 2);
            }
            $('#place-note').textContent = '';
            flyTo(Number(r.lon), Number(r.lat), range, -60);
          } })));
        }
        if (!good.length && !local.length) note('No place found with that name. Check the spelling.');
      })
      .catch(() => { if (seq === searchSeq) { list.textContent = ''; addLocal(); note('Search is not answering right now. Try again in a moment.'); } })
      .finally(() => { if (seq === searchSeq) go.disabled = false; });
  }

  /* ------------------------------------------------------------ share */
  function share() {
    if (viewer) captureView();
    writeLink();
    const url = location.href, msg = $('#share-msg'), box = $('#share-url');
    const fallback = () => {
      box.hidden = false; box.value = url; box.focus(); box.select();
      msg.textContent = 'Copy the link in the box below (Command + C).';
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => { box.hidden = true; msg.textContent = 'Link copied. Paste it wherever your teacher asked.'; }, fallback);
    } else fallback();
  }

  /* ------------------------------------------------------------ start-up */
  function renderAll() { renderWorlds(); renderLayers(); renderOptions(); renderPlaces(); $('#overlay-msg').textContent = ''; }

  // The panel has two tabs: Lesson (reading and questions) and Controls (everything that changes the globe).
  const ui = { tab: 'controls' };
  function setTab(name, focus) {
    ui.tab = name === 'lesson' ? 'lesson' : 'controls';
    for (const t of ['lesson', 'controls']) {
      const on = t === ui.tab, tab = $('#tab-' + t);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      $('#pane-' + t).hidden = !on;
    }
    if (focus) $('#tab-' + ui.tab).focus();
  }

  function setPanel(open) {
    $('#app').classList.toggle('panel-hidden', !open);
    $('#panel-open').hidden = open;
    (open ? $('#panel-close') : $('#panel-open')).focus();
    if (viewer) { viewer.resize(); viewer.scene.requestRender(); }
  }

  function wireUi() {
    $('#panel-close').addEventListener('click', () => setPanel(false));
    $('#panel-open').addEventListener('click', () => setPanel(true));
    $('#search-form').addEventListener('submit', (ev) => { ev.preventDefault(); runSearch($('#search-box').value); });
    $('#opt-terrain').addEventListener('change', (ev) => { state.terrain = ev.target.checked; applyTerrain(); writeLink(); });
    $('#opt-sharp').addEventListener('change', (ev) => {
      state.quality = ev.target.checked ? 'full' : 'lite';
      if (viewer) captureView();
      buildViewer(); writeLink();
    });
    $('#share-btn').addEventListener('click', share);
    $('#nav').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-nav]');
      if (b && viewer && NAV[b.dataset.nav]) NAV[b.dataset.nav]();
    });
    $('#info-close').addEventListener('click', closeInfo);
    $('#measure-again').addEventListener('click', () => setMeasure(true));
    $('#measure-done').addEventListener('click', () => setMeasure(false));
    $('#act-next').addEventListener('click', () => stepActivity(1));
    $('#act-back').addEventListener('click', () => stepActivity(-1));
    $('#act-view').addEventListener('click', () => { if (act.def && !act.review) applyStop(); });
    $('#act-leave').addEventListener('click', leaveActivity);
    $('#act-controls').addEventListener('click', () => setTab('controls', true));
    $('#tab-lesson').addEventListener('click', () => setTab('lesson'));
    $('#tab-controls').addEventListener('click', () => setTab('controls'));
    $('.tabs').addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); setTab(ui.tab === 'lesson' ? 'controls' : 'lesson', true); }
    });
    $('#hint-close').addEventListener('click', () => {
      $('#hint').hidden = true;
      try { localStorage.setItem('gg-hint-seen', '1'); } catch (e) { /* storage unavailable: show it again next time */ }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (!$('#hint').hidden) $('#hint-close').click(); else if (measure.on) setMeasure(false); else closeInfo();
    });
    window.addEventListener('resize', () => { if (viewer) viewer.scene.requestRender(); });
    // A link pasted into the address bar of an open page: load that view.
    window.addEventListener('hashchange', () => {
      if (location.hash === lastWritten) return;
      readLink(); renderAll(); buildViewer();
      if (linkActivity) startActivity(linkActivity.id, linkActivity.stop, linkActivity.keepView);
      else if (act.def) leaveActivity();
      else writeLink();
    });
  }

  async function start() {
    readLink(); renderAll(); wireUi();
    let seen = false;
    try { seen = localStorage.getItem('gg-hint-seen') === '1'; } catch (e) { /* ignore */ }
    try { await loadCesium(); }
    catch (e) {
      fatal('The globe could not load. The network may be blocking cdn.jsdelivr.net. Check the internet connection, then reload the page.');
      return;
    }
    try { buildViewer(); }
    catch (e) {
      console.error(e);
      fatal('The globe could not start on this device. Try reloading the page, or use a different browser.');
      return;
    }
    await loadActivities();
    if (linkActivity) await startActivity(linkActivity.id, linkActivity.stop, linkActivity.keepView);
    writeLink();
    if (!seen) { $('#hint').hidden = false; $('#hint-close').focus(); }
  }

  // For testing from the browser console.
  window.geoGlobe = { get viewer() { return viewer; }, state };

  start();
})();
