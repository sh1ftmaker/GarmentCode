// Cutting layout: arrange cut pieces on a bolt of fabric, grain along the fabric length.
//
// Fabric coordinates: x across the width, y along the length (downwards), cm.
// Each piece keeps its grainline (local y) parallel to the selvedge: rotation 0 or 180°
// (180 only when the fabric has no nap / one-way print). Pieces wider than the fabric may
// turn 90/270 (cross-grain) and are reported.
//
// Two ways to lay the fabric:
//  - single layer, full width: every cut piece is placed on its own;
//  - folded lengthwise (selvedges together): the top section is half as wide (x = 0 is the
//    fold, x = W/2 the selvedges) and cuts two layers at once, so a mirror pair (left and
//    right panels) is one placement, and a symmetric piece can be cut "on the fold" from its
//    half. Pieces that must be cut singly (an odd asymmetric piece, or anything too wide for
//    the folded width) go below, after the fabric is opened out to full width.
//
// Nesting is raster based (0.5 cm cells, true piece outlines, holes in concave pieces
// usable), bottom-left fill, with a short local search over the piece order inside a time
// budget. Pure JS without DOM access, so it also runs in a worker.

export const CELL = 0.5;

/** Map a local piece point to fabric coordinates for a placement {x, y, rot}. */
export function xf(piece, pl, [px, py]) {
  const [minX, minY, maxX, maxY] = piece.bbox;
  const w = maxX - minX, h = maxY - minY;
  void minY;
  // local (x, y-up) -> fabric (x, y-down), garment top towards the top of the layout
  let x = px - minX, y = maxY - py;
  if (pl.rot === 180) { x = w - x; y = h - y; }
  else if (pl.rot === 90) { const t = x; x = h - y; y = t; }
  else if (pl.rot === 270) { const t = x; x = y; y = w - t; }
  return [pl.x + x, pl.y + y];
}
export const pieceSize = (p, rot = 0) => {
  const w = p.bbox[2] - p.bbox[0], h = p.bbox[3] - p.bbox[1];
  return rot === 90 || rot === 270 ? [h, w] : [w, h];
};
/** x of the fold line for an on-fold placement (the piece's symmetry axis). */
export const foldX = (piece, pl) => pl.x + pieceSize(piece, pl.rot)[0] / 2;

