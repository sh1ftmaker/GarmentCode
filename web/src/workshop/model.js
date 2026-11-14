// Pattern-editor designs ("My patterns"): data model, measurement formulas, grading, and the
// conversion into the pattern export every other part of the app reads
// ({ panels: [{ name, label, boundary, edge_ranges, labels, rotation, translation, grain }],
//    stitches: [{ a, b, ia, ib }], attach_levels }), as web/py/gc_bridge.py produces for
// GarmentCode designs.
//
// Coordinates are GarmentCode's body frame, in cm: x across the body (+x = the wearer's
// left, on the right of a front view), y = height above the floor. A piece is drawn where it
// sits on the body, seen from the front (front layer) or from behind (back layer), so a
// side seam on the front and on the back has the same x, y. Like GarmentCode's own panels,
// every panel keeps rotation = identity and is moved in front of / behind the body (z).
//
// design = {
//   v: 1, name, ref: { measurements the fixed numbers were drawn on },
//   grade: true,            // fixed numbers follow the body (landmark grading), formulas don't need to
//   params: { ease: 4, ... },   // the design's own numbers, usable in formulas
//   pieces: [{ id, name, layer: 'front'|'back', role, sym: 'pair'|'fold'|'one', grain: deg,
//              cutOnly?, pts: [{ x, y, c?: [[u, v]] | [[u, v], [u, v]] , label? }] }],
//             // a point value is a number or { f: 'formula', d: offset }; pts[i].c / .label
//             // describe the edge from point i to point i+1 (control points relative to the
//             // edge, as in GarmentCode: start + u * edge + v * perpendicular)
//   seams: [{ id, a: { p, e: [edge, ...], side? }, b: { p, e: [...], side? }, flip? }],
//             // side 1 = the mirror copy (a 'pair' piece sewn to its own twin: a centre seam)
// }
import { evaluate } from './expr.js';

export const ROLES = {
  body: { name: 'Bodice / top', label: 'body', z: [30, -25] },
  skirt: { name: 'Skirt', label: 'leg', z: [25, -20] },
  leg: { name: 'Trouser leg', label: 'leg', z: [25, -20] },
  arm: { name: 'Sleeve', label: 'arm', z: [17.5, -12.5] },
  band: { name: 'Band / waistband', label: 'body', z: [20, -15] },
  flat: { name: 'Not draped (cut only)', label: 'body', z: [32, -27] },
};
export const SYMS = {
  pair: 'Mirrored pair (left and right)',
  fold: 'Cut on the fold (centre line)',
  one: 'Single piece, as drawn',
};
export const EDGE_LABELS = {
  '': 'Plain edge',
  lower_interface: 'Waistline: hold it at the waist',
  strapless_top: 'Top edge: hold it under the arms',
  collar: 'Neckline: keep it at the neck',
};

// ------------------------------------------------------------------ measurements
/** Formula names: every body measurement plus landmark heights and a few helpers. */
export function bodyVars(m) {
  const v = { ...m };
  const neck = m.height - m.head_l;
  const bustLine = 'vert_bust_line' in m ? (2 / 3) * m.vert_bust_line + (1 / 3) * m.bust_line : m.bust_line;
  v.neck_y = neck;
  v.shoulder_x = m.shoulder_w / 2;
  v.shoulder_y = neck - Math.tan((m.shoulder_incl || 20) * Math.PI / 180) * Math.max(0, m.shoulder_w / 2 - m.neck_w / 2);
  v.armpit_y = neck - m.armscye_depth;
  v.bust_y = neck - bustLine;
  v.waist_y = neck - m.waist_line;
  v.hip_y = v.waist_y - m.hips_line;
  v.crotch_y = v.hip_y - Math.max(4, m.crotch_hip_diff || 8);
  v.knee_y = 0.285 * m.height;
  v.ankle_y = 0.045 * m.height;
  v.arm_angle = m.arm_pose_angle ?? 45;
  return v;
}
export const LANDMARKS = [
  ['neck_y', 'Neck base'], ['shoulder_y', 'Shoulder'], ['armpit_y', 'Underarm'], ['bust_y', 'Bust'],
  ['waist_y', 'Waist'], ['hip_y', 'Hips'], ['crotch_y', 'Crotch'], ['knee_y', 'Knee'], ['ankle_y', 'Ankle'],
];

