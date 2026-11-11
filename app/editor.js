/* ============================================================================
   Geoscience Globe — lesson editor.
   Loaded only when the page address has ?edit added (the /editor/ page sends
   teachers there). It adds an Editor tab for writing a lesson without touching
   the lesson file by hand: set up the globe, press a button to store that view
   as a stop, type the reading and questions, preview, and save the file.

   The draft is kept in this browser (localStorage) so a reload does not lose it.
   Nothing is sent anywhere; "Save lesson file" downloads the file.
   File format: docs/activities.md.
   ========================================================================== */
'use strict';
(() => {
  const G = window.geoGlobe.api, el = G.el;
  const $ = (sel) => document.querySelector(sel);
  const pane = $('#pane-editor');
  const STORE = 'gg-editor-draft';
  const ID_OK = /^[a-z0-9-]{1,60}$/;

  // The lesson being edited. `id` is the file name without ".json".
  let draft = blank();
  let sel = 0;                         // which stop is open in the form

  function blank() { return { id: '', idTouched: false, title: '', minutes: 15, summary: '', order: 100, standards: [], stops: [] }; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ draft, sel })); } catch (e) { /* storage unavailable */ } }
  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (d && d.draft && Array.isArray(d.draft.stops)) { draft = Object.assign(blank(), d.draft); sel = d.sel || 0; }
    } catch (e) { /* start blank */ }
  }
  const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  // Turn whatever was loaded into a clean draft (unknown fields are dropped, text is kept as text).
  function fromFile(obj, id) {
    const d = blank();
    d.id = ID_OK.test(id) ? id : slug(id); d.idTouched = true;
    d.title = String(obj.title || ''); d.summary = String(obj.summary || '');
    d.minutes = Number(obj.minutes) > 0 ? Math.round(Number(obj.minutes)) : 15;
    d.order = Number.isFinite(Number(obj.order)) ? Number(obj.order) : 100;
    d.standards = Array.isArray(obj.standards) ? obj.standards.map(String) : [];
    d.stops = (Array.isArray(obj.stops) ? obj.stops : []).map((st) => ({
      title: String(st.title || ''), body: String(st.body || 'earth'), base: String(st.base || ''),
      layers: Array.isArray(st.layers) ? st.layers.map(String) : [], terrain: !!st.terrain,
      view: st.view && typeof st.view === 'object' ? st.view : null,
      text: String(st.text || ''), questions: Array.isArray(st.questions) ? st.questions.map(String) : [],
    }));
    return d;
  }
  // The lesson exactly as it is written to the file.
  function toFile() {
    return {
      title: draft.title.trim(), minutes: draft.minutes, summary: draft.summary.trim(), order: draft.order, standards: draft.standards,
      stops: draft.stops.map((st) => ({
        title: st.title.trim(), body: st.body, base: st.base, layers: st.layers, terrain: st.terrain, view: st.view,
        text: st.text.trim(), questions: st.questions.map((q) => q.trim()).filter(Boolean),
      })),
    };
  }

  /* ------------------------------------------------------------ describing a stop's view in words */
  function viewWords(st) {
    const w = WORLDS[st.body];
    if (!w || !st.view) return 'No view stored yet.';
    const base = w.base.find((b) => b.id === st.base);
    const layers = st.layers.map((item) => { const o = w.overlays.find((x) => x.id === item.split('.')[0]); return o ? o.name : null; }).filter(Boolean);
    const v = st.view;
    const where = `${Math.abs(v.lat).toFixed(1)}° ${v.lat >= 0 ? 'N' : 'S'}, ${Math.abs(v.lon).toFixed(1)}° ${v.lon >= 0 ? 'E' : 'W'}`;
    const far = v.range == null ? 'whole globe' : v.range >= 1e6 ? `from ${(v.range / 1e6).toFixed(1)} thousand km` : `from ${Math.round(v.range / 1000)} km`;
    return [w.name, base ? base.name : null, layers.length ? layers.join(', ') : 'nothing added', st.terrain ? '3D terrain' : null, `${where}, ${far}`]
      .filter(Boolean).join(' · ');
  }

  /* ------------------------------------------------------------ checks */
  function problems() {
    const stop = [], warn = [];
    if (!draft.title.trim()) stop.push('Give the lesson a title.');
    if (!ID_OK.test(draft.id)) stop.push('The file name can only use lowercase letters, numbers and hyphens.');
    if (!draft.stops.length) stop.push('Add at least one stop.');
    draft.stops.forEach((st, i) => {
      const n = `Stop ${i + 1}`;
      if (!st.view) stop.push(`${n} has no view stored.`);
      if (!st.title.trim()) warn.push(`${n} has no title.`);
      if (!st.text.trim()) warn.push(`${n} has no reading.`);
      if (!st.questions.some((q) => q.trim())) warn.push(`${n} has no question.`);
    });
    if (!draft.summary.trim()) warn.push('The lesson has no one-line summary for the lesson list.');
    return { stop, warn };
  }

  /* ------------------------------------------------------------ actions */
  let note = '';
  const say = (text) => { note = text; const n = $('#ed-note'); if (n) n.textContent = text; };

  function addStop() {
    if (!G.ready) return;
    draft.stops.push(Object.assign({ title: '', text: '', questions: [''] }, G.captureStop()));
    sel = draft.stops.length - 1;
    save(); render();
    say(`Stop ${sel + 1} added with the view the globe is showing now.`);
    const t = $('#ed-stop-title'); if (t) t.focus();
  }
  function recapture() {
    Object.assign(draft.stops[sel], G.captureStop());
    save(); render();
    say(`Stop ${sel + 1} now uses the view the globe is showing.`);
  }
  function moveStop(i, by) {
    const j = i + by;
    if (j < 0 || j >= draft.stops.length) return;
    [draft.stops[i], draft.stops[j]] = [draft.stops[j], draft.stops[i]];
    if (sel === i) sel = j; else if (sel === j) sel = i;
    save(); render();
  }
  function deleteStop(i) {
    const st = draft.stops[i];
    if ((st.text.trim() || st.questions.some((q) => q.trim())) && !window.confirm(`Delete stop ${i + 1}${st.title ? ' (' + st.title + ')' : ''}? Its reading and questions will be lost.`)) return;
    draft.stops.splice(i, 1);
    sel = Math.max(0, Math.min(sel, draft.stops.length - 1));
    save(); render();
  }
  function preview() {
    const p = problems();
    if (!draft.stops.length || draft.stops.some((st) => !st.view)) { say(p.stop.join(' ')); return; }
    G.openLesson(Object.assign(toFile(), { id: 'preview', preview: true, title: draft.title.trim() || 'Untitled lesson' }), sel + 1, false);
  }
  function download() {
    const p = problems();
    if (p.stop.length) { say('Not saved yet. ' + p.stop.join(' ')); return; }
    const text = JSON.stringify(toFile(), null, 2) + '\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = el('a', { href: url, download: draft.id + '.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    say(`Saved ${draft.id}.json to your Downloads folder. To put it on the site, follow the steps under "Put this lesson on the site".`);
  }
  // A link that carries the whole lesson, so it can be used without adding it to the site.
  async function copyLink() {
    const p = problems();
    if (!draft.stops.length || draft.stops.some((st) => !st.view) || !draft.title.trim()) { say('No link yet. ' + p.stop.filter((t) => !t.includes('file name')).join(' ')); return; }
    const f = toFile();
    const data = await G.packLesson({ title: f.title, stops: f.stops });
    const url = location.origin + location.pathname + '#lesson=' + data;
    const size = url.length.toLocaleString('en-US');
    const long = url.length > 8000 ? ' It is very long, and some apps cut long links short: test it where you plan to post it.' : '';
    const done = `Anyone who opens it gets this lesson. It is not added to the site's lesson list, and it will not change if you edit the lesson later.${long}`;
    const box = $('#ed-link');
    const fallback = () => { box.hidden = false; box.value = url; box.focus(); box.select(); say(`Copy the link in the box (Command + C). It is ${size} characters long. ${done}`); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => { box.hidden = true; say(`Link copied (${size} characters). ${done}`); }, fallback);
    } else fallback();
  }

  function startNew() {
    if (draft.stops.length && !window.confirm('Start a new lesson? The one in the editor will be cleared. Save it first if you want to keep it.')) return;
    draft = blank(); sel = 0; save(); render(); say('New lesson started.');
  }
  function load(obj, id, from) {
    if (!obj || !Array.isArray(obj.stops)) { say('That file is not a lesson file.'); return; }
    draft = fromFile(obj, id); sel = 0; save(); render();
    say(`Opened "${draft.title || id}" from ${from}. Saving with the same file name will replace it on the site.`);
    if (draft.stops.length) G.applyStopDef(draft.stops[0]);
  }
  function openFromSite(id) {
    if (!id) return;
    if (draft.stops.length && !window.confirm('Open this lesson? The one in the editor will be replaced.')) { render(); return; }
    G.getJson(APP.activitiesIndex.replace(/[^/]*$/, '') + id + '.json', true).then((obj) => load(obj, id, 'the site'), () => say('That lesson could not be loaded.'));
  }
  function openFromFile(file) {
    if (!file) return;
    if (draft.stops.length && !window.confirm('Open this file? The lesson in the editor will be replaced.')) return;
    const r = new FileReader();
    r.onload = () => { try { load(JSON.parse(String(r.result)), file.name.replace(/\.json$/i, ''), 'your computer'); } catch (e) { say('That file could not be read as a lesson.'); } };
    r.onerror = () => say('That file could not be read.');
    r.readAsText(file);
  }

  /* ------------------------------------------------------------ the form */
  const field = (label, control, hint) => el('label', { class: 'ed-field' }, el('span', { text: label }), control, hint ? el('span', { class: 'fine', text: hint }) : null);
  function textInput(value, onInput, attrs) {
    const i = el('input', Object.assign({ type: 'text', autocomplete: 'off' }, attrs || {}));
    i.value = value;
    i.addEventListener('input', () => { onInput(i.value); save(); refreshChecks(); });
    return i;
  }
  function textArea(value, onInput, attrs) {
    const t = el('textarea', Object.assign({ rows: 4 }, attrs || {}));
    t.value = value;
    t.addEventListener('input', () => { onInput(t.value); save(); refreshChecks(); });
    return t;
  }

  function refreshChecks() {
    const box = $('#ed-checks'); if (!box) return;
    const p = problems(); box.textContent = '';
    if (!p.stop.length && !p.warn.length) { box.append(el('li', { class: 'ok', text: 'Ready to save.' })); return; }
    p.stop.forEach((t) => box.append(el('li', { class: 'stop', text: t })));
    p.warn.forEach((t) => box.append(el('li', { text: t })));
  }

  function render() {
    pane.textContent = '';

    // ---- open / new
    const pick = el('select', { 'aria-label': 'Open a lesson from the site' }, el('option', { value: '', text: 'Open a lesson from the site…' }),
      ...G.lessons.map((a) => el('option', { value: a.id, text: a.title })));
    pick.addEventListener('change', () => openFromSite(pick.value));
    const fileBox = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    fileBox.addEventListener('change', () => { openFromFile(fileBox.files[0]); fileBox.value = ''; });
    pane.append(el('section', null,
      el('h2', { text: 'Lesson editor' }),
      el('p', { class: 'fine', text: 'Set up the globe on the Controls tab, then add a stop here. Your draft is kept in this browser until you save the file.' }),
      el('div', { class: 'ed-row' },
        el('button', { type: 'button', text: 'New lesson', onclick: startNew }),
        el('button', { type: 'button', text: 'Open a file…', onclick: () => fileBox.click() }), fileBox),
      pick));

    // ---- lesson details
    const idBox = textInput(draft.id, (v) => { draft.id = v.trim(); draft.idTouched = true; }, { id: 'ed-id', maxlength: 60, spellcheck: 'false' });
    pane.append(el('section', null,
      el('h2', { text: 'About the lesson' }),
      field('Title', textInput(draft.title, (v) => {
        draft.title = v;
        if (!draft.idTouched) { draft.id = slug(v); idBox.value = draft.id; }
      }, { maxlength: 80 })),
      field('One-line summary', textInput(draft.summary, (v) => { draft.summary = v; }, { maxlength: 120 }), 'Shown under the title in the lesson list.'),
      el('div', { class: 'ed-two' },
        field('Minutes', (() => { const i = el('input', { type: 'number', min: 1, max: 120 }); i.value = draft.minutes; i.addEventListener('input', () => { draft.minutes = Math.max(1, Math.round(Number(i.value) || 15)); save(); }); return i; })()),
        field('Place in the list', (() => { const i = el('input', { type: 'number', min: 0, max: 999 }); i.value = draft.order; i.addEventListener('input', () => { draft.order = Number(i.value) || 0; save(); }); return i; })())),
      el('p', { class: 'fine', text: 'Lessons with a lower "place" number come first in the list.' }),
      field('File name', idBox, 'Lowercase letters, numbers and hyphens. It becomes the lesson\'s link.')));

    // ---- stops
    const list = el('ol', { class: 'ed-stops' });
    draft.stops.forEach((st, i) => {
      list.append(el('li', { class: i === sel ? 'on' : '' },
        el('button', { type: 'button', class: 'ed-pick', 'aria-current': i === sel ? 'true' : null, text: `${i + 1}. ${st.title || 'Untitled stop'}`,
          onclick: () => { sel = i; save(); render(); if (st.view) G.applyStopDef(st); } }),
        el('button', { type: 'button', class: 'ed-mini', 'aria-label': `Move stop ${i + 1} up`, title: 'Move up', disabled: i === 0, text: '↑', onclick: () => moveStop(i, -1) }),
        el('button', { type: 'button', class: 'ed-mini', 'aria-label': `Move stop ${i + 1} down`, title: 'Move down', disabled: i === draft.stops.length - 1, text: '↓', onclick: () => moveStop(i, 1) }),
        el('button', { type: 'button', class: 'ed-mini', 'aria-label': `Delete stop ${i + 1}`, title: 'Delete', text: '×', onclick: () => deleteStop(i) })));
    });
    pane.append(el('section', null,
      el('h2', { text: 'Stops' }),
      draft.stops.length ? list : el('p', { class: 'fine', text: 'No stops yet. Move the globe to the first view you want students to see, then press the button.' }),
      el('button', { type: 'button', class: 'primary', text: 'Add a stop with the current view', onclick: addStop })));

    // ---- the selected stop
    const st = draft.stops[sel];
    if (st) {
      const qs = el('div', { class: 'ed-questions' });
      st.questions.forEach((q, qi) => {
        qs.append(el('div', { class: 'ed-q' },
          textArea(q, (v) => { st.questions[qi] = v; }, { rows: 2, 'aria-label': `Question ${qi + 1}`, placeholder: `Question ${qi + 1}` }),
          el('button', { type: 'button', class: 'ed-mini', 'aria-label': `Remove question ${qi + 1}`, title: 'Remove', text: '×',
            onclick: () => { st.questions.splice(qi, 1); save(); render(); } })));
      });
      pane.append(el('section', null,
        el('h2', { text: `Stop ${sel + 1}` }),
        field('Stop title', textInput(st.title, (v) => { st.title = v; const b = pane.querySelector('.ed-stops li.on .ed-pick'); if (b) b.textContent = `${sel + 1}. ${v || 'Untitled stop'}`; }, { id: 'ed-stop-title', maxlength: 80 })),
        el('p', { class: 'ed-view', text: viewWords(st) }),
        el('div', { class: 'ed-row' },
          el('button', { type: 'button', text: 'Use the current view', title: 'Store what the globe is showing now as this stop\'s view', onclick: recapture }),
          el('button', { type: 'button', text: 'Show this view', disabled: !st.view, onclick: () => G.applyStopDef(st) })),
        field('Reading', textArea(st.text, (v) => { st.text = v; }, { rows: 7 }), 'Leave a blank line between paragraphs.'),
        el('span', { class: 'ed-label', text: 'Questions' }), qs,
        el('button', { type: 'button', text: 'Add a question', onclick: () => { st.questions.push(''); save(); render(); const all = pane.querySelectorAll('.ed-q textarea'); if (all.length) all[all.length - 1].focus(); } })));
    }

    // ---- finish
    pane.append(el('section', null,
      el('h2', { text: 'Check and save' }),
      el('ul', { id: 'ed-checks', class: 'ed-checks' }),
      el('div', { class: 'ed-row' },
        el('button', { type: 'button', text: 'Preview as a student', onclick: preview }),
        el('button', { type: 'button', class: 'primary', text: 'Save lesson file', onclick: download })),
      el('div', { class: 'ed-row' },
        el('button', { type: 'button', text: 'Copy a link that runs this lesson', title: 'Use the lesson without adding it to the site', onclick: copyLink })),
      el('p', { id: 'ed-note', class: 'fine', role: 'status', text: note }),
      el('textarea', { id: 'ed-link', readonly: true, hidden: true, rows: 3, 'aria-label': 'Link that runs this lesson' }),
      el('details', { class: 'ed-help' },
        el('summary', { text: 'Put this lesson on the site' }),
        el('ol', null,
          el('li', { text: 'Press "Save lesson file". The file goes to your Downloads folder.' }),
          el('li', null, 'Open the ', el('a', { href: APP.lessonUploadUrl, target: '_blank', rel: 'noopener noreferrer', text: 'lessons folder on GitHub' }), ' and sign in.'),
          el('li', { text: 'Drag the file onto that page, then press the green "Commit changes" button.' }),
          el('li', { text: 'Wait about a minute, then reload the site. The lesson appears in the lesson list.' })),
        el('p', { class: 'fine', text: 'To change a lesson that is already on the site, open it here, edit it, save it with the same file name, and upload it the same way.' }))));
    refreshChecks();
  }

  /* ------------------------------------------------------------ start */
  restore();
  $('#tab-editor').hidden = false;
  $('#tab-editor').addEventListener('click', () => G.setTab('editor'));
  document.title = 'Lesson editor · Geoscience Globe';
  render();
  if (!$('#app').classList.contains('in-activity')) G.setTab('editor');
})();
