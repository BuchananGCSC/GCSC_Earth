/* ============================================================================
   Phase 0 benchmark — application logic.
   Depends on config.js (CFG, SOURCES, WAYPOINTS, MARS_RADII).
   ========================================================================== */
'use strict';

/* ------------------------------------------------------------------ helpers */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n, d = 1) => (n == null || !isFinite(n)) ? '–' : Number(n).toFixed(d);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const kb = (n) => n == null ? '–' : (n / 1024).toFixed(n > 102400 ? 0 : 1) + ' KB';
const mmss = (ms) => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

function utcDate(offsetDays) { return new Date(Date.now() - offsetDays * 864e5).toISOString().slice(0, 10); }
function templateUrl(src) { return src.url.split('{date}').join(utcDate(src.dateOffsetDays || 3)); }
function fillUrl(src, z, x, y) { return templateUrl(src).split('{z}').join(z).split('{x}').join(x).split('{y}').join(y); }

function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}

function browserName() {
  const ua = navigator.userAgent; let m;
  if ((m = ua.match(/Edg\/(\d+)/))) return 'Edge ' + m[1];
  if ((m = ua.match(/Chrome\/(\d+)/))) return 'Chrome ' + m[1];
  if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return 'Safari ' + m[1];
  if ((m = ua.match(/Firefox\/(\d+)/))) return 'Firefox ' + m[1];
  return ua;
}

function elog(msg, level) {
  const box = $('#log');
  const t = new Date().toLocaleTimeString([], { hour12: false });
  const line = h('div', { class: level || '' }, `${t}  ${msg}`);
  box.append(line);
  while (box.childNodes.length > 200) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}

/* ------------------------------------------------------------- this device */
function glReport() {
  const out = {};
  const mk = (t) => { try { return document.createElement('canvas').getContext(t) || null; } catch (e) { return null; } };
  const gl2 = mk('webgl2'); const gl = gl2 || mk('webgl');
  out.webgl2 = !!gl2; out.webgl1 = !!gl;
  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    out.vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    out.maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    out.maxSamples = gl2 ? gl.getParameter(gl2.MAX_SAMPLES) : null;
    out.floatLinear = !!gl.getExtension('OES_texture_float_linear');
    out.colorBufferFloat = !!gl.getExtension('EXT_color_buffer_float');
    out.anisotropy = !!gl.getExtension('EXT_texture_filter_anisotropic');
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
  }
  return out;
}

