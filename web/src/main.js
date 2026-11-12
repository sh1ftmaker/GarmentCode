// GarmentCode 3D Studio: app orchestration.
import { Viewer } from './viewer.js';
import { py, onPyProgress } from './py.js';
import { buildGarment, ClothSim, SDF } from './garment.js';
import { parseBodyBin, prepareMorph, morphBody, measureGirth } from './body.js';
import { MEASUREMENTS, MEASUREMENT_GROUPS, ANGLE_KEYS, groupName, paramName, paramHelp, valueName, ESSENTIAL } from './labels.js';
import { TEMPLATES, applyTemplate } from './templates.js';
import { FABRICS, SWATCHES, simParams } from './fabric.js';
import { buildPieces, sewingSteps, pieceName } from './pieces.js';
import { autoLayout, layoutLength, findProblems, placed } from './layout.js';
import { primitives, toSVG, layoutPDF, tiledPDF, toDXF } from './export.js';
import { History, compactSnapshot, expandSnapshot, encodeShare, decodeShare, saves, profiles, lastState, prefs } from './state.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};

// ---------------------------------------------------------------- state
const S = {
  mode: 'design', design: null, base: 'neutral', measurements: {}, unit: 'cm', detail: 'simple', search: '',
  locked: new Set(),
  fabric: { id: 'cotton', color: '#c9d6ea', print: 'plain', bend: 0.55, stretch: 0.05, friction: 0.5, res: 2.0, release: false },
  template: 'tee',
};
const defaults = { design: null, presets: {} };
const undoStack = new History();
const viewer = new Viewer($('#three'));
const bodies = {};            // base name -> { base, prep, sdfBuf }
let sdf = null, sdfReady = Promise.resolve(), sdfToken = 0;
let sim = null, pattern = null, genToken = 0, paused = false, flat = false;
let selfCollide = true;   // LAB: cloth self-collision on/off (btn-selfcol)
const cut = { pieces: null, layout: null, edited: false, key: '', sa: 1.5 };

// ---------------------------------------------------------------- status & toasts
function status(text, busy = false) { $('#status-text').textContent = text; $('#status').classList.toggle('idle', !busy); }
let toastTimer;
function toast(text, ms = 2800) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }
// Non-blocking notice: one collapsed line (tap to expand), dismissible. A dismissed
// message stays hidden until a different one comes up.
let warnDismissed = '';
function warn(text) {
  const w = $('#warn');
  text = text || '';
  w.classList.remove('open');
  $('#warn-text').textContent = text;
  w.hidden = !text || text === warnDismissed;
  if (text !== warnDismissed) warnDismissed = '';
}
$('#warn-text').onclick = () => $('#warn').classList.toggle('open');
$('#warn-x').onclick = () => { warnDismissed = $('#warn-text').textContent; $('#warn').hidden = true; };
onPyProgress((t) => status(t, true));

// ---------------------------------------------------------------- body
async function loadBase(name) {
  if (!bodies[name]) {
    const [bin, meas] = await Promise.all([
      fetch(`data/body_${name}.bin`).then(r => r.arrayBuffer()),
      fetch(`data/body_${name}.json`).then(r => r.json()),
    ]);
    const base = parseBodyBin(bin);
    bodies[name] = { base, prep: prepareMorph(base), sdfBuf: null };
    defaults.presets[name] = meas;
  }
  return bodies[name];
}
const isPreset = () => {
  const p = defaults.presets[S.base];
  return p && Object.keys(p).every(k => Math.abs((S.measurements[k] ?? p[k]) - p[k]) < 1e-6);
};
let armAxes = null, bodyPos = null;
function updateBodyMesh() {
  const b = bodies[S.base];
  if (!b) return;
  const pos = isPreset() ? b.base.pos : morphBody(b.prep, defaults.presets[S.base], S.measurements);
  viewer.setBody(pos, b.base.idx);
  armAxes = computeArmAxes(pos, b.base.part);
  bodyPos = pos;
}

/**
 * GarmentCode's trouser flare narrows the hem without looking at the leg, so short or
 * strongly tapered legs can come out smaller than the leg they must go around. Woven
 * cloth can't do that (the drape cuts into the leg), so say so.
 */
