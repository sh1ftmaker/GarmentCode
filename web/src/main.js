// GarmentCode 3D Studio: app orchestration.
import { Viewer } from './viewer.js';
import { py, onPyProgress } from './py.js';
import { buildGarment, ClothSim, SDF } from './garment.js';
import { parseBodyBin, prepareMorph, morphBody, measureGirth } from './body.js';
import { MEASUREMENTS, MEASUREMENT_GROUPS, ANGLE_KEYS, groupName, paramName, paramHelp, valueName, ESSENTIAL } from './labels.js';
import { TEMPLATES, applyTemplate } from './templates.js';
import { FABRICS, SWATCHES, simParams, grainStretch } from './fabric.js';
import { GRAIN_MODES, GRAIN_NAMES, GRAIN_HELP, grainMode, pieceGrains } from './grain.js';
import { buildPieces, sewingSteps, pieceName, cutText } from './pieces.js';
import { autoLayout, layoutLength, findProblems, regions, fabricToBuy } from './layout.js';
import { primitives, fabricPrims, toSVG, layoutPDF, patternPDF, planSheet, PAPERS, toDXF, yardText } from './export.js';
import { ADAPTERS, fsInfo, fsList, ensureFS, fsDefaults, isFS, fsPattern, fsSVG, fsSettings, fsRandomize } from './fs/index.js';
import { armAxes as computeArmAxes } from './fs/place.js';   // arm axes, for wrapping sleeves
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
  fabric: { id: 'cotton', color: '#c9d6ea', print: 'plain', bend: 0.55, stretch: 0.05, friction: 0.5, res: 2.0, release: false, selfCollide: true },
  template: 'tee',
  source: null,   // null = GarmentCode (Pyodide); else a FreeSewing design id (src/fs)
  grain: { all: 'straight', pieces: {} },   // grain.js: garment-wide mode for skirt/bodice pieces + per-piece overrides
};
const defaults = { design: null, presets: {}, fsDesign: fsDefaults, isFS };
const undoStack = new History();
const viewer = new Viewer($('#three'));
const bodies = {};            // base name -> { base, prep, sdfBuf }
let sdf = null, sdfReady = Promise.resolve(), sdfToken = 0;
let sim = null, pattern = null, genToken = 0, paused = false, flat = false;
const cut = { pieces: null, layout: null, alt: null, edited: false, key: '', sa: 1.5, folded: false, job: 0, material: null };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
let armAxes = null, bodyPos = null, curBody = null;   // curBody: current mannequin { pos, part } (FreeSewing measures on it)
function updateBodyMesh() {
  const b = bodies[S.base];
  if (!b) return;
  const pos = isPreset() ? b.base.pos : morphBody(b.prep, defaults.presets[S.base], S.measurements);
  viewer.setBody(pos, b.base.idx);
  curBody = { pos, part: b.base.part };
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
    pat = S.source
      ? await fsPattern(S.source, S.design, S.measurements, curBody, { res: S.fabric.res, drape: true })
      : await py('generate', { resolution: S.fabric.res });
  } catch (e) {
    if (token !== genToken) return;
    console.error(e.full || e);
    status('Pattern error');
    warn(S.source ? `FreeSewing couldn't draft this: ${e.message}` : `GarmentCode couldn't draft this combination: ${e.message}`);
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
  if (pat.noDrape) w.push(`${fsInfo(S.source).name} has no 3D drape yet, so the mannequin stays bare. Open the pattern (Pattern button) or the Cutting tab to see its ${pat.panels.length} pieces.`);
  if (pat.warnings?.length) w.push(`FreeSewing: ${pat.warnings.join(' ')}`);
  warn(w.join(' '));
  startDrape();
  if (!$('#pattern-card').hidden) refreshPatternSVG();
  if (S.mode === 'cut') refreshCut();
}