function envSnapshot() {
  const gl = glReport();
  return {
    browser: browserName(),
    platform: navigator.userAgentData?.platform || navigator.platform || 'unknown',
    screen: `${screen.width} × ${screen.height}`,
    window: `${innerWidth} × ${innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    cpuThreads: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory || null,
    secureContext: window.isSecureContext,
    online: navigator.onLine,
    connection: navigator.connection ? `${navigator.connection.effectiveType || '?'}, ~${navigator.connection.downlink ?? '?'} Mbit/s` : null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    gl,
  };
}

function renderEnv() {
  const e = envSnapshot();
  const core = $('#env-core'); core.replaceChildren();
  const row = (dl, k, v, cls) => { dl.append(h('dt', { text: k }), h('dd', { class: cls || '' }, v)); };
  row(core, 'Browser', e.browser);
  row(core, 'Platform', e.platform);
  row(core, 'Screen', e.screen + ` (window ${e.window})`);
  row(core, 'Pixel density', String(e.devicePixelRatio) + '×');
  row(core, 'CPU threads', e.cpuThreads != null ? String(e.cpuThreads) : 'not reported');
  row(core, 'Device memory', e.deviceMemoryGB != null ? e.deviceMemoryGB + ' GB (browser-rounded)' : 'not reported (Safari does not expose this)');
  row(core, 'Secure context (https)', e.secureContext ? 'yes' : 'no — some features may be disabled');
  row(core, 'Network hint', e.connection || 'not reported');
  row(core, 'Reduced motion', e.reducedMotion ? 'on' : 'off');
  const gl = $('#env-gl'); gl.replaceChildren();
  row(gl, 'WebGL 2', e.gl.webgl2 ? 'available' : 'NOT available', e.gl.webgl2 ? '' : 'muted');
  if (e.gl.webgl1) {
    row(gl, 'GPU', `${e.gl.renderer} (${e.gl.vendor})`);
    row(gl, 'Max texture size', String(e.gl.maxTexture));
    row(gl, 'Max renderbuffer', String(e.gl.maxRenderbuffer));
    row(gl, 'Antialiasing samples', e.gl.maxSamples != null ? String(e.gl.maxSamples) : 'n/a');
    row(gl, 'Float texture filtering', e.gl.floatLinear ? 'yes' : 'no');
    row(gl, 'Float render targets', e.gl.colorBufferFloat ? 'yes' : 'no');
  } else {
    row(gl, 'WebGL', 'Not available — neither globe will run in this browser.');
  }
  return e;
}

/* ----------------------------------------------------------- data sources */
async function probe(url, opts = {}) {
  const t0 = performance.now();
  const method = opts.method || 'GET';
  try {
    const r = await fetch(url, { mode: 'cors', cache: 'no-store', method });
    const out = { cors: true, status: r.status, type: r.headers.get('content-type') || '' };
    if (method === 'HEAD') {
      out.bytes = Number(r.headers.get('content-length')) || null;
    } else if (opts.json) {
      const text = await r.text(); out.bytes = text.length;
      try { out.json = JSON.parse(text); } catch (e) { out.parseError = true; }
    } else {
      const blob = await r.blob(); out.bytes = blob.size;
      if (opts.expectImage) {
        try { const bmp = await createImageBitmap(blob); out.w = bmp.width; out.h = bmp.height; out.decoded = true; if (bmp.close) bmp.close(); }
        catch (e) { out.decoded = false; }
      }
    }
    out.ms = performance.now() - t0;
    out.ok = r.ok && out.decoded !== false && !out.parseError;
    return out;
  } catch (err) {
    // Tell "no CORS headers" apart from "cannot connect at all".
    let reachable = false;
    try { await fetch(url, { mode: 'no-cors', cache: 'no-store', method }); reachable = true; } catch (e) { /* unreachable */ }
    return { ok: false, cors: false, reachable, status: 0, ms: performance.now() - t0, err: String((err && err.message) || err) };
  }
}

async function checkSource(src) {
  if (src.kind === 'tiles') {
    const jobs = src.tiles.map(([z, x, y]) => ({ z, x, y, url: fillUrl(src, z, x, y) }));
    const res = await Promise.all(jobs.map((j) => probe(j.url, { expectImage: true }).then((r) => Object.assign(j, r))));
    const okRes = res.filter((r) => r.ok);
    const details = res.map((r) => `z${r.z}/${r.x}/${r.y}  ` + (r.cors
      ? `HTTP ${r.status}  ${r.type || 'no type'}  ${kb(r.bytes)}  ${fmt(r.ms, 0)} ms` + (r.w ? `  ${r.w}×${r.h}` : '') + (r.decoded === false ? '  NOT A VALID IMAGE' : '')
      : (r.reachable ? 'blocked: server sends no CORS headers' : 'no connection')));
    return summarize(src, res, okRes, details, `${okRes.length}/${res.length} tiles OK`);
  }
  if (src.kind === 'json') {
    const r = await probe(templateUrl(src), { json: true });
    const extra = r.ok && src.count ? ' · ' + src.count(r.json) : '';
    return summarize(src, [r], r.ok ? [r] : [], [JSON.stringify({ status: r.status, ms: Math.round(r.ms), bytes: r.bytes, type: r.type, error: r.err || (r.parseError ? 'response was not JSON' : undefined) })], (r.ok ? 'OK' : 'failed') + extra);
  }
  const r = await probe(src.url, { method: 'HEAD' });
  return summarize(src, [r], r.ok ? [r] : [], [JSON.stringify({ status: r.status, ms: Math.round(r.ms), bytes: r.bytes, error: r.err })], r.ok ? 'File reachable' : 'failed');
}

function summarize(src, all, ok, details, head) {
  const times = ok.map((r) => r.ms);
  let status = ok.length === all.length ? 'pass' : ok.length ? 'warn' : 'fail';
  let why = '';
  if (status !== 'pass') {
    const noCors = all.filter((r) => r.cors === false && r.reachable);
    const unreachable = all.filter((r) => r.cors === false && !r.reachable);
    const http = all.filter((r) => r.cors && r.status && r.status >= 400);
    const bad = all.filter((r) => r.cors && r.status < 400 && !r.ok);
    if (noCors.length) why = 'The server answered but sends no CORS headers, so a browser app cannot use it directly (needs a proxy).';
    else if (unreachable.length) why = 'Could not connect: offline, DNS problem, or blocked by a filter.';
    else if (http.length) why = `HTTP ${[...new Set(http.map((r) => r.status))].join('/')} on ${http.length} request(s): check the URL pattern and tile numbering in config.js.`;
    else if (bad.length) why = 'The server replied, but the content was not what the app needs.';
  }
  return { status, medianMs: median(times), summary: head + (why ? ' — ' + why : ''), details: details.join('\n') };
}

const SRC_STATE = new Map();   // id -> result

function renderSourceTable() {
  const tb = $('#src-table tbody'); tb.replaceChildren();
  let group = null;
  for (const src of SOURCES) {
    if (src.group !== group) { group = src.group; tb.append(h('tr', { class: 'group' }, h('td', { colspan: '5', text: group }))); }
    const tr = h('tr', { 'data-id': src.id });
    const nameCell = h('td', null, h('div', { text: src.name }), h('div', { class: 'url', text: src.url }));
    if (src.note) nameCell.append(h('div', { class: 'hint', text: src.note }));
    tr.append(nameCell,
      h('td', null, h('span', { class: 'tag pending', text: 'Not run' })),
      h('td', { class: 'res' }),
      h('td', { class: 'num med', text: '–' }),
      h('td', null, h('button', { class: 'btn secondary small', text: 'Run' })));
    $('button', tr).addEventListener('click', () => runOne(src));
    tb.append(tr);
  }
}

async function runOne(src) {
  const tr = $(`#src-table tr[data-id="${src.id}"]`);
  const tag = $('.tag', tr);
  tag.className = 'tag run'; tag.textContent = 'Running…';
  const r = await checkSource(src).catch((e) => ({ status: 'fail', summary: 'Check crashed: ' + e.message, details: '', medianMs: null }));
  SRC_STATE.set(src.id, r);
  tag.className = 'tag ' + r.status; tag.textContent = { pass: 'Pass', warn: 'Partial', fail: 'Fail' }[r.status];
  const cell = $('.res', tr); cell.replaceChildren(h('div', { text: r.summary }));
  if (r.details) cell.append(h('details', null, h('summary', { text: 'Details' }), h('pre', { text: r.details })));
  $('.med', tr).textContent = r.medianMs != null ? fmt(r.medianMs, 0) + ' ms' : '–';
  return r;
}

async function runAllSources() {
  const btn = $('#btn-runall'); btn.disabled = true;
  let done = 0;
  for (const src of SOURCES) {
    $('#src-status').textContent = `Checking ${src.name}…`;
    await runOne(src);
    done++; $('#src-bar').style.width = (done / SOURCES.length * 100) + '%';
  }
  const counts = { pass: 0, warn: 0, fail: 0 };
  SRC_STATE.forEach((r) => counts[r.status]++);
  $('#src-status').textContent = `Done: ${counts.pass} pass, ${counts.warn} partial, ${counts.fail} fail.`;
  btn.disabled = false;
}

/* ------------------------------------------------------------ library load */
const LOADED = {};
function loadScript(src) {
  return LOADED[src] || (LOADED[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res();
    s.onerror = () => { delete LOADED[src]; rej(new Error('Could not load ' + src + ' (blocked by the network, a filter, or an offline connection?)')); };
    document.head.append(s);
  }));
}
function loadCss(href) {
  return LOADED[href] || (LOADED[href] = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href;
    l.onload = () => res(); l.onerror = () => { delete LOADED[href]; rej(new Error('Could not load ' + href)); };
    document.head.append(l);
  }));
}
async function ensureCesium() {
  if (window.Cesium) return;
  window.CESIUM_BASE_URL = CFG.cesiumBase;
  await loadCss(CFG.cesiumCss);
  await loadScript(CFG.cesiumJs);
}
async function ensureMapLibre() {
  if (window.maplibregl) return;
  await loadCss(CFG.maplibreCss);
  await loadScript(CFG.maplibreJs);
}

