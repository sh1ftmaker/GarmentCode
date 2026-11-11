import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildGarment, ClothSim, SDF } from './garment.js';

// ---------------------------------------------------------------------------
// Python worker RPC
const worker = new Worker(new URL('./py-worker.js', import.meta.url));
let rpcId = 0;
const pending = new Map();
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'progress') { setStatus(m.text, true); return; }
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  m.ok ? p.resolve(m.result) : p.reject(Object.assign(new Error(m.error), { full: m.full }));
};
const rpc = (cmd, args) => new Promise((resolve, reject) => {
  const id = ++rpcId;
  pending.set(id, { resolve, reject });
  worker.postMessage({ id, cmd, args });
});

// ---------------------------------------------------------------------------
// DOM helpers
const $ = (s) => document.querySelector(s);
const statusEl = $('#status'), statusText = $('#status-text');
function setStatus(text, busy = false) {
  statusText.textContent = text;
  statusEl.classList.toggle('idle', !busy);
}
function showWarn(text) {
  const w = $('#warn');
  w.hidden = !text;
  w.textContent = text || '';
}
const pretty = (k) => k.replace(/[_-]/g, ' ');

// ---------------------------------------------------------------------------
// three.js scene
const canvas = $('#three');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
camera.position.set(90, 130, 330);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 105, 0);
controls.enableDamping = true;
controls.minDistance = 60;
controls.maxDistance = 900;
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8a85, 1.4));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(120, 260, 180);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -120, right: 120, top: 220, bottom: -20, near: 10, far: 700 });
key.shadow.bias = -0.0005;
scene.add(key);
const rim = new THREE.DirectionalLight(0xdfe6ff, 0.9);
rim.position.set(-200, 150, -200);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);

// body
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb9b4ad, roughness: 0.75, metalness: 0 });
let bodyMesh = null, sdf = null;
const bodyCache = {};
async function loadBody(name) {
  if (!bodyCache[name]) {
    const [b, s] = await Promise.all([
      fetch(`data/body_${name}.bin`).then(r => r.arrayBuffer()),
      fetch(`data/sdf_${name}.bin`).then(r => r.arrayBuffer()),
    ]);
    const [nv, nf] = new Uint32Array(b, 0, 2);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b, 8, nv * 3), 3));
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(b, 8 + nv * 12, nf * 3), 1));
    geom.computeVertexNormals();
    bodyCache[name] = { geom, sdf: new SDF(s) };
  }
  if (bodyMesh) scene.remove(bodyMesh);
  bodyMesh = new THREE.Mesh(bodyCache[name].geom, bodyMat);
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  bodyMesh.visible = $('#show-body').checked;
  scene.add(bodyMesh);
  sdf = bodyCache[name].sdf;
}

// garment
const fabricTex = new THREE.TextureLoader().load('data/fabric_texture.png', (t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
});
const garmentMat = new THREE.MeshStandardMaterial({
  color: $('#fabric-color').value, map: fabricTex, roughness: 0.9, metalness: 0,
  side: THREE.DoubleSide, vertexColors: false,
});
let garmentMesh = null, sim = null, lastPattern = null, flatMode = false;

const PANEL_COLORS = [0xe8a87c, 0x85c1e9, 0xa3d9a5, 0xf5cba7, 0xc39bd3, 0xf7dc6f, 0x76d7c4, 0xf1948a,
  0xaed6f1, 0xd7bde2, 0xa9dfbf, 0xfad7a0];

