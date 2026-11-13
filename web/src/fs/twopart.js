// FreeSewing's two-part sleeve (library.topsleeve / library.undersleeve, used by Bent and
// the jackets and coats built on it: Jaeger, Carlton, Carlita, Devon): seam table and
// placement around the arm.
//
// The pieces are drafted on top of each other, both with the back (elbow) seam on their
// +x side: the top sleeve as seen from outside, the under sleeve as seen through the top
// sleeve (from inside). So each arm gets one unmirrored and one mirrored copy: the left
// arm the unmirrored top sleeve and the mirrored under sleeve, the right arm the reverse,
// and around the arm the under sleeve simply continues the top sleeve past the back seam.
import { pathEdges } from './convert.js';

const TAU = 2 * Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Index of the seam edge that ends at `pt` (FreeSewing point), or -1. */
export function edgeEndingAt(part, pt) {
  if (!pt) return -1;
  let k = -1, first = null;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { first = op.to; continue; }
    k++;
    const to = op.type === 'close' ? first : op.to;
    if (Math.abs(to.x - pt.x) < 0.01 && Math.abs(to.y - pt.y) < 0.01) return k;
  }
  return -1;
}

/**
 * Seam-path edges of a two-part sleeve, found by the points they end at (the parts that
 * add vents or cuffs to it keep these points), whichever point the outline starts at:
 *  top: back seam (wrist -> elbowRight -> tsRightEdge -> backPitchPoint), cap (-> top,
 *    -> frontPitchPoint, -> tsLeftEdge), front seam (-> tsElbowLeft -> tsWristLeft);
 *  under: back seam (wrist -> elbowRight -> usRightEdge -> usTip), cap (-> usLeftEdgeRight
 *    -> usLeftEdge), front seam (-> usElbowLeft -> usWristLeft).
 * The back seam starts at the wrist, or at the top of a vent (ventSlopeStart: Jaeger); the
 * wrist, a vent's extension or a cuff (Carlton) are not part of any seam.
 */
export function sleeveEdges(ts, us) {
  const run = (part, starts, names) => {
    const pe = pathEdges(part.paths.seam), n = pe.length;
    let k = -1;
    for (const nm of starts) { const j = edgeEndingAt(part, part.points[nm]); if (j >= 0) { k = j; break; } }
    if (k < 0) throw new Error(`${part.name}: no seam edge ends at ${starts.join(' or ')}`);
    const out = [];
    for (const nm of names) {
      const j = edgeEndingAt(part, part.points[nm]);
      if (j < 0) throw new Error(`${part.name}: no seam edge ends at ${nm}`);
      const r = [];
      for (let i = (k + 1) % n, c = 0; c < n; i = (i + 1) % n, c++) { if (pe[i]) r.push(i); if (i === j) break; }
      out.push(r);
      k = j;
    }
    return out;
  };
  const [tb1, tb2, tb3, tc1, tc2, tc3, tf1, tf2] = run(ts, ['ventSlopeStart', 'tsWristRight'],
    ['elbowRight', 'tsRightEdge', 'backPitchPoint', 'top', 'frontPitchPoint', 'tsLeftEdge', 'tsElbowLeft', 'tsWristLeft']);
  const [ub1, ub2, ub3, uc1, uc2, uf1, uf2] = run(us, ['ventSlopeStart', 'usWristRight'],
    ['elbowRight', 'usRightEdge', 'usTip', 'usLeftEdgeRight', 'usLeftEdge', 'usElbowLeft', 'usWristLeft']);
  return {
    top: { back: [...tb1, ...tb2, ...tb3], capBack: tc1, capTop: tc2, capFront: tc3, front: [...tf1, ...tf2] },
    under: { back: [...ub1, ...ub2, ...ub3], cap: [...uc1, ...uc2], front: [...uf1, ...uf2] },
  };
}

/**
 * Seams of one arm's sleeve: the two sleeve seams, and the armhole in two runs split at the
 * pitch points (FreeSewing's notches): `upper` is the body's armhole from the back pitch over
 * the shoulder to the front pitch, `lower` from the front pitch under the arm to the back
 * pitch (each a seam chain in sewing order, see brian.js).
 */
export function sleeveSeams(E, top, under, { upper, lower }) {
  const ch = (piece, ids, rev = false) => (rev ? ids.slice().reverse() : ids).map(k => [piece, k, rev]);
  return [
    { a: ch(top, E.top.back), b: ch(under, E.under.back) },                                     // back (elbow) seam
    { a: ch(top, E.top.front), b: ch(under, E.under.front) },                                   // front seam
    { a: upper, b: [...ch(top, E.top.capBack), ...ch(top, E.top.capTop)] },                     // armhole over the shoulder
    { a: lower, b: [...ch(top, E.top.capFront), ...ch(under, E.under.cap, true)] },             // armhole under the arm
  ];
}