/* ------------------------------------------------------------------- meter */
const Meter = {
  run: null, active: null, last: null, recent: [], t0: 0, binMs: 30000, bins: new Map(),
  errors: 0, reqTotal: 0, bytesTotal: 0, reqBase: 0, bytesBase: 0,
  begin(run) { this.run = run; this.t0 = performance.now(); this.bins = new Map(); this.active = null; this.last = null; this.reqBase = this.reqTotal; this.bytesBase = this.bytesTotal; this.errors = 0; },
  end() { this.active = null; this.last = null; },
  phase(name) {
    const m = this.run.phaseMap;
    if (!m.has(name)) m.set(name, { name, dts: [], stalls: 0, settle: [] });
    return m.get(name);
  },
  beginPhase(name) { this.active = this.phase(name); this.last = null; },
  endPhase() { this.active = null; this.last = null; },
  tick() {
    const now = performance.now();
    this.recent.push(now);
    while (this.recent.length && now - this.recent[0] > 1000) this.recent.shift();
    if (this.active && this.last != null) {
      const dt = now - this.last;
      if (dt <= 1000) {
        this.active.dts.push(dt); this.run.allDts.push(dt);
        const b = Math.floor((now - this.t0) / this.binMs);
        const bin = this.bins.get(b) || { frames: 0, ms: 0 }; bin.frames++; bin.ms += dt; this.bins.set(b, bin);
      } else { this.active.stalls++; }
    }
    this.last = now;
    this.lastDt = this.recent.length > 1 ? now - this.recent[this.recent.length - 2] : null;
  },
};

try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) { Meter.reqTotal++; Meter.bytesTotal += (e.transferSize || e.encodedBodySize || 0); }
  }).observe({ type: 'resource', buffered: false });
} catch (e) { /* resource timing not available: request counts will show 0 */ }

function noteError(msg) {
  Meter.errors++;
  if (Meter.errors <= 15) elog(msg, 'bad');
  if (Meter.errors === 16) elog('Further errors are counted but not listed.', 'warn');
}

/* ------------------------------------------------------------ engine state */
const E = { kind: null, adapter: null, cfg: null, buildId: 0, running: false, stop: false };

function currentProfile() { return $('input[name=profile]:checked').value; }
function readCfg() {
  return {
    kind: E.kind,
    body: E.kind === 'cesium' ? $('#ctl-body').value : 'earth',
    imagery: $('#ctl-imagery').value,
    terrain: $('#ctl-terrain').checked,
    quakes: $('#ctl-quakes').checked,
    macro: $('#ctl-macro').checked,
    profile: currentProfile(),
    dpr: $('#ctl-dpr').value,
    durationMs: Number($('#ctl-duration').value),
    token: $('#ctl-token').value.trim(),
  };
}
function pixelRatioFor(cfg) { return cfg.dpr === 'native' ? null : Number(cfg.dpr); }
const srcById = (id) => SOURCES.find((s) => s.id === id);

