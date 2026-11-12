// FreeSewing draft -> the pattern JSON the rest of the app uses (the same shape the
// Pyodide bridge exports for GarmentCode: panels with sampled outlines, edge ranges,
// edge labels and one-to-one stitches, plus 3D placement for the drape).
//
// A design adapter (see bruce.js) describes, per FreeSewing part, how to cut it
// (on the fold, mirrored pairs), which edges are sewn together, which edges are
// waistlines, and where each piece sits around the body.
//
// Conventions
//  - FreeSewing works in mm with y pointing down. Panels here are in cm with y up.
//  - An edge is one drawing operation of the part's `seam` path (line or cubic),
//    numbered from 0 in drawing order. Edges of the mirrored half of a piece cut on
//    the fold are called 'm0', 'm1', ... after the edge they mirror.
//  - Every edge has a canonical direction: the direction FreeSewing draws it in
//    (for 'mK': the mirror image of edge K, same start and end points mirrored).
//    Seam chains are given in canonical direction unless flagged reversed.

// ------------------------------------------------------------------ geometry
const cubic = (a, b, c, d, t) => {
  const s = 1 - t;
  return [s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0],
          s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]];
};
const P = (pt) => [pt.x / 10, -pt.y / 10];          // FreeSewing point -> cm, y up
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const signedArea = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

/** Dense polyline (cm, y up) for every drawing operation of a FreeSewing path. */
export function pathEdges(path) {
  const edges = [];
  let cur = null, first = null;
  for (const op of path.ops) {
    if (op.type === 'move') { cur = P(op.to); first = cur; continue; }
    let poly;
    if (op.type === 'line') poly = [cur, P(op.to)];
    else if (op.type === 'curve') {
      const a = cur, b = P(op.cp1), c = P(op.cp2), d = P(op.to);
      poly = [];
      for (let i = 0; i <= 96; i++) poly.push(cubic(a, b, c, d, i / 96));
    } else if (op.type === 'close') {
      if (first && dist(cur, first) > 1e-4) poly = [cur, first]; else { edges.push(null); continue; }
    } else continue;
    edges.push(poly);
    cur = poly[poly.length - 1];
  }
  return edges;   // index = drawing operation number (moves excluded); null for empty closes
}