function tightLegOpening(pat) {
  const b = bodies[S.base];
  if (!b || !bodyPos) return null;
  const legOnly = b.base.part.map(p => (p === 3 ? 0 : 9));   // left leg only, as "body" for measureGirth
  let worst = null;
  for (const side of ['r', 'l']) {
    let hem = 0, hemY = Infinity;
    for (const p of pat.panels) {
      if (!new RegExp(`^pant_[fb]_${side}$`).test(p.name)) continue;
      const ys = p.boundary.map(q => q[1]), ymin = Math.min(...ys);
      for (const r of p.edge_ranges) {
        const pts = r.map(i => p.boundary[i]);
        if (pts.length < 2 || !pts.every(q => q[1] < ymin + 1.5)) continue;
        for (let i = 1; i < pts.length; i++) hem += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        hemY = Math.min(hemY, ymin * p.rotation[1][1] + p.translation[1]);
      }
    }
    if (!hem || !isFinite(hemY)) continue;
    // the leg is widest a little above the hem (calf / thigh): check the hem and up to 15 cm
    // above, but not the foot (full-length trousers end at the floor)
    const ankle = 0.07 * (S.measurements.height || 170);
    let leg = 0;
    for (let dy = 0; dy <= 15; dy += 3) leg = Math.max(leg, measureGirth(bodyPos, legOnly, Math.max(hemY, ankle) + dy, 0.8));
    if (leg > 0 && hem < leg + 1 && (!worst || leg - hem > worst.leg - worst.hem)) worst = { hem, leg };
  }
  return worst;
}
/** Principal axis of each arm (centroid + direction pointing to the hand), for wrapping sleeves. */
function computeArmAxes(pos, part) {
  const out = {};
  for (const pid of [1, 2]) {
    let n = 0, c = [0, 0, 0];
    for (let v = 0; v < part.length; v++) if (part[v] === pid) { c[0] += pos[3 * v]; c[1] += pos[3 * v + 1]; c[2] += pos[3 * v + 2]; n++; }
    if (!n) continue;
    c = c.map(x => x / n);
    let a = [c[0] >= 0 ? 1 : -1, -1, 0];   // power iteration on the covariance
    for (let it = 0; it < 12; it++) {
      const r = [0, 0, 0];
      for (let v = 0; v < part.length; v++) {
        if (part[v] !== pid) continue;
        const dx = pos[3 * v] - c[0], dy = pos[3 * v + 1] - c[1], dz = pos[3 * v + 2] - c[2];
        const d = dx * a[0] + dy * a[1] + dz * a[2];
        r[0] += d * dx; r[1] += d * dy; r[2] += d * dz;
      }
      const l = Math.hypot(...r) || 1; a = r.map(x => x / l);
    }
    if (a[1] > 0) a = a.map(x => -x);        // point down the arm
    out[c[0] >= 0 ? 'pos' : 'neg'] = { c, a };
  }
  return out;
}
let sdfWorker = null;
function rebuildSDF() {
  const b = bodies[S.base];
  const token = ++sdfToken;
  sdfReady = (async () => {
    if (isPreset()) {
      b.sdfBuf ||= await fetch(`data/sdf_${S.base}.bin`).then(r => r.arrayBuffer());
      if (token === sdfToken) sdf = new SDF(b.sdfBuf);
      return;
    }
    const pos = morphBody(b.prep, defaults.presets[S.base], S.measurements);
    sdfWorker ||= new Worker(new URL('./sdf-worker.js', import.meta.url), { type: 'module' });
    const isArm = b.base.part.map(p => (p === 1 || p === 2) ? 1 : 0);
    const buf = await new Promise((res, rej) => {
      sdfWorker.onmessage = (e) => {
        if (e.data.id !== token) return;
        if (e.data.progress != null) { status(`Fitting mannequin… ${Math.round(e.data.progress * 100)}%`, true); return; }
        res(e.data.sdf);
      };
      sdfWorker.onerror = (e) => rej(new Error(e.message || 'The collision worker failed'));
      sdfWorker.postMessage({ id: token, pos, idx: b.base.idx, isArm, cell: 2.0 });
    });
    if (token === sdfToken) sdf = new SDF(buf);
  })().catch((e) => { console.error(e); warn(`Mannequin update failed: ${e.message}`); });
  return sdfReady;
}

// ---------------------------------------------------------------- pattern + drape pipeline
async function regenerate() {
  const token = ++genToken;
  status('Drafting pattern…', true);
  let pat;
  try {
    pat = await py('generate', { resolution: S.fabric.res });
  } catch (e) {
    if (token !== genToken) return;
    console.error(e.full || e);
    status('Pattern error');
    warn(`GarmentCode couldn't draft this combination: ${e.message}`);
    return;
  }
  await sdfReady;
  if (token !== genToken) return;
  pattern = pat;
  cut.key = '';
  const w = [];
  if (!pat.panels.length) w.push('Empty design: choose a top, waistband or bottom under “Garment”.');
  const tight = tightLegOpening(pat);
  if (tight) w.push(`The trouser legs are narrower than the leg (opening ${Math.round(tight.hem)} cm, leg ${Math.round(tight.leg)} cm), so they can't go on without stretch fabric and the drape cuts into the leg. Increase the flare or width.`);
  if (pat.self_intersecting) {
    const names = [...new Set((pat.intersecting_panels || []).map(n => pieceName(n).replace(/ \((left|right)\)$/, '')))];
    const list = names.map(n => n.toLowerCase()).join(' and ') || 'a panel';
    w.push(`Pattern issue: the ${names.length > 1 ? 'outlines' : 'outline'} of the ${list} ${names.length > 1 ? 'cross themselves' : 'crosses itself'}, so the drape may look odd. Usually a neckline or armhole that's too deep or wide for this body.`);
  }
  warn(w.join(' '));
  startDrape();
  if (!$('#pattern-card').hidden) refreshPatternSVG();
  if (S.mode === 'cut') refreshCut();
}

function startDrape() {
  sim = null;
  if (!pattern || !pattern.panels.length || !sdf) {
    viewer.clearGarment();
    status(pattern && !pattern.panels.length ? 'Empty design' : 'Ready');
    return;
  }
  // GarmentCode occasionally drafts degenerate geometry for extreme combinations
  // (e.g. a metres-wide panel). Don't pretend to drape it.
  const huge = pattern.panels.find(p => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of p.boundary) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return x1 - x0 > 320 || y1 - y0 > 320;
  });
  if (huge) {
    viewer.clearGarment();
    status('Invalid pattern');
    warn(`GarmentCode produced invalid geometry for this combination (panel “${huge.name}” is several metres across). Try other parameters or body measurements.`);
    return;
  }
  const g = buildGarment(pattern, S.fabric.res, sdf, { armAxes });
  viewer.setGarment(g);
  sim = new ClothSim(g, sdf, { ...simParams(S.fabric), releaseAttachments: S.fabric.release, selfCollision: selfCollide });
  paused = false; flat = false;
  status(`Draping ${pattern.panels.length} panels…`, true);
  updateDrapeChip();
}

let fitBufS, fitBufE, frameCount = 0;
viewer.onFrame = () => {
  if (!sim || paused || flat) return;
  if (!sim.done) {
    const t0 = performance.now();
    do { sim.step(1 / 60); } while (!sim.done && performance.now() - t0 < 7);
    viewer.garmentUpdated();
    $('#sim-bar').hidden = false;
    $('#sim-bar > div').style.width = `${(sim.progress * 100).toFixed(1)}%`;
    if (sim.done) {
      $('#sim-bar').hidden = true;
      status(`Draped · ${pattern.panels.length} panels`);
      updateDrapeChip();
      if (S.fabric.release && sim.slipAfterRelease() > 12) warn(`The garment slid ${Math.round(sim.slipAfterRelease())} cm after the attachments were released. It probably doesn't fit this body.`);
    }
  }
  if (viewer.fitMode && (frameCount++ % 8 === 0)) {
    fitBufS = sim.vertexStrain(fitBufS?.length === sim.g.nv ? fitBufS : null);
    fitBufE = sim.vertexEase(fitBufE?.length === sim.g.nv ? fitBufE : null);
    viewer.updateFitColors(fitBufS, fitBufE);
  }
};
function updateDrapeChip() {
  $('#btn-drape').textContent = sim && !sim.done && !paused && !flat ? '⏸ Pause' : '▶ Drape';
}

