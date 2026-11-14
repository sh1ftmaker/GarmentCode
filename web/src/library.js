// "My designs": the user's library of saved designs (localStorage, see state.js `saves`).
// An entry is { id, name, ts, updated?, thumb, state } where `state` is the compact snapshot
// ({ v, s?, d, b, m, f, g?, c?, ... }). Snapshots are stored and passed around opaquely:
// fields this module doesn't know (e.g. `c`, custom pattern-editor designs) are kept as-is.
// Files: <name>.gcdesign.json = { format: 'gcdesign', version: 1, name, saved, thumb, snapshot }
// or a whole-library backup { format: 'gcdesign-library', version: 1, designs: [...] }.
import { saves, prefs, SAVES_MAX } from './state.js';

const FORMAT = 'gcdesign', LIB_FORMAT = 'gcdesign-library', FILE_VERSION = 1;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtDate = (ts) => { try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const FULL_MSG = 'Couldn’t save: this browser’s storage is full or blocked. Export some designs to files (⋯ › Export) and delete them, then try again.';

let api = null;
// The library design the current state came from: { id, base } (base: compact JSON right
// after opening/saving; null while unknown = not edited). Kept in prefs across reloads.
let cur = null;

/**
 * api: { compact() -> current compact snapshot, thumb() -> data URL, open(compact) -> Promise,
 *        title() -> name of the current design, refresh() -> re-render the current-design card,
 *        openGallery(kind), sourceName(compact) -> 'GarmentCode' | FreeSewing design name }
 */
export function initLibrary(a) {
  api = a;
  const p = prefs.get().lib;
  if (p?.id && saves.list().some(e => e.id === p.id)) cur = { id: p.id, base: p.base ?? null };
}
const persist = () => prefs.set({ lib: cur ? { id: cur.id, base: cur.base } : null });
export const list = () => saves.list();
const find = (id) => saves.list().find(e => e.id === id);
export function current() { return cur ? find(cur.id) || null : null; }
export function detach() { if (cur) { cur = null; persist(); } }
export function isEdited() {
  if (!cur || cur.base == null || !api) return false;
  try { return JSON.stringify(api.compact()) !== cur.base; } catch { return false; }
}

// ---------------------------------------------------------------- storage operations
function store(l) {
  if (saves.setAll(l)) return true;
  toastMsg(FULL_MSG, 8000);
  return false;
}
function uniqueName(name, exceptId) {
  const names = new Set(saves.list().filter(e => e.id !== exceptId).map(e => e.name));
  if (!names.has(name)) return name;
  const stem = name.replace(/ \d+$/, '');
  for (let i = 2; ; i++) if (!names.has(`${stem} ${i}`)) return `${stem} ${i}`;
}
/**
 * Small 4:5 thumbnail for storage (~5-15 kB): the middle of the 3D view (or an image data URL),
 * kept transparent so it sits on the card colour in light and dark mode.
 */
async function smallThumb(src) {
  if (!src) return '';
  try {
    let img = src;
    if (typeof src === 'string') { img = new Image(); img.src = src; await img.decode(); }
    const W = img.width, H = img.height;
    let ch = H * 0.94, cw = ch * 0.8;
    if (cw > W) { cw = W; ch = cw / 0.8; }
    const cv = document.createElement('canvas');
    cv.width = 160; cv.height = 200;
    cv.getContext('2d').drawImage(img, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, 160, 200);
    const webp = cv.toDataURL('image/webp', 0.85);
    return webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/png');
  } catch { return typeof src === 'string' ? src : ''; }
}
function addEntries(entries, { at = 0 } = {}) {
  const l = saves.list();
  if (l.length + entries.length > SAVES_MAX) { toastMsg(`My designs holds up to ${SAVES_MAX} designs. Export and delete some first.`, 6000); return false; }
  l.splice(at, 0, ...entries);
  return store(l);
}

/** Save the current design as a new library entry and make it the current one. */
export async function saveNew(name) {
  const state = api.compact();
  const e = { id: uid(), name: uniqueName((name || '').trim() || api.title() || 'My design'), ts: Date.now(), thumb: await smallThumb(api.thumb()), state };
  if (!addEntries([e])) return null;
  cur = { id: e.id, base: JSON.stringify(state) }; persist();
  api.refresh();
  toastMsg(`Saved “${e.name}” to My designs`);
  return e;
}
/** Overwrite the current library entry with the current design. */
export async function saveCurrent() {
  const e = current();
  if (!e) return null;
  const state = api.compact();
  const l = saves.list(), i = l.findIndex(x => x.id === e.id);
  l[i] = { ...l[i], state, thumb: await smallThumb(api.thumb()), updated: Date.now() };
  if (!store(l)) return null;
  cur.base = JSON.stringify(state); persist();
  api.refresh();
  toastMsg(`Saved changes to “${e.name}”`);
  return l[i];
}
export async function open(id) {
  const e = find(id);
  if (!e) return;
  cur = { id, base: null }; persist();
  try { await api.open(e.state); } catch (err) { detach(); api.refresh(); throw err; }
  if (cur?.id === id) { cur.base = JSON.stringify(api.compact()); persist(); }
  api.refresh();
}
function rename(id, name) {
  name = name.trim();
  const l = saves.list(), e = l.find(x => x.id === id);
  if (!e || !name || name === e.name) return;
  e.name = uniqueName(name, id);
  store(l);
  api.refresh();
}
function duplicate(id) {
  const l = saves.list(), i = l.findIndex(x => x.id === id);
  if (i < 0) return;
  const e = l[i];
  addEntries([{ ...JSON.parse(JSON.stringify(e)), id: uid(), name: uniqueName(`${e.name} copy`), ts: Date.now(), updated: undefined }], { at: i + 1 });
}
function remove(id, rerender) {
  const l = saves.list(), i = l.findIndex(x => x.id === id);
  if (i < 0) return;
  const [e] = l.splice(i, 1);
  const wasCur = cur?.id === id ? { ...cur } : null;
  if (!store(l)) return;
  if (wasCur) detach();
  api.refresh(); rerender();
  toastMsg(`Deleted “${e.name}”`, 7000, { label: 'Undo', run: () => {
    const l2 = saves.list();
    l2.splice(Math.min(i, l2.length), 0, e);
    if (!store(l2)) return;
    if (wasCur) { cur = wasCur; persist(); }
    api.refresh(); rerender();
  } });
}

// ---------------------------------------------------------------- files
const fileName = (name) => `${(name || 'design').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'design'}.gcdesign.json`;
const fileRecord = (e) => ({ format: FORMAT, version: FILE_VERSION, app: 'GarmentCode 3D Studio', name: e.name, saved: new Date(e.updated || e.ts || Date.now()).toISOString(), thumb: e.thumb || '', snapshot: e.state });
function download(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function exportEntry(id) { const e = find(id); if (e) download(fileName(e.name), fileRecord(e)); }
export async function exportCurrent() {
  const e = current();
  const name = e?.name || api.title() || 'design';
  download(fileName(name), fileRecord({ name, ts: Date.now(), thumb: await smallThumb(api.thumb()), state: api.compact() }));
}
export function exportAll() {
  const l = saves.list();
  if (!l.length) return;
  download(`my-designs-${new Date().toISOString().slice(0, 10)}.gcdesign.json`, { format: LIB_FORMAT, version: FILE_VERSION, app: 'GarmentCode 3D Studio', designs: l.map(fileRecord) });
}
const isSnapshot = (s) => s && typeof s === 'object' && !Array.isArray(s) && (typeof s.d === 'object' || typeof s.c === 'object' || 'b' in s);
/** Design records in a parsed file, or null when it isn't a design file. */
function recordsOf(obj, fname) {
  const one = (r) => {
    if (r?.format === FORMAT && isSnapshot(r.snapshot)) return { name: r.name, thumb: r.thumb, state: r.snapshot, ts: Date.parse(r.saved) || Date.now() };
    if (isSnapshot(r?.state) && 'name' in r) return { name: r.name, thumb: r.thumb, state: r.state, ts: r.ts || Date.now() };   // a raw library entry
    return null;
  };
  if (obj?.format === LIB_FORMAT && Array.isArray(obj.designs)) return obj.designs.map(one).filter(Boolean);
  if (Array.isArray(obj)) { const r = obj.map(one).filter(Boolean); return r.length ? r : null; }
  const r = one(obj);
  if (r) return [r];
  if (isSnapshot(obj) && 'v' in obj) return [{ name: (fname || 'Imported design').replace(/(\.gcdesign)?\.json$/i, ''), thumb: '', state: obj, ts: Date.now() }];   // bare compact snapshot
  return null;
}
/**
 * Import design file text. Returns the number of designs added (0 when none could be stored),
 * or null when the text isn't a design file (so the caller can try other formats).
 */
export function importText(text, fname, { openIt = false } = {}) {
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  const recs = recordsOf(obj, fname);
  if (!recs) return null;
  if (!recs.length) throw new Error('The file has no designs in it.');
  const entries = recs.map(r => ({ id: uid(), name: uniqueName(String(r.name || 'Imported design').slice(0, 120)), ts: r.ts, thumb: typeof r.thumb === 'string' && r.thumb.startsWith('data:image/') ? r.thumb : '', state: r.state }));
  // names must also be unique among themselves
  const seen = new Set();
  for (const e of entries) { let n = e.name, i = 2; while (seen.has(n)) n = `${e.name} ${i++}`; e.name = n; seen.add(n); }
  if (!addEntries(entries)) return 0;
  toastMsg(entries.length === 1 ? `Imported “${entries[0].name}” into My designs` : `Imported ${entries.length} designs into My designs`);
  if (openIt && entries.length === 1) open(entries[0].id);
  return entries.length;
}
let importInput = null;
/** Pick design files and import them; `done` runs afterwards (e.g. to re-render the gallery). */
export function pickImport(done) {
  if (!importInput) {
    importInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', multiple: true, hidden: true });
    document.body.append(importInput);
  }
  importInput.onchange = async () => {
    let n = 0;
    for (const f of importInput.files) {
      try {
        const r = importText(await f.text(), f.name);
        if (r === null) toastMsg(`${f.name} isn’t a GarmentCode 3D Studio design file.`, 5000); else n += r;
      } catch (err) { toastMsg(`Could not import ${f.name}: ${err.message}`, 5000); }
    }
    importInput.value = '';
    if (n) done?.();
  };
  importInput.click();
}

// ---------------------------------------------------------------- small UI helpers
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const svgIcon = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = `<path d="${d}"/>`; return s; };
const ICON = {
  rename: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  dup: 'M8 8h11v11H8zM5 16V5h11',
  export: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  del: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  import: 'M12 15V4M7 9l5-5 5 5M5 20h14',
};

let toastTimer = null;
function toastMsg(text, ms = 3500, action = null) {
  let t = document.getElementById('lib-toast');
  if (!t) { t = h('div', { id: 'lib-toast', class: 'lib-toast', role: 'status' }); }
  // inside an open modal dialog (top layer) the toast must live in the dialog to be visible
  (document.querySelector('dialog[open]') || document.body).append(t);
  t.innerHTML = '';
  t.append(h('span', {}, text));
  if (action) t.append(h('button', { class: 'btn ghost', onclick: () => { t.hidden = true; action.run(); } }, action.label));
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
export { toastMsg as libToast };

// ---------------------------------------------------------------- current-design card
/** Overlay the current-design card when the design is one of "My designs", and add the save row. */
export function decorateCard() {
  const card = document.getElementById('current-design');
  if (!card || !api) return;
  const e = current(), edited = e && isEdited();
  if (e) {
    card.classList.add('mine');
    document.getElementById('cd-kicker').innerHTML = `My design${edited ? ' <span class="pill flat">edited</span>' : ''}`;
    document.getElementById('cd-name').textContent = e.name;
    document.getElementById('cd-desc').textContent = `${api.sourceName(e.state)} · saved ${fmtDate(e.updated || e.ts)}`;
    if (e.thumb) { const th = document.getElementById('cd-thumb'); th.innerHTML = ''; th.append(h('img', { src: e.thumb, alt: '' })); }
  } else card.classList.remove('mine');
  let row = card.querySelector('.cd-lib');
  if (row?.dataset.naming) return;   // keep the name prompt open while the user types
  if (!row) { row = h('div', { class: 'cd-lib' }); card.append(row); }
  row.innerHTML = '';
  if (e) {
    row.append(
      h('button', { class: 'btn' + (edited ? ' accent' : ''), disabled: !edited, title: edited ? `Overwrite “${e.name}” with your changes` : 'No changes since it was saved', onclick: () => saveCurrent() }, edited ? 'Save changes' : 'Saved'),
      h('button', { class: 'btn ghost', onclick: () => namePrompt(row, `${e.name} copy`) }, 'Save as new'));
  } else {
    row.append(h('button', { class: 'btn', onclick: () => namePrompt(row, api.title()) }, svgIcon('M6 4h12v16l-6-4-6 4z'), 'Save to My designs'));
  }
  row.append(h('button', { class: 'btn ghost', title: 'Download this design as a .gcdesign.json file', onclick: () => exportCurrent() }, svgIcon(ICON.export), 'File'));
}
function namePrompt(row, suggestion) {
  row.dataset.naming = '1';
  row.innerHTML = '';
  const input = h('input', { type: 'text', class: 'grow', 'aria-label': 'Name for the saved design', maxlength: '120', placeholder: 'Name this design' });
  input.value = uniqueName(suggestion || 'My design');
  const close = () => { delete row.dataset.naming; decorateCard(); };
  const ok = async () => { const name = input.value.trim(); delete row.dataset.naming; if (!(await saveNew(name))) decorateCard(); };
  input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } if (ev.key === 'Escape') { ev.preventDefault(); close(); } };
  row.append(h('form', { class: 'cd-name-form', onsubmit: (ev) => { ev.preventDefault(); ok(); } }, input,
    h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
    h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel')));
  input.focus(); input.select();
}

// ---------------------------------------------------------------- gallery section
/** Saved designs matching the gallery's search and source filter. */
export function matches(q = '', src = 'all') {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return saves.list().filter(e => {
    const fs = !!e.state?.s;
    if ((src === 'gc' && fs) || (src === 'fs' && !fs)) return false;
    const hay = `${e.name} my design saved ${api.sourceName(e.state)}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}
/**
 * Render saved designs as gallery cards. `full`: the "My designs" category (with an empty
 * state and library actions); otherwise a section at the top of "All".
 */
export function renderGallerySection(container, items, { full = false, onOpen, rerender } = {}) {
  const grid = h('div', { class: 'gal-grid' });
  const curId = cur?.id;
  for (const e of items) grid.append(card(e, e.id === curId, onOpen, rerender));
  const actions = h('span', { class: 'mine-acts' },
    h('button', { class: 'btn ghost sm', onclick: () => pickImport(rerender), title: 'Add designs from .gcdesign.json files' }, svgIcon(ICON.import), 'Import'),
    full && saves.list().length ? h('button', { class: 'btn ghost sm', onclick: exportAll, title: 'Download every saved design in one file' }, svgIcon(ICON.export), 'Export all') : null);
  const head = h('h4', {}, 'My designs', h('small', {}, String(items.length)), actions);
  const sec = h('section', { class: 'gal-sec mine' }, head);
  if (!items.length && full) {
    sec.append(h('div', { class: 'gal-empty mine-empty' },
      saves.list().length ? 'No saved designs match.' : 'Nothing saved yet. Use “Save to My designs” on the Design tab, or import a .gcdesign.json file. Designs stay in this browser.'));
  } else sec.append(grid);
  if (full) sec.append(h('p', { class: 'muted small mine-foot' }, `${saves.list().length} of ${SAVES_MAX} · stored in this browser only. Export files to keep a backup or move designs to another device.`));
  container.append(sec);
}
function card(e, active, onOpen, rerender) {
  const thumb = e.thumb ? h('img', { src: e.thumb, alt: '', loading: 'lazy' }) : h('span', { class: 'mine-noimg' }, '?');
  const name = h('div', { class: 'gname' }, e.name);
  const openBtn = h('button', { class: 'mine-open', 'aria-label': `Open ${e.name}` },
    h('div', { class: 'gthumb' }, thumb, h('span', { class: 'pill flat' }, 'Mine')),
    h('div', { class: 'gtext' }, name, h('div', { class: 'gby' }, `${api.sourceName(e.state)} · ${fmtDate(e.updated || e.ts)}`)));
  openBtn.onclick = () => onOpen?.(e);
  const startRename = () => {
    const input = h('input', { type: 'text', class: 'mine-rename', value: e.name, 'aria-label': 'New name', maxlength: '120' });
    let done = false;
    const finish = (save) => { if (done) return; done = true; if (save) rename(e.id, input.value); rerender(); };
    input.onkeydown = (ev) => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); finish(false); } };
    input.onblur = () => finish(true);
    wrap.querySelector('.mine-acts-row').before(input);
    input.focus(); input.select();
  };
  const act = (label, d, fn, cls = '') => h('button', { class: 'icon-btn sm ' + cls, title: label, 'aria-label': `${label} ${e.name}`, onclick: fn }, svgIcon(d));
  const wrap = h('div', { class: 'gcard mine' + (active ? ' active' : '') }, openBtn,
    h('div', { class: 'mine-acts-row' },
      act('Rename', ICON.rename, startRename),
      act('Duplicate', ICON.dup, () => { duplicate(e.id); rerender(); }),
      act('Export file', ICON.export, () => exportEntry(e.id)),
      act('Delete', ICON.del, () => remove(e.id, rerender), 'danger')));
  return wrap;
}