/* -------------------------------------------------------------- Cesium */
async function createCesium(cfg) {
  await ensureCesium();
  const C = window.Cesium;
  const lite = cfg.profile === 'lite';
  const ell = cfg.body === 'moon' ? C.Ellipsoid.MOON
            : cfg.body === 'mars' ? new C.Ellipsoid(...MARS_RADII)
            : C.Ellipsoid.WGS84;
  C.Ellipsoid.default = ell;

  const opts = {
    baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false, vrButton: false,
    infoBox: false, selectionIndicator: false,
    requestRenderMode: lite, maximumRenderTimeChange: Infinity,
  };
  if (lite) { opts.skyBox = false; opts.skyAtmosphere = false; }
  if (cfg.body !== 'earth') { opts.skyAtmosphere = false; opts.globe = new C.Globe(ell); opts.mapProjection = new C.GeographicProjection(ell); }

  const viewer = new C.Viewer('viewer', opts);
  const scene = viewer.scene, globe = scene.globe;
  scene.backgroundColor = C.Color.fromCssColorString('#0a1115');
  globe.baseColor = C.Color.fromCssColorString('#16242c');

  // Performance profile
  if (lite) {
    scene.msaaSamples = 1; scene.postProcessStages.fxaa.enabled = false;
    globe.maximumScreenSpaceError = 4; globe.enableLighting = false; globe.showGroundAtmosphere = false;
    globe.tileCacheSize = 50; if (scene.fog) scene.fog.enabled = false;
  } else {
    scene.msaaSamples = 4; scene.postProcessStages.fxaa.enabled = true;
    globe.maximumScreenSpaceError = 2; globe.enableLighting = true; globe.showGroundAtmosphere = cfg.body === 'earth';
  }
  const ratio = pixelRatioFor(cfg);
  if (ratio) { viewer.useBrowserRecommendedResolution = false; viewer.resolutionScale = ratio; }

  const mkProvider = (src) => {
    const p = new C.UrlTemplateImageryProvider({
      url: templateUrl(src), maximumLevel: src.maxZoom, credit: src.credit, tileWidth: src.tileSize || 256, tileHeight: src.tileSize || 256,
      tilingScheme: src.scheme === 'geographic' ? new C.GeographicTilingScheme({ ellipsoid: ell }) : new C.WebMercatorTilingScheme({ ellipsoid: ell }),
    });
    p.errorEvent.addEventListener((e) => { noteError(`Tile error (${src.id}): ${(e && e.message) || 'request failed'}`); e.retry = false; });
    return p;
  };
  const base = srcById(cfg.imagery);
  viewer.imageryLayers.addImageryProvider(mkProvider(base));
  if (cfg.macro && cfg.body === 'earth') {
    const layer = viewer.imageryLayers.addImageryProvider(mkProvider(srcById('macrostrat-tiles'))); layer.alpha = 0.6;
  }
  if (cfg.terrain && cfg.body === 'earth') {
    if (!cfg.token) { elog('Terrain skipped: paste a Cesium ion token first.', 'warn'); }
    else {
      C.Ion.defaultAccessToken = cfg.token;
      const terrain = C.Terrain.fromWorldTerrain();
      terrain.errorEvent.addEventListener((e) => noteError('Terrain error: ' + ((e && e.message) || e)));
      scene.setTerrain(terrain); scene.verticalExaggeration = 1.5;
    }
  }
  if (cfg.quakes && cfg.body === 'earth') {
    C.GeoJsonDataSource.load(srcById('usgs-eq').url).then((ds) => {
      if (viewer.isDestroyed()) return;           // globe was rebuilt while the feed loaded
      ds.entities.values.forEach((en) => {
        const mag = en.properties && en.properties.mag ? en.properties.mag.getValue() : 2;
        en.billboard = undefined;
        en.point = new C.PointGraphics({ pixelSize: 3 + (mag || 2) * 1.6, color: C.Color.fromCssColorString('#ff5a36').withAlpha(0.85) });
      });
      return viewer.dataSources.add(ds);
    }).catch((e) => { if (!viewer.isDestroyed()) noteError('Earthquake feed error: ' + e.message); });
  }

  const R = ell.maximumRadius;
  const home = () => viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(-40, 20, R * 2.2, ell) });
  home();
  scene.postRender.addEventListener(() => Meter.tick());

  return {
    kind: 'cesium', version: window.CESIUM_VERSION || CFG.cesiumVersion,
    destroy() { try { viewer.destroy(); } catch (e) { /* already gone */ } },
    resetView: home,
    cancel() { viewer.camera.cancelFlight(); },
    flyTo(stop, ms) {
      return new Promise((done) => {
        const guard = setTimeout(done, ms + 4000);   // a flight started in a hidden tab may never report back
        const res = () => { clearTimeout(guard); done(); };
        const target = C.Cartesian3.fromDegrees(stop.lon, stop.lat, 0, ell);
        viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target, 1), {
          duration: ms / 1000,
          offset: new C.HeadingPitchRange(0, C.Math.toRadians(stop.pitch), stop.range == null ? R * 2.6 : stop.range),
          complete: res, cancel: res,
        });
        scene.requestRender();
      });
    },
    async waitLoaded(timeout) {
      const t0 = performance.now(); let good = 0;
      await sleep(400);                          // let the new view request its tiles first
      while (performance.now() - t0 < timeout && !E.stop) {
        good = globe.tilesLoaded ? good + 1 : 0;
        if (good >= 3) return performance.now() - t0;
        await sleep(100);
      }
      return null;
    },
    loaded: () => globe.tilesLoaded,
  };
}