// ---------------------------------------------------------------- history / snapshots
const snapshot = () => ({ design: S.design, base: S.base, measurements: S.measurements, fabric: { ...S.fabric } });
function syncUndoButtons() {
  $('#btn-undo').disabled = !undoStack.canUndo;
  $('#btn-redo').disabled = !undoStack.canRedo;
}
function commitHistory() {
  if (undoStack.push(snapshot())) lastState.set(compactSnapshot(snapshot(), defaults));
  syncUndoButtons();
}
async function applySnapshot(snap, { record = true } = {}) {
  await loadBase(snap.base || 'neutral');
  S.base = snap.base || 'neutral';
  S.measurements = { ...defaults.presets[S.base], ...(snap.measurements || {}) };
  if (snap.fabric) Object.assign(S.fabric, snap.fabric);
  await py('setDesign', { design: snap.design });
  S.design = await py('design');
  await py('setBody', { name: S.base });
  await py('setBodyParams', { params: S.measurements });
  renderDesignUI(); renderBodyUI(); renderFabricUI(); applyFabricLook();
  $('#body-select').value = S.base;
  updateBodyMesh();
  rebuildSDF();
  if (record) commitHistory();
  await regenerate();
}

// ---------------------------------------------------------------- design UI
const RELEVANT = {
  upper: { FittedShirt: ['shirt', 'collar', 'sleeve', 'left'], Shirt: ['shirt', 'collar', 'sleeve', 'left'] },
  wb: { StraightWB: ['waistband'], FittedWB: ['waistband'] },
  bottom: {
    SkirtCircle: ['flare-skirt'], AsymmSkirtCircle: ['flare-skirt'], GodetSkirt: ['godet-skirt'],
    Pants: ['pants'], Skirt2: ['skirt'], SkirtManyPanels: ['flare-skirt'], PencilSkirt: ['pencil-skirt'],
    SkirtLevels: ['levels-skirt'],
  },
};
const isParam = (n) => n && typeof n === 'object' && 'v' in n && 'type' in n;
const openGroups = new Set(['meta']);

function paramRow(path, node) {
  const key = path.join('.');
  const row = el('div', { class: 'prow', 'data-path': key });
  const lock = el('button', { class: 'lock' + (S.locked.has(key) ? ' on' : ''), title: 'Keep this value when randomising', 'aria-label': 'Lock value' }, S.locked.has(key) ? '🔒' : '🔓');
  lock.onclick = () => {
    S.locked.has(key) ? S.locked.delete(key) : S.locked.add(key);
    lock.classList.toggle('on', S.locked.has(key));
    lock.textContent = S.locked.has(key) ? '🔒' : '🔓';
  };
  const name = el('span', { class: 'pname' }, paramName(path));
  const help = paramHelp(path);
  if (node.type === 'bool') {
    const input = el('input', { type: 'checkbox', 'aria-label': paramName(path) });
    input.checked = !!node.v;
    input.onchange = () => commitParam(path, input.checked);
    row.append(name, el('span', { class: 'pval' }, lock, el('label', { class: 'switch' }, input, el('i'))));
  } else if (node.type === 'select' || node.type === 'select_null') {
    const opts = [...(node.range || [])];
    if (node.type === 'select_null' && !opts.includes(null)) opts.push(null);
    const sel = el('select', { 'aria-label': paramName(path) }, opts.map(o => {
      const op = el('option', { value: JSON.stringify(o) }, valueName(o));
      if (JSON.stringify(o) === JSON.stringify(node.v)) op.selected = true;
      return op;
    }));
    sel.onchange = () => commitParam(path, JSON.parse(sel.value));
    row.append(name, el('span', { class: 'pval' }, lock), el('div', { class: 'pctl' }, sel));
  } else if (node.type === 'float' || node.type === 'int') {
    const [lo, hi] = node.range;
    const isInt = node.type === 'int';
    const step = isInt ? 1 : +((hi - lo) / 200).toPrecision(2);
    const range = el('input', { type: 'range', min: lo, max: hi, step, value: node.v, 'aria-label': paramName(path) });
    const num = el('input', { type: 'number', class: 'num', min: lo, max: hi, step, value: isInt ? node.v : (+node.v).toFixed(2), 'aria-label': `${paramName(path)} value` });
    range.oninput = () => { num.value = isInt ? range.value : (+range.value).toFixed(2); };
    range.onchange = () => commitParam(path, isInt ? Math.round(+range.value) : +range.value);
    num.onchange = () => { const v = Math.min(hi, Math.max(lo, +num.value)); range.value = v; commitParam(path, isInt ? Math.round(v) : v); };
    row.append(name, el('span', { class: 'pval' }, lock), el('div', { class: 'pctl' }, range, num));
  } else return null;
  if (help) row.append(el('span', { class: 'help' }, help));
  return row;
}

function groupEl(name, node, path) {
  const key = path.join('.');
  const body = el('div', { class: 'gbody' });
  const q = S.search.trim().toLowerCase();
  let count = 0;
  for (const [k, v] of Object.entries(node)) {
    const p = [...path, k];
    if (isParam(v)) {
      const label = paramName(p).toLowerCase();
      if (q && !label.includes(q) && !p.join('.').includes(q)) continue;
      if (!q && S.detail === 'simple' && !ESSENTIAL.has(p.join('.'))) continue;
      const r = paramRow(p, v);
      if (r) { body.append(r); count++; }
    } else if (v && typeof v === 'object') {
      const sub = groupEl(k, v, p);
      if (sub) { body.append(sub); count++; }
    }
  }
  if (!count) return null;
  const det = el('details', { class: 'group' }, el('summary', {}, groupName(name)), body);
  det.open = openGroups.has(key) || !!q || path.length > 1;
  det.ontoggle = () => { det.open ? openGroups.add(key) : openGroups.delete(key); };
  return det;
}