/** Keep the part of a closed polygon with x >= x0 (Sutherland-Hodgman, one edge). */
export function clipHalf(pts, x0) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ina = a[0] >= x0 - 1e-9, inb = b[0] >= x0 - 1e-9;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (x0 - a[0]) / (b[0] - a[0]); out.push([x0, a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}

/** Piece outline in fabric coordinates (half outline for an on-fold placement). */
export function placed(piece, pl, which = 'cut') {
  const pts = (which === 'sew' ? piece.sew : piece.cut).map(p => xf(piece, pl, p));
  return pl.fold ? clipHalf(pts, foldX(piece, pl)) : pts;
}
/** Width/height an item occupies on the fabric. */
export function itemSize(piece, it) {
  const [w, h] = pieceSize(piece, it.rot);
  return it.fold ? [w / 2, h] : [w, h];
}

// ------------------------------------------------------------------ raster masks
// A mask is a list of rows (top to bottom) of inclusive column intervals [a, b], relative to
// the placement origin cell; `r0` is the row of the first entry (negative after dilation).
function rasterize(pts) {
  let maxY = 0;
  for (const [, y] of pts) maxY = Math.max(maxY, y);
  const rows = Math.max(1, Math.ceil(maxY / CELL - 1e-6));
  const out = Array.from({ length: rows }, () => []);
  const n = pts.length;
  for (let r = 0; r < rows; r++) {
    const ivs = out[r];
    for (const s of [0.04, 0.35, 0.65, 0.96]) {
      const y = (r + s) * CELL, xs = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if ((a[1] <= y) === (b[1] <= y)) continue;
        xs.push(a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) ivs.push([Math.floor(xs[k] / CELL), Math.floor((xs[k + 1] - 1e-9) / CELL)]);
    }
  }
  for (let i = 0; i < n; i++) {   // edges between sample lines: cover the cells they pass
    const a = pts[i], b = pts[(i + 1) % n];
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * 0.5)) + 1;
    for (let k = 0; k <= steps; k++) {
      const x = a[0] + (b[0] - a[0]) * k / steps, y = a[1] + (b[1] - a[1]) * k / steps;
      const r = Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))), c = Math.floor(x / CELL);
      out[r].push([c, c]);
    }
  }
  return { rows: out.map(merge), r0: 0 };
}
function merge(ivs) {
  if (!ivs.length) return ivs;
  ivs.sort((p, q) => p[0] - q[0]);
  const m = [ivs[0].slice()];
  for (let i = 1; i < ivs.length; i++) {
    const t = m[m.length - 1];
    if (ivs[i][0] <= t[1] + 1) t[1] = Math.max(t[1], ivs[i][1]);
    else m.push(ivs[i].slice());
  }
  return m;
}
function dilate(mask, g, minCol = -Infinity) {
  if (g <= 0) return mask;
  const n = mask.rows.length, rows = [];
  for (let r = -g; r < n + g; r++) {
    const acc = [];
    for (let k = Math.max(0, r - g); k <= Math.min(n - 1, r + g); k++) for (const [a, b] of mask.rows[k]) acc.push([Math.max(minCol, a - g), b + g]);
    rows.push(merge(acc));
  }
  return { rows, r0: mask.r0 - g };
}
function colRange(mask) {
  let lo = Infinity, hi = -Infinity;
  for (const row of mask.rows) if (row.length) { lo = Math.min(lo, row[0][0]); hi = Math.max(hi, row[row.length - 1][1]); }
  return [lo, hi];
}

// ------------------------------------------------------------------ strip packer
class Grid {
  constructor(cols) { this.cols = cols; this.cap = 0; this.used = 0; this.occ = new Uint8Array(0); this.pre = new Int32Array(0); this.grow(256); }
  grow(rows) {
    if (rows <= this.cap) return;
    const cap = Math.max(rows, this.cap * 2), C = this.cols;
    const occ = new Uint8Array(cap * C); occ.set(this.occ);
    const pre = new Int32Array(cap * (C + 1)); pre.set(this.pre);
    this.occ = occ; this.pre = pre; this.cap = cap;
  }
  fits(mask, X, Y) {
    const C = this.cols, C1 = C + 1, pre = this.pre, used = this.used;
    const rows = mask.rows;
    for (let i = 0; i < rows.length; i++) {
      const yy = Y + mask.r0 + i;
      if (yy < 0) continue;
      if (yy >= used) break;
      const base = yy * C1;
      for (const iv of rows[i]) {
        let a = X + iv[0], b = X + iv[1];
        if (a < 0) a = 0; if (b > C - 1) b = C - 1;
        if (a > b) continue;
        if (pre[base + b + 1] - pre[base + a] > 0) return false;
      }
    }
    return true;
  }
  rowFull(y) { return y < this.used && this.pre[y * (this.cols + 1) + this.cols] >= this.cols; }
  put(mask, X, Y) {
    const C = this.cols, C1 = C + 1;
    const last = Y + mask.r0 + mask.rows.length;
    this.grow(last + 1);
    for (let i = 0; i < mask.rows.length; i++) {
      const yy = Y + mask.r0 + i;
      if (yy < 0) continue;
      for (const [a0, b0] of mask.rows[i]) {
        const a = Math.max(0, X + a0), b = Math.min(C - 1, X + b0);
        for (let c = a; c <= b; c++) this.occ[yy * C + c] = 1;
      }
      let s = 0; const base = yy * C1, ob = yy * C;
      for (let c = 0; c < C; c++) { this.pre[base + c] = s; s += this.occ[ob + c]; }
      this.pre[base + C] = s;
    }
    this.used = Math.max(this.used, last);
  }
}