function buildMesh(pattern) {
  if (garmentMesh) { scene.remove(garmentMesh); garmentMesh.geometry.dispose(); garmentMesh = null; }
  sim = null;
  if (!pattern.panels.length) return;
  const h = +$('#res').value;
  const g = buildGarment(pattern, h);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(g.positions, 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
  const colors = new Float32Array(g.nv * 3);
  const c = new THREE.Color();
  for (let i = 0; i < g.nv; i++) {
    c.setHex(PANEL_COLORS[g.panelOf[i] % PANEL_COLORS.length]);
    colors[3 * i] = c.r; colors[3 * i + 1] = c.g; colors[3 * i + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setIndex(new THREE.BufferAttribute(g.index, 1));
  geom.computeVertexNormals();
  garmentMesh = new THREE.Mesh(geom, garmentMat);
  garmentMesh.castShadow = garmentMesh.receiveShadow = true;
  scene.add(garmentMesh);
  sim = new ClothSim(g, sdf, simOpts());
  flatMode = !$('#auto-drape').checked;
  updateDrapeButtons();
}

function simOpts() {
  const b = +$('#bend').value;
  return {
    bendCompliance: 2e-4 * Math.pow(10, -4 * b),
    friction: +$('#fric').value,
  };
}

function updateDrapeButtons() {
  $('#btn-drape').textContent = sim && !sim.done && !flatMode && sim.t > 0 ? '⏸ Pause' : '▶ Drape';
  $('#btn-flat').disabled = !sim;
}

// render loop
let paused = false;
function frame() {
  requestAnimationFrame(frame);
  controls.update();
  if (sim && !flatMode && !paused && !sim.done) {
    const t0 = performance.now();
    sim.step(1 / 60);
    if (performance.now() - t0 < 6 && !sim.done) sim.step(1 / 60); // run faster on quick machines
    garmentMesh.geometry.attributes.position.needsUpdate = true;
    garmentMesh.geometry.computeVertexNormals();
    garmentMesh.geometry.computeBoundingSphere();
    const bar = $('#sim-bar');
    bar.hidden = sim.done;
    bar.firstElementChild.style.width = `${(sim.progress * 100).toFixed(1)}%`;
    if (sim.attached === false && !sim._announced) { sim._announced = true; if (!sim.done) setStatus('Attachments released, settling…', true); }
    if (sim.done) {
      setStatus('Draped'); updateDrapeButtons();
      const slip = sim.slipAfterRelease();
      if (slip > 12) showWarn(`This design slid ${slip.toFixed(0)} cm once the waist/neck attachments were released. It probably does not fit this body (GarmentCode's simulator releases them the same way).`);
    }
  }
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Parameter UI
let design = null;
const RELEVANT = {
  upper: { FittedShirt: ['shirt', 'collar', 'sleeve', 'left'], Shirt: ['shirt', 'collar', 'sleeve', 'left'] },
  wb: { StraightWB: ['waistband'], FittedWB: ['waistband'] },
  bottom: {
    SkirtCircle: ['flare-skirt'], AsymmSkirtCircle: ['flare-skirt'], GodetSkirt: ['godet-skirt', 'skirt'],
    Pants: ['pants'], Skirt2: ['skirt'], SkirtManyPanels: ['flare-skirt'], PencilSkirt: ['pencil-skirt'],
    SkirtLevels: ['levels-skirt', 'skirt', 'flare-skirt', 'pencil-skirt'],
  },
};
const openGroups = new Set(['meta']);

function isParam(node) { return node && typeof node === 'object' && 'v' in node && 'type' in node; }

function paramControl(name, node, path) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  const head = document.createElement('span');
  head.textContent = pretty(name);
  const val = document.createElement('b');
  head.appendChild(val);
  wrap.appendChild(head);
  const type = node.type;
  let input;
  if (type === 'bool') {
    wrap.className = 'check';
    wrap.textContent = '';
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!node.v;
    wrap.append(input, document.createTextNode(pretty(name)));
    input.onchange = () => commit(path, input.checked);
  } else if (type === 'select' || type === 'select_null') {
    input = document.createElement('select');
    const opts = [...(node.range || [])];
    if (type === 'select_null' && !opts.includes(null)) opts.push(null);
    for (const o of opts) {
      const op = document.createElement('option');
      op.value = JSON.stringify(o);
      op.textContent = o === null ? '— none —' : String(o);
      if (JSON.stringify(o) === JSON.stringify(node.v)) op.selected = true;
      input.appendChild(op);
    }
    input.onchange = () => commit(path, JSON.parse(input.value));
    wrap.appendChild(input);
  } else if (type === 'float' || type === 'int') {
    const [lo, hi] = node.range;
    input = document.createElement('input');
    input.type = 'range';
    input.min = lo; input.max = hi;
    input.step = type === 'int' ? 1 : (hi - lo) / 200;
    input.value = node.v;
    const fmt = (v) => type === 'int' ? String(Math.round(v)) : (+v).toFixed(2);
    val.textContent = fmt(node.v);
    input.oninput = () => { val.textContent = fmt(input.value); };
    input.onchange = () => commit(path, type === 'int' ? Math.round(+input.value) : +input.value);
    wrap.appendChild(input);
  } else {
    val.textContent = JSON.stringify(node.v);
  }
  return wrap;
}

function groupEl(name, node, path, depth) {
  const det = document.createElement('details');
  const key = path.join('.');
  det.open = openGroups.has(key);
  det.ontoggle = () => det.open ? openGroups.add(key) : openGroups.delete(key);
  const sum = document.createElement('summary');
  sum.textContent = pretty(name);
  det.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'group-body';
  for (const [k, v] of Object.entries(node)) {
    if (isParam(v)) body.appendChild(paramControl(k, v, [...path, k]));
    else if (v && typeof v === 'object') body.appendChild(groupEl(k, v, [...path, k], depth + 1));
  }
  det.appendChild(body);
  return det;
}

function renderDesignUI() {
  const root = $('#design-params');
  root.innerHTML = '';
  const meta = design.meta;
  const relevant = new Set(['meta']);
  for (const slot of ['upper', 'wb', 'bottom']) {
    const v = meta?.[slot]?.v;
    for (const g of (RELEVANT[slot][v] || [])) relevant.add(g);
  }
  if (meta?.bottom?.v === 'SkirtLevels') {
    const base = design['levels-skirt']?.base?.v;
    for (const g of (RELEVANT.bottom[base] || [])) relevant.add(g);
  }
  const keys = Object.keys(design);
  const rel = keys.filter(k => relevant.has(k));
  const other = keys.filter(k => !relevant.has(k));
  for (const k of rel) root.appendChild(groupEl(k, design[k], [k], 0));
  if (other.length) {
    const sep = document.createElement('div');
    sep.className = 'group-sep';
    sep.textContent = 'Not used by the current garment';
    root.appendChild(sep);
    for (const k of other) {
      const el = groupEl(k, design[k], [k], 0);
      el.style.opacity = 0.65;
      root.appendChild(el);
    }
  }
}

async function renderBodyUI() {
  const params = await rpc('body');
  const root = $('#body-params');
  root.innerHTML = '';
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith('_')) continue;
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const head = document.createElement('span');
    head.textContent = pretty(k);
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.value = (+v).toFixed(2);
    input.onchange = async () => {
      await rpc('setBodyParam', { key: k, value: +input.value });
      regenerate();
    };
    wrap.append(head, input);
    root.appendChild(wrap);
  }
}

async function commit(path, value) {
  try { await rpc('setParam', { path, value }); } catch (e) { showWarn(e.message); return; }
  design = await rpc('design');
  if (path[0] === 'meta' || path.join('.') === 'levels-skirt.base') renderDesignUI();
  regenerate();
}

// ---------------------------------------------------------------------------
// Generation pipeline (latest request wins)
let genToken = 0;
async function regenerate() {
  const token = ++genToken;
  setStatus('Generating sewing pattern…', true);
  let pattern;
  try {
    pattern = await rpc('generate', { resolution: +$('#res').value });
  } catch (e) {
    if (token !== genToken) return;
    console.error(e.full || e);
    setStatus('Pattern error');
    showWarn(`This parameter combination failed in GarmentCode: ${e.message}`);
    return;
  }
  if (token !== genToken) return;
  lastPattern = pattern;
  const warns = [];
  if (!pattern.panels.length) warns.push('Empty design: pick an upper garment, waistband or bottom in “meta”.');
  if (pattern.self_intersecting) warns.push('Some panels are self-intersecting, so the drape may look wrong.');
  showWarn(warns.join(' '));
  buildMesh(pattern);
  paused = false;
  setStatus(pattern.panels.length ? `${pattern.panels.length} panels · ${sim ? sim.g.nv : 0} vertices` : 'Empty design', false);
  if (sim && !flatMode) setStatus('Draping…', true);
  if (!$('#pattern-card').hidden) refreshSvg();
}

async function refreshSvg() {
  const holder = $('#pattern-svg');
  try {
    const svg = await rpc('svg');
    holder.innerHTML = svg || '<p class="muted">Empty pattern</p>';
  } catch (e) {
    holder.textContent = `Could not render SVG: ${e.message}`;
  }
}

// ---------------------------------------------------------------------------
// Downloads
function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function garmentObj() {
  if (!garmentMesh) return '';
  const g = garmentMesh.geometry;
  const p = g.attributes.position.array, uv = g.attributes.uv.array, idx = g.index.array;
  const lines = ['# Draped garment exported from the unofficial GarmentCode 3D web configurator', '# units: cm'];
  for (let i = 0; i < p.length; i += 3) lines.push(`v ${p[i].toFixed(4)} ${p[i + 1].toFixed(4)} ${p[i + 2].toFixed(4)}`);
  for (let i = 0; i < uv.length; i += 2) lines.push(`vt ${uv[i].toFixed(5)} ${uv[i + 1].toFixed(5)}`);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] + 1, b = idx[i + 1] + 1, c = idx[i + 2] + 1;
    lines.push(`f ${a}/${a} ${b}/${b} ${c}/${c}`);
  }
  return lines.join('\n') + '\n';
}

