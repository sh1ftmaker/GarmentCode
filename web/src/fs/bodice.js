// Shared pieces of the adapters for FreeSewing's fitted bodices and their children (Bella,
// Noble, Bee): finding edges by the points they end at, and laying a darted bodice around
// the torso as if its darts were already sewn.
//
// A dart can't be closed in a flat plane without distorting the cloth around it (that is
// what it is for: it turns the flat piece into a cone). For the drape only a starting
// placement is needed, close to the sewn shape, so the darts are closed by shifting the cloth
// beyond them: a vertical (waist) dart moves the cloth at its side in by the dart's width at
// that height, as Wahid's; a horizontal (side bust) dart moves the cloth above it down by the
// dart's opening, fading out towards the shoulder, so the side seam above the dart lines up
// with the back's. The cloth simulation then settles the cone over the bust.
import { torsoMap, outlineSpan } from './place.js';
import { pieceLoop, pathEdges } from './convert.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** End points (FreeSewing coordinates, mm, y down) of each drawing operation of a part's seam path. */
function opEnds(part) {
  const ends = [];
  let first = null;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { first = op.to; continue; }
    if (op.type !== 'line' && op.type !== 'curve' && op.type !== 'close') continue;   // e.g. noop: not an edge (pathEdges)
    ends.push(op.type === 'close' ? first : op.to);
  }
  return ends;
}

/**
 * Edges of a part's seam path by the FreeSewing points they end at (within `tol` mm), in
 * drawing order: { name: edgeIndex }. Edges of zero length are skipped. `opt` names may be
 * missing (null), e.g. a dart FreeSewing leaves out when it would be negative.
 */
export function edgesOf(part, names, opt = [], tol = 3) {
  const ends = opEnds(part), ed = pathEdges(part.paths.seam);
  const len = (i) => { const p = ed[i]; if (!p) return 0; let l = 0; for (let k = 1; k < p.length; k++) l += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return l; };
  const out = {};
  let k = -1;
  for (const nm of names) {
    const p = part.points[nm];
    let j = k + 1;
    const hit = (i) => p && Math.hypot(ends[i].x - p.x, ends[i].y - p.y) < tol;
    while (j < ends.length && !(hit(j) && len(j) > 1e-3)) j++;
    if (j >= ends.length) {
      if (opt.includes(nm)) { out[nm] = null; continue; }
      throw new Error(`${part.name}: no seam edge ends at ${nm}`);
    }
    out[nm] = k = j;
  }
  return out;
}

/** x where polylines cross height y (first crossing), or null; y where they cross x likewise. */
function xAt(polys, y) {
  for (const p of polys) for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
  }
  return null;
}
function yAt(polys, x) {
  for (const p of polys) for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
    return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
  }
  return null;
}

/**
 * The "sewn" flat coordinates of a darted piece half (FreeSewing coordinates in cm, y up,
 * x >= 0 away from the centre line): (x, y) -> [x', y'].
 *  vdarts: [[legA, legB]] vertical darts, each leg a list of polylines, legA nearer the centre;
 *  hdarts: [{ lower, upper, apex, top }] horizontal darts from the side: their legs (polylines)
 *    and apex [x, y]; the cloth above moves down by the opening, fading out up to height `top`.
 */
export function sewnFlat({ vdarts = [], hdarts = [] }) {
  return (x, y) => {
    let dx = 0, dy = 0;
    for (const [A, B] of vdarts) {
      const a = xAt(A, y), b = xAt(B, y);
      if (a == null || b == null || b <= a) continue;
      dx -= x >= b ? b - a : x > a ? x - a : 0;
    }
    for (const { lower, upper, apex, top } of hdarts) {
      if (x <= apex[0]) continue;
      const lo = yAt(lower, x), hi = yAt(upper, x);
      if (lo == null || hi == null || hi <= lo) continue;
      if (y >= hi) dy -= (hi - lo) * clamp((top - y) / Math.max(1, top - hi), 0, 1);
      else if (y > lo) dy -= y - lo;
    }
    return [x + dx, y + dy];
  };
}

/**
 * A piece's outline (unmirrored) carried through a flat transform: outlineSpan of it. cx: the
 * piece's centre line (x), when not at 0; flat then takes x measured from it.
 */
export function sewnSpan(part, flat, cx = 0) {
  const loop = pieceLoop(part);
  for (const e of loop.edges) e.poly = e.poly.map(([x, y]) => flat(Math.abs(x - cx), y));
  return outlineSpan(loop);
}

/**
 * Pull a placed point back towards the torso when it stands more than `max` cm off the body's
 * section at its height. torsoMap lays the top of a bodice on rings as wide as the garment at
 * the armholes, so a close neckline (Bella's, Breanna's) starts as a funnel well in front of
 * the neck, and the cloth falling back from it crumples into folds the drape keeps.
 */
