// App state snapshots: undo/redo, share links, saved designs, body profiles, autosave.
// A snapshot is { source, design, base, measurements, fabric, grain }; source is null for
// GarmentCode designs or a FreeSewing design id (then design is that design's option tree).

export class History {
  constructor(limit = 100) { this.stack = []; this.i = -1; this.limit = limit; }
  push(snap) {
    const s = JSON.stringify(snap);
    if (this.i >= 0 && this.stack[this.i] === s) return false;
    this.stack = this.stack.slice(0, this.i + 1);
    this.stack.push(s);
    if (this.stack.length > this.limit) this.stack.shift();
    this.i = this.stack.length - 1;
    return true;
  }
  get canUndo() { return this.i > 0; }
  get canRedo() { return this.i < this.stack.length - 1; }
  undo() { return this.canUndo ? JSON.parse(this.stack[--this.i]) : null; }
  redo() { return this.canRedo ? JSON.parse(this.stack[++this.i]) : null; }
}

// --- compact form: only values that differ from the defaults
export function designValues(design, prefix = [], out = {}) {
  for (const [k, v] of Object.entries(design)) {
    if (v && typeof v === 'object' && 'v' in v && 'type' in v) out[[...prefix, k].join('.')] = v.v;
    else if (v && typeof v === 'object') designValues(v, [...prefix, k], out);
  }
  return out;
}
export function applyValues(design, values) {
  const d = JSON.parse(JSON.stringify(design));
  for (const [path, v] of Object.entries(values)) {
    let node = d;
    for (const k of path.split('.')) { node = node?.[k]; }
    if (node && 'v' in node) node.v = v;
  }
  return d;
}
const designDefaults = (source, defaults) => (source && defaults.isFS?.(source) ? defaults.fsDesign(source) : defaults.design);
export function compactSnapshot(snap, defaults) {
  const dv = designValues(snap.design), base = designValues(designDefaults(snap.source, defaults));
  const d = {};
  for (const [k, v] of Object.entries(dv)) if (JSON.stringify(v) !== JSON.stringify(base[k])) d[k] = v;
  const m = {};
  const bm = defaults.presets[snap.base] || {};
  for (const [k, v] of Object.entries(snap.measurements || {})) if (Math.abs(v - (bm[k] ?? NaN)) > 1e-6 || !(k in bm)) m[k] = Math.round(v * 100) / 100;
  // grain (v3): { a: garment-wide mode, p: { piece: mode } }, only when not all straight
  const gr = snap.grain || {}, gp = Object.fromEntries(Object.entries(gr.pieces || {}).filter(([, v]) => v));
  const g = (gr.all && gr.all !== 'straight') || Object.keys(gp).length ? { ...(gr.all && gr.all !== 'straight' ? { a: gr.all } : {}), ...(Object.keys(gp).length ? { p: gp } : {}) } : null;
  return { v: 3, ...(snap.source ? { s: snap.source } : {}), ...(snap.custom ? { c: snap.custom } : {}), d, b: snap.base, m, f: snap.fabric, ...(g ? { g } : {}) };
}
export function expandSnapshot(c, defaults) {
  const source = c.s && defaults.isFS?.(c.s) ? c.s : null;   // older links have no source: GarmentCode
  return {
    source,
    custom: c.c || null,   // a Draft workshop pattern (src/workshop/model.js)
    design: applyValues(designDefaults(source, defaults), c.d || {}),
    base: c.b || 'neutral',
    measurements: { ...(defaults.presets[c.b || 'neutral'] || {}), ...(c.m || {}) },
    // v1 stored self-collision while it was off by default; let older saves pick up the new default
    fabric: c.f ? ((c.v || 1) < 2 ? (({ selfCollide, ...f }) => f)(c.f) : c.f) : null,
    // v1/v2 links have no grain: everything on the straight grain
    grain: { all: c.g?.a || 'straight', pieces: { ...(c.g?.p || {}) } },
  };
}

// --- share links: deflate + base64url in the URL hash
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
export async function encodeShare(compact) {
  const raw = new TextEncoder().encode(JSON.stringify(compact));
  if (window.CompressionStream) return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw')));
  return 'j' + b64u(raw);
}
export async function decodeShare(s) {
  const kind = s[0], bytes = unb64u(s.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

// --- local storage (always guarded: private mode / blocked storage must not break the app)
const KEY_SAVES = 'gc3d.saves.v1', KEY_PROFILES = 'gc3d.profiles.v1', KEY_LAST = 'gc3d.last.v1', KEY_PREFS = 'gc3d.prefs.v1';
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
// Saved designs ("My designs", library.js). Entries keep the compact snapshot opaquely in `state`
// (unknown fields such as `c` are never dropped). Thumbnails are small data URLs (~10 kB each).
export const SAVES_MAX = 200;
export const saves = {
  list: () => read(KEY_SAVES, []),
  setAll: (l) => write(KEY_SAVES, l.slice(0, SAVES_MAX)),
  add(entry) { const l = saves.list(); l.unshift(entry); return write(KEY_SAVES, l.slice(0, SAVES_MAX)); },
  remove(id) { write(KEY_SAVES, saves.list().filter(e => e.id !== id)); },
};
export const profiles = {
  list: () => read(KEY_PROFILES, []),
  add(p) { const l = profiles.list().filter(e => e.name !== p.name); l.unshift(p); write(KEY_PROFILES, l.slice(0, 30)); },
};
export const lastState = { get: () => read(KEY_LAST, null), set: (c) => write(KEY_LAST, c) };
export const prefs = { get: () => read(KEY_PREFS, {}), set: (p) => write(KEY_PREFS, { ...prefs.get(), ...p }) };