$('#btn-download').onclick = (e) => { e.stopPropagation(); $('#download-menu').hidden = !$('#download-menu').hidden; };
document.addEventListener('click', () => { $('#download-menu').hidden = true; });
$('#download-menu').addEventListener('click', async (e) => {
  const kind = e.target.dataset.dl;
  if (!kind) return;
  try {
    if (kind === 'spec') download('garment_specification.json', await rpc('specJson'), 'application/json');
    if (kind === 'svg') download('garment_pattern.svg', await rpc('svg'), 'image/svg+xml');
    if (kind === 'design') download('design_params.yaml', await rpc('designYaml'), 'text/yaml');
    if (kind === 'body') download('body_measurements.yaml', await rpc('bodyYaml'), 'text/yaml');
    if (kind === 'obj') download('garment_draped.obj', garmentObj(), 'text/plain');
  } catch (err) { showWarn(err.message); }
});

// ---------------------------------------------------------------------------
// Wiring
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === t.dataset.tab));
});
$('#sheet-toggle').onclick = () => {
  const sb = $('#sidebar');
  sb.classList.toggle('collapsed');
  $('#sheet-toggle').textContent = sb.classList.contains('collapsed') ? '▴' : '▾';
};

$('#btn-random').onclick = async () => {
  await rpc('randomize');
  design = await rpc('design');
  renderDesignUI();
  regenerate();
};
$('#btn-reset').onclick = async () => {
  await rpc('reset');
  design = await rpc('design');
  renderDesignUI();
  regenerate();
};
$('#body-select').onchange = async (e) => {
  setStatus('Loading body…', true);
  await Promise.all([loadBody(e.target.value), rpc('setBody', { name: e.target.value })]);
  await renderBodyUI();
  regenerate();
};
$('#btn-upload').onclick = () => $('#file-input').click();
$('#file-input').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    await rpc('loadDesign', { text: await f.text() });
    design = await rpc('design');
    renderDesignUI();
    regenerate();
  } catch (err) { showWarn(`Could not load ${f.name}: ${err.message}`); }
  e.target.value = '';
};