function renderDesignUI() {
  const root = $('#design-params');
  root.innerHTML = '';
  const d = S.design, meta = d.meta;
  const relevant = new Set(['meta']);
  const addFor = (slot, v) => { for (const g of (RELEVANT[slot][v] || [])) relevant.add(g); };
  for (const slot of ['upper', 'wb', 'bottom']) addFor(slot, meta?.[slot]?.v);
  if (meta?.bottom?.v === 'SkirtLevels') { addFor('bottom', d['levels-skirt']?.base?.v); addFor('bottom', d['levels-skirt']?.level?.v); }
  if (meta?.bottom?.v === 'GodetSkirt') addFor('bottom', d['godet-skirt']?.base?.v);
  const keys = Object.keys(d);
  for (const k of keys.filter(k => relevant.has(k))) { const g = groupEl(k, d[k], [k]); if (g) root.append(g); }
  const other = keys.filter(k => !relevant.has(k)).map(k => groupEl(k, d[k], [k])).filter(Boolean);
  if (other.length && (S.detail === 'all' || S.search)) {
    root.append(el('div', { class: 'group-sep' }, 'Not used by this garment'));
    for (const g of other) { g.classList.add('dim'); root.append(g); }
  }
  if (!root.children.length) root.append(el('p', { class: 'muted' }, 'No parameters match your search.'));
  $$('.tpl').forEach(t => t.classList.toggle('active', t.dataset.id === S.template));
}

async function commitParam(path, value) {
  try { await py('setParam', { path, value }); } catch (e) { warn(e.message); return; }
  S.design = await py('design');
  S.template = null;
  const structural = path[0] === 'meta' || ['levels-skirt.base', 'levels-skirt.level', 'godet-skirt.base', 'left.enable_asym'].includes(path.join('.'));
  if (structural) renderDesignUI(); else $$('.tpl').forEach(t => t.classList.remove('active'));
  commitHistory();
  regenerate();
}