function startDrape() {
  sim = null;
  if (pattern?.noDrape) {
    viewer.clearGarment();
    status(`Pattern only · ${pattern.panels.length} pieces`);
    updateDrapeChip();
    return;
  }
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
  const g = buildGarment(pattern, S.fabric.res, sdf, { armAxes, grain: S.grain });
  viewer.setGarment(g);
  sim = new ClothSim(g, sdf, { ...simParams(S.fabric), releaseAttachments: S.fabric.release, selfCollision: !!S.fabric.selfCollide });
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
const snapshot = () => ({ source: S.source, design: S.design, base: S.base, measurements: S.measurements, fabric: { ...S.fabric }, grain: { all: S.grain.all, pieces: { ...S.grain.pieces } } });
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
  S.grain = { all: snap.grain?.all || 'straight', pieces: { ...(snap.grain?.pieces || {}) } };
  S.source = isFS(snap.source) ? snap.source : null;
  if (S.source) await ensureFS(S.source);
  if (S.source) {
    S.design = snap.design || fsDefaults(S.source);
    S.template = `fs:${S.source}`;
  } else {
    await py('setDesign', { design: snap.design });
    S.design = await py('design');
    if (S.template?.startsWith('fs:')) S.template = null;
  }
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
  const label = node.name || paramName(path);   // FreeSewing options carry their own labels
  const name = el('span', { class: 'pname' }, label);
  const help = node.help || paramHelp(path);
  if (node.type === 'bool') {
    const input = el('input', { type: 'checkbox', 'aria-label': label });
    input.checked = !!node.v;
    input.onchange = () => commitParam(path, input.checked);
    row.append(name, el('span', { class: 'pval' }, lock, el('label', { class: 'switch' }, input, el('i'))));
  } else if (node.type === 'select' || node.type === 'select_null') {
    const opts = [...(node.range || [])];
    if (node.type === 'select_null' && !opts.includes(null)) opts.push(null);
    const sel = el('select', { 'aria-label': label }, opts.map(o => {
      const op = el('option', { value: JSON.stringify(o) }, node.labels?.[o] ?? valueName(o));
      if (JSON.stringify(o) === JSON.stringify(node.v)) op.selected = true;
      return op;
    }));
    sel.onchange = () => commitParam(path, JSON.parse(sel.value));
    row.append(name, el('span', { class: 'pval' }, lock), el('div', { class: 'pctl' }, sel));
  } else if (node.type === 'float' || node.type === 'int') {
    const [lo, hi] = node.range;
    const isInt = node.type === 'int';
    const step = isInt ? 1 : +((hi - lo) / 200).toPrecision(2);
    const range = el('input', { type: 'range', min: lo, max: hi, step, value: node.v, 'aria-label': label });
    const num = el('input', { type: 'number', class: 'num', min: lo, max: hi, step, value: isInt ? node.v : (+node.v).toFixed(2), 'aria-label': `${label} value` });
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
  renderTemplates();
  $('#export-menu [data-x="svg"]').textContent = S.source ? 'FreeSewing pattern SVG' : 'GarmentCode pattern SVG';
  $('#export-menu [data-x="spec"]').textContent = S.source ? 'FreeSewing settings JSON' : 'Pattern specification JSON';
  $('#export-menu [data-x="design"]').hidden = !!S.source;
  if (S.source) return renderFSDesignUI(root);
  const d = S.design, meta = d.meta;
  const g = grainControl(meta);
  if (g) root.append(g);
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
}

/** Garment-wide grain (skirt and bodice pieces; grain.js), shown for skirts, dresses and tops. */
function grainControl(meta) {
  const skirt = meta?.bottom?.v && meta.bottom.v !== 'Pants', upper = !!meta?.upper?.v;
  if (!skirt && !upper) return null;
  const what = skirt && upper ? 'dress' : skirt ? 'skirt' : 'bodice';
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': `Grain of the ${what}` }, GRAIN_MODES.map(m =>
    el('button', { class: 'seg-btn' + (S.grain.all === m ? ' active' : ''), 'aria-pressed': String(S.grain.all === m), title: GRAIN_HELP[m],
      onclick: () => setGrain({ ...S.grain, all: m }) }, GRAIN_NAMES[m])));
  return el('div', { class: 'grain-ctl' },
    el('div', { class: 'grain-row' }, el('span', {}, `Cut the ${what} on`), seg),
    el('p', { class: 'muted small' }, GRAIN_HELP[S.grain.all] + (S.grain.all !== 'straight' ? ' Single pieces can be changed in Cutting.' : '')));
}
function setGrain(grain) {
  S.grain = { all: grain.all || 'straight', pieces: { ...(grain.pieces || {}) } };
  commitHistory();
  cut.key = '';
  renderDesignUI();
  startDrape();
  if (S.mode === 'cut') refreshCut();
  if (!$('#pattern-card').hidden) refreshPatternSVG();
}

/** Group title of a FreeSewing option menu ('style.collar' -> 'Style · Collar'). */
const fsGroupName = (g) => g.split('.').map(w => groupName(w)).join(' · ');
/**
 * Options of a FreeSewing design. Adapted designs have a few hand-picked options; the rest
 * show FreeSewing's own option menus (fit, style, ...; "advanced" ones only under "All").
 */
function renderFSDesignUI(root) {
  const info = fsInfo(S.source), A = ADAPTERS[S.source];
  const by = info.designers.length ? ` by ${info.designers.join(', ')}` : '';
  root.append(el('div', { class: 'fs-note' },
    el('b', {}, info.name), ' · a ', el('a', { href: info.url, target: '_blank', rel: 'noopener' }, 'FreeSewing'),
    ` design${by} (MIT), drafted in your browser from your measurements. `,
    A ? A.stretchNote : el('span', {}, el('b', {}, 'No 3D drape yet: '), 'FreeSewing doesn’t say which edges are sewn together, so this design is shown as its pattern. The pattern view, cutting layout and exports work as usual.')));
  const q = S.search.trim().toLowerCase();
  let hidden = 0;
  for (const [g, node] of Object.entries(S.design)) {
    const expert = !A && g.startsWith('advanced');
    const body = el('div', { class: 'gbody' });
    for (const [k, v] of Object.entries(node)) {
      if (!isParam(v) || (q && !(v.name || k).toLowerCase().includes(q) && !k.toLowerCase().includes(q))) continue;
      if (expert && S.detail === 'simple' && !q) { hidden++; continue; }
      const r = paramRow([g, k], v);
      if (r) body.append(r);
    }
    if (!body.children.length) continue;
    const key = `fs:${g}:closed`;
    const det = el('details', { class: 'group' }, el('summary', {}, fsGroupName(g)), body);
    det.open = !openGroups.has(key) && !(expert && !q);
    det.ontoggle = () => { det.open ? openGroups.delete(key) : openGroups.add(key); };
    root.append(det);
  }
  if (hidden) root.append(el('p', { class: 'muted small' }, `${hidden} advanced option${hidden === 1 ? '' : 's'} hidden. Choose “All” to show them.`));
  if (root.children.length < 2) root.append(el('p', { class: 'muted' }, 'No parameters match your search.'));
}

async function commitParam(path, value) {
  if (S.source) {
    const d = JSON.parse(JSON.stringify(S.design));
    let node = d;
    for (const k of path) node = node[k];
    node.v = value;
    S.design = d;
    commitHistory();
    regenerate();
    return;
  }
  try { await py('setParam', { path, value }); } catch (e) { warn(e.message); return; }
  S.design = await py('design');
  S.template = null;
  const structural = path[0] === 'meta' || ['levels-skirt.base', 'levels-skirt.level', 'godet-skirt.base', 'left.enable_asym'].includes(path.join('.'));
  if (structural) renderDesignUI(); else renderTemplates();
  commitHistory();
  regenerate();
}