/** Landmark grading: maps a point drawn on the reference body to the current body. */
function grader(ref, cur, on) {
  if (!on || !ref) return { x: (x) => x, y: (y) => y, sleeve: null };
  const R = bodyVars(ref), C = bodyVars(cur);
  const keys = ['ankle_y', 'knee_y', 'crotch_y', 'hip_y', 'waist_y', 'bust_y', 'armpit_y', 'shoulder_y', 'neck_y'];
  const ys = [0, ...keys.map(k => R[k]), R.height], yc = [0, ...keys.map(k => C[k]), C.height];
  const order = ys.map((y, i) => [y, yc[i]]).sort((a, b) => a[0] - b[0]);
  const Y = (y) => {
    const n = order.length;
    if (y <= order[0][0]) return y * (order[0][1] / (order[0][0] || 1));
    for (let i = 1; i < n; i++) if (y <= order[i][0]) {
      const t = (y - order[i - 1][0]) / ((order[i][0] - order[i - 1][0]) || 1);
      return order[i - 1][1] + t * (order[i][1] - order[i - 1][1]);
    }
    return order[n - 1][1] + (y - order[n - 1][0]);
  };
  // girth ratio by height: bust above the waist, then waist, hips, thigh below the crotch
  const gk = [[R.crotch_y - 10, (C.leg_circ / R.leg_circ) || 1], [R.hip_y, C.hips / R.hips], [R.waist_y, C.waist / R.waist],
    [R.bust_y, C.bust / R.bust], [R.shoulder_y, C.shoulder_w / R.shoulder_w]];
  const G = (y) => {
    if (y <= gk[0][0]) return gk[0][1];
    for (let i = 1; i < gk.length; i++) if (y <= gk[i][0]) {
      const t = (y - gk[i - 1][0]) / ((gk[i][0] - gk[i - 1][0]) || 1);
      return gk[i - 1][1] + t * (gk[i][1] - gk[i - 1][1]);
    }
    return gk[gk.length - 1][1];
  };
  return {
    x: (x, y) => x * G(y), y: Y,
    // sleeves: about the shoulder point, along the arm by arm length, across by the shoulder-armhole size
    sleeve: { R, C, along: C.arm_length / R.arm_length, across: (C.bust / R.bust + C.armscye_depth / R.armscye_depth) / 2 },
  };
}

/** Value of one coordinate: a number, or a formula with an optional dragged offset. */
export function coordValue(c, vars) {
  if (typeof c === 'number') return c;
  if (c && typeof c === 'object' && 'f' in c) return evaluate(c.f, vars) + (+c.d || 0);
  return +c || 0;
}
export const isFormula = (c) => !!(c && typeof c === 'object' && 'f' in c);

/**
 * Solve every piece's points for a body. Fixed numbers are graded from the reference
 * body; formulas are evaluated directly. Returns { pieces: [{ ...piece, P: [[x, y]] }], errors }.
 */
export function solve(design, measurements) {
  const vars = { ...bodyVars(measurements), ...(design.params || {}) };
  const g = grader(design.ref, measurements, design.grade !== false);
  const errors = [];
  const pieces = design.pieces.map((pc) => {
    const P = pc.pts.map((pt, i) => {
      let x, y;
      try { x = coordValue(pt.x, vars); } catch (e) { errors.push(`${pc.name}, point ${i + 1} (across): ${e.message}`); x = 0; }
      try { y = coordValue(pt.y, vars); } catch (e) { errors.push(`${pc.name}, point ${i + 1} (height): ${e.message}`); y = 0; }
      const fx = isFormula(pt.x), fy = isFormula(pt.y);
      if (pc.place) return [x, y];   // in the panel's own frame (imported 3D placement): not graded
      if (pc.role === 'arm' && g.sleeve && !(fx && fy)) {   // fixed sleeve points: about the shoulder point
        const { R, C, along, across } = g.sleeve;
        const sgn = x >= 0 ? 1 : -1;
        const a = (90 - R.arm_angle) * Math.PI / 180;   // arm direction, measured from straight down
        const d = [sgn * Math.sin(a), -Math.cos(a)], n = [-d[1], d[0]];
        const rx = x - sgn * R.shoulder_x, ry = y - R.shoulder_y;
        const u = rx * d[0] + ry * d[1], w = rx * n[0] + ry * n[1];
        const ac = (90 - C.arm_angle) * Math.PI / 180, dc = [sgn * Math.sin(ac), -Math.cos(ac)], nc = [-dc[1], dc[0]];
        const gx = sgn * C.shoulder_x + u * along * dc[0] + w * across * nc[0];
        const gy = C.shoulder_y + u * along * dc[1] + w * across * nc[1];
        return [fx ? x : gx, fy ? y : gy];
      }
      return [fx ? x : g.x(x, y), fy ? y : g.y(y)];
    });
    return { ...pc, P };
  });
  return { pieces, errors, vars };
}