const TPL_ICONS = {
  tee: 'M14 8l8-4h12l8 4 6 10-7 4-3-5v31H18V17l-3 5-7-4z',
  longsleeve: 'M14 8l8-4h12l8 4 8 30-6 2-6-20v28H18V20l-6 20-6-2z',
  aline: 'M20 4h16l2 16 10 30H8l10-30z',
  sundress: 'M18 6h20v14l12 30H6l12-30z',
  maxi: 'M22 2c4-2 8-2 12 0l4 10 6 4-4 4-2-2 6 34H12l6-34-2 2-4-4 6-4z',
  pencil: 'M14 6h28l-2 46H16z',
  tiered: 'M18 6h20l2 14H16zM15 20h26l3 15H12zM12 35h32l4 16H8z',
  trousers: 'M14 4h28l4 48h-12l-6-34-6 34H10z',
  shorts: 'M14 10h28l4 22H32l-4-10-4 10H10z',
};
function renderTemplates() {
  const root = $('#templates');
  root.innerHTML = '';
  for (const t of TEMPLATES) {
    const b = el('button', { class: 'tpl', 'data-id': t.id, title: t.name });
    b.innerHTML = `<svg viewBox="0 0 56 56" aria-hidden="true"><path d="${TPL_ICONS[t.id] || TPL_ICONS.tee}" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    b.append(el('span', {}, t.name));
    b.onclick = async () => {
      if (!defaults.design) return;
      S.template = t.id;
      await py('setDesign', { design: applyTemplate(defaults.design, t) });
      S.design = await py('design');
      renderDesignUI();
      commitHistory();
      regenerate();
    };
    root.append(b);
  }
}

// ---------------------------------------------------------------- body UI
const toUnit = (k, v) => (ANGLE_KEYS.has(k) || S.unit === 'cm') ? v : v / 2.54;
const fromUnit = (k, v) => (ANGLE_KEYS.has(k) || S.unit === 'cm') ? v : v * 2.54;
function renderBodyUI() {
  const root = $('#body-params');
  root.innerHTML = '';
  const preset = defaults.presets[S.base] || {};
  for (const grp of MEASUREMENT_GROUPS) {
    const body = el('div', { class: 'gbody' });
    for (const [k, [label, help, g]] of Object.entries(MEASUREMENTS)) {
      if (g !== grp || !(k in preset)) continue;
      const v0 = preset[k], v = S.measurements[k] ?? v0;
      const span = ANGLE_KEYS.has(k) ? 15 : Math.max(5, v0 * 0.35);
      const lo = ANGLE_KEYS.has(k) ? v0 - span : Math.max(1, v0 - span), hi = v0 + span;
      const unit = ANGLE_KEYS.has(k) ? '°' : S.unit;
      const fmt = (x) => toUnit(k, x).toFixed(S.unit === 'in' && !ANGLE_KEYS.has(k) ? 2 : 1);
      const range = el('input', { type: 'range', min: lo, max: hi, step: 0.1, value: v, 'aria-label': label });
      const num = el('input', { type: 'number', class: 'num', step: 0.1, value: fmt(v), 'aria-label': `${label} in ${unit}` });
      const live = (val) => { S.measurements[k] = val; updateBodyMesh(); };
      range.oninput = () => { num.value = fmt(+range.value); live(+range.value); };
      range.onchange = () => commitBody();
      num.onchange = () => { const val = fromUnit(k, +num.value); range.value = val; live(val); commitBody(); };
      const reset = Math.abs(v - v0) > 1e-6
        ? el('button', { class: 'lock on', title: 'Back to the base shape value', onclick: () => { S.measurements[k] = v0; updateBodyMesh(); commitBody(true); } }, '↺')
        : null;
      body.append(el('div', { class: 'prow' },
        el('span', { class: 'pname' }, label, el('small', {}, unit)),
        el('span', { class: 'pval' }, reset),
        el('div', { class: 'pctl' }, range, num),
        el('span', { class: 'help' }, help)));
    }
    if (!body.children.length) continue;
    const det = el('details', { class: 'group' }, el('summary', {}, grp), body);
    det.open = grp === 'Key' || openGroups.has('body:' + grp);
    det.ontoggle = () => { det.open ? openGroups.add('body:' + grp) : openGroups.delete('body:' + grp); };
    root.append(det);
  }
  const sel = $('#profile-select');
  sel.innerHTML = '';
  sel.append(el('option', { value: '' }, 'Saved profiles…'));
  for (const p of profiles.list()) sel.append(el('option', { value: p.name }, p.name));
}
async function commitBody(rerender = false) {
  await py('setBodyParams', { params: S.measurements });
  if (rerender) renderBodyUI();
  rebuildSDF();
  commitHistory();
  regenerate();
}

// ---------------------------------------------------------------- fabric UI
function renderFabricUI() {
  const grid = $('#fabric-presets');
  grid.innerHTML = '';
  for (const f of FABRICS) {
    grid.append(el('button', { class: 'fab' + (S.fabric.id === f.id ? ' active' : ''), onclick: () => {
      Object.assign(S.fabric, { id: f.id, bend: f.bend, stretch: f.stretch, friction: f.friction });
      if (f.weave === 'twill' && S.fabric.print === 'plain') S.fabric.print = 'twill';
      renderFabricUI(); applyFabricLook(); commitHistory(); startDrape();
    } }, el('b', {}, f.name), el('span', {}, f.note)));
  }
  const sw = $('#swatches');
  sw.innerHTML = '';
  for (const c of SWATCHES) {
    sw.append(el('button', { class: 'sw' + (S.fabric.color === c ? ' active' : ''), style: `background:${c}`, 'aria-label': `Colour ${c}`,
      onclick: () => { S.fabric.color = c; renderFabricUI(); applyFabricLook(); commitHistory(); } }));
  }
  const custom = el('input', { type: 'color', class: 'sw-custom', value: S.fabric.color, 'aria-label': 'Custom colour', title: 'Custom colour' });
  custom.oninput = () => { S.fabric.color = custom.value; applyFabricLook(); };
  custom.onchange = () => { renderFabricUI(); commitHistory(); };
  sw.append(custom);
  $('#print-select').value = S.fabric.print;
  $('#bend').value = S.fabric.bend; $('#stretch').value = S.fabric.stretch; $('#fric').value = S.fabric.friction; $('#res').value = S.fabric.res;
  $('#release-attach').checked = !!S.fabric.release;
  labelSliders();
}
function applyFabricLook() {
  if (!viewer.ok) return;
  const f = FABRICS.find(x => x.id === S.fabric.id) || FABRICS[0];
  viewer.setPrint(S.fabric.print);
  viewer.setFabric(f, S.fabric.color);
}
function labelSliders() {
  const b = +$('#bend').value, s = +$('#stretch').value;
  $('#bend-val').textContent = b < 0.25 ? 'very soft' : b < 0.5 ? 'soft' : b < 0.75 ? 'medium' : 'stiff';
  $('#stretch-val').textContent = s < 0.15 ? 'woven' : s < 0.5 ? 'some stretch' : 'stretchy';
  $('#fric-val').textContent = (+$('#fric').value).toFixed(2);
  $('#res-val').textContent = `${(+$('#res').value).toFixed(1)} cm`;
}
for (const [id, key] of [['bend', 'bend'], ['stretch', 'stretch'], ['fric', 'friction'], ['res', 'res']]) {
  $('#' + id).addEventListener('input', labelSliders);
  $('#' + id).addEventListener('change', () => {
    S.fabric[key] = +$('#' + id).value;
    commitHistory();
    if (key === 'res') regenerate(); else startDrape();
  });
}
$('#release-attach').onchange = (e) => { S.fabric.release = e.target.checked; commitHistory(); startDrape(); };
$('#print-select').onchange = (e) => { S.fabric.print = e.target.value; applyFabricLook(); commitHistory(); };

// ---------------------------------------------------------------- cutting layout
async function ensurePieces() {
  const sa = +$('#seam-allowance').value;
  const key = `${genToken}|${sa}`;
  if (cut.key === key && cut.pieces) return cut;
  const data = await py('pieces', { res: 0.5 });
  const set = buildPieces(data, { sa });
  const sameSet = cut.pieces && cut.pieces.pieces.map(p => p.id).join() === set.pieces.map(p => p.id).join() && cut.sa === sa;
  cut.pieces = set; cut.sa = sa; cut.key = key;
  if (!cut.layout || !sameSet || !cut.edited) relayout();
  return cut;
}
function relayout() {
  cut.layout = autoLayout(cut.pieces.pieces, { width: +$('#fabric-width').value, allowRotate: $('#allow-rotate').checked });
  cut.edited = false;
}
async function refreshCut() {
  if (!pattern || !pattern.panels.length) {
    $('#layout-view').innerHTML = '<p class="muted" style="text-align:center;margin-top:30vh">Nothing to cut: the design is empty.</p>';
    return;
  }
  status('Preparing pattern pieces…', true);
  try { await ensurePieces(); } catch (e) { warn(e.message); return; }
  renderLayout();
  status(`${cut.pieces.pieces.length} pattern pieces`);
}
const polyArea = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
function piecePrims(all) {   // group primitives (emitted piece by piece) by piece id
  const by = {};
  let cur = null;
  for (const q of all) { if (q.k === 'cut') cur = q.id; (by[cur] ||= []).push(q); }
  return by;
}
function renderLayout() {
  const { pieces } = cut.pieces, L = cut.layout;
  const W = L.width, len = Math.max(20, Math.ceil(layoutLength(pieces, L.placements) + 4));
  const view = $('#layout-view');
  const pxPerCm = Math.min(7, Math.max(2, (view.clientWidth - 48) / (W + 4)));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `-2 -4 ${W + 4} ${len + 6}`);
  svg.setAttribute('width', (W + 4) * pxPerCm);
  svg.setAttribute('height', (len + 6) * pxPerCm);
  let grid = '';
  for (let x = 0; x <= W; x += 10) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="#000" stroke-opacity="${x % 50 ? .05 : .12}" stroke-width=".1"/>`;
  for (let y = 0; y <= len; y += 10) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#000" stroke-opacity="${y % 50 ? .05 : .12}" stroke-width=".1"/>`;
  svg.innerHTML = `<rect x="0" y="0" width="${W}" height="${len}" fill="#f6efe4" stroke="#b9ab96" stroke-width=".25"/>${grid}
    <text x="0" y="-1.2" font-size="1.8" fill="#8e877d" font-family="Inter, sans-serif">← selvedge · ${W} cm wide · grain runs top to bottom</text>`;
  const problems = findProblems(pieces, L.placements, W);
  const local = Object.fromEntries(pieces.map(p => [p.id, { x: 0, y: 0, rot: L.placements[p.id].rot }]));
  const by = piecePrims(primitives(cut.pieces, { placements: local }, { sewLines: $('#show-sewline').checked }));
  for (const p of pieces) {
    const pl = L.placements[p.id];
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'piece' + (problems.has(p.id) ? ' overlap' : ''));
    g.dataset.id = p.id;
    g.setAttribute('transform', `translate(${pl.x} ${pl.y})`);
    g.innerHTML = toSVG(by[p.id] || [], 1, 1, { units: false, bg: false }).replace(/^<svg[^>]*>|<\/svg>$/g, '').replace('<path ', '<path class="cut" ');
    svg.append(g);
  }
  view.innerHTML = '';
  view.append(svg);
  enableDrag(svg, pxPerCm);
  const usedArea = pieces.reduce((s, p) => s + polyArea(placed(p, L.placements[p.id])), 0);
  const length = layoutLength(pieces, L.placements);
  const buyM = Math.ceil((length + 10) / 10) / 10, buyYd = Math.ceil(((length + 10) / 91.44) * 8) / 8;
  $('#cut-summary').innerHTML = `
    <div class="stat"><b>${buyM.toFixed(1)} m</b><span>${buyYd.toFixed(2)} yd to buy</span></div>
    <div class="stat"><b>${Math.round(usedArea / (W * Math.max(1, length)) * 100)}%</b><span>fabric used</span></div>
    <div class="stat"><b>${pieces.length}</b><span>pieces</span></div>`;
  $('#sew-steps').innerHTML = sewingSteps(cut.pieces).map(s => `<li>${s}</li>`).join('');
  if (problems.size) toast(`${problems.size} piece${problems.size > 1 ? 's overlap' : ' overlaps'} or leave the fabric (shown in red).`);
  const notes = [];
  if (L.tooWide?.length) notes.push(`${L.tooWide.length} piece(s) are wider than this fabric, even turned. Choose a wider fabric or cut them separately.`);
  if (L.crossGrain?.length) notes.push(`${L.crossGrain.length} piece(s) only fit turned 90° (cross-grain). Fine for most wovens, not for stretch or one-way prints.`);
  warn(notes.join(' '));
}
function enableDrag(svg, pxPerCm) {
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.piece');
    if (!g) return;
    const pl = cut.layout.placements[g.dataset.id];
    drag = { g, id: g.dataset.id, sx: e.clientX, sy: e.clientY, x0: pl.x, y0: pl.y, moved: false };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / pxPerCm, dy = (e.clientY - drag.sy) / pxPerCm;
    if (Math.abs(dx) + Math.abs(dy) > 0.6) drag.moved = true;
    const pl = cut.layout.placements[drag.id];
    pl.x = Math.round((drag.x0 + dx) * 2) / 2; pl.y = Math.round((drag.y0 + dy) * 2) / 2;
    drag.g.setAttribute('transform', `translate(${pl.x} ${pl.y})`);
  });
  const end = () => {
    if (!drag) return;
    const pl = cut.layout.placements[drag.id];
    if (!drag.moved && $('#allow-rotate').checked) pl.rot = (pl.rot + 180) % 360;
    cut.edited = true;
    drag = null;
    renderLayout();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}