// ---------------------------------------------------------------- design picker
// GarmentCode templates (drafted by GarmentCode in Pyodide) and every FreeSewing design:
// a "current design" card, a row of recently used designs, and a gallery dialog with
// categories, search and filters.
const TPL_ICONS = {
  tee: 'M14 8l8-4h12l8 4 6 10-7 4-3-5v31H18V17l-3 5-7-4z',
  longsleeve: 'M14 8l8-4h12l8 4 8 30-6 2-6-20v28H18V20l-6 20-6-2z',
  hoodie: 'M20 10c-1-9 17-9 16 0l6 2 8 28-6 2-6-20v26H18V22l-6 20-6-2 8-28zM22 38h12l3 8H19z',
  ziphoodie: 'M20 10c-1-9 17-9 16 0l6 2 8 28-6 2-6-20v26H29V14h-2v34H18V22l-6 20-6-2 8-28z',
  sweatshirt: 'M14 8l8-4c2 4 10 4 12 0l8 4 8 30-6 2-6-20v24H18V20l-6 20-6-2zM18 44h20v4H18z',
  joggers: 'M14 4h28l3 44h-11l-6-30-6 30H11zM11 48h11v4H11zM34 48h11v4H34z',
  aline: 'M20 4h16l2 16 10 30H8l10-30z',
  sundress: 'M18 6h20v14l12 30H6l12-30z',
  maxi: 'M22 2c4-2 8-2 12 0l4 10 6 4-4 4-2-2 6 34H12l6-34-2 2-4-4 6-4z',
  pencil: 'M14 6h28l-2 46H16z',
  tiered: 'M18 6h20l2 14H16zM15 20h26l3 15H12zM12 35h32l4 16H8z',
  trousers: 'M14 4h28l4 48h-12l-6-34-6 34H10z',
  shorts: 'M14 10h28l4 22H32l-4-10-4 10H10z',
};
const KIND_ORDER = ['Tops', 'Jackets & coats', 'Dresses', 'Skirts', 'Trousers & shorts', 'One-pieces', 'Swim & underwear',
  'Historical', 'Blocks', 'Accessories', 'Costumes', 'Toys', 'Other'];
let fsThumbs = null;   // FreeSewing pattern thumbnails (src/fs/meta/thumbs.json), loaded with the gallery
const loadThumbs = () => (fsThumbs ||= fetch(new URL('./fs/meta/thumbs.json', import.meta.url)).then(r => r.json()).catch(() => ({})));
/** Every design the picker offers: { key, src: 'gc'|'fs', id, name, kind, by, description, drape, difficulty, icon } */
function allDesigns() {
  const gc = TEMPLATES.map(t => ({ key: t.id, src: 'gc', id: t.id, name: t.name, kind: t.kind, by: 'GarmentCode', description: t.description || '', drape: true, difficulty: 0, icon: TPL_ICONS[t.id] || TPL_ICONS.tee }));
  const fs = fsList().map(d => ({ key: `fs:${d.id}`, src: 'fs', id: d.id, name: d.name, kind: d.kind, by: d.designers.join(', '), description: d.description, drape: d.drape, difficulty: d.difficulty, icon: d.icon, tags: d.tags }));
  return [...gc, ...fs];
}
const designByKey = (key) => allDesigns().find(d => d.key === key);
function thumbSVG(d, size = 56) {
  if (d.icon) return `<svg viewBox="0 0 56 56" width="${size}" height="${size}" aria-hidden="true"><path class="thumb-path" d="${d.icon}"/></svg>`;
  const path = thumbCache[d.id];
  return path ? `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><path class="thumb-path" d="${path}"/></svg>`
    : `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><rect class="thumb-path" x="22" y="14" width="56" height="72" rx="6"/></svg>`;
}
const thumbCache = {};
async function ensureThumbs() { Object.assign(thumbCache, await loadThumbs()); }
const diffDots = (n) => (n ? `<span class="diff" title="Difficulty ${n} of 5">${'●'.repeat(n)}<i>${'●'.repeat(5 - n)}</i></span>` : '');

const RECENT_MAX = 8;
function recentKeys() { const r = prefs.get().recent; return Array.isArray(r) ? r.filter(k => designByKey(k)) : []; }
function pushRecent(key) { prefs.set({ recent: [key, ...recentKeys().filter(k => k !== key)].slice(0, RECENT_MAX) }); }

async function selectGC(t) {
  if (!defaults.design) return;
  cut.material = null;
  S.template = t.id; S.source = null;
  await py('setDesign', { design: applyTemplate(defaults.design, t) });
  S.design = await py('design');
  pushRecent(t.id);
  renderDesignUI(); renderTemplates();
  commitHistory();
  regenerate();
}
async function selectFS(id) {
  cut.material = null;
  try { await ensureFS(id); } catch (e) { warn(e.message); return; }
  S.source = id; S.template = `fs:${id}`;
  S.design = fsDefaults(id);
  pushRecent(`fs:${id}`);
  renderDesignUI(); renderTemplates();
  commitHistory();
  await regenerate();
  // no drape: the pattern is the picture (on wide screens, where it fits beside the mannequin)
  if (!ADAPTERS[id] && $('#pattern-card').hidden && matchMedia('(min-width: 821px)').matches) $('#btn-pattern').click();
}
const selectDesign = (key) => (key.startsWith('fs:') ? selectFS(key.slice(3)) : selectGC(TEMPLATES.find(t => t.id === key) || TEMPLATES[0]));