function polyLen(poly) { let l = 0; for (let i = 1; i < poly.length; i++) l += dist(poly[i - 1], poly[i]); return l; }
/** Point at arc-length fraction f (0..1) of a polyline. */
function polyAt(poly, f, cum) {
  const L = cum[cum.length - 1], s = Math.max(0, Math.min(1, f)) * L;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const t = (s - cum[i - 1]) / seg;
  const a = poly[i - 1], b = poly[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
const cumLen = (poly) => { const c = [0]; for (let i = 1; i < poly.length; i++) c.push(c[i - 1] + dist(poly[i - 1], poly[i])); return c; };
const reflect = (p, a, b) => {   // mirror p across the line a-b
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  const fx = a[0] + t * dx, fy = a[1] + t * dy;
  return [2 * fx - p[0], 2 * fy - p[1]];
};

// ------------------------------------------------------------------ pieces
/**
 * Outline of one cut piece copy as a counter-clockwise loop of edges.
 * spec: { part, fold?: edgeIndex, mirror?: bool }
 * Returns { edges: [{ id, poly, canon }], toLocal(pt) } where canon = +1 when the
 * loop runs along the edge's canonical direction, -1 otherwise.
 */
export function pieceLoop(part, { fold = null, mirror = false } = {}) {
  const raw = pathEdges(part.paths.seam);
  const n = raw.length;
  let edges = [];
  if (fold == null) {
    raw.forEach((poly, i) => { if (poly && polyLen(poly) > 1e-3) edges.push({ id: String(i), poly, canon: 1 }); });
  } else {
    const fa = raw[fold][0], fb = raw[fold][raw[fold].length - 1];
    const half = [];
    for (let k = 1; k < n; k++) { const i = (fold + k) % n; if (raw[i] && polyLen(raw[i]) > 1e-3) half.push({ id: String(i), poly: raw[i] }); }
    edges = half.map(e => ({ ...e, canon: 1 }));
    for (let k = half.length - 1; k >= 0; k--) {
      const e = half[k];
      edges.push({ id: 'm' + e.id, poly: e.poly.map(p => reflect(p, fa, fb)).reverse(), canon: -1 });
    }
  }
  const sx = mirror ? -1 : 1;
  if (mirror) edges = edges.map(e => ({ ...e, poly: e.poly.map(([x, y]) => [-x, y]) }));
  // counter-clockwise loop (mirroring flips the winding)
  const loopPts = edges.flatMap(e => e.poly.slice(0, -1));
  if (signedArea(loopPts) < 0) edges = edges.reverse().map(e => ({ ...e, poly: [...e.poly].reverse(), canon: -e.canon }));
  for (const e of edges) { e.cum = cumLen(e.poly); e.len = e.cum[e.cum.length - 1]; }
  return { edges, toLocal: (pt) => [sx * pt.x / 10, -pt.y / 10] };
}

// ------------------------------------------------------------------ conversion
/**
 * @param {object} draft   drafted FreeSewing pattern (pattern.draft() result)
 * @param {object} spec    design adapter description:
 *   pieces: [{ name, part, fold?, mirror?, label?, place?(local)->map3d }]
 *   seams:  [{ a: [[piece, edge, rev?, from?, to?], ...], b: [...] }]  chains of edges (or the
 *           part from..to of an edge, canonical fractions) sewn along each other
 *   labels: { label: [[piece, edge], ...] }   (e.g. lower_interface = waist edges)
 * @param {object} opts    { res: sample spacing (cm), place: (pieceSpec, loop) -> (x, y) => [X, Y, Z],
 *                          layers: also emit unsewn extra layers (pieces with `lining: true`) for cutting }
 */
export function convertDraft(draft, spec, { res = 1.5, place = null, attachLevels = {}, layers = false } = {}) {
  const parts = draft.parts[0];
  const copies = spec.pieces.map((ps) => {
    const part = parts[ps.part];
    if (!part) throw new Error(`FreeSewing part ${ps.part} is missing`);
    const loop = pieceLoop(part, ps);
    const byId = Object.fromEntries(loop.edges.map(e => [e.id, e]));
    for (const e of loop.edges) { e.cuts = new Set([0, 1]); e.nseg = new Map(); }
    return { ps, part, loop, byId };
  });
  const byName = Object.fromEntries(copies.map(c => [c.ps.name, c]));
  const edgeOf = (piece, id) => {
    const c = byName[piece];
    const e = c && c.byId[String(id)];
    if (!e) throw new Error(`Seam table: ${piece} has no edge ${id}`);
    return e;
  };

  // 1. split seam chains into one-to-one segments
  const segs = [];
  const key = (f) => Math.round(f * 1e6) / 1e6;
  for (const seam of spec.seams) {
    const chains = [seam.a, seam.b].map(ch => {
      const items = ch.map(([piece, id, rev, from = 0, to = 1]) => {
        const e = edgeOf(piece, id);
        return { piece, e, rev: !!rev, from, to, len: e.len * (to - from) };
      });
      const total = items.reduce((s, it) => s + it.len, 0);
      let acc = 0;
      for (const it of items) { it.t0 = acc / total; acc += it.len; it.t1 = acc / total; }
      return { items, total };
    });
    let T = [...new Set([0, 1, ...chains.flatMap(c => c.items.map(it => it.t1))].map(key))].sort((x, y) => x - y);
    T = T.filter((t, i) => i === 0 || t - T[i - 1] > 0.02 || t === 1);   // merge near-coincident breaks
    if (T.length > 2 && 1 - T[T.length - 2] < 0.02) T.splice(T.length - 2, 1);
    for (let k = 1; k < T.length; k++) {
      const t0 = T[k - 1], t1 = T[k], tm = (t0 + t1) / 2;
      const ends = chains.map(c => {
        const it = c.items.find(q => tm >= q.t0 && tm <= q.t1) || c.items[c.items.length - 1];
        const span = it.t1 - it.t0 || 1;
        // fractions along the chain item (effective direction), snapped to its ends
        let f0 = (t0 - it.t0) / span, f1 = (t1 - it.t0) / span;
        if (f0 < 0.03) f0 = 0; if (f1 > 0.97) f1 = 1;
        // canonical direction fractions
        const c0 = it.from + (it.to - it.from) * (it.rev ? 1 - f0 : f0), c1 = it.from + (it.to - it.from) * (it.rev ? 1 - f1 : f1);
        return { piece: it.piece, e: it.e, rev: it.rev, c0: key(c0), c1: key(c1), len: it.len * Math.abs(f1 - f0) };
      });
      const n = Math.max(1, Math.ceil(Math.max(ends[0].len, ends[1].len) / res));
      for (const en of ends) {
        en.e.cuts.add(en.c0); en.e.cuts.add(en.c1);
        en.e.nseg.set(`${Math.min(en.c0, en.c1)}|${Math.max(en.c0, en.c1)}`, n);
      }
      segs.push(ends);
    }
  }

  // 2. sample every outline (edge by edge, sub-interval by sub-interval)
  const panels = [];
  for (const c of copies) {
    const boundary = [], ranges = [];
    for (const e of c.loop.edges) {
      // cut fractions in loop direction
      const cuts = [...e.cuts].sort((x, y) => x - y);
      const loopCuts = (e.canon > 0 ? cuts : cuts.map(f => key(1 - f)).sort((x, y) => x - y));
      e.at = new Map();   // canonical fraction -> vertex index
      const idx = [];
      for (let k = 1; k < loopCuts.length; k++) {
        const l0 = loopCuts[k - 1], l1 = loopCuts[k];
        const ca = e.canon > 0 ? l0 : key(1 - l0), cb = e.canon > 0 ? l1 : key(1 - l1);
        const n = e.nseg.get(`${Math.min(ca, cb)}|${Math.max(ca, cb)}`) || Math.max(1, Math.ceil(e.len * (l1 - l0) / res));
        for (let i = 0; i < n; i++) {
          const f = l0 + (l1 - l0) * i / n;
          if (i === 0) e.at.set(ca, boundary.length);
          idx.push(boundary.length);
          boundary.push(polyAt(e.poly, f, e.cum));
        }
      }
      e.idx = idx;
      ranges.push(idx);
    }
    // close every edge range with the first vertex of the next edge
    const N = boundary.length;
    c.loop.edges.forEach((e, k) => {
      const next = ranges[(k + 1) % ranges.length][0] ?? 0;
      e.idx.push(next % N);
      e.at.set(e.canon > 0 ? 1 : 0, next % N);
    });
    c.boundary = boundary;
    c.ranges = ranges;
  }

  // vertex indices along an edge between two canonical fractions, in canonical order
  const span = (e, c0, c1) => {
    const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
    // loop-direction positions of all edge samples
    const m = e.idx.length - 1;
    const out = [];
    const ia = e.at.get(lo), ib = e.at.get(hi);
    if (ia === undefined || ib === undefined) throw new Error('internal: seam cut not sampled');
    // walk the edge in loop order and keep the run between ia and ib
    const pa = e.canon > 0 ? e.idx.indexOf(ia) : e.idx.lastIndexOf(ia);
    const pb = e.canon > 0 ? e.idx.lastIndexOf(ib) : e.idx.indexOf(ib);
    const s = Math.min(pa, pb), t = Math.max(pa, pb);
    for (let i = s; i <= t && i <= m; i++) out.push(e.idx[i]);
    // canonical order lo->hi
    if (e.canon < 0) out.reverse();
    return c0 <= c1 ? out : out.reverse();
  };

  // 3. stitches (vertex lists paired one-to-one, both running the same way)
  const stitches = [];
  for (const [A, B] of segs) {
    let ia = span(A.e, A.c0, A.c1), ib = span(B.e, B.c0, B.c1);
    if (ia.length !== ib.length) throw new Error(`internal: unequal seam sampling (${A.piece} ${ia.length} / ${B.piece} ${ib.length})`);
    stitches.push({ a: A.piece, b: B.piece, ia, ib });
  }

  // 4. panels
  for (const c of copies) {
    const labels = {};
    for (const [label, list] of Object.entries(spec.labels || {})) {
      for (const [piece, id] of list) if (piece === c.ps.name) (labels[label] ||= []).push(...edgeOf(piece, id).idx);
    }
    const panel = {
      name: c.ps.name,
      label: c.ps.label || 'leg',
      boundary: c.boundary,
      edge_ranges: c.loop.edges.map(e => e.idx),
      labels,
      // zero normal: garment.js then leaves placement to map3d (no cylinder wrap)
      rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 0]],
      translation: [0, 0, 0],
    };
    if (place) panel.map3d = place(c.ps, c.loop, c.part);
    panels.push(panel);
    // a second, identical layer (e.g. a lined pouch): cut, not draped
    if (layers && c.ps.lining) panels.push({ ...panel, name: `${c.ps.name}_lining`, labels: {}, map3d: undefined });
  }
  return { panels, stitches, attach_levels: attachLevels };
}