// ------------------------------------------------------------------ edge geometry
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export function relToAbs(s, e, [u, v]) {
  const d = sub(e, s);
  return [s[0] + u * d[0] - v * d[1], s[1] + u * d[1] + v * d[0]];
}
export function absToRel(s, e, p) {
  const d = sub(e, s), L2 = d[0] * d[0] + d[1] * d[1] || 1e-9, q = sub(p, s);
  return [(q[0] * d[0] + q[1] * d[1]) / L2, (q[1] * d[0] - q[0] * d[1]) / L2];
}
/** Point at parameter t on the edge from s to e with relative controls c (none / 1 / 2). */
export function edgePoint(s, e, c, t) {
  if (!c || !c.length) return [s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])];
  const cps = c.map(r => relToAbs(s, e, r)), u = 1 - t;
  if (cps.length === 1) {
    const [q] = cps;
    return [u * u * s[0] + 2 * u * t * q[0] + t * t * e[0], u * u * s[1] + 2 * u * t * q[1] + t * t * e[1]];
  }
  const [q1, q2] = cps;
  return [u * u * u * s[0] + 3 * u * u * t * q1[0] + 3 * u * t * t * q2[0] + t * t * t * e[0],
    u * u * u * s[1] + 3 * u * u * t * q1[1] + 3 * u * t * t * q2[1] + t * t * t * e[1]];
}
/** Dense polyline of an edge + cumulative arc lengths. */
export function edgePolyline(s, e, c, m = 48) {
  const n = c && c.length ? m : 1;
  const pts = [], cum = [0];
  for (let i = 0; i <= n; i++) {
    pts.push(edgePoint(s, e, c, i / n));
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, cum, length: cum[n] };
}
export function edgeLength(s, e, c) { return edgePolyline(s, e, c).length; }
/** k points evenly spaced by arc length, start included, end excluded. */
function arcSamples(s, e, c, k) {
  const { pts, cum, length } = edgePolyline(s, e, c, Math.max(48, 8 * k));
  const out = [];
  let j = 1;
  for (let i = 0; i < k; i++) {
    const target = length * i / k;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const t = (target - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
    out.push([pts[j - 1][0] + t * (pts[j][0] - pts[j - 1][0]), pts[j - 1][1] + t * (pts[j][1] - pts[j - 1][1])]);
  }
  return out;
}

// ------------------------------------------------------------------ panels (symmetry)
/** The edge of a solved piece as { s, e, c }. */
export function pieceEdge(pc, i) {
  const n = pc.P.length;
  return { s: pc.P[i], e: pc.P[(i + 1) % n], c: pc.pts[i].c || null, label: pc.pts[i].label || '' };
}
/** The centre edge of a fold piece: both ends on x = 0 (within 0.3 cm). */
export function foldEdge(pc) {
  const n = pc.P.length;
  for (let i = 0; i < n; i++) {
    const a = pc.P[i], b = pc.P[(i + 1) % n];
    if (Math.abs(a[0]) < 0.3 && Math.abs(b[0]) < 0.3 && !(pc.pts[i].c && pc.pts[i].c.length)) return i;
  }
  return -1;
}

/**
 * Expand solved pieces into panels: { name, piece, side, verts, edges: [{ s, e, c, label }],
 * map: { 'side:edge' -> panel edge index } }. Pairs give two panels (side 0 as drawn, side 1
 * mirrored to the other side of the body), folds one unfolded panel, singles one panel.
 */
export function expand(solved) {
  const panels = [], errors = [];
  for (const pc of solved.pieces) {
    const n = pc.P.length;
    if (n < 3) { errors.push(`${pc.name} needs at least 3 points.`); continue; }
    const edges = pc.P.map((_, i) => pieceEdge(pc, i));
    const base = slug(pc.name || pc.id);
    const sideName = (side) => {
      // name so the drape code knows the panel: back pieces contain "back", trouser legs "leg"
      const mean = pc.P.reduce((a, p) => a + p[0], 0) / n * (side ? -1 : 1);
      const lr = mean >= 0 ? 'left' : 'right';
      return `${lr}_${base}`;
    };
    const tag = (name) => `${name}${pc.layer === 'back' && !/back/.test(name) ? '_back' : ''}${pc.role === 'leg' && !/leg|pant/.test(name) ? '_leg' : ''}`;
    if (pc.sym === 'fold') {
      const k = foldEdge(pc);
      if (k < 0) { errors.push(`${pc.name} is cut on the fold, but no straight edge lies on the centre line (x = 0).`); continue; }
      // walk from the end of the fold edge round to its start (the outer path), then back mirrored
      const outer = [];
      for (let j = 1; j < n; j++) outer.push((k + j) % n);   // edge indices k+1 .. k-1
      const verts = [], E = [], map = {};
      for (const i of outer) { E.push({ ...edges[i] }); map[`0:${i}`] = E.length - 1; }
      for (let j = outer.length - 1; j >= 0; j--) {
        const i = outer[j], ed = edges[i];
        E.push({ s: [-ed.e[0], ed.e[1]], e: [-ed.s[0], ed.s[1]], c: ed.c ? ed.c.map(([u, v]) => [1 - u, v]) : null, label: ed.label });
        map[`1:${i}`] = E.length - 1;
      }
      for (const ed of E) verts.push(ed.s);
      panels.push({ name: tag(base), piece: pc, verts, edges: E, map, fold: true });
    } else if (pc.sym === 'pair') {
      const E0 = edges.map(ed => ({ ...ed }));
      const m0 = Object.fromEntries(edges.map((_, i) => [`0:${i}`, i]));
      // mirror copy: x -> -x reverses the winding, so walk the edges backwards
      const E1 = [], m1 = {};
      for (let i = n - 1; i >= 0; i--) {
        const ed = edges[i];
        E1.push({ s: [-ed.e[0], ed.e[1]], e: [-ed.s[0], ed.s[1]], c: ed.c ? ed.c.map(([u, v]) => [1 - u, v]) : null, label: ed.label });
        m1[`1:${i}`] = E1.length - 1;
      }
      panels.push({ name: tag(sideName(0)), piece: pc, side: 0, verts: E0.map(e => e.s), edges: E0, map: m0 });
      panels.push({ name: tag(sideName(1)), piece: pc, side: 1, verts: E1.map(e => e.s), edges: E1, map: m1 });
    } else {
      const E = edges.map(ed => ({ ...ed }));
      panels.push({ name: tag(base), piece: pc, verts: E.map(e => e.s), edges: E, map: Object.fromEntries(edges.map((_, i) => [`0:${i}`, i])) });
    }
  }
  // unique names
  const seen = {};
  for (const p of panels) { if (seen[p.name]) p.name = `${p.name}_${++seen[p.name]}`; else seen[p.name] = 1; }
  return { panels, errors };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'piece';

/** Panel + edge for a seam side: [{ panel, edge }] per edge of the chain, or null. */
function seamSide(panels, ref, side) {
  const out = [];
  for (const e of ref.e) {
    const s = ref.side ? 1 - side : side;   // a seam to the twin flips the side
    const P = panels.find(p => p.piece.id === ref.p && (p.map[`${s}:${e}`] !== undefined));
    if (!P) return null;
    out.push({ panel: P, edge: P.map[`${s}:${e}`] });
  }
  // walk the chain in the panel's own edge order (a mirrored panel numbers its edges backwards)
  if (out.length > 1) {
    const n = out[0].panel.edges.length;
    out.sort((a, b) => a.edge - b.edge);
    for (let k = 0; k < out.length - 1; k++) {   // chain wraps past edge 0: start after the gap
      if (out[k + 1].edge - out[k].edge > 1) { out.push(...out.splice(0, k + 1)); break; }
    }
    void n;
  }
  return out;
}
/** Seam instances: one per side of the body that both ends exist on. */
export function seamInstances(design, panels) {
  const out = [];
  for (const sm of design.seams) {
    const pa = design.pieces.find(p => p.id === sm.a.p), pb = design.pieces.find(p => p.id === sm.b.p);
    if (!pa || !pb) continue;
    const symA = pa.sym !== 'one', symB = pb.sym !== 'one';
    const sides = symA || symB ? [0, 1] : [0];
    const twin = sm.a.p === sm.b.p && (sm.a.side || sm.b.side);
    for (const side of twin ? [0] : sides) {
      const A = seamSide(panels, sm.a, side), B = seamSide(panels, sm.b, side);
      if (!A || !B) continue;   // e.g. a single piece has no mirror side
      out.push({ seam: sm, side, A, B });
    }
  }
  return out;
}

// ------------------------------------------------------------------ export
/** Lengths of both sides of a seam (cm), for the editor's checks. */
export function seamLengths(inst) {
  const L = (side) => side.reduce((a, { panel, edge }) => { const ed = panel.edges[edge]; return a + edgeLength(ed.s, ed.e, ed.c); }, 0);
  return [L(inst.A), L(inst.B)];
}

/**
 * The pattern export for a body: what buildGarment (drape), buildPieces (cutting) and the
 * exports read. res = sample spacing in cm.
 */
export function toPattern(design, measurements, { res = 1.5, drape = true } = {}) {
  const solved = solve(design, measurements);
  const { panels, errors } = expand(solved);
  const errs = [...solved.errors, ...errors];
  const insts = seamInstances(design, panels);

  // segments per edge: sewn edges share one count per seam (both chains distributed by length)
  const nseg = new Map();   // panel.name + ':' + edge -> count
  const key = (p, e) => `${p.name}:${e}`;
  const elen = (p, e) => { const ed = p.edges[e]; return edgeLength(ed.s, ed.e, ed.c); };
  for (const p of panels) p.edges.forEach((_, e) => nseg.set(key(p, e), Math.max(1, Math.ceil(elen(p, e) / res))));
  const split = (chain, N) => {   // distribute N segments over a chain by length, at least 1 each
    const ls = chain.map(({ panel, edge }) => elen(panel, edge)), tot = ls.reduce((a, b) => a + b, 0) || 1;
    const k = ls.map(l => Math.max(1, Math.round(N * l / tot)));
    let diff = N - k.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0 && i < 1000; i++) { const j = i % k.length; if (diff > 0) { k[j]++; diff--; } else if (k[j] > 1) { k[j]--; diff++; } }
    chain.forEach(({ panel, edge }, i) => nseg.set(key(panel, edge), k[i]));
  };
  for (let pass = 0; pass < 3; pass++) for (const it of insts) {
    const na = it.A.reduce((a, x) => a + nseg.get(key(x.panel, x.edge)), 0), nb = it.B.reduce((a, x) => a + nseg.get(key(x.panel, x.edge)), 0);
    const N = Math.max(na, nb, it.A.length, it.B.length);
    split(it.A, N); split(it.B, N);
  }

  const levels = attachLevels(measurements);
  const out = [];
  const ranges = new Map();
  for (const p of panels) {
    const pc = p.piece;
    const loop = [], rs = [];
    p.edges.forEach((ed, e) => {
      const n = nseg.get(key(p, e)), first = loop.length;
      loop.push(...arcSamples(ed.s, ed.e, ed.c, n));
      rs.push([first, n]);
    });
    const total = loop.length;
    const er = rs.map(([first, n]) => Array.from({ length: n + 1 }, (_, i) => (first + i) % total));
    er.forEach((r, e) => ranges.set(key(p, e), r));
    const labels = {};
    p.edges.forEach((ed, e) => {
      if (!ed.label) return;
      // necklines: the drape code's collar attachment is per side of the body
      const lab = ed.label === 'collar' ? (mean(er[e].map(i => loop[i][0])) >= 0 ? 'left_collar' : 'right_collar') : ed.label;
      (labels[lab] ||= []).push(...er[e]);
    });
    const role = ROLES[pc.role] || ROLES.body;
    const z = pc.z ?? role.z[pc.layer === 'back' ? 1 : 0];
    // pieces turned out of the front plane (imported from GarmentCode) keep their 3D placement;
    // their points are in the panel's own frame
    const place = pc.place && p.side === undefined ? pc.place : null;
    const ga = (pc.grain || 0) * Math.PI / 180;
    out.push({
      name: p.name, title: panelTitle(p), label: role.label, boundary: loop, edge_ranges: er, labels,
      rotation: place ? place.R : [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: place ? place.T : [0, 0, z],
      grain: [Math.sin(ga) * (p.side ? -1 : 1), Math.cos(ga)],
      rib: !!pc.rib, cutOnly: !!pc.cutOnly || pc.role === 'flat', fold: !!p.fold, layer: pc.layer, role: pc.role,
    });
  }
  const stitches = [];
  const byName = new Map(out.map(o => [o.name, o]));
  for (const it of insts) {
    // each side as a run of (panel, boundary index); consecutive edges share their joint
    const chain = (side) => {
      const idx = [];
      for (const { panel, edge } of side) {
        const r = ranges.get(key(panel, edge));
        const last = idx[idx.length - 1];
        r.forEach((i, j) => { if (!(j === 0 && last && last.n === panel.name && last.i === i)) idx.push({ n: panel.name, i }); });
      }
      return idx;
    };
    const A = chain(it.A);
    let B = chain(it.B);
    // pair the chains the way round that brings their ends together on the body
    const pt = (q) => { const o = byName.get(q.n); return [o.boundary[q.i][0], o.boundary[q.i][1], o.translation[2] * 0.3]; };
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const a0 = pt(A[0]), a1 = pt(A[A.length - 1]), b0 = pt(B[0]), b1 = pt(B[B.length - 1]);
    let reverse = it.seam.dir === 'same' ? false : it.seam.dir === 'reverse' ? true : d(a0, b1) + d(a1, b0) < d(a0, b0) + d(a1, b1);
    if (it.seam.flip) reverse = !reverse;
    if (reverse) B = B.slice().reverse();
    // one stitch per run of the same two panels, indices kept in step
    let cur = null;
    for (let k = 0; k < Math.min(A.length, B.length); k++) {
      const pa = A[k].n, pb = B[k].n;
      if (!cur || cur.a !== pa || cur.b !== pb) {
        if (cur) stitches.push(cur);
        cur = { a: pa, b: pb, ia: [], ib: [], seam: it.seam.id };
        if (k > 0 && (A[k - 1].n === pa) && (B[k - 1].n === pb)) { cur.ia.push(A[k - 1].i); cur.ib.push(B[k - 1].i); }
      }
      cur.ia.push(A[k].i); cur.ib.push(B[k].i);
    }
    if (cur) stitches.push(cur);
  }
  // sleeves: the direction from where they are sewn to the body (the cap) to their middle
  for (const o of out) {
    if (o.role !== 'arm') continue;
    const cap = [];
    for (const s of stitches) {
      const other = s.a === o.name ? byName.get(s.b) : s.b === o.name ? byName.get(s.a) : null;
      if (other && other.role !== 'arm') cap.push(...(s.a === o.name ? s.ia : s.ib));
    }
    if (!cap.length) continue;
    const c = [mean(o.boundary.map(p => p[0])), mean(o.boundary.map(p => p[1]))];
    const k = [mean(cap.map(i => o.boundary[i][0])), mean(cap.map(i => o.boundary[i][1]))];
    const l = Math.hypot(c[0] - k[0], c[1] - k[1]);
    if (l > 1) o.sleeveDir = [(c[0] - k[0]) / l, (c[1] - k[1]) / l];
  }
  const draped = drape ? out.filter(p => !p.cutOnly) : out;
  const names = new Set(draped.map(p => p.name));
  return {
    panels: draped,
    stitches: stitches.filter(s => names.has(s.a) && names.has(s.b)),
    attach_levels: levels,
    errors: errs,
    noDrape: drape && !draped.length,
    custom: true,
  };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
function panelTitle(p) {
  const nm = p.piece.name || 'Piece';
  if (p.side === undefined) return nm;
  return `${nm} (${p.name.startsWith('left') ? 'left' : 'right'})`;
}
/** Attachment levels, as gc_bridge.py exports them for GarmentCode designs. */
export function attachLevels(m) {
  const neckHalf = (m.neck_w - 2) / 2;
  return {
    lower_interface: m.height - m.head_l - m.waist_line,
    strapless_top: m.height - m.head_l - m.armscye_depth,
    right_collar: -neckHalf, left_collar: neckHalf,
  };
}

// ------------------------------------------------------------------ helpers for the editor
export const uid = () => Math.random().toString(36).slice(2, 9);
export function emptyDesign(measurements, name = 'My pattern') {
  return { v: 1, name, ref: { ...measurements }, grade: true, params: {}, pieces: [], seams: [] };
}
/** Which seam (and which end) uses a piece edge: { seam, end: 'a'|'b' } or null. */
export function seamOfEdge(design, pid, e, side = 0) {
  for (const s of design.seams) {
    for (const end of ['a', 'b']) {
      const r = s[end];
      if (r.p === pid && r.e.includes(e) && !!r.side === !!side) return { seam: s, end };
    }
  }
  return null;
}
/** Remove point i of a piece, keeping seams and edge data consistent. */
export function deletePoint(design, pc, i) {
  const n = pc.pts.length;
  if (n <= 3) return false;
  // edges i-1 and i merge into edge i-1; seams on either are dropped
  const prev = (i - 1 + n) % n;
  design.seams = design.seams.filter(s => !['a', 'b'].some(k => s[k].p === pc.id && (s[k].e.includes(i) || s[k].e.includes(prev))));
  pc.pts[prev].c = null;
  pc.pts.splice(i, 1);
  for (const s of design.seams) for (const k of ['a', 'b']) if (s[k].p === pc.id) s[k].e = s[k].e.map(e => (e > i ? e - 1 : e));
  return true;
}
/** Insert a point on edge i at parameter t (splitting its curve). */
export function insertPoint(design, pc, i, t, solvedP) {
  const n = pc.pts.length;
  const s = solvedP[i], e = solvedP[(i + 1) % n], c = pc.pts[i].c;
  const p = edgePoint(s, e, c, t);
  // split curves approximately: keep each half straight-ish with one control at its middle
  let c1 = null, c2 = null;
  if (c && c.length) {
    const m1 = edgePoint(s, e, c, t / 2), m2 = edgePoint(s, e, c, (1 + t) / 2);
    const q1 = [2 * m1[0] - (s[0] + p[0]) / 2, 2 * m1[1] - (s[1] + p[1]) / 2];
    const q2 = [2 * m2[0] - (p[0] + e[0]) / 2, 2 * m2[1] - (p[1] + e[1]) / 2];
    c1 = [absToRel(s, p, q1)]; c2 = [absToRel(p, e, q2)];
  }
  const label = pc.pts[i].label;
  pc.pts[i].c = c1;
  pc.pts.splice(i + 1, 0, { x: round1(p[0]), y: round1(p[1]), c: c2, label });
  // seams: an edge split into two becomes a chain of both halves
  for (const sm of design.seams) for (const k of ['a', 'b']) {
    if (sm[k].p !== pc.id) continue;
    const out = [];
    for (const e2 of sm[k].e) {
      if (e2 < i) out.push(e2);
      else if (e2 === i) out.push(i, i + 1);
      else out.push(e2 + 1);
    }
    sm[k].e = out;
  }
  return i + 1;
}
export const round1 = (v) => Math.round(v * 10) / 10;