/** The current-design card and the recent row. */
function renderTemplates() {
  const key = S.source ? `fs:${S.source}` : S.template;
  const d = key && designByKey(key);
  $('#cd-thumb').innerHTML = d ? thumbSVG(d, 56) : thumbSVG({ icon: TPL_ICONS.tee }, 56);
  $('#cd-name').textContent = d ? d.name : 'Custom design';
  $('#cd-kicker').innerHTML = d
    ? `${d.src === 'gc' ? 'GarmentCode' : `FreeSewing · ${esc(d.by)}`} <span class="pill ${d.drape ? 'drape' : 'flat'}">${d.drape ? '3D' : 'Pattern'}</span>`
    : 'GarmentCode · edited';
  $('#cd-desc').textContent = d ? (d.description || '') : 'Your own combination of GarmentCode parameters.';
  if (d && !d.icon) ensureThumbs().then(() => { if ((S.source ? `fs:${S.source}` : S.template) === key) $('#cd-thumb').innerHTML = thumbSVG(d, 56); });
  const root = $('#templates');
  root.innerHTML = '';
  let keys = recentKeys();
  if (keys.length < 4) keys = [...keys, ...['tee', 'hoodie', 'aline', 'trousers', 'fs:hugo', 'fs:teagan'].filter(k => !keys.includes(k))].slice(0, 6);
  for (const k of keys) {
    const r = designByKey(k);
    const b = el('button', { class: 'tpl' + (k === key ? ' active' : ''), 'data-id': k, title: `${r.name} (${r.src === 'gc' ? 'GarmentCode' : 'FreeSewing'})` });
    b.innerHTML = thumbSVG(r, 44);
    b.append(el('span', {}, r.name.length > 24 ? r.name.replace(/^(\w+) /, '') : r.name));
    b.onclick = () => selectDesign(k);
    root.append(b);
  }
  const more = el('button', { class: 'tpl more', title: 'Browse every design' }, el('b', {}, '⋯'), el('span', {}, `All ${allDesigns().length} designs`));
  more.onclick = openGallery;
  root.append(more);
  if (keys.some(k => !designByKey(k).icon)) ensureThumbs().then(() => { $$('#templates .tpl[data-id^="fs:"]').forEach(b => { const r = designByKey(b.dataset.id); if (r && !r.icon) b.querySelector('svg').outerHTML = thumbSVG(r, 44); }); });
}