$('#btn-drape').onclick = () => {
  if (!sim) return;
  if (flatMode || sim.done) {
    flatMode = false; paused = false;
    if (sim.done || sim.t === 0) sim.reset();
    Object.assign(sim.opts, simOpts());
    setStatus('Draping…', true);
  } else {
    paused = !paused;
    setStatus(paused ? 'Paused' : 'Draping…', !paused);
  }
  updateDrapeButtons();
  if (paused) $('#btn-drape').textContent = '▶ Resume';
};
$('#btn-flat').onclick = () => {
  if (!sim) return;
  sim.reset();
  flatMode = true;
  garmentMesh.geometry.attributes.position.needsUpdate = true;
  garmentMesh.geometry.computeVertexNormals();
  $('#sim-bar').hidden = true;
  setStatus('Flat panels in their initial 3D placement');
  updateDrapeButtons();
};
$('#btn-pattern').onclick = () => {
  const card = $('#pattern-card');
  card.hidden = !card.hidden;
  if (!card.hidden) refreshSvg();
};
$('#pattern-close').onclick = () => { $('#pattern-card').hidden = true; };

const label = (id, fmt) => { const el = $(id); const out = $(`${id}-val`); const f = () => out.textContent = fmt(+el.value); el.addEventListener('input', f); f(); };
label('#res', v => `${v.toFixed(1)} cm`);
label('#bend', v => v < 0.33 ? 'soft' : v < 0.66 ? 'medium' : 'stiff');
label('#fric', v => v.toFixed(2));
$('#res').onchange = () => lastPattern && regenerate();
$('#bend').onchange = () => { if (lastPattern) { buildMesh(lastPattern); setStatus('Draping…', true); } };
$('#fric').onchange = () => { if (lastPattern) { buildMesh(lastPattern); setStatus('Draping…', true); } };
$('#show-body').onchange = (e) => { if (bodyMesh) bodyMesh.visible = e.target.checked; };
$('#panel-colors').onchange = (e) => {
  garmentMat.vertexColors = e.target.checked;
  garmentMat.color.set(e.target.checked ? '#ffffff' : $('#fabric-color').value);
  garmentMat.needsUpdate = true;
};
$('#wire').onchange = (e) => { garmentMat.wireframe = e.target.checked; };
$('#fabric-color').oninput = (e) => { if (!garmentMat.vertexColors) garmentMat.color.set(e.target.value); };

// ---------------------------------------------------------------------------
// Boot
(async () => {
  resize();
  frame();
  try {
    await loadBody('neutral');
    await rpc('init');
    design = await rpc('design');
    renderDesignUI();
    await renderBodyUI();
    await regenerate();
  } catch (e) {
    console.error(e);
    setStatus('Failed to start');
    showWarn(`Startup failed: ${e.message}`);
  }
})();