function hug(F, p, max) {
  const S = F.sec(p[1]), n = S.r.length - 1;
  const dx = p[0] - S.xc, dz = p[2] - S.zc, rr = Math.hypot(dx, dz);
  let f = (Math.atan2(dx, dz) / (2 * Math.PI) + 1) % 1 * n;
  const j = Math.floor(f); f -= j;
  const lim = S.r[j] * (1 - f) + S.r[j + 1] * f + max;
  if (rr <= lim || rr < 1e-6) return p;
  return [S.xc + dx * lim / rr, p[1], S.zc + dz * lim / rr];
}

/**
 * Torso maps for a darted (or panelled) front and back, each laid around the torso in its
 * sewn-flat coordinates (sewnFlat, slideFlat).
 *  front/back: { pieces: [{ part, flat, cx? }], hps, shoulder, armhole }: the pieces the side is
 *    cut in (their outlines give the girth: the widest sewn half width at each height) and
 *    its high shoulder point, shoulder point and armhole bottom as [x, y] in sewn-flat
 *    coordinates (cm, y up).
 * Returns { front(flat), back(flat) }: the map of a piece with that flat transform, taking
 * its local (x, y) (x < 0: a mirrored copy or half).
 */
export function dartedTorso(F, front, back, { gap = 1.5 } = {}) {
  const side = (s, y) => { const r = s(clamp(y, s.y0, s.y1)); return r ? r[1] : 0; };
  const half = (S) => (y) => Math.max(...S.map(s => side(s, y)));
  const hf = half(front.pieces.map(p => sewnSpan(p.part, p.flat, p.cx))), hb = half(back.pieces.map(p => sewnSpan(p.part, p.flat, p.cx)));
  const girth = (y) => hf(y) + hb(y);
  const armholeY = Math.min(front.armhole[1], back.armhole[1]);
  const line = ({ hps: n, shoulder: s, armhole: a }) => ({ hps: n, slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])), shoulderX: s[0], armholeX: a[0] });
  const Tf = torsoMap(F, { side: 1, xSign: 1, ...line(front), girth, armholeY, gap });
  const Tb = torsoMap(F, { side: -1, xSign: -1, ...line(back), girth, armholeY, gap });
  // inside the high shoulder points (the neckline and below it), the cloth starts no higher
  // than the high shoulder point less (most of) its depth below it in the pattern
  const wrap = (T, n) => (flat) => (x, y) => {
    const [u, v] = flat(Math.abs(x), y), p = hug(F, T(Math.sign(x || 1) * u, v), gap + 2.5);
    if (u < n[0]) p[1] = Math.min(p[1], F.Yhps + gap - 0.8 * Math.max(0, n[1] - v));
    return p;
  };
  return { front: wrap(Tf, front.hps), back: wrap(Tb, back.hps), girth, armholeY };
}

/**
 * Sewn-flat transform of a panel sewn to another along a seam drawn in a different place
 * (a princess panel, a dart opened into a seam): each point moves by the offset between the
 * two seam lines at matching arc length, the offsets blended by inverse distance (nearest
 * dominating). seam: the panel's own seam polylines, onto: the partner's (same direction),
 * then `base` (the partner's own flat transform) is applied.
 */
export function slideFlat(seam, onto, base = (x, y) => [x, y], N = 48) {
  const sample = (polys) => {
    const pts = polys.flat(), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1] || 1, out = [];
    for (let k = 0, i = 1; k <= N; k++) {
      const s = L * k / N;
      while (i < pts.length - 1 && cum[i] < s) i++;
      const f = clamp((s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), 0, 1);
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
    }
    return out;
  };
  const A = sample(seam), B = sample(onto).map(([x, y]) => base(x, y));
  const D = A.map((a, k) => [B[k][0] - a[0], B[k][1] - a[1]]);
  return (x, y) => {
    let w = 0, dx = 0, dy = 0;
    for (let k = 0; k <= N; k++) {
      const d2 = (A[k][0] - x) ** 2 + (A[k][1] - y) ** 2;
      if (d2 < 1e-8) return [x + D[k][0], y + D[k][1]];
      const ww = 1 / (d2 * d2);
      w += ww; dx += ww * D[k][0]; dy += ww * D[k][1];
    }
    return [x + dx / w, y + dy / w];
  };
}

/** Edge indices a..b (inclusive). */
export const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
/** Polylines (cm, y up) of the given edges of a part. */
export const polysOf = (part, ids) => { const ed = pathEdges(part.paths.seam); return ids.map(i => ed[i]); };
/** A FreeSewing point as [x, y] in cm, y up. */
export const P = (pt) => [pt.x / 10, -pt.y / 10];