/* ------------------------------------------------------------ MapLibre */
async function createMapLibre(cfg) {
  await ensureMapLibre();
  const lite = cfg.profile === 'lite';
  const base = srcById(cfg.imagery);
  const style = {
    version: 8, projection: { type: 'globe' }, sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0a1115' } }],
  };
  style.sources.base = { type: 'raster', tiles: [templateUrl(base)], tileSize: base.tileSize || 256, maxzoom: base.maxZoom, attribution: base.credit };
  style.layers.push({ id: 'base', type: 'raster', source: 'base' });
  if (cfg.macro) {
    const m = srcById('macrostrat-tiles');
    style.sources.macro = { type: 'raster', tiles: [templateUrl(m)], tileSize: m.tileSize || 256, maxzoom: m.maxZoom, attribution: m.credit };
    style.layers.push({ id: 'macro', type: 'raster', source: 'macro', paint: { 'raster-opacity': 0.6 } });
  }
  if (cfg.terrain) {
    const d = srcById('aws-terrain');
    style.sources.dem = { type: 'raster-dem', tiles: [templateUrl(d)], tileSize: 256, encoding: 'terrarium', maxzoom: d.maxZoom, attribution: d.credit };
    style.terrain = { source: 'dem', exaggeration: 1.5 };
  }
  if (cfg.quakes) {
    style.sources.quakes = { type: 'geojson', data: srcById('usgs-eq').url };
    style.layers.push({ id: 'quakes', type: 'circle', source: 'quakes', paint: {
      'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'mag'], 2], 2, 2.5, 5, 6, 8, 14],
      'circle-color': '#ff5a36', 'circle-opacity': 0.85 } });
  }
  const ratio = pixelRatioFor(cfg);
  const mapOpts = {
    container: 'viewer', style, center: [-40, 20], zoom: 1.3, pitch: 0, maxPitch: 85,
    attributionControl: { compact: true }, fadeDuration: lite ? 0 : 300,
    canvasContextAttributes: { antialias: !lite },
  };
  if (ratio) mapOpts.pixelRatio = ratio;
  const map = new maplibregl.Map(mapOpts);
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.on('render', () => Meter.tick());
  map.on('error', (e) => noteError('Map error: ' + ((e && e.error && e.error.message) || 'unknown')));

  return {
    kind: 'maplibre', version: CFG.maplibreVersion,
    ready: new Promise((res) => map.once('load', res)),
    destroy() { try { map.remove(); } catch (e) { /* already gone */ } },
    resetView() { map.jumpTo({ center: [-40, 20], zoom: 1.3, pitch: 0, bearing: 0 }); },
    cancel() { map.stop(); },
    flyTo(stop, ms) {
      return new Promise((res) => {
        const guard = setTimeout(res, ms + 4000);
        map.once('moveend', () => { clearTimeout(guard); res(); });
        map.flyTo({ center: [stop.lon, stop.lat], zoom: stop.zoom, pitch: stop.mlPitch, bearing: 0, duration: ms, essential: true });
      });
    },
    async waitLoaded(timeout) {
      const t0 = performance.now(); let good = 0;
      await sleep(400);
      while (performance.now() - t0 < timeout && !E.stop) {
        good = map.areTilesLoaded() ? good + 1 : 0;
        if (good >= 3) return performance.now() - t0;
        await sleep(100);
      }
      return null;
    },
    loaded: () => map.areTilesLoaded(),
  };
}

/* ------------------------------------------------------ engine tab control */
function populateImagery() {
  const sel = $('#ctl-imagery'); const body = E.kind === 'cesium' ? $('#ctl-body').value : 'earth';
  const prev = sel.value; sel.replaceChildren();
  SOURCES.filter((s) => s.kind === 'tiles' && s.role === 'base' && s.body === body && (E.kind === 'cesium' || s.scheme === 'webmercator'))
    .forEach((s) => sel.append(h('option', { value: s.id, text: s.name.replace(' (verify URL)', '') })));
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  $('#imagery-hint').textContent = E.kind === 'maplibre'
    ? 'MapLibre only reads standard web-map tiles, so the Moon and Mars (equirectangular) layers are Cesium-only.' : '';
}

function syncControlVisibility() {
  const cesium = E.kind === 'cesium';
  const earth = !cesium || $('#ctl-body').value === 'earth';
  $('#row-body').classList.toggle('hidden', !cesium);
  $('#row-terrain').classList.toggle('hidden', !earth);
  $('#row-macro').classList.toggle('hidden', !earth);
  $('#ctl-quakes').closest('label').classList.toggle('hidden', !earth);
  $('#row-token').classList.toggle('hidden', !(cesium && earth && $('#ctl-terrain').checked));
  $('#engine-title').textContent = cesium ? 'Cesium globe (full 3D, any planet)' : 'MapLibre globe (lighter, Earth only)';
}

async function rebuild() {
  if (E.running) return;
  const id = ++E.buildId;
  if (E.adapter) { E.adapter.destroy(); E.adapter = null; }
  $('#viewer').replaceChildren();
  const msg = $('#viewmsg'); msg.classList.remove('hidden'); msg.textContent = 'Loading ' + (E.kind === 'cesium' ? 'Cesium' : 'MapLibre') + '…';
  $('#hud').classList.add('hidden');
  const cfg = readCfg(); E.cfg = cfg;
  Meter.errors = 0;
  try {
    const adapter = await (E.kind === 'cesium' ? createCesium(cfg) : createMapLibre(cfg));
    if (id !== E.buildId) { adapter.destroy(); return; }
    E.adapter = adapter;
    if (adapter.ready) await Promise.race([adapter.ready, sleep(20000)]);
    if (id !== E.buildId) return;
    msg.classList.add('hidden'); $('#hud').classList.remove('hidden');
    $('#btn-start').disabled = false;
    elog(`${adapter.kind} ${adapter.version} ready: ${cfg.body}, ${cfg.profile}, ${cfg.dpr === 'native' ? 'native' : cfg.dpr + '×'} sharpness.`);
  } catch (err) {
    if (id !== E.buildId) return;
    msg.textContent = 'Could not start: ' + err.message;
    $('#btn-start').disabled = true;
    elog(err.message, 'bad');
  }
}

function teardownEngine() {
  E.buildId++;
  if (E.adapter) { E.adapter.destroy(); E.adapter = null; }
  $('#viewer').replaceChildren();
}

/* ---------------------------------------------------------------- the tour */
async function stoppableSleep(ms) {
  const t0 = performance.now();
  while (!E.stop && performance.now() - t0 < ms) await sleep(100);
}

let RUN_COUNTER = 0;
const RUNS = [];

function conditions() {
  return {
    device: $('#cond-device').value, macOS: $('#cond-os').value, power: $('#cond-power').value,
    lowPowerMode: $('#cond-lpm').value, network: $('#cond-net').value, otherApps: $('#cond-other').value, notes: $('#cond-notes').value,
  };
}

