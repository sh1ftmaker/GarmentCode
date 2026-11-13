// Generates the FreeSewing catalogue the app reads (run after upgrading @freesewing/*):
//   node tools/gen_fs_catalog.mjs
// Writes
//   src/fs/catalog.js           every design's id, name, designers, tags, difficulty (loaded up front)
//   src/fs/meta/<id>.json       its options as an app parameter tree with FreeSewing's English
//                               titles and help, its measurements and its part names (loaded on use)
// FreeSewing (https://freesewing.eu) is MIT licensed, (c) Joost De Cock and contributors.
import * as C from '@freesewing/collection';
import fs from 'node:fs';
import path from 'node:path';
import { genericPieces } from '../src/fs/generic.js';

// FreeSewing's average measurements (cisFemaleAdult in @freesewing/models' neckstimate.mjs),
// for the pattern thumbnails
const AVERAGE = { ankle: 245, biceps: 270, bustFront: 480, bustPointToUnderbust: 100, bustSpan: 160, chest: 925,
  crossSeam: 740, crossSeamFront: 370, crotchDepth: 270, heel: 315, head: 565, highBust: 865, highBustFront: 440,
  hips: 900, hpsToBust: 275, hpsToWaistBack: 395, hpsToWaistFront: 400, inseam: 765, knee: 380, neck: 340, seat: 1010,
  seatBack: 520, shoulderSlope: 13, shoulderToElbow: 340, shoulderToShoulder: 415, shoulderToWrist: 590, underbust: 780,
  upperLeg: 570, waist: 750, waistBack: 380, waistToArmpit: 170, waistToFloor: 1050, waistToHips: 125, waistToKnee: 600,
  waistToSeat: 250, waistToUnderbust: 80, waistToUpperLeg: 285, wrist: 165 };

/** Douglas-Peucker simplification of a closed outline (tolerance eps). */
function simplify(pts, eps) {
  const rec = (a, b, out) => {
    let best = -1, bd = eps;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > bd) { bd = d; best = i; } }
    if (best < 0) { out.push(pts[b]); return; }
    rec(a, best, out); rec(best, b, out);
  };
  // split at the point farthest from the first
  let far = 0, fd = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const out = [pts[0]];
  rec(0, far, out);
  const tail = pts.slice(far).concat([pts[0]]);
  const save = pts; pts = tail;
  rec(0, tail.length - 1, out);
  pts = save;
  out.pop();
  return out;
}

/** One SVG path (viewBox 0 0 100 100) with the design's distinct pieces packed in shelves. */
function thumbnail(panels) {
  const seen = new Set();
  const pieces = [];
  for (const p of panels) {
    const key = p.name.replace(/(_\d+)?(_[lr])?$/, '');   // one of each set of copies
    if (seen.has(key)) continue;
    seen.add(key);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p.boundary) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    pieces.push({ pts: p.boundary.map(([x, y]) => [x - x0, y1 - y]), w: x1 - x0, h: y1 - y0 });
  }
  if (!pieces.length) return '';
  pieces.sort((a, b) => b.h * b.w - a.h * a.w);
  const keep = pieces.slice(0, 9).sort((a, b) => b.h - a.h);
  // shelf packing at a width that makes the block roughly square
  const area = keep.reduce((s, p) => s + p.w * p.h, 0);
  let W = Math.max(Math.sqrt(area * 1.5), ...keep.map(p => p.w));
  const gap = 0.04 * Math.sqrt(area);
  let x = 0, y = 0, rowH = 0, maxX = 0;
  for (const p of keep) {
    if (x > 0 && x + p.w > W) { x = 0; y += rowH + gap; rowH = 0; }
    p.ox = x; p.oy = y; x += p.w + gap; rowH = Math.max(rowH, p.h); maxX = Math.max(maxX, x - gap);
  }
  const H = y + rowH, S = 92 / Math.max(maxX, H), dx = (100 - maxX * S) / 2, dy = (100 - H * S) / 2;
  const f = (v) => (Math.round(v * 10) / 10).toString();
  return keep.map(p => {
    const pts = simplify(p.pts.map(([px, py]) => [dx + (p.ox + px) * S, dy + (p.oy + py) * S]), 0.6);
    return 'M' + pts.map(([a, b]) => `${f(a)} ${f(b)}`).join('L') + 'Z';
  }).join('');
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const META = path.join(ROOT, 'src/fs/meta');
fs.mkdirSync(META, { recursive: true });

const round = (v) => Math.round(v * 1000) / 1000;
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// FreeSewing menus -> app parameter groups (in this order)
const GROUP_ORDER = ['fit', 'style', 'advanced'];

