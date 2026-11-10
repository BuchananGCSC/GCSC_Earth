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
    state.terrain = p.get('terrain') === '1' && !!w.hasTerrain;
    state.quality = p.get('q') === 'full' ? 'full' : 'lite';
    const v = (p.get('view') || '').split(',').map(Number);
    state.view = (v.length === 5 && v.every(Number.isFinite))
      ? { lon: clamp(v[0], -180, 180), lat: clamp(v[1], -90, 90), height: clamp(v[2], 100, 1e9), heading: v[3], pitch: clamp(v[4], -90, 90) }
      : null;
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
     Cesium asks for elevation in its own latitude/longitude tile grid. The elevation
     tiles on AWS are standard web-map tiles with height packed into the colors, so each
     Cesium tile is filled by sampling one or two of those web-map tiles. */
  const demCache = new Map();          // "z/x/y" -> Promise<Int16Array 256x256>
  const DEM_KEEP = 80;
  let demCanvas = null;
  function demTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    let p = demCache.get(key);
    if (p) { demCache.delete(key); demCache.set(key, p); return p; }      // move to newest
    p = new Promise((ok, fail) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          if (!demCanvas) { demCanvas = document.createElement('canvas'); demCanvas.width = demCanvas.height = 256; }
          const ctx = demCanvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 256, 256);
          const px = ctx.getImageData(0, 0, 256, 256).data;
          const out = new Int16Array(65536);
          for (let i = 0, j = 0; i < 65536; i++, j += 4) out[i] = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768;
          ok(out);
        } catch (e) { fail(e); }
      };
      img.onerror = () => fail(new Error('elevation tile failed'));
      img.src = APP.terrain.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    });
    p.catch(() => demCache.delete(key));
    demCache.set(key, p);
    if (demCache.size > DEM_KEEP) demCache.delete(demCache.keys().next().value);
    return p;
  }

  function makeTerrain(ell) {
    const W = 65, MAXLAT = rad(85.0511);
    const tiling = new C.GeographicTilingScheme({ ellipsoid: ell });
    const mercY = (lat) => (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2;   // 0 at the top, 1 at the bottom
    return new C.CustomHeightmapTerrainProvider({
      width: W, height: W, tilingScheme: tiling, ellipsoid: ell, credit: APP.terrain.credit,
      callback(x, y, level) {
        const r = tiling.tileXYToRectangle(x, y, level);
        const yN = mercY(clamp(r.north, -MAXLAT, MAXLAT)), yS = mercY(clamp(r.south, -MAXLAT, MAXLAT));
        // Web-map zoom: columns line up exactly at level+1; go lower near the poles so
        // the tile's latitude range fits inside two web-map rows.
        let z = Math.min(level + 1, APP.terrain.maxZoom);
        if (yS - yN > 1e-9) z = Math.min(z, Math.floor(Math.log2(1 / (yS - yN))));
        z = Math.max(0, z);
        const n = 2 ** z;
        const tx = clamp(Math.floor((r.west + Math.PI) / (2 * Math.PI) * n + 1e-6), 0, n - 1);
        const ty0 = clamp(Math.floor(yN * n), 0, n - 1);
        const ty1 = clamp(Math.floor(yS * n - 1e-9), ty0, n - 1);
        const jobs = [demTile(z, tx, ty0)];
        if (ty1 !== ty0) jobs.push(demTile(z, tx, ty1));
        return Promise.all(jobs).then((tiles) => {
          const out = new Float32Array(W * W);
          for (let j = 0; j < W; j++) {
            const lat = clamp(r.north - (r.north - r.south) * j / (W - 1), -MAXLAT, MAXLAT);
            const gy = mercY(lat) * n * 256;
            const t = clamp(Math.floor(gy / 256), ty0, ty0 + tiles.length - 1);
            const py = clamp(Math.floor(gy - t * 256), 0, 255);
            const src = tiles[t - ty0];
            for (let i = 0; i < W; i++) {
              const lon = r.west + (r.east - r.west) * i / (W - 1);
              const px = clamp(Math.floor((lon + Math.PI) / (2 * Math.PI) * n * 256 - tx * 256), 0, 255);
              out[j * W + i] = src[py * 256 + px];
            }
          }
          return out;
        }).catch(() => undefined);     // on failure Cesium keeps showing the coarser parent tile
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
    const on = state.terrain && !!world().hasTerrain;
    viewer.terrainProvider = on ? makeTerrain(ell) : new C.EllipsoidTerrainProvider({ ellipsoid: ell });
    viewer.scene.verticalExaggeration = on ? APP.terrain.exaggeration : 1;
    viewer.scene.requestRender();
  }

  /* ------------------------------------------------------------ camera moves */
  function flyTo(lon, lat, range, pitchDeg, done) {
    const target = C.Cartesian3.fromDegrees(lon, lat, 0, ell);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target, 1), {
      duration: reduceMotion ? 0 : 2.5,
      offset: new C.HeadingPitchRange(0, rad(pitchDeg), range),
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
    box.textContent = fmtLatLon(deg(c.latitude), deg(c.longitude));
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
        const u = units[0];
        const age = (u.b_int_name && u.t_int_name)
          ? (u.b_int_name === u.t_int_name ? u.b_int_name : `${u.b_int_name} to ${u.t_int_name}`) : null;
        const ma = (v) => v >= 1 ? num(Math.round(v)) + ' million' : num(Math.round(v * 1e6));
        const years = (u.b_int_age != null && u.t_int_age != null) ? `About ${ma(u.b_int_age)} to ${ma(u.t_int_age)} years old` : null;
        const desc = (u.descrip || '').trim();
        const others = [...new Set(units.slice(1).map((x) => x.name).filter((n) => n && n !== u.name))].slice(0, 2);
        showInfo('Rock at this spot', [
          ['Name', u.name || u.strat_name], ['Rock type', (u.lith || '').replace(/^Major:\{|\}$/g, '')],
          ['Age', age], ['', years], ['Location', fmtLatLon(lat, lon)],
        ], [
          desc ? el('p', { text: desc.length > 320 ? desc.slice(0, 320).replace(/\s+\S*$/, '') + '…' : desc }) : null,
          others.length ? el('p', { class: 'fine', text: 'Other maps of this spot also show: ' + others.join('; ') + '.' }) : null,
          el('p', { class: 'fine', text: 'Source: ' + APP.rockLookup.credit }),
        ]);
      })
      .catch(() => {
        if (seq !== lookupSeq) return;
        showInfo('Rock at this spot', [['Location', fmtLatLon(lat, lon)]], [el('p', { text: 'The rock lookup did not answer. Try again in a moment.' })]);
      });
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

  function renderLayers() {
    const w = world();
    const baseBox = $('#base-list'); baseBox.textContent = '';
    for (const def of w.base) {
      const on = def.id === state.base;
      baseBox.append(el('div', { class: 'layer' + (on ? ' on' : '') },
        el('label', null,
          el('input', { type: 'radio', name: 'base', value: def.id, checked: on, onchange: () => { setBase(def.id); renderLayers(); writeLink(); } }),
          el('span', null, el('span', { text: def.name }), el('p', { class: 'fine note', text: def.note.split('{date}').join(niceDate(def)) })))));
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
    $('#terrain-row').hidden = !w.hasTerrain;
    $('#opt-terrain').checked = state.terrain;
    $('#terrain-note').textContent = `(heights stretched ${APP.terrain.exaggeration}× so they show)`;
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
    $('#hint-close').addEventListener('click', () => {
      $('#hint').hidden = true;
      try { localStorage.setItem('gg-hint-seen', '1'); } catch (e) { /* storage unavailable: show it again next time */ }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (!$('#hint').hidden) $('#hint-close').click(); else closeInfo();
    });
    window.addEventListener('resize', () => { if (viewer) viewer.scene.requestRender(); });
    // A link pasted into the address bar of an open page: load that view.
    window.addEventListener('hashchange', () => {
      if (location.hash === lastWritten) return;
      readLink(); renderAll(); buildViewer(); writeLink();
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
    writeLink();
    if (!seen) { $('#hint').hidden = false; $('#hint-close').focus(); }
  }

  // For testing from the browser console.
  window.geoGlobe = { get viewer() { return viewer; }, state };

  start();
})();