const gal = { kind: 'All', src: 'all', drapeOnly: false, q: '' };
async function openGallery() {
  try { const g = prefs.get().gallery; if (g) Object.assign(gal, { kind: g.kind || 'All', src: g.src || 'all', drapeOnly: !!g.drapeOnly }); } catch { /* defaults */ }
  gal.q = '';
  $('#gal-search').value = '';
  $('#gal-3d').checked = gal.drapeOnly;
  $$('#gal-source .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.src === gal.src));
  renderGallery();
  $('#dlg-gallery').showModal();
  if (matchMedia('(min-width: 821px)').matches) $('#gal-search').focus();
  await ensureThumbs();
  renderGallery();
  $('#gal-body .gcard.active')?.scrollIntoView({ block: 'center' });
}
function galleryMatches() {
  const q = gal.q.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  return allDesigns().filter(d => {
    if (gal.src !== 'all' && d.src !== gal.src) return false;
    if (gal.drapeOnly && !d.drape) return false;
    if (!words.length) return true;
    const hay = `${d.name} ${d.id} ${d.kind} ${d.by} ${d.description} ${(d.tags || []).join(' ')} ${d.src === 'gc' ? 'garmentcode' : 'freesewing'}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}
function renderGallery() {
  const list = galleryMatches();
  const key = S.source ? `fs:${S.source}` : S.template;
  // category chips with counts (for the current source / search filters)
  const counts = {};
  for (const d of list) counts[d.kind] = (counts[d.kind] || 0) + 1;
  const kinds = KIND_ORDER.filter(k => counts[k]);
  if (gal.kind !== 'All' && !counts[gal.kind]) gal.kind = 'All';
  const chips = $('#gal-kinds');
  chips.innerHTML = '';
  for (const k of ['All', ...kinds]) {
    const c = el('button', { class: 'chip' + (gal.kind === k ? ' on' : ''), role: 'tab', 'aria-selected': String(gal.kind === k) }, k, el('small', {}, String(k === 'All' ? list.length : counts[k])));
    c.onclick = () => { gal.kind = k; saveGal(); renderGallery(); $('#gal-body').scrollTop = 0; };
    chips.append(c);
  }
  const shown = gal.kind === 'All' ? list : list.filter(d => d.kind === gal.kind);
  $('#gal-count').textContent = `${shown.length} design${shown.length === 1 ? '' : 's'} · ${shown.filter(d => d.drape).length} in 3D`;
  const body = $('#gal-body');
  body.innerHTML = '';
  if (!shown.length) { body.append(el('div', { class: 'gal-empty' }, 'No designs match. Try another search or clear the filters.')); return; }
  for (const k of KIND_ORDER) {
    const ds = shown.filter(d => d.kind === k)
      .sort((a, b) => (b.drape - a.drape) || (a.src === b.src ? 0 : a.src === 'gc' ? -1 : 1) || a.name.localeCompare(b.name));
    if (!ds.length) continue;
    const grid = el('div', { class: 'gal-grid' });
    for (const d of ds) {
      const b = el('button', { class: 'gcard' + (d.key === key ? ' active' : ''), 'data-id': d.key, 'aria-label': `${d.name}, ${d.src === 'gc' ? 'GarmentCode' : 'FreeSewing by ' + d.by}${d.drape ? ', drapes in 3D' : ', pattern only'}` });
      b.innerHTML = `<div class="gthumb">${thumbSVG(d, 120)}<span class="pill ${d.drape ? 'drape' : 'flat'}">${d.drape ? '3D' : 'Pattern'}</span></div>
        <div class="gtext"><div class="gname">${esc(d.name)}</div>
        <div class="gby">${d.src === 'gc' ? 'GarmentCode' : esc(d.by)} ${diffDots(d.difficulty)}</div>
        ${d.description && !/^A description for/i.test(d.description) ? `<div class="gdesc">${esc(d.description)}</div>` : ''}</div>`;
      b.onclick = () => { $('#dlg-gallery').close(); selectDesign(d.key); };
      grid.append(b);
    }
    body.append(el('section', { class: 'gal-sec' }, el('h4', {}, k, el('small', {}, `${ds.length}`)), grid));
  }
}
function saveGal() { prefs.set({ gallery: { kind: gal.kind, src: gal.src, drapeOnly: gal.drapeOnly } }); }
$('#btn-browse').onclick = openGallery;
$('#gal-search').oninput = (e) => { gal.q = e.target.value; renderGallery(); };
$('#gal-search').onkeydown = (e) => { if (e.key === 'Enter') { const first = $('#gal-body .gcard'); if (first) first.click(); } };
$('#gal-3d').onchange = (e) => { gal.drapeOnly = e.target.checked; saveGal(); renderGallery(); };
$$('#gal-source .seg-btn').forEach(b => { b.onclick = () => { gal.src = b.dataset.src; $$('#gal-source .seg-btn').forEach(x => x.classList.toggle('active', x === b)); saveGal(); renderGallery(); }; });

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
      Object.assign(S.fabric, { id: f.id, bend: f.bend, stretch: f.stretch, weft: f.weft, bias: f.bias, friction: f.friction });
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
  const gs = grainStretch(S.fabric);
  $('#weft').value = gs.weft; $('#bias').value = gs.bias;
  $('#bend').value = S.fabric.bend; $('#stretch').value = S.fabric.stretch; $('#fric').value = S.fabric.friction; $('#res').value = S.fabric.res;
  $('#release-attach').checked = !!S.fabric.release;
  $('#self-collide').checked = !!S.fabric.selfCollide;
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
  $('#stretch-val').textContent = s < 0.15 ? 'firm' : s < 0.5 ? 'some stretch' : 'stretchy';
  const word = (v) => (v < 0.3 ? 'firm' : v < 0.6 ? 'a little' : v < 0.85 ? 'gives' : 'very stretchy');
  $('#weft-val').textContent = word(+$('#weft').value); $('#bias-val').textContent = word(+$('#bias').value);
  $('#fric-val').textContent = (+$('#fric').value).toFixed(2);
  $('#res-val').textContent = `${(+$('#res').value).toFixed(1)} cm`;
}
for (const [id, key] of [['bend', 'bend'], ['stretch', 'stretch'], ['weft', 'weft'], ['bias', 'bias'], ['fric', 'friction'], ['res', 'res']]) {
  $('#' + id).addEventListener('input', labelSliders);
  $('#' + id).addEventListener('change', () => {
    if (key === 'weft' || key === 'bias') Object.assign(S.fabric, grainStretch(S.fabric));
    S.fabric[key] = +$('#' + id).value;
    commitHistory();
    if (key === 'res') regenerate(); else startDrape();
  });
}
$('#release-attach').onchange = (e) => { S.fabric.release = e.target.checked; commitHistory(); startDrape(); };
$('#self-collide').onchange = (e) => { S.fabric.selfCollide = e.target.checked; commitHistory(); startDrape(); };
$('#print-select').onchange = (e) => { S.fabric.print = e.target.value; applyFabricLook(); commitHistory(); };

// ---------------------------------------------------------------- cutting layout
// Pieces -> layout on a bolt of fabric (layout.js, nesting search in a worker) -> exports.
function fabricWidth() {
  const v = $('#fabric-width').value;
  return v === 'custom' ? Math.max(30, Math.min(400, Math.round(+$('#fabric-custom').value || 130))) : +v;
}
const cutOpts = () => ({ width: fabricWidth(), folded: cut.folded, allowRotate: $('#allow-rotate').checked });
function measureNote() {   // printed on every piece so a pattern can be matched to its body later
  const m = S.measurements || {};
  const f = (k) => (m[k] == null ? null : S.unit === 'in' ? (m[k] / 2.54).toFixed(1) : Math.round(m[k]));
  const parts = [['Bust', 'bust'], ['Waist', 'waist'], ['Hips', 'hips'], ['Height', 'height']].filter(([, k]) => m[k] != null).map(([n, k]) => `${n} ${f(k)}`);
  return parts.length ? `${parts.join(' · ')} ${S.unit === 'in' ? 'in' : 'cm'}` : '';
}
// FreeSewing designs without an adapter list pieces per material (fabric, lining, interfacing...)
const MATERIAL_NAMES = { fabric: 'Main fabric', lining: 'Lining', interfacing: 'Interfacing', ribbing: 'Ribbing', rigidInterfacing: 'Rigid interfacing', undersideFabric: 'Underside fabric' };
const materialName = (k) => MATERIAL_NAMES[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
function showMaterials(data) {
  const mats = data.materials || [];
  $('#material-wrap').hidden = mats.length < 2;
  const sel = $('#cut-material');
  if (mats.length >= 2) {
    sel.innerHTML = '';
    for (const k of mats) sel.append(el('option', { value: k }, materialName(k)));
    sel.value = data.material || mats[0];
  }
  const others = Object.entries(data.others || {});
  $('#cut-others').hidden = !others.length;
  $('#cut-others').textContent = others.length
    ? `Also cut from ${others.map(([k, list]) => `${materialName(k).toLowerCase()}: ${list.join(', ')}`).join('; ')}.`
    : '';
}
async function ensurePieces() {
  const sa = +$('#seam-allowance').value;
  const note = measureNote();
  const key = `${genToken}|${sa}|${note}|${JSON.stringify(S.grain)}|${cut.material || ''}`;
  if (cut.key === key && cut.pieces) return false;
  const data = S.source
    ? await fsPattern(S.source, S.design, S.measurements, curBody, { res: 0.5, drape: false, material: cut.material })   // the real (stretch) pattern
    : await py('pieces', { res: 0.5 });
  showMaterials(data);
  const set = buildPieces(data, { sa, note, grain: S.grain });
  const sameSet = cut.pieces && cut.pieces.pieces.map(p => p.id).join() === set.pieces.map(p => p.id).join() && cut.sa === sa;
  cut.pieces = set; cut.sa = sa; cut.key = key;
  return !cut.layout || !sameSet || !cut.edited;
}

// nesting search in a worker (falls back to a quick greedy pass on the main thread)
let layoutWorker = null, layoutJobs = 0;
const pendingLayouts = new Map();
function slimSet(set) {
  return {
    pieces: set.pieces.map(p => ({ id: p.id, cut: p.cut, sew: p.sew, bbox: p.bbox, area: p.area, sym: p.sym, group: p.group, flip: p.flip })),
    groups: set.groups.map(g => ({ id: g.id, members: g.members.map(m => ({ id: m.id, flip: m.flip })), sym: g.sym, count: g.count })),
  };
}
function arrange(opts, budget) {
  try {
    if (!layoutWorker) {
      layoutWorker = new Worker(new URL('./layout-worker.js', import.meta.url), { type: 'module' });
      layoutWorker.onmessage = (e) => { const p = pendingLayouts.get(e.data.id); if (p) { pendingLayouts.delete(e.data.id); e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.layout); } };
      layoutWorker.onerror = () => { for (const p of pendingLayouts.values()) p.reject(new Error('layout worker failed')); pendingLayouts.clear(); layoutWorker = null; };
    }
    const id = ++layoutJobs;
    return new Promise((resolve, reject) => {
      pendingLayouts.set(id, { resolve, reject });
      layoutWorker.postMessage({ id, set: slimSet(cut.pieces), opts: { ...opts, timeBudget: budget } });
    }).catch(() => autoLayout(cut.pieces, { ...opts, timeBudget: Math.min(budget, 200) }));
  } catch {
    return Promise.resolve(autoLayout(cut.pieces, { ...opts, timeBudget: Math.min(budget, 200) }));
  }
}
async function relayout() {
  const job = ++cut.job;
  const opts = cutOpts();
  cut.layout = autoLayout(cut.pieces, { ...opts, timeBudget: 0 });   // instant first answer
  cut.edited = false; cut.alt = null;
  renderLayout();
  status('Optimising the layout…', true);
  const set = cut.pieces;
  const [best, alt] = await Promise.all([arrange(opts, 1500), arrange({ ...opts, folded: !opts.folded }, 500)]);
  if (job !== cut.job || set !== cut.pieces) return;
  if (!cut.edited && best.length < cut.layout.length - 1e-6) cut.layout = best;
  cut.alt = alt;
  status(`${set.pieces.length} pattern pieces`);
  if (S.mode === 'cut') renderLayout();
}
async function refreshCut() {
  if (!pattern || !pattern.panels.length) {
    $('#layout-view').innerHTML = '<p class="muted" style="text-align:center;margin-top:30vh">Nothing to cut: the design is empty.</p>';
    return;
  }
  status('Preparing pattern pieces…', true);
  let fresh;
  try { fresh = await ensurePieces(); } catch (e) { warn(e.message); return; }
  if (fresh) await relayout();
  else { renderLayout(); status(`${cut.pieces.pieces.length} pattern pieces`); }
}
const polyArea = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
const lenText = (cm) => (S.unit === 'in' ? `${Math.ceil(cm / 2.54)} in` : `${Math.ceil(cm)} cm`);
function renderLayout() {
  const set = cut.pieces, L = cut.layout;
  if (!set || !L) return;
  const W = L.width, length = layoutLength(set, L), len = Math.max(20, Math.ceil(length + 4));
  const view = $('#layout-view');
  const x0 = -5, y0 = -4, vw = W + 14, vh = len + 6;
  const pxPerCm = Math.min(7, Math.max(2, (view.clientWidth - 48) / vw));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${x0} ${y0} ${vw} ${vh}`);
  svg.setAttribute('width', vw * pxPerCm);
  svg.setAttribute('height', vh * pxPerCm);
  const inner = (prims) => toSVG(prims, 1, 1, { units: false, bg: false }).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  let grid = '';
  const { split } = regions(set, L);
  for (let x = 10; x < W; x += 10) {
    const top = L.folded && split > 0 && x > W / 2 ? (L.items.some(i => i.region === 'open') ? split : len) : 0;
    if (top < len) grid += `<line x1="${x}" y1="${top}" x2="${x}" y2="${len}" stroke="#000" stroke-opacity="${x % 50 ? .04 : .1}" stroke-width=".1"/>`;
  }
  for (let y = 10; y < len; y += 10) grid += `<line x1="0" y1="${y}" x2="${L.folded && split > 0 && y < split ? W / 2 : W}" y2="${y}" stroke="#000" stroke-opacity="${y % 50 ? .04 : .1}" stroke-width=".1"/>`;
  const fab = fabricPrims(set, L, { length: len });
  svg.innerHTML = `<g class="fabric">${inner(fab)}${grid}</g>
    <text x="0" y="-1.4" font-size="1.8" fill="#8e877d" font-family="Inter, sans-serif">${W} cm (${Math.round(W / 2.54)}″) wide${L.folded ? ', folded lengthwise' : ''} · grain runs top to bottom</text>`;
  const problems = findProblems(set, L);
  const prims = primitives(set, L, { sewLines: $('#show-sewline').checked });
  const by = {};
  for (const q of prims) (by[q.id] ||= []).push(q);
  for (const it of L.items) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'piece' + (problems.has(it.id) ? ' overlap' : '') + (it.fold ? ' on-fold' : ''));
    g.dataset.id = it.id;
    g.innerHTML = inner(by[it.id] || []);
    svg.append(g);
  }
  view.innerHTML = '';
  view.append(svg);
  enableDrag(svg, pxPerCm);

  // summary: what to buy
  const byId = Object.fromEntries(set.pieces.map(p => [p.id, p]));
  const pieceArea = set.pieces.reduce((s, p) => s + polyArea(p.cut), 0);
  const buy = fabricToBuy(length);
  $('#cut-summary').innerHTML = `
    <div class="stat"><b>${S.unit === 'in' ? yardText(buy.yd) : `${buy.m.toFixed(1)} m`}</b><span>to buy (${S.unit === 'in' ? `${buy.m.toFixed(1)} m` : yardText(buy.yd)})</span></div>
    <div class="stat"><b>${lenText(length)}</b><span>layout length</span></div>
    <div class="stat"><b>${Math.round(pieceArea / (W * Math.max(1, length)) * 100)}%</b><span>of the fabric used</span></div>`;
  const alt = cut.alt;
  $('#cut-compare').innerHTML = alt && Math.abs(alt.width - W) < 1e-6 && alt.folded !== L.folded
    ? `${alt.folded ? 'Folded lengthwise' : 'As a single layer'} it would take ${S.unit === 'in' ? yardText(fabricToBuy(alt.length).yd) : `${fabricToBuy(alt.length).m.toFixed(1)} m`}${alt.length < length - 5 ? ' (less)' : alt.length > length + 5 ? ' (more)' : ''}. <button class="linkish" id="btn-alt">Use that</button>`
    : '';
  const ba = $('#btn-alt');
  if (ba) ba.onclick = () => { setFolded(alt.folded); cut.layout = alt; cut.alt = null; cut.edited = false; renderLayout(); relayoutAlt(); };
  // cutting list, with the grain of each piece (straight / cross / bias), stored per piece
  const list = $('#cut-list');
  list.innerHTML = '';
  for (const g of set.groups) {
    const rep = byId[g.members[0].id];
    const sel = el('select', { class: 'grain-sel', 'aria-label': `Grain of ${g.name}`, title: GRAIN_HELP[rep?.grainMode || 'straight'] },
      GRAIN_MODES.map(m => el('option', { value: m, selected: (rep?.grainMode || 'straight') === m }, GRAIN_NAMES[m].replace(' (45°)', ''))));
    sel.onchange = () => {
      const pieces = { ...S.grain.pieces };
      for (const m of g.members) {
        const raw = m.id.replace(/_lining$/, '');
        // no override when the piece would get this grain anyway
        if (grainMode(raw, { all: S.grain.all }) === sel.value) { delete pieces[raw]; delete pieces[m.id]; } else pieces[raw] = sel.value;
      }
      setGrain({ all: S.grain.all, pieces });
    };
    list.append(el('li', {}, el('b', {}, g.name), el('span', {}, cutText(g, { folded: L.folded }), sel)));
  }
  $('#sew-steps').innerHTML = sewingSteps(set).map(s => `<li>${s}</li>`).join('');
  const names = (ids) => [...new Set(ids.map(id => byId[id]?.name || id))].join(', ');
  const notes = [];
  if (L.tooWide?.length) notes.push(`${names(L.tooWide)} ${L.tooWide.length > 1 ? 'are' : 'is'} wider than ${W} cm fabric, even turned sideways (shown in red, sticking out). Choose a wider fabric, or cut ${L.tooWide.length > 1 ? 'them' : 'it'} in two and add a seam.`);
  if (L.crossGrain?.length) notes.push(`${names(L.crossGrain)} only fit${L.crossGrain.length > 1 ? '' : 's'} turned 90° (cross-grain): fine for most stable wovens, not for stretch fabric or one-way prints. A wider fabric avoids it.`);
  const bias = set.pieces.filter(p => p.grainMode === 'bias');
  if (bias.length) notes.push(`${names(bias.map(p => p.id))}: cut on the bias, laid at 45° to the selvedge (takes more fabric). Handle bias edges gently, they stretch; staystitch them and let the garment hang a day before hemming.`);
  if (L.folded && (L.movedOpen?.length || L.singles?.length)) notes.push(`${names([...(L.movedOpen || []), ...(L.singles || [])])}: cut from the opened-out fabric below the folded part.`);
  warn(notes.join(' '));
  if (problems.size) toast(`${problems.size} piece${problems.size > 1 ? 's overlap' : ' overlaps'} or leave the fabric (shown in red).`);
}
async function relayoutAlt() {   // refresh the comparison line after switching
  const job = cut.job, opts = cutOpts();
  const alt = await arrange({ ...opts, folded: !opts.folded }, 500);
  if (job === cut.job) { cut.alt = alt; if (S.mode === 'cut') renderLayout(); }
}
function enableDrag(svg, pxPerCm) {
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.piece');
    if (!g) return;
    const it = cut.layout.items.find(i => i.id === g.dataset.id);
    if (!it) return;
    drag = { g, it, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    let dx = (e.clientX - drag.sx) / pxPerCm, dy = (e.clientY - drag.sy) / pxPerCm;
    if (Math.abs(dx) + Math.abs(dy) > 0.6) drag.moved = true;
    if (drag.it.fold) dx = 0;   // an on-fold piece stays on the fold
    drag.dx = Math.round(dx * 2) / 2; drag.dy = Math.round(dy * 2) / 2;
    drag.g.setAttribute('transform', `translate(${drag.dx} ${drag.dy})`);
  });
  const end = () => {
    if (!drag) return;
    const it = drag.it;
    if (drag.moved) { it.x += drag.dx; it.y += drag.dy; }
    else if ($('#allow-rotate').checked) it.rot = (it.rot + 180) % 360;
    cut.edited = true;
    drag = null;
    renderLayout();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}
