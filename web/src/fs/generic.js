// Any FreeSewing design as cut pieces, without a hand-written adapter: the outline of every
// part, unfolded when FreeSewing says to cut it on the fold, copied as often as its cut
// list says (mirrored pairs for "cut 2"), with its grainline. No seams are known, so these
// designs get the pattern, cutting layout and exports but no 3D drape (adapters in
// src/fs/<design>.js add that; see index.js).

const P = (pt) => [pt.x / 10, -pt.y / 10];          // FreeSewing mm, y down -> cm, y up
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const signedArea = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
const cubic = (a, b, c, d, t) => {
  const s = 1 - t;
  return [s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0],
          s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]];
};

/** Polylines (cm, y up) of a FreeSewing path, one per move (sub-path); closed flags. */
function pathPolys(path, res) {
  const polys = [];
  let cur = null, poly = null;
  for (const op of path.ops) {
    if (op.type === 'move') { cur = P(op.to); poly = { pts: [cur], closed: false }; polys.push(poly); continue; }
    if (!poly) continue;
    if (op.type === 'line') { cur = P(op.to); poly.pts.push(cur); }
    else if (op.type === 'curve') {
      const a = cur, b = P(op.cp1), c = P(op.cp2), d = P(op.to);
      const n = Math.max(2, Math.min(200, Math.ceil((dist(a, b) + dist(b, c) + dist(c, d)) / res)));
      for (let i = 1; i <= n; i++) poly.pts.push(cubic(a, b, c, d, i / n));
      cur = d;
    } else if (op.type === 'close') poly.closed = true;
  }
  for (const q of polys) {
    // drop repeated points, and a closing point equal to the first
    q.pts = q.pts.filter((p, i, a) => i === 0 || dist(p, a[i - 1]) > 1e-4);
    if (q.pts.length > 2 && dist(q.pts[0], q.pts[q.pts.length - 1]) < 0.05) { q.pts.pop(); q.closed = true; }
  }
  return polys.filter(q => q.pts.length >= 2);
}

const SKIP = /\b(note|help|mark|dotted|dashed|scalebox|hidden|contrast|interfacing|lining|stroke-sm|sa)\b/;
const classes = (p) => (p.attributes?.list?.class || []).join(' ');

/**
 * Chain open polylines end to end into closed loops (ends within tol cm). Some designs draw
 * overlapping variants of the same edge (a half and its mirror image as well as the whole),
 * so this searches the ways to continue at each end and keeps the loops it can close.
 */
function chainLoops(polys, tol = 0.15) {
  const segs = polys.map(p => p.pts);
  const loops = [];
  let budget = 20000;
  const used = new Array(segs.length).fill(false);
  const search = (loop, start) => {
    if (--budget < 0) return;
    const end = loop[loop.length - 1];
    if (loop.length > 2 && dist(loop[0], end) <= tol) { loops.push(loop.slice(0, -1)); return; }
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      const q = segs[i];
      for (const rev of [false, true]) {
        const a = rev ? q[q.length - 1] : q[0];
        if (dist(a, end) >= tol) continue;
        used[i] = true;
        search(loop.concat((rev ? q.slice().reverse() : q).slice(1)), start);
        used[i] = false;
        if (budget < 0) return;
      }
    }
  };
  for (let s = 0; s < segs.length && budget > 0; s++) {
    used[s] = true;
    search(segs[s].slice(), s);
    used[s] = false;
  }
  return loops;
}

