// Turn a GarmentCode pattern specification (gc_bridge spec_json) into an editor design:
// panels placed flat on the body (identity / in-plane rotation) become pieces drawn where
// they sit; left/right mirror images collapse into one 'pair' piece; GarmentCode's
// stitches become seams with the same sewing direction. Panels turned out of the body's
// front plane (e.g. hood halves) keep GarmentCode's 3D placement (piece.place).
import { uid, absToRel, emptyDesign } from './model.js';

const rad = (d) => d * Math.PI / 180;
function eulerR([a, b, c]) {   // pygarment euler_xyz_to_R: Rz * Ry * Rx, degrees
  const [x, y, z] = [rad(a), rad(b), rad(c)];
  const Rx = [[1, 0, 0], [0, Math.cos(x), -Math.sin(x)], [0, Math.sin(x), Math.cos(x)]];
  const Ry = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]];
  const Rz = [[Math.cos(z), -Math.sin(z), 0], [Math.sin(z), Math.cos(z), 0], [0, 0, 1]];
  const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
  return mul(mul(Rz, Ry), Rx);
}

/** SVG-style circular arc (GarmentCode 'circle' curvature) as cubic pieces: [[p0, c1, c2, p1], ...]. */
function arcCubics(s, e, radius, largeArc, sweep) {
  const dx = (s[0] - e[0]) / 2, dy = (s[1] - e[1]) / 2;
  const d2 = dx * dx + dy * dy;
  let r = Math.max(radius, Math.sqrt(d2));
  const sign = (!!largeArc === !!sweep) ? -1 : 1;
  const k = sign * Math.sqrt(Math.max(0, (r * r - d2) / d2));
  const cx = k * dy + (s[0] + e[0]) / 2, cy = -k * dx + (s[1] + e[1]) / 2;
  let a0 = Math.atan2(s[1] - cy, s[0] - cx), a1 = Math.atan2(e[1] - cy, e[0] - cx);
  let da = a1 - a0;
  if (sweep && da < 0) da += 2 * Math.PI;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 2) - 1e-6));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t0 = a0 + da * i / n, t1 = a0 + da * (i + 1) / n, h = 4 / 3 * Math.tan((t1 - t0) / 4);
    const p0 = [cx + r * Math.cos(t0), cy + r * Math.sin(t0)], p1 = [cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
    out.push([i === 0 ? s : p0, [p0[0] - h * r * Math.sin(t0), p0[1] + h * r * Math.cos(t0)],
      [p1[0] + h * r * Math.sin(t1), p1[1] - h * r * Math.cos(t1)], i === n - 1 ? e : p1]);
  }
  return out;
}

/**
 * @param spec GarmentCode pattern ({ panels: {name: {vertices, edges, translation, rotation, label}}, stitches })
 * @param measurements the body it was drafted for (the design's reference body)
 * @param title name for the new design; nice(name) -> piece title
 */