/**
 * Pack units into a strip of `cols` cells. Each unit has `opts`: [{rot, mask (undilated),
 * dil (dilated), lo, hi, rows, fixedX?}]. Returns positions or null for a unit that never fits.
 */
function packStrip(units, order, cols, { lo: minC, hi: maxC }, rule = 0, pref = null) {
  const grid = new Grid(cols);
  const pos = new Array(units.length);
  let bottom = 0, sumB = 0;
  for (const ui of order) {
    const u = units[ui];
    let best = null;
    const forced = pref && pref[ui] >= 0 ? u.opts[pref[ui]] : null;
    for (const o of forced ? [forced, ...u.opts] : u.opts) {
      if (best && forced && o !== forced) break;   // a forced orientation that fits wins
      // an on-fold piece is pinned to the fold (left edge of the strip)
      const xMin = o.pin ? minC : minC - o.lo, xMax = o.pin ? minC : maxC - o.hi;
      if (xMax < xMin || (o.pin && minC + o.hi > maxC)) continue;
      let found = null;
      const yTop = grid.used - o.dil.r0 + 1;
      for (let Y = 0; Y <= yTop && !found; Y++) {
        if (grid.rowFull(Y) && grid.rowFull(Y + 1)) continue;
        for (let X = xMin; X <= xMax; X++) if (grid.fits(o.dil, X, Y)) { found = { X, Y }; break; }
      }
      if (!found) continue;
      const b = found.Y + o.rows;
      const key = rule === 1 ? found.Y * 1e4 + b : b * 1e4 + found.X;   // rule 0: lowest bottom; 1: highest top
      if (!best || key < best.key) best = { key, o, ...found, b };
    }
    if (!best) { pos[ui] = null; continue; }
    grid.put(best.o.mask, best.X, best.Y);
    pos[ui] = { X: best.X, Y: best.Y, o: best.o };
    bottom = Math.max(bottom, best.b); sumB += best.b;
  }
  return { pos, bottom, score: bottom * 1e6 + sumB };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Order search: a few greedy orderings, then swaps/moves while the time budget lasts. */
function search(units, cols, bounds, budget, seed) {
  const n = units.length;
  if (!n) return { pos: [], bottom: 0 };
  const idx = [...Array(n).keys()];
  const key = (f) => [...idx].sort((a, b) => f(units[b]) - f(units[a]) || a - b);
  const starts = [
    key(u => u.area), key(u => u.h), key(u => u.w), key(u => u.w * u.h), key(u => Math.max(u.w, u.h)),
  ];
  let best = null;
  const t0 = now();
  for (const order of starts) for (const rule of [0, 1]) {
    const r = packStrip(units, order, cols, bounds, rule);
    if (!best || r.score < best.score) best = { ...r, order, rule };
  }
  const rand = rng(seed);
  best.pref = new Array(n).fill(-1);
  let cur = best, it = 0;
  while (now() - t0 < budget) {
    it++;
    const order = cur.order.slice(), pref = cur.pref.slice();
    const m = rand();
    const i = Math.floor(rand() * n);
    if (m < 0.25 || n < 2) { const k = order[i]; pref[k] = Math.floor(rand() * (units[k].opts.length + 1)) - 1; }
    else if (m < 0.5) { const j = Math.min(n - 1, Math.max(0, i + (rand() < 0.5 ? -1 : 1) * (1 + Math.floor(rand() * 3)))); [order[i], order[j]] = [order[j], order[i]]; }
    else if (m < 0.8) { const j = Math.floor(rand() * n); [order[i], order[j]] = [order[j], order[i]]; }
    else { const [x] = order.splice(i, 1); order.splice(Math.floor(rand() * n), 0, x); }
    const rule = rand() < 0.15 ? 1 - cur.rule : cur.rule;
    const r = packStrip(units, order, cols, bounds, rule, pref);
    if (r.score <= cur.score) { cur = { ...r, order, rule, pref }; if (r.score < best.score) best = cur; }
    else if (it % 40 === 0) cur = best;
  }
  return { ...best, iterations: it };
}

// ------------------------------------------------------------------ units
function shapeOpts(piece, { fold, rots, gap }) {
  const g = Math.max(0, Math.ceil(gap / CELL - 1e-6));
  const out = [];
  for (const rot of rots) {
    const [w] = pieceSize(piece, rot);
    const pl = { x: fold ? -w / 2 : 0, y: 0, rot, fold };
    const mask = rasterize(placed(piece, pl));
    const dil = dilate(mask, g, fold ? 0 : -Infinity);
    const [lo, hi] = colRange(mask);
    out.push({ rot, mask, dil, lo, hi, rows: mask.rows.length, baseX: pl.x, pin: fold });
  }
  return out;
}

/** Trivial groups (one piece each) for callers that pass a bare piece list. */
function asSet(set) { return Array.isArray(set) ? { pieces: set, groups: set.map(p => ({ id: p.id, members: [{ id: p.id, flip: false }], sym: !!p.sym })) } : set; }

/**
 * Arrange pieces on the fabric.
 * @returns {{ width, folded, items: Array<{id, piece, covers, layers, fold, region, x, y, rot}>,
 *   length, foldEnd, tooWide, crossGrain, singles, stats }}
 */
export function autoLayout(setIn, { width = 150, gap = 1, margin = 1, allowRotate = true, folded = false, timeBudget = 0, seed = 1, sheet = false } = {}) {
  const set = asSet(setIn);
  const byId = Object.fromEntries(set.pieces.map(p => [p.id, p]));
  const foldUnits = [], openUnits = [];
  const singles = [];   // pieces that can't be cut on the folded part
  const mk = (piece, covers, extra = {}) => {
    const [w, h] = pieceSize(piece);
    return { piece, covers, layers: covers.length, fold: false, w, h, area: piece.area, ...extra };
  };
  if (sheet) {
    // pattern sheet: one piece per group; a lone symmetric piece is drawn as a half, on fold
    for (const g of set.groups) {
      const p = byId[g.members[0].id];
      if (!p) continue;
      const fold = folded && g.sym && g.count === 1;
      const [w, h] = pieceSize(p);
      openUnits.push(mk(p, [p.id], fold ? { fold, w: w / 2, h, area: p.area / 2 } : {}));
    }
  } else if (!folded) {
    for (const p of set.pieces) openUnits.push(mk(p, [p.id]));
  } else {
    for (const g of set.groups) {
      const ms = g.members.map(m => ({ ...m, p: byId[m.id] })).filter(m => m.p);
      if (!ms.length) continue;
      let pairs = [], rest = [];
      if (g.sym) {
        for (let k = 0; k + 1 < ms.length; k += 2) pairs.push([ms[k], ms[k + 1]]);
        if (ms.length % 2) rest.push(ms[ms.length - 1]);
      } else {
        const A = ms.filter(m => !m.flip), B = ms.filter(m => m.flip);
        const k = Math.min(A.length, B.length);
        for (let i = 0; i < k; i++) pairs.push([A[i], B[i]]);
        rest = [...A.slice(k), ...B.slice(k)];
      }
      for (const [a, b] of pairs) foldUnits.push(mk(a.p, [a.id, b.id]));
      for (const m of rest) {
        if (g.sym) { const [w, h] = pieceSize(m.p); foldUnits.push(mk(m.p, [m.id], { fold: true, w: w / 2, h, area: m.p.area / 2 })); }
        else { openUnits.push(mk(m.p, [m.id])); singles.push(m.id); }
      }
    }
  }
  // on paper (pattern sheet) any quarter turn is fine: the grain arrow shows the direction
  const rots0 = sheet ? [0, 180, 90, 270] : allowRotate ? [0, 180] : [0];
  const items = [], tooWide = [], crossGrain = [], movedOpen = [];
  const half = width / 2;

  // folded part: 0 = fold .. W/2 = selvedges
  let foldEnd = 0;
  if (foldUnits.length) {
    const cols = Math.floor(half / CELL);
    const bounds = { lo: 0, hi: Math.floor((half - margin) / CELL) - 1 };
    const keep = [];
    for (const u of foldUnits) {
      u.opts = shapeOpts(u.piece, { fold: u.fold, rots: u.fold ? rots0.filter(r => r % 180 === 0) : rots0, gap });
      if (u.opts.every(o => (o.pin ? o.hi > bounds.hi : o.hi - o.lo > bounds.hi - bounds.lo))) {
        // too wide for the folded width: cut from the opened fabric instead
        for (const id of u.covers) { openUnits.push(mk(byId[id], [id])); movedOpen.push(id); }
      } else keep.push(u);
    }
    const r = search(keep, cols, bounds, timeBudget * (keep.length / Math.max(1, keep.length + openUnits.length)), seed);
    keep.forEach((u, i) => {
      const p = r.pos[i];
      items.push({ id: (u.fold ? 'fold:' : u.layers > 1 ? 'pair:' : '') + u.covers.join('+'), piece: u.piece.id, covers: u.covers, layers: u.layers, fold: u.fold, region: 'fold', x: p.X * CELL + p.o.baseX, y: p.Y * CELL, rot: p.o.rot });
      foldEnd = Math.max(foldEnd, p.Y * CELL + u.h);
    });
  }

  // open part (or the whole fabric when it isn't folded)
  if (openUnits.length) {
    const cols = Math.floor(width / CELL);
    const m = Math.ceil(margin / CELL);
    const bounds = { lo: m, hi: cols - 1 - m };
    const keep = [], wide = [];
    for (const u of openUnits) {
      u.opts = shapeOpts(u.piece, { fold: u.fold, rots: u.fold ? rots0.filter(r => r % 180 === 0) : rots0, gap });
      if (u.opts.every(o => (o.pin ? bounds.lo + o.hi > bounds.hi : o.hi - o.lo > bounds.hi - bounds.lo))) {
        if (u.fold) { wide.push(u); continue; }
        const x = shapeOpts(u.piece, { fold: false, rots: allowRotate ? [90, 270] : [90], gap });
        if (x.some(o => o.hi - o.lo <= bounds.hi - bounds.lo)) { u.opts = x; crossGrain.push(u.piece.id); keep.push(u); }
        else wide.push(u);
      } else keep.push(u);
    }
    const r = search(keep, cols, bounds, timeBudget - 0, seed + 7);
    const y0 = foldUnits.length ? Math.ceil((foldEnd + gap) / CELL) * CELL : 0;
    let end = y0;
    keep.forEach((u, i) => {
      const p = r.pos[i];
      const it = { id: (u.fold ? 'fold:' : '') + u.covers.join('+'), piece: u.piece.id, covers: u.covers, layers: 1, fold: u.fold, region: 'open', x: p.X * CELL + p.o.baseX, y: y0 + p.Y * CELL, rot: p.o.rot };
      items.push(it);
      end = Math.max(end, it.y + pieceSize(u.piece, it.rot)[1]);
    });
    // wider than the fabric even when turned: below everything, sticking out, reported
    for (const u of wide) {
      const y = end + gap;
      items.push({ id: u.covers.join('+'), piece: u.piece.id, covers: u.covers, layers: 1, fold: false, region: 'open', x: margin, y, rot: 0 });
      tooWide.push(u.piece.id);
      end = y + u.h;
    }
  }
  const layout = { width, folded, sheet, gap, margin, allowRotate, items, foldEnd, tooWide, crossGrain, singles, movedOpen };
  layout.length = layoutLength(set, layout);
  return layout;
}

export function layoutLength(set, layout) {
  const byId = Object.fromEntries(set.pieces.map(p => [p.id, p]));
  let L = 0;
  for (const it of layout.items) { const p = byId[it.piece]; if (p) L = Math.max(L, it.y + pieceSize(p, it.rot)[1]); }
  return L;
}

/** Fabric to buy: length rounded up the way shops sell it. */
export function fabricToBuy(lengthCm, { allowance = 5 } = {}) {
  const need = lengthCm + allowance;   // a little for straightening the cut end
  const m = Math.ceil(need / 10 - 1e-9) / 10;                    // 10 cm steps
  const yd = Math.ceil(need / 91.44 * 8 - 1e-9) / 8;              // 1/8 yard steps
  return { cm: need, m, yd, inches: need / 2.54 };
}

/** Where the folded part ends and the opened part starts (for drawing and checks). */
export function regions(set, layout) {
  const byId = Object.fromEntries(set.pieces.map(p => [p.id, p]));
  let foldEnd = 0, openStart = Infinity;
  for (const it of layout.items) {
    const p = byId[it.piece]; if (!p) continue;
    if (it.region === 'fold') foldEnd = Math.max(foldEnd, it.y + pieceSize(p, it.rot)[1]);
    else openStart = Math.min(openStart, it.y);
  }
  if (openStart === Infinity) openStart = foldEnd;
  return { foldEnd, openStart, split: layout.folded ? Math.max(foldEnd, Math.min(openStart, foldEnd + (layout.gap || 1))) : 0 };
}

/** Ids of items that overlap another one or stick out of their part of the fabric. */
export function findProblems(set, layout) {
  const CL = (typeof window !== 'undefined' && window.ClipperLib) || globalThis.ClipperLib;
  const byId = Object.fromEntries(set.pieces.map(p => [p.id, p]));
  const W = layout.width, bad = new Set();
  const { foldEnd } = regions(set, layout);
  const polys = layout.items.filter(it => byId[it.piece]).map(it => ({ it, pts: placed(byId[it.piece], it) }));
  const boxes = polys.map(({ pts }) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]));
  polys.forEach(({ it }, i) => {
    const b = boxes[i];
    const maxX = it.region === 'fold' ? W / 2 : W;
    if (b[0] < -0.01 || b[2] > maxX + 0.01 || b[1] < -0.01) bad.add(it.id);
    if (it.fold && it.region === 'fold' && Math.abs(b[0]) > 0.05) bad.add(it.id);   // an on-fold piece must touch the fold
    if (layout.folded && it.region === 'open' && b[1] < foldEnd - 0.01) bad.add(it.id);
  });
  if (!CL) return bad;
  const S = 100;
  const toPath = (pts) => pts.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    if (polys[i].it.region !== polys[j].it.region) continue;
    const a = boxes[i], b = boxes[j];
    if (a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]) continue;
    const c = new CL.Clipper();
    c.AddPath(toPath(polys[i].pts), CL.PolyType.ptSubject, true);
    c.AddPath(toPath(polys[j].pts), CL.PolyType.ptClip, true);
    const sol = new CL.Paths();
    c.Execute(CL.ClipType.ctIntersection, sol, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
    const area = sol.reduce((s, p) => s + Math.abs(CL.Clipper.Area(p)), 0) / (S * S);
    if (area > 0.5) { bad.add(polys[i].it.id); bad.add(polys[j].it.id); }
  }
  return bad;
}

/** Smallest distance between the cut outlines of two items (cm), for tests. */
export function minGap(set, layout) {
  const byId = Object.fromEntries(set.pieces.map(p => [p.id, p]));
  const polys = layout.items.map(it => ({ it, pts: placed(byId[it.piece], it) }));
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1e-12; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  let best = Infinity;
  for (let i = 0; i < polys.length; i++) for (let j = 0; j < polys.length; j++) {
    if (i === j || polys[i].it.region !== polys[j].it.region) continue;
    const A = polys[i].pts, B = polys[j].pts;
    for (let k = 0; k < A.length; k += 2) for (let m = 0; m < B.length; m++) best = Math.min(best, segD(A[k], B[m], B[(m + 1) % B.length]));
  }
  return best;
}