/** The cutting outline of a part (cm, y up), or null. */
export function partOutline(part, res = 0.5) {
  const paths = part.paths || {};
  // the usual case: a closed `seam` path (even if FreeSewing hides it in this view)
  const candidates = [];
  if (paths.seam) candidates.push(...pathPolys(paths.seam, res).filter(q => q.closed && q.pts.length > 2).map(q => q.pts));
  if (!candidates.length) {
    const visible = Object.entries(paths).filter(([k, p]) => !p.hidden && !k.startsWith('__') && !SKIP.test(classes(p)) && !/^sa/.test(k));
    const polys = visible.flatMap(([, p]) => pathPolys(p, res));
    candidates.push(...polys.filter(q => q.closed && q.pts.length > 2).map(q => q.pts));
    candidates.push(...chainLoops(polys.filter(q => !q.closed)));
  }
  if (!candidates.length) return null;
  let best = null, bestA = 0;
  for (const c of candidates) { const a = Math.abs(signedArea(c)); if (a > bestA) { bestA = a; best = c; } }
  return bestA > 1 ? best : null;   // ignore specks (< 1 cm²)
}

/** Unfold an outline drawn as a half across the fold line a-b; null if it doesn't touch it. */
export function unfold(pts, a, b, tol = 0.08) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const off = (p) => ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
  const n = pts.length;
  const on = pts.map(p => Math.abs(off(p)) < tol);
  // longest cyclic run of vertices on the fold line
  let best = null;
  for (let s = 0; s < n; s++) {
    if (!on[s] || on[(s - 1 + n) % n]) continue;
    let e = s, len = 1;
    while (on[(e + 1) % n] && len < n) { e = (e + 1) % n; len++; }
    const span = dist(pts[s], pts[e]);
    if (!best || span > best.span) best = { s, e, span };
  }
  if (!best || best.span < 1) return null;
  // half outline from the run's end, around, to its start (off the fold)
  const half = [];
  for (let i = best.e; ; i = (i + 1) % n) { half.push(pts[i]); if (i === best.s) break; }
  const refl = (p) => { const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L); const fx = a[0] + t * dx, fy = a[1] + t * dy; return [2 * fx - p[0], 2 * fy - p[1]]; };
  const mirrored = half.slice(1, -1).reverse().map(refl);
  return half.concat(mirrored);
}

const slug = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Cut list entries of a part for one material: [{ cut, identical, onFold }]. */
function cutsOf(entry, material) {
  const m = entry?.materials;
  if (!m) return null;
  return m[material] || null;
}

/**
 * Cut pieces of a drafted pattern, as the app's pattern JSON ({ panels, stitches: [] }).
 * meta: the design's catalogue metadata (part titles). Pieces cut from other materials
 * (lining, interfacing, ribbing...) are listed in `others` (and only cut from the main
 * fabric when the design has no main fabric pieces at all).
 */