/** x where a set of polylines crosses height y (the first crossing), or null. */
function xAt(polys, y) {
  for (const p of polys) for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  }
  return null;
}
/** (y) -> x of a seam run, clamped to its height range. */
function seamX(polys) {
  const ys = polys.flatMap(p => p.map(q => q[1]));
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  return (y) => xAt(polys, clamp(y, y0 + 1e-4, y1 - 1e-4)) ?? 0;
}

/**
 * Placement of the four sleeve pieces around the arms (upperFrame F). Returns
 * (kind, mirror) -> (x, y) => [X, Y, Z] where kind is 'top' or 'under' and (x, y) are the
 * piece copy's local coordinates (a mirrored copy's local x is -x).
 * Below the biceps line (the top of the seams, at the armpit crease) the sleeve is a tube
 * whose girth is the two pieces' widths between the seams; the cap above it continues the
 * tube towards the shoulder (it is snapped onto the armhole by `follow`). The front seam
 * keeps the angle it has at the biceps line, which puts the top of the cap on top of the arm.
 */
export function sleeveMaps(F, ts, us, E, { gap = 1.2 } = {}) {
  const et = pathEdges(ts.paths.seam), eu = pathEdges(us.paths.seam);
  const bicepsY = -ts.points.tsLeftEdge.y / 10;
  const tb = seamX(E.top.back.map(k => et[k])), tf = seamX(E.top.front.map(k => et[k]));
  const ub = seamX(E.under.back.map(k => eu[k])), uf = seamX(E.under.front.map(k => eu[k]));
  const widths = (y) => {
    const yy = Math.min(y, bicepsY);
    const a = tb(yy), b = tf(yy), c = ub(yy), d = uf(yy);
    return { tf: b, tw: Math.max(1, a - b), uw: Math.max(1, c - d), ub: c };
  };
  const w0 = widths(bicepsY), W0 = w0.tw + w0.uw;
  const thF = -TAU * (ts.points.top.x / 10 - w0.tf) / W0;   // front seam angle: the cap top on top of the arm
  const maps = {};
  for (const kind of ['top', 'under']) for (const mirror of [false, true]) {
    const sx = (kind === 'top') !== mirror ? 1 : -1, A = F.arms[sx];
    if (!A) { maps[kind + mirror] = null; continue; }
    const tPit = A.tCrease;
    maps[kind + mirror] = (x, y) => {
      const xu = mirror ? -x : x;   // FreeSewing (unmirrored) x
      const w = widths(y), W = w.tw + w.uw;
      const u = kind === 'top' ? xu - w.tf : w.tw + (w.ub - xu);
      const th = thF + TAU * u / W;
      const t = y <= bicepsY ? tPit + (bicepsY - y) : tPit - (y - bicepsY);
      const r = Math.max(W / TAU, A.radius(Math.max(t, A.root)) + gap);
      const c = Math.cos(th), s = -Math.sin(th);
      return A.at(t, r, [c * A.up[0] + s * A.fr[0], c * A.up[1] + s * A.fr[1], c * A.up[2] + s * A.fr[2]]);
    };
  }
  return (kind, mirror) => maps[kind + !!mirror];
}

const near = (a, b) => a && b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
/**
 * The drape copy of a two-part sleeve piece with a vent and a hem allowance (Jaeger, Carlton):
 * as the finished sleeve shows it from outside, which is the library sleeve's outline. The
 * back seam runs straight on to the wrist (the vent's extension is folded in behind it) and
 * the outline ends at the hem line (the allowance is turned up inside); those layers are cut,
 * not simulated. kind: 'ts' (top sleeve) or 'us' (under sleeve). Mutates the part's seam path:
 * for the drape copy only.
 */
export function finishSleeve(part, kind) {
  const p = part.points, wr = p[kind + 'WristRight'], wl = p[kind + 'WristLeft'];
  if (!wr || !wl || !p.elbowRight) return;
  const ops = part.paths.seam.ops.filter(op => op.type !== 'move' && op.type !== 'close'), n = ops.length;
  const a = ops.findIndex(op => near(op.to, p.elbowRight)), b = ops.findIndex(op => near(op.to, wl));
  if (a < 0 || b < 0) return;
  const out = [{ type: 'move', to: wr }, { type: 'line', to: p.elbowRight }];
  for (let i = (a + 1) % n; ; i = (i + 1) % n) { out.push(ops[i]); if (i === b) break; }
  out.push({ type: 'line', to: wr });
  part.paths.seam.ops = out;
}