async function runTour() {
  if (E.running || !E.adapter) return;
  const cfg = readCfg(); E.cfg = cfg;
  const adapter = E.adapter;
  const stops = WAYPOINTS[cfg.body];
  const run = {
    id: ++RUN_COUNTER, startedAt: new Date().toISOString(), engine: adapter.kind, engineVersion: adapter.version,
    config: { body: cfg.body, imagery: cfg.imagery, terrain: cfg.terrain && (adapter.kind === 'maplibre' || !!cfg.token), quakes: cfg.quakes, macrostrat: cfg.macro,
              profile: cfg.profile, sharpness: cfg.dpr, lengthMin: cfg.durationMs ? cfg.durationMs / 60000 : 'one pass' },
    env: envSnapshot(), conditions: conditions(), flags: [], phaseMap: new Map(), allDts: [],
  };
  E.running = true; E.stop = false; setRunningUI(true);
  Meter.begin(run);
  const heapStart = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null;
  const t0 = performance.now(); run.t0 = t0;
  adapter.resetView(); await sleep(600);
  elog(`Test started: ${stops.length} stops${cfg.durationMs ? ', looping for ' + cfg.durationMs / 60000 + ' min' : ', one pass'}.`);

  tour:
  do {
    for (const stop of stops) {
      if (E.stop || (cfg.durationMs && performance.now() - t0 >= cfg.durationMs)) break tour;
      setState(`Flying to ${stop.name}`);
      Meter.beginPhase(stop.name);
      await adapter.flyTo(stop, CFG.flightMs);
      Meter.endPhase();
      if (E.stop) break tour;
      setState(`Loading tiles at ${stop.name}`);
      const settle = await adapter.waitLoaded(CFG.settleTimeoutMs);
      Meter.phase(stop.name).settle.push(settle);
      if (E.stop) break tour;
      setState(`Viewing ${stop.name}`);
      await stoppableSleep(CFG.dwellMs);
    }
  } while (cfg.durationMs && !E.stop && performance.now() - t0 < cfg.durationMs);

  Meter.end();
  const elapsed = performance.now() - t0;
  finishRun(run, elapsed, heapStart);
  if (E.stop) run.flags.push('Stopped early by user.');
  E.running = false; setRunningUI(false);
  setState(E.stop ? 'Stopped' : 'Test complete');
  elog(`Test ${E.stop ? 'stopped' : 'finished'} — avg ${fmt(run.summary.avgFps)} frames/s while moving. See Results.`);
  RUNS.push(run); renderResults();
  $('#runcount').textContent = `(${RUNS.length})`;
  if (E.adapter === adapter) adapter.resetView();
}

function finishRun(run, elapsedMs, heapStart) {
  const dts = run.allDts; let sum = 0, max = 0;
  for (const d of dts) { sum += d; if (d > max) max = d; }
  const phases = [...run.phaseMap.values()].map((p) => {
    let s = 0, m = 0; for (const d of p.dts) { s += d; if (d > m) m = d; }
    return { name: p.name, frames: p.dts.length, avgFps: p.dts.length ? 1000 / (s / p.dts.length) : null, p95Ms: pct(p.dts, 95), maxMs: m || null,
             stalls: p.stalls, settleMs: p.settle.map((v) => v == null ? null : Math.round(v)) };
  });
  const settles = phases.flatMap((p) => p.settleMs).filter((v) => v != null);
  const timeouts = phases.flatMap((p) => p.settleMs).filter((v) => v == null).length;
  const bins = [...Meter.bins.entries()].sort((a, b) => a[0] - b[0]).filter(([, b]) => b.frames >= 20)
    .map(([i, b]) => ({ minute: (i * Meter.binMs) / 60000, fps: 1000 * b.frames / b.ms }));
  let throttle = null;
  if (bins.length >= 6) {
    const first = bins.slice(0, 2).reduce((a, b) => a + b.fps, 0) / 2;
    const last = bins.slice(-2).reduce((a, b) => a + b.fps, 0) / 2;
    throttle = { firstFps: first, lastFps: last, drop: first > 0 ? 1 - last / first : null, flagged: first > 0 && last < 0.8 * first };
  }
  run.summary = {
    durationS: elapsedMs / 1000, renderedFrames: dts.length, avgFps: dts.length ? 1000 / (sum / dts.length) : null,
    p95FrameMs: pct(dts, 95), p99FrameMs: pct(dts, 99), maxFrameMs: max || null,
    stalls: phases.reduce((a, p) => a + p.stalls, 0), tileErrors: Meter.errors,
    requests: Meter.reqTotal - Meter.reqBase, bytesTransferredKnown: Meter.bytesTotal - Meter.bytesBase,
    settleMedianMs: median(settles), settleMaxMs: settles.length ? Math.max(...settles) : null, settleTimeouts: timeouts,
    heapStartMB: heapStart, heapEndMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
    throttle,
  };
  run.phases = phases; run.bins = bins;
  delete run.phaseMap; delete run.allDts; delete run.t0;
  if (run.summary.tileErrors > 0) run.flags.push(`${run.summary.tileErrors} tile/data error(s) occurred during this run; imagery may be incomplete.`);
  if (run.summary.settleTimeouts > 0) run.flags.push(`${run.summary.settleTimeouts} stop(s) did not finish loading within ${CFG.settleTimeoutMs / 1000} s.`);
  if (throttle && throttle.flagged) run.flags.push(`Possible heat throttling: speed fell from ${fmt(throttle.firstFps)} to ${fmt(throttle.lastFps)} frames/s over the run.`);
  if (!dts.length) run.flags.push('No frames were drawn during the flights, so speed could not be measured. The window was probably minimized or covered; rerun with the page in front.');
  if (run.hiddenDuringRun) run.flags.push('This tab was in the background during the run; browsers slow hidden tabs, so the numbers are unreliable.');
}

document.addEventListener('visibilitychange', () => { if (document.hidden && E.running && Meter.run) Meter.run.hiddenDuringRun = true; });

