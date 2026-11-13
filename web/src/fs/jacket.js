// Shared pieces of the adapters for FreeSewing's tailored jackets and coats (Jaeger,
// Carlton, Carlita): edges found by the points they end at, options from the design tree,
// and the placement of a front (+ side panel) + back torso around the body, with folds
// (lapels, vents) laid as layers.
import { pathEdges, pieceLoop } from './convert.js';
import { outlineSpan, torsoMap } from './place.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const P = (pt) => [pt.x / 10, -pt.y / 10];

/** App design tree -> FreeSewing options (by each option's `fs` kind, as index.js does for the generic designs). */
export function fsOptions(d) {
  const o = {};
  for (const grp of Object.values(d)) for (const [k, n] of Object.entries(grp)) {
    if (!n || typeof n !== 'object' || !('v' in n)) continue;
    o[k] = n.fs === 'pct' ? n.v / 100 : n.fs === 'mm' ? n.v * 10 : n.v;
  }
  return o;
}

/** Seam path end points (FreeSewing points) in drawing order (moves excluded, closes -> the start). */
function ends(part) {
  const out = [];
  let first = null;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { first = op.to; continue; }
    out.push(op.type === 'close' ? first : op.to);
  }
  return out;
}

/**
 * Edges found by the FreeSewing points they end at, in drawing order: { name: edgeIndex }.
 * Names may be alternatives ('a|b'); a name prefixed with '?' is optional (null when absent).
 */
export function edgesOf(part, names) {
  const E = ends(part), out = {};
  let k = -1;
  for (const raw of names) {
    const opt = raw.startsWith('?'), alts = raw.replace(/^\?/, '').split('|');
    let j = -1;
    for (const nm of alts) {
      const p = part.points[nm];
      if (!p) continue;
      for (let i = k + 1; i < E.length; i++) if (Math.abs(E[i].x - p.x) < 0.01 && Math.abs(E[i].y - p.y) < 0.01) { j = i; break; }
      if (j >= 0) break;
    }
    const key = alts[0];
    if (j < 0) {
      if (opt) { out[key] = null; continue; }
      throw new Error(`${part.name}: no seam edge ends at ${alts.join(' or ')}`);
    }
    out[key] = k = j;
  }
  return out;
}

/** Edge indices from a (exclusive) to b (inclusive). */
export const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + 1 + i);

/** x where a set of polylines crosses height y (clamped to their height range). */
export function seamX(polys) {
  const ys = polys.flatMap(p => p.map(q => q[1]));
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  return (y) => {
    y = clamp(y, y0 + 1e-4, y1 - 1e-4);
    for (const p of polys) for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
      return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
    }
    return 0;
  };
}

/** Reflect [x, y] across the line a-b. */
export function reflect(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  return [2 * (a[0] + t * dx) - p[0], 2 * (a[1] + t * dy) - p[1]];
}
/** Which side of the line a-b [x, y] lies on (sign of the cross product). */
export const sideOf = (p, a, b) => Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));

/** Move a 3D point d cm away from the torso's axis (horizontally; negative: inwards). */
export function outward(F, Q, d) {
  if (!d) return Q;
  const S = F.sec(Q[1]), rx = Q[0] - S.xc, rz = Q[2] - S.zc, r = Math.hypot(rx, rz) || 1;
  return [Q[0] + d * rx / r, Q[1], Q[2] + d * rz / r];
}

/** The shoulder seam (edge index) of a part as [neck end, shoulder end] (cm). */
export function shoulderLine(part, e) {
  const p = pathEdges(part.paths.seam)[e], a = p[0], b = p[p.length - 1];
  return a[0] < b[0] ? [a, b] : [b, a];
}

/**
 * Torso placement of a jacket: a front (closure edge at local x = cx), optionally a side
 * panel drafted in the front's coordinates, and a back with a centre back seam (cb(y):
 * its x). Pieces are laid around the torso by their sewn widths (front: from the closure
 * edge to its side seam; side panel: between its two seams; back: from the centre back
 * seam), so their seams meet.
 *  front: { part, cx, shoulder (edge), side: [lo(y), hi(y)] of the front's side seam x }
 *  side:  { part, lo(y), hi(y) } or null
 *  back:  { part, cb(y), hi(y), shoulder (edge) }
 *  armhole: [x, y] of the armhole bottom, in the side panel's (or the front's) coordinates
 *  skirt: { front, back } (optional, long coats): pattern heights (each piece's own) below
 *    which the pieces hang as a cone from that level (the torso maps are made for the torso:
 *    below the seat they would pleat the extra girth into depth): the ring at that height,
 *    scaled about the body's axis by the garment's girth there.
 * Returns { front, side, back }: (x, y, sg) in each piece's FreeSewing (unmirrored) coordinates -> 3D,
 * on the wearer's left for the front and side (sg = 1) or right (sg = -1), the back the other way round.
 */
export function jacketTorso(F, { front, side = null, back, armhole, gap = 1.5, skirt = null }) {
  const wf = (y) => front.hi(y) - front.cx;
  const ws = (y) => (side ? Math.max(0, side.hi(y) - side.lo(y)) : 0);
  const wb = (y) => back.hi(y) - back.cb(y);
  const girth = (y) => wf(y) + ws(y) + wb(y);
  const armholeY = armhole[1];
  const uArm = side ? wf(armholeY) + (armhole[0] - side.lo(armholeY)) : armhole[0] - front.cx;
  const [nf, sf] = shoulderLine(front.part, front.shoulder), [nb, sb] = shoulderLine(back.part, back.shoulder);
  const slope = (n, s) => Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0]));
  const cbN = back.cb(nb[1]), cbS = back.cb(sb[1]);
  const Tf0 = torsoMap(F, { side: 1, xSign: 1, hps: [nf[0] - front.cx, nf[1]], slope: slope(nf, sf), shoulderX: sf[0] - front.cx,
    armholeX: uArm, girth, armholeY, gap });
  const Tb0 = torsoMap(F, { side: -1, xSign: -1, hps: [nb[0] - cbN, nb[1]], slope: slope(nb, sb), shoulderX: sb[0] - cbS,
    armholeX: girth(armholeY) - uArm, girth, armholeY, gap });
  const cone = (T, yS) => (u, y) => {
    if (yS == null || y >= yS) return T(u, y);
    const g0 = Math.max(1, girth(yS)), g = Math.max(1, girth(y)), s = Math.max(0.95, g / g0);
    const Q = T(u * g0 / g, yS), S = F.sec(Q[1]);
    return [S.xc + (Q[0] - S.xc) * s, Q[1] - (yS - y), S.zc + (Q[2] - S.zc) * s];
  };
  const Tf = cone(Tf0, skirt?.front), Tb = cone(Tb0, skirt?.back);
  return {
    girth,
    front: (x, y, sg = 1) => Tf(sg * (x - front.cx), y),
    side: side ? (x, y, sg = 1) => Tf(sg * (wf(y) + (x - side.lo(y))), y) : null,
    back: (x, y, sg = 1) => Tb(sg * (x - back.cb(y)), y),
    Tf, Tb,
  };
}

/** [lo(y), hi(y)] of a part's outline, clamped to its height range. */
export function spanOf(part, opts = {}) {
  const s = outlineSpan(pieceLoop(part, opts));
  const at = (y) => s(clamp(y, s.y0 + 0.01, s.y1 - 0.01)) || [0, 0];
  return { lo: (y) => at(y)[0], hi: (y) => at(y)[1], y0: s.y0, y1: s.y1 };
}