$('#btn-autolayout').onclick = () => { if (cut.pieces) { relayout(); renderLayout(); } };
$('#fabric-width').onchange = () => { if (cut.pieces) { relayout(); renderLayout(); } };
$('#allow-rotate').onchange = () => { if (cut.pieces) { relayout(); renderLayout(); } };
$('#seam-allowance').onchange = () => { cut.key = ''; refreshCut(); };
$('#show-sewline').onchange = () => { if (cut.pieces) renderLayout(); };

// ---------------------------------------------------------------- modes
function setMode(mode) {
  S.mode = mode;
  $$('.mode').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
  $$('.page').forEach(p => p.classList.toggle('active', p.dataset.page === mode));
  const isCut = mode === 'cut';
  $('#layout-view').hidden = !isCut;
  $('#three').style.visibility = isCut ? 'hidden' : 'visible';
  $$('.no-webgl').forEach(n => { n.hidden = isCut; });
  $('#viewbar').hidden = isCut;
  $('#fit-legend').hidden = isCut || !viewer.fitMode;
  if (isCut) { $('#pattern-card').hidden = true; refreshCut(); }
}
$$('.mode').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });

// ---------------------------------------------------------------- toolbar & actions
$('#btn-drape').onclick = () => {
  if (!sim) return;
  if (flat || sim.done) { flat = false; paused = false; sim.reset(); status('Draping…', true); }
  else { paused = !paused; status(paused ? 'Paused' : 'Draping…', !paused); }
  updateDrapeChip();
};
$('#btn-flat').onclick = () => {
  if (!sim) return;
  sim.reset(); sim.x.set(sim.g.flat); flat = true;
  viewer.garmentUpdated();
  $('#sim-bar').hidden = true;
  status('Flat panels, as GarmentCode places them');
  updateDrapeChip();
};
$('#btn-fit').onclick = () => {
  const on = !viewer.fitMode;
  viewer.setFitMode(on);
  $('#btn-fit').classList.toggle('on', on);
  $('#fit-legend').hidden = !on;
  frameCount = 0;
  if (on && sim) { fitBufS = sim.vertexStrain(); fitBufE = sim.vertexEase(); viewer.updateFitColors(fitBufS, fitBufE); }
  if (!on) applyFabricLook();
};
// LAB: compare with / without cloth self-collision; restarts the drape
$('#btn-selfcol').onclick = () => {
  selfCollide = !selfCollide;
  $('#btn-selfcol').classList.toggle('on', selfCollide);
  startDrape();
};
$('#btn-body').onclick = () => { const on = !$('#btn-body').classList.contains('on'); $('#btn-body').classList.toggle('on', on); viewer.showBody(on); };
$('#btn-camera').onclick = () => { if (viewer.ok) viewer.resetCamera(); };
async function refreshPatternSVG() {
  try { $('#pattern-svg').innerHTML = (await py('svg')) || '<p class="muted">Empty pattern</p>'; }
  catch (e) { $('#pattern-svg').textContent = `Could not draw the pattern: ${e.message}`; }
}
$('#btn-pattern').onclick = () => {
  const card = $('#pattern-card');
  card.hidden = !card.hidden;
  $('#btn-pattern').classList.toggle('on', !card.hidden);
  if (!card.hidden) refreshPatternSVG();
};
$('#pattern-close').onclick = () => { $('#pattern-card').hidden = true; $('#btn-pattern').classList.remove('on'); };