function setFolded(f) {
  cut.folded = !!f;
  $$('#fold-seg .seg-btn').forEach(b => { const on = (b.dataset.fold === '1') === cut.folded; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  prefs.set({ cutFolded: cut.folded });
}
const reArrange = () => { if (cut.pieces) relayout(); };
$('#btn-autolayout').onclick = reArrange;
$('#fabric-width').onchange = () => {
  $('#fabric-custom-wrap').hidden = $('#fabric-width').value !== 'custom';
  prefs.set({ fabricWidth: $('#fabric-width').value });
  reArrange();
};
$('#fabric-custom').onchange = () => { prefs.set({ fabricCustom: $('#fabric-custom').value }); reArrange(); };
$$('#fold-seg .seg-btn').forEach(b => { b.onclick = () => { if ((b.dataset.fold === '1') !== cut.folded) { setFolded(b.dataset.fold === '1'); reArrange(); } }; });
$('#allow-rotate').onchange = reArrange;
$('#seam-allowance').onchange = () => { cut.key = ''; refreshCut(); };
$('#cut-material').onchange = (e) => { cut.material = e.target.value; cut.key = ''; refreshCut(); };
$('#show-sewline').onchange = () => { if (cut.pieces) renderLayout(); };
$('#paper').onchange = () => prefs.set({ paper: $('#paper').value });
$('#btn-print-pdf').onclick = async () => { try { await cuttingExport(`pdf-${$('#paper').value}`); } catch (e) { status('Ready'); warn(e.message); } };
{   // restore cutting preferences
  const p = prefs.get();
  if (p.fabricWidth && [...$('#fabric-width').options].some(o => o.value === p.fabricWidth)) $('#fabric-width').value = p.fabricWidth;
  if (p.fabricCustom) $('#fabric-custom').value = p.fabricCustom;
  $('#fabric-custom-wrap').hidden = $('#fabric-width').value !== 'custom';
  setFolded(!!p.cutFolded);
  $('#paper').value = p.paper || (/^en-(US|CA)|^es-(MX|US)/.test(navigator.language || '') ? 'letter' : 'a4');
}

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
$('#btn-body').onclick = () => { const on = !$('#btn-body').classList.contains('on'); $('#btn-body').classList.toggle('on', on); viewer.showBody(on); };
$('#btn-camera').onclick = () => { if (viewer.ok) viewer.resetCamera(); };
async function refreshPatternSVG() {
  try { $('#pattern-svg').innerHTML = (S.source ? await fsSVG(S.source, S.design, S.measurements, curBody) : await py('svg', { grains: pattern ? pieceGrains(pattern, S.grain) : {} })) || '<p class="muted">Empty pattern</p>'; }
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
  if (S.source) {
    S.design = fsRandomize(S.design, S.locked);
    renderDesignUI(); commitHistory(); regenerate();
    return;
  }
  await py('randomize', { locked: [...S.locked].map(k => k.split('.')) });
  S.design = await py('design'); S.template = null;
  renderDesignUI(); commitHistory(); regenerate();
};
$('#btn-reset').onclick = () => selectDesign(S.source ? `fs:${S.source}` : (S.template && designByKey(S.template) ? S.template : 'tee'));
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
      S.design = await py('design'); S.template = null; S.source = null;
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
    img.onclick = async () => { $('#dlg-saves').close(); if (isFS(s.state.s)) await ensureFS(s.state.s); await applySnapshot(expandSnapshot(s.state, defaults)); toast(`Opened “${s.name}”`); };
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
const designTitle = () => (S.source ? fsInfo(S.source).name : TEMPLATES.find(t => t.id === S.template)?.name || 'Custom design');
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
  status('Preparing pattern pieces…', true);
  if (await ensurePieces() || !cut.layout) cut.layout = autoLayout(cut.pieces, { ...cutOpts(), timeBudget: 300 });
  const set = cut.pieces, L = cut.layout;
  const length = layoutLength(set, L), len = Math.ceil(length + 2);
  const meta = {
    title: designTitle(), note: set.note, sa: cut.sa, folded: L.folded, fabricWidth: L.width, fabricLength: length,
    steps: sewingSteps(set), date: new Date().toISOString().slice(0, 10),
  };
  const fab = [...fabricPrims(set, L, { length: len }), ...primitives(set, L, { sewLines: true })];
  const done = () => status('Ready');
  if (kind === 'svg-layout') { done(); return download(`${slug()}-cutting-layout.svg`, toSVG(fab, L.width + 14, len + 4, { x0: -5, y0: -2 }), 'image/svg+xml'); }
  if (kind === 'dxf') { done(); return download(`${slug()}-cutting-layout.dxf`, toDXF(fab), 'application/dxf'); }
  if (kind === 'svg-sheet') {
    const sh = planSheet(set, { folded: L.folded, paper: PAPERS.roll36, budget: 300 });
    done();
    return download(`${slug()}-pattern-pieces.svg`, toSVG(primitives(set, sh.layout, { title: meta.title }), sh.width, sh.length), 'image/svg+xml');
  }
  status('Building PDF…', true);
  if (kind === 'pdf-full') download(`${slug()}-cutting-layout-1to1.pdf`, await layoutPDF(fab, L.width, len, meta));
  const paper = kind.startsWith('pdf-') && PAPERS[kind.slice(4)] ? kind.slice(4) : null;
  if (paper) {
    const r = await patternPDF(set, meta, { paper, fabricPrims: fab, fabricSize: [L.width, len] });
    download(`${slug()}-pattern-${paper}.pdf`, r.blob);
    toast(`${r.pages} page${r.pages > 1 ? 's' : ''} on ${r.paper}. Print at 100% / actual size and check the test square.`, 4500);
  }
  done();
}
$('#btn-export').onclick = (e) => { e.stopPropagation(); $('#export-menu').hidden = !$('#export-menu').hidden; };
document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) $('#export-menu').hidden = true; });
$('#export-menu').addEventListener('click', async (e) => {
  const k = e.target.closest('button')?.dataset.x;
  if (!k) return;
  $('#export-menu').hidden = true;
  try {
    if (['pdf-a4', 'pdf-letter', 'pdf-a0', 'pdf-roll36', 'pdf-full', 'svg-layout', 'svg-sheet', 'dxf'].includes(k)) return await cuttingExport(k);
    if (S.source && ['svg', 'spec', 'design'].includes(k)) {   // FreeSewing: its own drawing + settings
      if (k === 'svg') return download(`${slug()}-freesewing.svg`, await fsSVG(S.source, S.design, S.measurements, curBody), 'image/svg+xml');
      return download(`${slug()}-freesewing-settings.json`, JSON.stringify(await fsSettings(S.source, S.design, S.measurements, curBody), null, 2), 'application/json');
    }
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
      try { const c = await decodeShare(m[1]); if (isFS(c.s)) await ensureFS(c.s); start = expandSnapshot(c, defaults); fromShare = true; toast('Opened a shared design'); }
      catch (e) { console.error(e); warn('This share link could not be read.'); }
    }
    if (!start && lastState.get()) { try { const c = lastState.get(); if (isFS(c.s)) await ensureFS(c.s); start = expandSnapshot(c, defaults); } catch { start = null; } }
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
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // An older worker may have served stale modules for this page load; when the updated
  // worker takes over, reload once so every module comes from the same release.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// debugging handle (used by the automated visual tests)
window.__gc = { viewer, selectDesign, get sim() { return sim; }, get sdf() { return sdf; }, get pattern() { return pattern; }, get state() { return S; } };