/* --------------------------------------------------------------------- HUD */
function setState(t) { $('#hud-state').textContent = t; }
function setRunningUI(on) {
  $('#btn-start').disabled = on; $('#btn-stop').disabled = !on;
  $$('#controls select, #controls input, #controls textarea').forEach((n) => { if (!n.closest('details')) n.disabled = on; });
}
setInterval(() => {
  if ($('#tab-engine').classList.contains('hidden') || !E.adapter) return;
  $('#hud-fps').textContent = String(Meter.recent.length && performance.now() - Meter.recent[Meter.recent.length - 1] < 1000 ? Meter.recent.length : 0);
  $('#hud-ms').textContent = Meter.lastDt != null && performance.now() - (Meter.last || 0) < 1000 ? fmt(Meter.lastDt) : '–';
  $('#hud-errors').textContent = String(Meter.errors);
  $('#hud-req').textContent = String(Meter.reqTotal - Meter.reqBase);
  $('#hud-heap').textContent = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/a (Chrome only)';
  $('#hud-elapsed').textContent = E.running && Meter.run ? mmss(performance.now() - Meter.t0) : '–';
}, 500);

/* ----------------------------------------------------------------- results */
function sparkline(bins) {
  if (bins.length < 2) return null;
  const W = 280, H = 48, max = Math.max(...bins.map((b) => b.fps)) * 1.1 || 1;
  const pts = bins.map((b, i) => `${(i / (bins.length - 1) * (W - 8) + 4).toFixed(1)},${(H - 4 - b.fps / max * (H - 8)).toFixed(1)}`).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Frames per second per 30-second slice: ${bins.map((b) => fmt(b.fps, 0)).join(', ')}`);
  const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#0d6a86'); pl.setAttribute('stroke-width', '2');
  svg.append(pl); return svg;
}

function runTitle(r) {
  const eng = r.engine === 'cesium' ? 'Cesium' : 'MapLibre';
  const len = typeof r.config.lengthMin === 'number' ? r.config.lengthMin + ' min' : 'one pass';
  return `Run ${r.id}: ${eng} · ${r.config.body} · ${r.config.profile} · ${len}`;
}

function renderResults() {
  const box = $('#runs'); box.replaceChildren();
  if (!RUNS.length) { box.append(h('p', { class: 'muted', text: 'No runs yet. Open a globe tab and press Start test.' })); $('#md-preview').value = ''; return; }
  for (const r of [...RUNS].reverse()) {
    const s = r.summary;
    const card = h('div', { class: 'card' });
    card.append(h('div', { class: 'runhead' }, h('h2', { text: runTitle(r) }), h('span', { class: 'muted', text: `${r.env.browser} · ${new Date(r.startedAt).toLocaleString()}` })));
    r.flags.forEach((f) => card.append(h('div', { class: 'flag', text: f })));
    const kv = h('dl', { class: 'kv' });
    const add = (k, v) => kv.append(h('dt', { text: k }), h('dd', { text: v }));
    add('Setup', `${r.config.imagery}${r.config.terrain ? ' + terrain' : ''}${r.config.quakes ? ' + quakes' : ''}${r.config.macrostrat ? ' + geologic map' : ''}; sharpness ${r.config.sharpness === 'native' ? 'native' : r.config.sharpness + '×'}`);
    add('Drawing speed while moving', `${fmt(s.avgFps)} frames/s average · 95% of frames faster than ${fmt(s.p95FrameMs)} ms · worst ${fmt(s.maxFrameMs, 0)} ms`);
    add('Stalls (gaps over 1 s)', String(s.stalls));
    add('Time to finish loading a view', s.settleMedianMs != null ? `${fmt(s.settleMedianMs / 1000)} s median, ${fmt(s.settleMaxMs / 1000)} s longest` + (s.settleTimeouts ? `, ${s.settleTimeouts} timed out` : '') : 'no data');
    add('Network', `${s.requests} requests` + (s.bytesTransferredKnown ? `, at least ${(s.bytesTransferredKnown / 1048576).toFixed(1)} MB (sizes of cross-origin files are often hidden)` : ''));
    add('JS memory', s.heapStartMB != null ? `${fmt(s.heapStartMB, 0)} → ${fmt(s.heapEndMB, 0)} MB` : 'n/a (Chrome only; GPU memory cannot be read)');
    add('Test length', `${fmt(s.durationS, 0)} s`);
    const c = r.conditions; const cs = Object.entries(c).filter(([, v]) => v && v !== 'Unknown').map(([k, v]) => `${k}: ${v}`).join(' · ');
    add('Conditions', cs || 'none recorded');
    card.append(kv);
    const sp = sparkline(r.bins);
    if (sp) { card.append(h('h3', { text: 'Speed over time (frames/s per 30 s)' }), sp); }
    const tbl = h('table', null, h('thead', null, h('tr', null, h('th', { text: 'Stop' }), h('th', { class: 'num', text: 'Frames/s' }), h('th', { class: 'num', text: 'p95 ms' }), h('th', { class: 'num', text: 'Worst ms' }), h('th', { class: 'num', text: 'Stalls' }), h('th', { text: 'Load time per visit (s)' }))));
    const tb = h('tbody');
    r.phases.forEach((p) => tb.append(h('tr', null, h('td', { text: p.name }), h('td', { class: 'num', text: fmt(p.avgFps) }), h('td', { class: 'num', text: fmt(p.p95Ms) }), h('td', { class: 'num', text: fmt(p.maxMs, 0) }), h('td', { class: 'num', text: String(p.stalls) }), h('td', { text: p.settleMs.map((v) => v == null ? 'timeout' : (v / 1000).toFixed(1)).join(', ') }))));
    tbl.append(tb); card.append(h('h3', { text: 'By stop' }), h('div', { style: 'overflow:auto' }, tbl));
    box.append(card);
  }
  $('#md-preview').value = toMarkdown();
}

function toMarkdown() {
  if (!RUNS.length) return '';
  const e = RUNS[0].env;
  const lines = [`## Globe benchmark — ${new Date().toLocaleDateString()}`, '',
    `Device: ${RUNS[0].conditions.device || 'unlabeled'} · ${e.browser} · ${e.platform} · ${e.screen} @ ${e.devicePixelRatio}× · GPU: ${e.gl.renderer || 'n/a'}`, '',
    '| # | Engine | Body | Profile | Sharpness | Length | Frames/s | p95 ms | Stalls | Load s (median) | Errors | Notes |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of RUNS) {
    const s = r.summary;
    lines.push(`| ${r.id} | ${r.engine} | ${r.config.body} | ${r.config.profile} | ${r.config.sharpness} | ${typeof r.config.lengthMin === 'number' ? r.config.lengthMin + ' min' : '1 pass'} | ${fmt(s.avgFps)} | ${fmt(s.p95FrameMs)} | ${s.stalls} | ${fmt(s.settleMedianMs != null ? s.settleMedianMs / 1000 : null)} | ${s.tileErrors} | ${r.flags.map((f) => f.replace(/\|/g, '/')).join(' ')} |`);
  }
  const src = [...SRC_STATE.entries()];
  if (src.length) {
    lines.push('', '### Data source checks', '', '| Source | Status | Median | Result |', '|---|---|---|---|');
    for (const [id, r] of src) lines.push(`| ${srcById(id).name} | ${r.status} | ${r.medianMs != null ? Math.round(r.medianMs) + ' ms' : '–'} | ${r.summary.replace(/\|/g, '/')} |`);
  }
  return lines.join('\n');
}