$('#btn-random').onclick = async () => {
  await py('randomize', { locked: [...S.locked].map(k => k.split('.')) });
  S.design = await py('design'); S.template = null;
  renderDesignUI(); commitHistory(); regenerate();
};
$('#btn-reset').onclick = () => { $$('.tpl')[0]?.click(); };
$('#btn-upload').onclick = () => $('#file-input').click();
$('#file-input').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    if (/^\s*body\s*:/m.test(text) && !/^\s*design\s*:/m.test(text)) {
      const params = {};
      for (const line of text.split('\n')) { const m = line.match(/^\s+([a-z_]+):\s*([-0-9.eE]+)\s*$/); if (m) params[m[1]] = +m[2]; }
      S.measurements = { ...S.measurements, ...params };
      renderBodyUI(); updateBodyMesh(); await commitBody(); toast('Body measurements loaded');
    } else {
      await py('loadDesign', { text });
      S.design = await py('design'); S.template = null;
      renderDesignUI(); commitHistory(); regenerate(); toast('Design loaded');
    }
  } catch (err) { warn(`Could not load ${f.name}: ${err.message}`); }
  e.target.value = '';
};
$('#param-search').oninput = (e) => { S.search = e.target.value; renderDesignUI(); };
$$('[data-detail]').forEach(b => { b.onclick = () => {
  S.detail = b.dataset.detail;
  $$('[data-detail]').forEach(x => x.classList.toggle('active', x === b));
  renderDesignUI();
}; });
$('#body-select').onchange = async (e) => {
  S.base = e.target.value;
  await loadBase(S.base);
  S.measurements = { ...defaults.presets[S.base] };
  await py('setBody', { name: S.base });
  renderBodyUI(); updateBodyMesh(); rebuildSDF(); commitHistory(); regenerate();
};
$$('[data-unit]').forEach(b => { b.onclick = () => {
  S.unit = b.dataset.unit; prefs.set({ unit: S.unit });
  $$('[data-unit]').forEach(x => x.classList.toggle('active', x === b));
  renderBodyUI();
}; });
$('#btn-profile-save').onclick = () => {
  const name = prompt('Name this body profile', 'My measurements');
  if (!name) return;
  profiles.add({ name, base: S.base, measurements: { ...S.measurements } });
  renderBodyUI(); toast(`Saved profile “${name}”`);
};
$('#profile-select').onchange = async (e) => {
  const p = profiles.list().find(x => x.name === e.target.value);
  if (p) await applySnapshot({ ...snapshot(), base: p.base, measurements: p.measurements });
};

// undo / redo
async function undoRedo(dir) {
  const snap = dir < 0 ? undoStack.undo() : undoStack.redo();
  if (!snap) return;
  await applySnapshot(snap, { record: false });
  syncUndoButtons();
  lastState.set(compactSnapshot(snapshot(), defaults));
}
$('#btn-undo').onclick = () => undoRedo(-1);
$('#btn-redo').onclick = () => undoRedo(1);
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.target.matches('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); }
  if (k === 'y') { e.preventDefault(); undoRedo(1); }
});

// share
async function share() {
  const code = await encodeShare(compactSnapshot(snapshot(), defaults));
  const url = `${location.origin}${location.pathname}#s=${code}`;
  window.history.replaceState(null, '', `#s=${code}`);
  try {
    if (navigator.share && matchMedia('(max-width: 820px)').matches) { await navigator.share({ title: 'GarmentCode design', url }); return; }
    await navigator.clipboard.writeText(url);
    toast('Link copied. Anyone with it can open this design.');
  } catch { prompt('Copy this link', url); }
}
$('#btn-share').onclick = share;

// saves dialog
function renderSaves() {
  const list = $('#saves-list');
  list.innerHTML = '';
  const items = saves.list();
  if (!items.length) list.append(el('div', { class: 'empty' }, 'No saved designs yet. They stay in this browser.'));
  for (const s of items) {
    const img = el('img', { src: s.thumb || '', alt: s.name, title: 'Open' });
    img.onclick = async () => { $('#dlg-saves').close(); await applySnapshot(expandSnapshot(s.state, defaults)); toast(`Opened “${s.name}”`); };
    const del = el('button', { class: 'icon-btn', title: 'Delete', 'aria-label': `Delete ${s.name}` }, '🗑');
    del.onclick = () => { saves.remove(s.id); renderSaves(); };
    list.append(el('div', { class: 'save' }, img, el('div', { class: 'meta' }, el('div', {}, s.name, el('small', {}, new Date(s.ts).toLocaleDateString())), del)));
  }
}
$('#btn-saves').onclick = () => { renderSaves(); $('#save-name').value = ''; $('#dlg-saves').showModal(); };
$('#btn-save').onclick = () => {
  const name = $('#save-name').value.trim() || `Design ${new Date().toLocaleString()}`;
  const ok = saves.add({ id: Math.random().toString(36).slice(2), name, ts: Date.now(), thumb: viewer.thumbnail(), state: compactSnapshot(snapshot(), defaults) });
  renderSaves();
  toast(ok ? `Saved “${name}”` : 'Could not save: browser storage is unavailable.');
};
$$('dialog [data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
$('#btn-about').onclick = () => $('#dlg-about').showModal();
$('#brand').onclick = (e) => { e.preventDefault(); $('#dlg-about').showModal(); };

// theme
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
$('#btn-theme').onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = dark ? 'light' : 'dark';
  applyTheme(t); prefs.set({ theme: t });
};