// ------------------------------------------------------------------ placement
/**
 * A body-hugging guide surface for lower-body garments. (u, h) are pattern-like
 * coordinates: u = cm along the hip girth from centre front (positive towards +x,
 * i.e. the wearer's left), h = cm above the hip line. Below the crotch the
 * surface folds in under the body so front and back crotch pieces meet between
 * the legs.
 * frame: { hipY, zc, a, b, crotchH, gap, depth (half front-to-back depth at the crotch) }
 */
export function hipSurface(frame) {
  const { hipY, zc, a, b, crotchH, gap = 6, depth = 4 } = frame;
  const N = 360, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) {
    const t = 2 * Math.PI * i / N;
    pts.push([a * Math.sin(t), zc + b * Math.cos(t)]);
    if (i) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  }
  const L = cum[N];
  const ring = (u) => {   // point on the hip ellipse at arc length u from centre front
    let s = ((u % L) + L) % L;
    let i = 1;
    while (i < N && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  };
  const fn = (u, h) => {
    const [x, z0] = ring(u);
    // near the centre plane the body narrows front-to-back towards the crotch
    const ax = Math.abs(x);
    const w = ax <= gap ? 1 : ax >= gap + 6 ? 0 : 1 - (ax - gap) / 6;
    const t = h >= 0 ? 0 : Math.min(1, h / crotchH);
    const dz0 = z0 - zc, adz = Math.abs(dz0) - (Math.abs(dz0) - depth) * w * t * t;
    const z = zc + Math.sign(dz0) * adz;
    if (h >= crotchH) return [x, hipY + h, z];
    // below the crotch: fold in under the body near the centre plane; further out
    // the cloth carries on down the leg
    const e = crotchH - h;
    const zf = zc + Math.sign(dz0) * Math.max(0.5, adz - e);
    return [x, (hipY + h) * (1 - w) + (hipY + crotchH - 1) * w, z * (1 - w) + zf * w];
  };
  fn.girth = L;
  return fn;
}