function exportJson() {
  return JSON.stringify({ generated: new Date().toISOString(), runs: RUNS, sources: Object.fromEntries(SRC_STATE) }, null, 2);
}
async function copyText(text, label) {
  const note = $('#export-status');
  try { await navigator.clipboard.writeText(text); note.textContent = label + ' copied.'; }
  catch (e) {
    const ta = $('#md-preview'); ta.value = text; ta.select();
    note.textContent = 'Copy blocked by the browser: the text is selected below, press ⌘C.';
  }
}

/* ------------------------------------------------------------------- tabs */
const ENGINE_TABS = ['cesium', 'maplibre'];
let currentTab = 'env';

async function showTab(name) {
  if (E.running) {
    E.stop = true; if (E.adapter) E.adapter.cancel();
    for (let i = 0; i < 100 && E.running; i++) await sleep(100);   // wait up to 10 s for the run to wind down
  }
  const leavingEngine = ENGINE_TABS.includes(currentTab) && currentTab !== name;
  currentTab = name;
  $$('nav button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  const isEngine = ENGINE_TABS.includes(name);
  $('#tab-env').classList.toggle('hidden', name !== 'env');
  $('#tab-sources').classList.toggle('hidden', name !== 'sources');
  $('#tab-results').classList.toggle('hidden', name !== 'results');
  $('#tab-engine').classList.toggle('hidden', !isEngine);
  if (leavingEngine || (isEngine && E.kind !== name)) teardownEngine();
  if (isEngine) {
    E.kind = name;
    populateImagery(); syncControlVisibility();
    $('#log').replaceChildren();
    await rebuild();
  } else if (name === 'results') { renderResults(); }
}

function wire() {
  $$('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#btn-runall').addEventListener('click', runAllSources);
  $('#btn-start').addEventListener('click', runTour);
  $('#btn-stop').addEventListener('click', () => { E.stop = true; if (E.adapter) E.adapter.cancel(); });
  $('#btn-view-results').addEventListener('click', () => showTab('results'));
  $('#btn-copy-md').addEventListener('click', () => copyText(toMarkdown(), 'Markdown'));
  $('#btn-copy-json').addEventListener('click', () => copyText(exportJson(), 'JSON'));
  $('#btn-dl-json').addEventListener('click', () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' })), download: `globe-phase0-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  });

  // Rebuild the globe whenever a setting changes (debounced so quick clicks don't thrash the GPU).
  let t = null;
  const onChange = () => { syncControlVisibility(); clearTimeout(t); t = setTimeout(rebuild, 250); };
  $('#ctl-body').addEventListener('change', () => { populateImagery(); onChange(); });
  ['#ctl-imagery', '#ctl-terrain', '#ctl-quakes', '#ctl-macro', '#ctl-dpr'].forEach((s) => $(s).addEventListener('change', onChange));
  $$('input[name=profile]').forEach((r) => r.addEventListener('change', onChange));
  $('#ctl-token').addEventListener('change', () => { try { sessionStorage.setItem('p0-token', $('#ctl-token').value); } catch (e) { /* storage blocked */ } if ($('#ctl-terrain').checked) onChange(); });

  // Remember test conditions for this tab session (sessionStorage; may be unavailable).
  const condIds = ['device', 'os', 'power', 'lpm', 'net', 'other', 'notes'];
  try {
    const saved = JSON.parse(sessionStorage.getItem('p0-cond') || '{}');
    condIds.forEach((k) => { if (saved[k] != null) $('#cond-' + k).value = saved[k]; });
    const tok = sessionStorage.getItem('p0-token'); if (tok) $('#ctl-token').value = tok;
  } catch (e) { /* ignore */ }
  condIds.forEach((k) => $('#cond-' + k).addEventListener('change', () => {
    try { const o = {}; condIds.forEach((x) => { o[x] = $('#cond-' + x).value; }); sessionStorage.setItem('p0-cond', JSON.stringify(o)); } catch (e) { /* ignore */ }
  }));
}

renderEnv();
renderSourceTable();
wire();