const catalog = [];
const thumbs = {};
for (const id of C.collection) {
  if (id === 'library') continue;   // parts library, not a design
  const D = C.designs[id];
  const cfg = D.patternConfig;
  const en = C.i18n[id]?.en || {};
  const about = C.about[id] || {};
  const opts = cfg.options || {};

  // option defaults, as FreeSewing merges them (pct as fractions), for menu functions
  const merged = {};
  for (const [k, v] of Object.entries(opts)) {
    if (typeof v !== 'object' || v == null) { merged[k] = v; continue; }
    merged[k] = v.pct != null ? v.pct / 100 : v.deg ?? v.count ?? v.bool ?? v.dflt ?? v.mm;
  }

  const groups = {};
  const dynamicMenus = [];
  for (const [k, v] of Object.entries(opts)) {
    if (typeof v !== 'object' || v == null) continue;          // constants
    let menu = v.menu;
    if (typeof menu === 'function') {
      dynamicMenus.push(k);
      try { menu = menu({}, merged); } catch { menu = 'advanced'; }
      if (!menu) menu = 'advanced';                             // hidden at the defaults
    }
    if (!menu) continue;                                        // internal option
    const t = en.o?.[k]?.t || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
    const help = en.o?.[k]?.d || '';
    let node;
    if (v.pct != null) node = { v: round(v.pct), range: [v.min, v.max], type: 'float', fs: 'pct', name: `${t} (%)` };
    else if (v.deg != null) node = { v: round(v.deg), range: [v.min, v.max], type: 'float', fs: 'deg', name: `${t} (°)` };
    else if (v.count != null) node = { v: v.count, range: [v.min, v.max], type: 'int', fs: 'count', name: t };
    else if (v.bool != null) node = { v: !!v.bool, type: 'bool', fs: 'bool', name: t };
    else if (v.list) {
      node = { v: v.dflt, range: v.list, type: 'select', fs: 'list', name: t,
        labels: Object.fromEntries(v.list.map(x => [x, en.o?.[`${k}.${x}`]?.t || String(x)])) };
    } else if (v.mm != null) node = { v: round(v.mm / 10), range: [v.min / 10, v.max / 10], type: 'float', fs: 'mm', name: `${t} (cm)` };
    else continue;
    if (help) node.help = help;
    if (node.range && node.type !== 'select' && !(node.range[1] > node.range[0])) continue;
    const g = String(menu);
    (groups[g] ||= {})[k] = node;
  }
  // stable group order: fit, style, style.*, advanced, advanced.*, then the rest
  const rank = (g) => { const i = GROUP_ORDER.indexOf(g.split('.')[0]); return (i < 0 ? 9 : i) * 100 + (g.includes('.') ? 1 : 0); };
  const design = Object.fromEntries(Object.keys(groups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map(g => [g, groups[g]]));

  const meta = {
    id,
    name: about.name || en.t || id,
    design,
    dynamicMenus,
    measurements: cfg.measurements || [],
    optionalMeasurements: cfg.optionalMeasurements || [],
    parts: en.p || {},
  };
  fs.writeFileSync(path.join(META, `${id}.json`), JSON.stringify(meta));

  let thumb = '';
  try {
    const names = [...meta.measurements, ...meta.optionalMeasurements];
    const m = Object.fromEntries(names.filter(k => k in AVERAGE).map(k => [k, AVERAGE[k]]));
    const p = new D({ measurements: m, complete: true, expand: true }).draft();
    thumb = thumbnail(genericPieces(p, meta).panels);
  } catch (e) { console.warn(`${id}: no thumbnail (${e.message})`); }
  thumbs[id] = thumb;

  catalog.push({
    id,
    name: about.name || en.t || id,
    description: en.d || about.description || '',
    designers: asList(about.design),
    difficulty: about.difficulty || 0,
    tags: asList(about.tags),
  });
}

const out = `// Generated by tools/gen_fs_catalog.mjs from @freesewing/collection ${C.about.simon?.version || ''} (MIT,
// https://freesewing.eu). Do not edit by hand.
export const FS_CATALOG = ${JSON.stringify(catalog, null, 0).replace(/\},\{/g, '},\n  {')};
`;
fs.writeFileSync(path.join(ROOT, 'src/fs/catalog.js'), out);
fs.writeFileSync(path.join(META, 'thumbs.json'), JSON.stringify(thumbs));
console.log(`wrote ${catalog.length} designs to src/fs/catalog.js and src/fs/meta/`);