export function importGC(spec, measurements, title, nice = (n) => n) {
  const design = emptyDesign(measurements, title);
  const raw = {};   // panel name -> { pts: [{x, y, c, label}], edgeOf: [new edge index per GC edge (first of its split)], nEdges }
  for (const [name, p] of Object.entries(spec.panels)) {
    const R = eulerR(p.rotation || [0, 0, 0]), T = p.translation || [0, 0, 0];
    const inPlane = Math.abs(R[2][2]) > 0.995;
    const place = (v) => (inPlane ? [R[0][0] * v[0] + R[0][1] * v[1] + T[0], R[1][0] * v[0] + R[1][1] * v[1] + T[1]] : [v[0], v[1]]);
    const V = p.vertices.map(place);
    const pts = [], edgeOf = [];
    for (const ed of p.edges) {
      const [ia, ib] = ed.endpoints;
      const s = V[ia], e = V[ib];
      const lab = typeof ed.label === 'string' ? (ed.label.endsWith('_collar') ? 'collar' : ['lower_interface', 'strapless_top'].includes(ed.label) ? ed.label : '') : '';
      edgeOf.push(pts.length);
      const curv = ed.curvature;
      if (curv && !Array.isArray(curv) && curv.type === 'circle') {
        const [radius, large, sweep] = curv.params;
        // the arc's sense is about the panel's own frame; a mirror-free in-plane rotation keeps it
        for (const [p0, c1, c2, p1] of arcCubics(s, e, radius, large, sweep)) {
          pts.push({ x: p0[0], y: p0[1], c: [absToRel(p0, p1, c1), absToRel(p0, p1, c2)], label: lab, gc: [name, edgeOf.length - 1] });
        }
      } else {
        let c = null;
        if (Array.isArray(curv)) c = [curv];
        else if (curv?.type === 'quadratic') c = [curv.params[0]];
        else if (curv?.type === 'cubic') c = curv.params.slice(0, 2);
        pts.push({ x: s[0], y: s[1], c: c ? c.map(q => [+q[0], +q[1]]) : null, label: lab, gc: [name, edgeOf.length - 1] });
      }
    }
    const nEdges = p.edges.length;
    const span = (i) => { const a = edgeOf[i], b = i + 1 < nEdges ? edgeOf[i + 1] : pts.length; return Array.from({ length: b - a }, (_, k) => a + k); };
    raw[name] = { name, p, pts, span, R, T, inPlane };
  }

  // left/right mirror pairs: 'left_x' and 'right_x' with mirrored outlines
  const used = new Set(), pieces = [], refOf = {};   // refOf[panel] = { piece, side, edgeMap: gcEdge -> [piece edges] }
  const names = Object.keys(raw);
  const mirrorOf = (L, Rr) => {
    if (!L.inPlane || !Rr.inPlane || L.pts.length !== Rr.pts.length) return null;
    const n = L.pts.length;
    // right edge j (a->b) corresponds to left edge i with mirror(b_i) ... reversed
    const map = [];
    for (let j = 0; j < n; j++) {
      const a = Rr.pts[j], b = Rr.pts[(j + 1) % n];
      let hit = -1;
      for (let i = 0; i < n; i++) {
        const s = L.pts[i], e = L.pts[(i + 1) % n];
        if (Math.hypot(-e.x - a.x, e.y - a.y) < 0.5 && Math.hypot(-s.x - b.x, s.y - b.y) < 0.5) { hit = i; break; }
      }
      if (hit < 0) return null;
      map.push(hit);
    }
    return map;
  };
  for (const name of names) {
    if (used.has(name)) continue;
    const r = raw[name];
    const twinName = name.startsWith('left_') ? 'right_' + name.slice(5) : name.startsWith('right_') ? 'left_' + name.slice(6)
      : /_l$/.test(name) ? name.slice(0, -2) + '_r' : /_r$/.test(name) ? name.slice(0, -2) + '_l' : null;
    let twin = twinName && raw[twinName] && !used.has(twinName) ? raw[twinName] : null;
    let mm = null;
    // keep the piece on the wearer's left (+x) as drawn
    let main = r, other = twin;
    if (twin) {
      const meanX = (q) => q.pts.reduce((a, p) => a + p.x, 0) / q.pts.length;
      if (meanX(r) < meanX(twin)) { main = twin; other = r; }
      mm = mirrorOf(main, other);
      if (!mm) { twin = null; main = r; other = null; }
    }
    const p = main.p;
    const label = p.label || 'body';
    const role = label === 'arm' ? 'arm' : label === 'leg' ? (/pant|leg/.test(main.name) ? 'leg' : 'skirt') : 'body';
    const piece = {
      id: uid(), name: nice(main.name).replace(/ \((left|right)\)$/, ''), layer: main.T[2] >= 0 ? 'front' : 'back', role,
      sym: twin ? 'pair' : 'one', grain: role === 'arm' ? null : 0, z: main.T[2],
      pts: main.pts.map(({ x, y, c, label: lab }) => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, c, label: lab })),
    };
    if (!main.inPlane) piece.place = { R: main.R, T: main.T };
    pieces.push(piece);
    used.add(main.name);
    refOf[main.name] = { piece, side: 0, edges: (gi) => main.span(gi) };
    if (twin) {
      used.add(other.name);
      // right edge j <-> left edge mm[j]; a GC edge of the right panel spans the same split edges
      refOf[other.name] = { piece, side: 1, edges: (gi) => other.span(gi).map(j => mm[j]).sort((a, b) => a - b) };
    }
  }
  // sleeves: grain along the sleeve (set from the drape's sleeve direction later); keep vertical otherwise
  for (const pc of pieces) if (pc.grain === null) pc.grain = 0;

  // seams
  const seen = new Set();
  for (const st of spec.stitches || []) {
    const [A, B] = st;
    const ra = refOf[A.panel], rb = refOf[B.panel];
    if (!ra || !rb) continue;
    let sa = ra.side, sb = rb.side;
    if (sa === 1 && sb === 1) { sa = 0; sb = 0; }   // the mirror image of a seam on the other side
    const ea = ra.edges(A.edge), eb = rb.edges(B.edge);
    const k = `${ra.piece.id}:${ea}:${sa}|${rb.piece.id}:${eb}:${sb}`, k2 = `${rb.piece.id}:${eb}:${sb}|${ra.piece.id}:${ea}:${sa}`;
    if (seen.has(k) || seen.has(k2)) continue;
    seen.add(k);
    // GarmentCode sews the edges in opposite directions unless marked 'right_wrong' (gc_bridge._export)
    const dir = st.length === 3 && st[2] === 'right_wrong' ? 'same' : 'reverse';
    design.seams.push({ id: uid(), a: { p: ra.piece.id, e: ea, ...(sa ? { side: 1 } : {}) }, b: { p: rb.piece.id, e: eb, ...(sb ? { side: 1 } : {}) }, dir });
  }
  design.pieces = pieces;
  return design;
}