export function genericPieces(pattern, meta, { res = 0.5, material = null } = {}) {
  const parts = pattern.parts[0];
  const store = pattern.setStores?.[0] || {};
  const cutlist = store.cutlist || {};
  const prefix = `${meta.id}.`;
  const panels = [], others = {}, uncut = [];
  const usedNames = new Set();
  const nameFor = (raw) => { let n = raw, k = 2; while (usedNames.has(n)) n = `${raw}_${k++}`; usedNames.add(n); return n; };
  const titleOf = (name) => {
    const short = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
    const t = meta.parts?.[short] || meta.parts?.[name] || short.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
    return titleCase(t.toLowerCase().replace(/^\w/, c => c.toUpperCase()));
  };
  // which material counts as "the fabric": 'fabric' if any part uses it, else the most used one
  const mats = {};
  for (const e of Object.values(cutlist)) {
    if (!e?.materials) continue;
    e.materials = Object.fromEntries(Object.entries(e.materials).map(([k, v]) => [k === 'Fabric' ? 'fabric' : k, v]));
    for (const k of Object.keys(e.materials)) mats[k] = (mats[k] || 0) + 1;
  }
  const main = mats.fabric ? 'fabric' : Object.keys(mats).sort((x, y) => mats[y] - mats[x])[0] || 'fabric';
  const cutFrom = material && mats[material] ? material : main;

  for (const [name, part] of Object.entries(parts)) {
    if (part.hidden) continue;
    const entry = cutlist[name];
    let outline = partOutline(part, res);
    if (!outline) continue;
    const title = titleOf(name);
    for (const [mat, list] of Object.entries(entry?.materials || {})) {
      if (mat === cutFrom) continue;
      const n = list.reduce((s, c) => s + (+c.cut || 0), 0);
      if (n) (others[mat] ||= []).push(`${title} × ${n}`);
    }
    let cuts = cutsOf(entry, cutFrom);
    if (!cuts) {
      if (cutFrom !== main || (entry?.materials && Object.keys(entry.materials).length)) continue;   // cut from another material only
      cuts = [{ cut: 1, identical: false, onFold: !!entry?.cutOnFold }];        // no cut list: cut once
      if (!entry) uncut.push(title);
    }
    // cut on the fold: unfold along FreeSewing's fold line
    const fold = entry?.cutOnFold;
    let folded = false;
    if (cuts.some(c => c.onFold) && Array.isArray(fold) && fold.length === 2) {
      const full = unfold(outline, P(fold[0]), P(fold[1]));
      if (full) outline = full; else folded = true;
    }
    // grain: FreeSewing's angle (counter-clockwise on screen, y down) -> local vector
    let grain = null;
    if (typeof entry?.grain === 'number' && isFinite(entry.grain)) {
      const a = entry.grain * Math.PI / 180;
      grain = [Math.cos(a), Math.sin(a)];
      if (Math.abs(grain[0]) < 1e-9) grain[0] = 0;
      if (Math.abs(grain[1]) < 1e-9) grain[1] = 0;
      if (grain[1] < 0 || (grain[1] === 0 && grain[0] < 0)) grain = [-grain[0], -grain[1]];
    } else if (Array.isArray(fold) && fold.length === 2) {   // along the fold
      const a = P(fold[0]), b = P(fold[1]);
      const l = dist(a, b) || 1;
      grain = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      if (grain[1] < 0) grain = [-grain[0], -grain[1]];
    }
    const base = slug(name.startsWith(prefix) ? name.slice(prefix.length) : name.replace(/\./g, '_'));
    const push = (suffix, mirror, label) => {
      const pts = mirror ? outline.map(([x, y]) => [-x, y]).reverse() : outline;
      const panel = {
        name: nameFor(`${base}${suffix}`),
        title: `${title}${folded ? ' (cut on fold)' : ''}${label}`,
        label: 'body',
        boundary: pts,
        edge_ranges: [pts.map((_, i) => i)],
        labels: {},
        rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 0]],
        translation: [0, 0, 0],
        mirror,
      };
      if (grain) panel.grain = mirror ? [-grain[0], grain[1]].map((v, i) => (i === 0 && v === 0 ? 0 : v)) : grain;
      if (/rib|binding|cuff|waistband|neckband|legband/i.test(name) && mats.ribbing) panel.rib = true;
      panels.push(panel);
    };
    for (const c of cuts) {
      const n = Math.max(1, +c.cut || 1);
      const identical = c.identical === true || c.identical === 'true';
      if (n === 1) { push('', false, ''); continue; }
      if (identical) { for (let i = 0; i < n; i++) push(`_${i + 1}`, false, ''); continue; }
      // non-identical pairs: half as drawn, half mirrored (left / right)
      for (let i = 0; i < n; i++) {
        const mirror = i % 2 === 1, pair = Math.floor(i / 2);
        const many = n > 2 ? ` ${pair + 1}` : '';
        push(`${many ? '_' + (pair + 1) : ''}${mirror ? '_l' : '_r'}`, mirror, `${many} (${mirror ? 'left' : 'right'})`);
      }
    }
  }
  return { panels, stitches: [], attach_levels: {}, others, uncut, main, material: cutFrom, materials: Object.keys(mats).sort((a, b) => (a === main ? -1 : b === main ? 1 : a.localeCompare(b))) };
}