/** Hip-section frame of the (morphed) mannequin: centre and half-axes at height y. */
export function bodySection(pos, part, y, band = 1.2) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let v = 0; v < part.length; v++) {
    if (part[v] !== 0) continue;   // torso only (PART.BODY)
    const py = pos[3 * v + 1];
    if (Math.abs(py - y) > band) continue;
    const px = pos[3 * v], pz = pos[3 * v + 2];
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
  }
  if (!isFinite(x0)) return null;
  return { xc: (x0 + x1) / 2, zc: (z0 + z1) / 2, a: (x1 - x0) / 2, b: (z1 - z0) / 2 };
}

/** Least-squares affine map through landmark pairs [[x, y], [u, h]] (at least 3). */
export function fitAffine(pairs) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ru = [0, 0, 0], rh = [0, 0, 0];
  for (const [[x, y], [u, h]] of pairs) {
    const r = [x, y, 1];
    for (let i = 0; i < 3; i++) { ru[i] += r[i] * u; rh[i] += r[i] * h; for (let j = 0; j < 3; j++) M[i][j] += r[i] * r[j]; }
  }
  const solve = (b) => {   // 3x3 Cramer
    const det = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    const D = det(M);
    return [0, 1, 2].map(c => det(M.map((row, i) => row.map((v, j) => (j === c ? b[i] : v)))) / D);
  };
  const a = solve(ru), b = solve(rh);
  return (x, y) => [a[0] * x + a[1] * y + a[2], b[0] * x + b[1] * y + b[2]];
}