// exports
function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const designTitle = () => (TEMPLATES.find(t => t.id === S.template)?.name || 'Custom design');
const slug = () => designTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-');
function garmentOBJ() {
  if (!sim) return '';
  const g = sim.g, p = sim.x;
  const out = ['# Draped garment, GarmentCode 3D Studio (unofficial)', '# units: cm'];
  for (let i = 0; i < p.length; i += 3) out.push(`v ${p[i].toFixed(3)} ${p[i + 1].toFixed(3)} ${p[i + 2].toFixed(3)}`);
  for (let i = 0; i < g.uvs.length; i += 2) out.push(`vt ${g.uvs[i].toFixed(4)} ${g.uvs[i + 1].toFixed(4)}`);
  for (let i = 0; i < g.index.length; i += 3) { const a = g.index[i] + 1, b = g.index[i + 1] + 1, c = g.index[i + 2] + 1; out.push(`f ${a}/${a} ${b}/${b} ${c}/${c}`); }
  return out.join('\n') + '\n';
}
async function cuttingExport(kind) {
  if (!pattern || !pattern.panels.length) throw new Error('The design is empty.');
  await ensurePieces();
  const L = cut.layout, len = Math.ceil(layoutLength(cut.pieces.pieces, L.placements) + 2);
  const prims = primitives(cut.pieces, L, { sewLines: true, title: designTitle() });
  const meta = { title: designTitle(), fabricWidth: L.width, fabricLength: len, sa: cut.sa, steps: sewingSteps(cut.pieces) };
  if (kind === 'svg-layout') return download(`${slug()}-layout.svg`, toSVG(prims, L.width, len), 'image/svg+xml');
  if (kind === 'dxf') return download(`${slug()}-pattern.dxf`, toDXF(prims), 'application/dxf');
  status('Building PDF…', true);
  if (kind === 'pdf-full') download(`${slug()}-cutting-layout.pdf`, await layoutPDF(prims, L.width, len, meta));
  if (kind === 'pdf-tiles') {
    const r = await tiledPDF(prims, L.width, len, meta);
    download(`${slug()}-print-${r.paper.replace(/\s/g, '')}.pdf`, r.blob);
    toast(`${r.pages} pages on ${r.paper}. Print at 100% scale.`);
  }
  status('Ready');
}
$('#btn-export').onclick = (e) => { e.stopPropagation(); $('#export-menu').hidden = !$('#export-menu').hidden; };
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) $('#export-menu').hidden = true; });
$('#export-menu').addEventListener('click', async (e) => {
  const k = e.target.closest('button')?.dataset.x;
  if (!k) return;
  $('#export-menu').hidden = true;
  try {
    if (['pdf-tiles', 'pdf-full', 'svg-layout', 'dxf'].includes(k)) return await cuttingExport(k);
    if (k === 'svg') return download(`${slug()}-garmentcode.svg`, await py('svg'), 'image/svg+xml');
    if (k === 'spec') return download(`${slug()}-specification.json`, await py('specJson'), 'application/json');
    if (k === 'design') return download('design_params.yaml', await py('designYaml'), 'text/yaml');
    if (k === 'body') return download('body_measurements.yaml', await py('bodyYaml'), 'text/yaml');
    if (k === 'obj') return download(`${slug()}.obj`, garmentOBJ());
    if (k === 'glb') return download(`${slug()}.glb`, await viewer.exportGLB());
    if (k === 'png') return download(`${slug()}.png`, await viewer.screenshotBlob());
    if (k === 'video') {
      status('Recording turntable…', true);
      const r = await viewer.recordTurntable(6);
      download(`${slug()}-turntable.${r.ext}`, r.blob);
      status('Ready');
      return;
    }
    if (k === 'share') return share();
    if (k === 'saves') return $('#btn-saves').click();
  } catch (err) { console.error(err); warn(err.message); status('Ready'); }
});

// mobile bottom sheet resize
(() => {
  const handle = $('#sheet-handle'), panel = $('#panel');
  let start = null;
  handle.addEventListener('pointerdown', (e) => { start = { y: e.clientY, h: panel.getBoundingClientRect().height }; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', (e) => {
    if (!start) return;
    const h = Math.max(window.innerHeight * 0.16, Math.min(window.innerHeight * 0.86, start.h - (e.clientY - start.y)));
    panel.style.setProperty('--sheet-h', `${h}px`);
  });
  const stop = () => { start = null; if (viewer.ok) viewer.resize(); };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
})();

// ---------------------------------------------------------------- boot
(async () => {
  const p = prefs.get();
  if (p.theme) applyTheme(p.theme);
  if (p.unit) { S.unit = p.unit; $$('[data-unit]').forEach(x => x.classList.toggle('active', x.dataset.unit === S.unit)); }
  renderTemplates();
  try {
    status('Loading mannequin…', true);
    await Promise.all(['neutral', 'female', 'male'].map(loadBase));
    await py('init');
    defaults.design = await py('defaultDesign');
    let start = null, fromShare = false;
    const m = location.hash.match(/#s=([\w-]+)/);
    if (m) {
      try { start = expandSnapshot(await decodeShare(m[1]), defaults); fromShare = true; toast('Opened a shared design'); }
      catch (e) { console.error(e); warn('This share link could not be read.'); }
    }
    if (!start && lastState.get()) { try { start = expandSnapshot(lastState.get(), defaults); } catch { start = null; } }
    S.template = start ? null : 'tee';
    if (!start) start = { design: defaults.design, base: 'neutral', measurements: { ...defaults.presets.neutral }, fabric: null };
    void fromShare;
    await applySnapshot(start);
  } catch (e) {
    console.error(e);
    status('Failed to start');
    warn(`Startup failed: ${e.message}`);
  }
})();

// offline cache (installable app)
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// debugging handle (used by the automated visual tests)
window.__gc = { viewer, get sim() { return sim; }, get sdf() { return sdf; } };
