// Placement helpers for lower-body FreeSewing pieces with legs (trousers built on Titan,
// and skirts) and for finding seam edges by FreeSewing's named points.
//
// Trouser legs: every leg piece (front or back of one leg) is laid on the body section
// of its own side at each height (the convex hull of the half torso and that leg, from
// the morphed mannequin). Above the crotch a piece runs around that hull from the centre
// front (or centre back) seam, and its crotch extension carries on along the body's centre
// plane, under the crotch, so front and back meet at the fork. Below the crotch front and
// back share the leg's hull, scaled up to the trouser leg's girth: the front from the
// outseam over the front of the leg to the inseam, the back the rest of the way round.
// The two are blended over a few cm around the fork.
//
// Conventions as in place.js: world cm, y up, the body faces +z, the wearer's left is +x.
// The pieces' local y is FreeSewing's (cm, y up) with 0 at the natural waist.
import { PART } from '../body.js';
import { outlineSpan } from './place.js';

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ options
/** App parameter tree -> FreeSewing options, by each entry's `fs` kind (as meta/<id>.json). */
export function fsOptions(d) {
  const o = {};
  for (const grp of Object.values(d)) for (const [k, n] of Object.entries(grp)) {
    if (!n || typeof n !== 'object' || !('v' in n)) continue;
    o[k] = n.fs === 'pct' ? n.v / 100 : n.fs === 'mm' ? n.v * 10 : n.v;
  }
  return o;
}

// ------------------------------------------------------------------ seam edges
// (mm; FreeSewing nudges some points a hair apart, e.g. Titan's crotch seam start on a low waist)
const near = (p, q) => p && q && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;
/**
 * Edge numbers (seam path operations, as convert.js numbers them) of a part's seam from
 * point `from` to point `to`, in drawing order. FreeSewing designs draw some seams with a
 * varying number of operations (e.g. a knee point only when the knee is fitted), so seam
 * tables are built from named points rather than fixed numbers.
 */
export function opsBetween(part, from, to, path = 'seam') {
  const ops = part.paths[path].ops, ids = [];
  let cur = null, first = null, k = -1, on = false;
  for (const op of ops) {
    if (op.type === 'move') { cur = op.to; first = op.to; continue; }
    k++;
    const end = op.type === 'close' ? first : op.to;
    if (!on && near(cur, from)) on = true;
    // ops shorter than convert.js keeps as edges (a hair-thin line) are left out
    if (on && !(op.type !== 'curve' && near(cur, end))) ids.push(k);
    cur = end;
    if (on && near(end, to)) return ids;
  }
  throw new Error(`${part.name}: no seam from (${from?.x?.toFixed(1)}, ${from?.y?.toFixed(1)}) to (${to?.x?.toFixed(1)}, ${to?.y?.toFixed(1)})`);
}
/** A seam chain item list ([[piece, op, rev]...]) for ops, optionally run backwards. */
export const chain = (piece, ids, rev = false) => (rev ? [...ids].reverse().map(i => [piece, i, true]) : ids.map(i => [piece, i]));

/** A part's seam outline (local cm, y up) as a one-edge loop, for outlineSpan(). */
export function partOutline(part) {
  const loc = (p) => [p.x / 10, -p.y / 10], pts = [];
  let cur = null;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { cur = op.to; pts.push(loc(cur)); continue; }
    if (op.type === 'curve') {
      for (let i = 1; i <= 24; i++) {
        const t = i / 24, s = 1 - t;
        const x = s * s * s * cur.x + 3 * s * s * t * op.cp1.x + 3 * s * t * t * op.cp2.x + t * t * t * op.to.x;
        const y = s * s * s * cur.y + 3 * s * s * t * op.cp1.y + 3 * s * t * t * op.cp2.y + t * t * t * op.to.y;
        pts.push([x / 10, -y / 10]);
      }
    } else if (op.to) pts.push(loc(op.to));
    if (op.to) cur = op.to;
  }
  pts.push(pts[0]);
  return { edges: [{ poly: pts }] };
}

// ------------------------------------------------------------------ body sections
function hullCW(pts) {   // convex hull, clockwise in (x, z) (outer side -> front -> centre for x < 0)
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return null;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1)).reverse();
}

/** A closed polygon with arc-length lookup: at(s) -> [x, z, nx, nz] (outward normal). */
function loopOf(H) {
  // start at the outermost point (min x)
  let i0 = 0;
  for (let i = 1; i < H.length; i++) if (H[i][0] < H[i0][0]) i0 = i;
  return loopFrom(H.slice(i0).concat(H.slice(0, i0)));
}
/** loopOf() for a polygon already starting where arc 0 should be. */
function loopFrom(H) {
  const P = H.slice();
  P.push(P[0]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum[cum.length - 1];
  let cx = 0, cz = 0;
  for (let i = 0; i < P.length - 1; i++) { cx += P[i][0]; cz += P[i][1]; }
  cx /= P.length - 1; cz /= P.length - 1;
  const pt = (s) => {
    s = ((s % L) + L) % L;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
    return [P[lo][0] + (P[hi][0] - P[lo][0]) * t, P[lo][1] + (P[hi][1] - P[lo][1]) * t];
  };
  const at = (s) => {
    const [x, z] = pt(s), a = pt(s - 2), b = pt(s + 2);
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    return [x, z, -tz, tx];   // clockwise loop: outward is the tangent turned counter-clockwise
  };
  // arc position of the point nearest q
  const nearest = (q) => {
    let best = 0, bd = Infinity;
    for (let s = 0; s < L; s += 0.25) { const p = pt(s), d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  };
  // the front-most and back-most points next to the centre plane (centre front / back)
  let xMax = -Infinity, zMax = -Infinity, zMin = Infinity;
  for (const [x] of P) xMax = Math.max(xMax, x);
  for (const [x, z] of P) if (x > xMax - 1.5) { zMax = Math.max(zMax, z); zMin = Math.min(zMin, z); }
  let front = 0, zf = -Infinity;
  for (let s = 0; s < L; s += 0.25) { const p = pt(s); if (p[1] > zf) { zf = p[1]; front = s; } }
  return { L, at, cx, cz, front, sCF: nearest([xMax, zMax]), sCB: nearest([xMax, zMin]), xMax };
}

/**
 * Sections of the wearer's right side (x < 0) of the lower body, one per cm of height:
 * section(Y) -> loop (see loopOf). The left side is mirrored into it, so both sides
 * use the same (symmetric) sections.
 */
export function lowerSections(body, topY) {
  const { pos, part } = body;
  const n = Math.ceil(topY) + 2, bins = Array.from({ length: n }, () => []);
  for (let v = 0; v < part.length; v++) {
    const p = part[v];
    if (p !== PART.BODY && p !== PART.L_LEG && p !== PART.R_LEG) continue;
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
    if (y < 0 || y > topY + 1.5) continue;
    // one side: the right leg and the torso's right half (the left mirrored onto it)
    let X;
    if (p === PART.R_LEG) X = Math.min(x, 0.3);
    else if (p === PART.L_LEG) X = Math.min(-x, 0.3);
    else X = Math.min(-Math.abs(x), 0.3);   // torso: both halves, mirrored onto x <= 0
    if (p === PART.BODY && Math.abs(x) < 0.3) X = 0.3;
    const k0 = Math.max(0, Math.floor(y - 1.2)), k1 = Math.min(n - 1, Math.ceil(y + 1.2));
    for (let k = k0; k <= k1; k++) if (Math.abs(y - k) <= 1.2) bins[k].push([X, z]);
  }
  const loops = new Array(n).fill(null);
  for (let k = 0; k < n; k++) { const H = bins[k].length >= 8 ? hullCW(bins[k]) : null; if (H && H.length >= 3) loops[k] = loopOf(H); }
  // fill holes from the nearest section
  for (let k = 0; k < n; k++) if (!loops[k]) {
    for (let d = 1; d < n; d++) { if (loops[k - d]) { loops[k] = loops[k - d]; break; } if (loops[k + d]) { loops[k] = loops[k + d]; break; } }
  }
  return (Y) => loops[clamp(Math.round(Y), 0, n - 1)];
}

// ------------------------------------------------------------------ trouser legs
/**
 * Maps for the four leg pieces of a pair of trousers.
 *  sections: lowerSections(); waistY: world height of the pieces' local y = 0;
 *  front / back: { loop (pieceLoop of the unmirrored piece), outSign: sign of local x
 *    towards the outseam, cs: [x, y] where the crotch (front) / cross (back) seam starts
 *    to curve, forkY: local height of the fork };
 *  gap: clearance (cm) off the body.
 * Returns { front, back }: (x, y) -> [X, Y, Z] for the wearer's right leg pieces as drawn
 * (mirror the result in x for the left leg).
 */
export function trouserMaps(sections, { waistY, front, back, gap = 1.2, blend = 5 }) {
  const spans = { front: outlineSpan(front.loop), back: outlineSpan(back.loop) };
  const P = { front, back };
  // inner (centre / inseam) and outer (outseam) extents of a piece at local height y
  const ext = (k, y) => {
    const sp = spans[k](clamp(y, spans[k].y0, spans[k].y1));
    if (!sp) return null;
    const o = P[k].outSign;
    return o < 0 ? { out: sp[0], inn: sp[1] } : { out: sp[1], inn: sp[0] };
  };
  const width = (k, y) => { const e = ext(k, y); return e ? Math.abs(e.inn - e.out) : 0; };
  const put = (S, s, k, g) => {   // point at arc s on section S scaled by k about its centre, g off it
    const [x, z, nx, nz] = S.at(s);
    return [S.cx + k * (x - S.cx) + g * nx, S.cz + k * (z - S.cz) + g * nz];
  };
  const make = (kind) => {
    const pc = P[kind], isFront = kind === 'front', o = pc.outSign;
    return (x, y) => {
      const Y = waistY + y, S = sections(Y);
      const e = ext(kind, y);
      // above the crotch: around the hull from the centre seam (and on along the centre plane)
      let sig;   // distance from the centre seam towards the outseam (negative: crotch extension)
      if (y >= pc.cs[1] && e) sig = (e.inn - x) * -o;
      else sig = (pc.cs[0] - x) * -o;
      const sHip = isFront ? S.sCF - sig : S.sCB + sig;
      const hip = put(S, sHip, 1, gap);
      // below the crotch: around the leg, the front from the outseam over the front
      const wf = width('front', y), wb = width('back', y), W = wf + wb;
      const k = Math.max(1, W / S.L);
      const t = e ? clamp((x - e.out) / ((e.inn - e.out) || 1), 0, 1) : 0;
      const sO = S.front - wf / (2 * k);
      const sLeg = isFront ? sO + t * wf / k : sO - t * wb / k;
      const leg = put(S, sLeg, k, gap);
      const a = sm((pc.forkY + blend - y) / (2 * blend));
      return [hip[0] * (1 - a) + leg[0] * a, Y, hip[1] * (1 - a) + leg[1] * a];
    };
  };
  return { front: make('front'), back: make('back') };
}

// ------------------------------------------------------------------ bands
/**
 * A waistband around the body at height Y: (u, v) -> 3D, u (0..len) along the band from
 * the centre front towards the wearer's right, round the back and back to the front;
 * v up from Y. Meant to be snapped onto the waist it is sewn to (`follow`).
 */
export function waistBandMap(body, sections, { Y, len, gap = 1.5 }) {
  void body;
  return (u, v) => {
    const S = sections(Y + v);
    // the right half: from the centre front (sCF) back towards the side and round to the
    // centre back (sCB); the left half mirrors it
    const half = (S.sCF - S.sCB + S.L) % S.L;   // arc from CB round the outside to CF
    let f = ((u / len) % 1 + 1) % 1, sx = 1;
    if (f > 0.5) { f = 1 - f; sx = -1; }
    const s = S.sCF - 2 * f * half;
    const [x, z, nx, nz] = S.at(s);
    return [sx * (x + gap * nx), Y + v, z + gap * nz];
  };
}

// ------------------------------------------------------------------ skirts
/**
 * A waistline with darts, from point `from` to `to` along the seam: { waist: [op...] (the
 * waist segments in drawing order), darts: [[leg1, leg2]...] } where a dart is a pair of
 * ops running down to its tip and back up.
 */
export function waistDarts(part, from, to, depth = 1.5) {
  const ids = opsBetween(part, from, to);
  const ops = part.paths.seam.ops, ends = [];   // per op number: [start y, end y] (cm, FreeSewing's y down)
  let cur = null;
  for (const op of ops) {
    if (op.type === 'move') { cur = op.to; continue; }
    const to = op.to || cur;
    ends.push([cur.y / 10, to.y / 10]);
    cur = to;
  }
  const waist = [], darts = [];
  for (let k = 0; k < ids.length; k++) {
    const i = ids[k], j = ids[k + 1];
    if (j !== undefined && ends[i][1] - ends[i][0] > depth && ends[i][1] - ends[j][1] > depth) { darts.push([i, j]); k++; continue; }
    waist.push(i);
  }
  return { waist, darts };
}

/**
 * Sections of the whole lower body (torso and both legs as one convex outline, as a
 * skirt hangs over them), one per cm: section(Y) -> loop with arc 0 at the centre front,
 * increasing towards the wearer's left (+x).
 */
export function skirtSections(body, topY) {
  const { pos, part } = body;
  const n = Math.ceil(topY) + 2, bins = Array.from({ length: n }, () => []);
  for (let v = 0; v < part.length; v++) {
    const p = part[v];
    if (p !== PART.BODY && p !== PART.L_LEG && p !== PART.R_LEG) continue;
    const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
    if (y < 0 || y > topY + 1.5) continue;
    for (let k = Math.max(0, Math.floor(y - 1.2)); k <= Math.min(n - 1, Math.ceil(y + 1.2)); k++) if (Math.abs(y - k) <= 1.2) bins[k].push([x, z], [-x, z]);
  }
  const loops = new Array(n).fill(null);
  for (let k = 0; k < n; k++) {
    const H = bins[k].length >= 16 ? hullCW(bins[k]) : null;
    if (!H || H.length < 3) continue;
    // start at the centre front: where the outline crosses x = 0 at the front
    let i0 = -1, zb = -Infinity;
    for (let i = 0; i < H.length; i++) {
      const a = H[i], b = H[(i + 1) % H.length];
      if (a[0] <= 0 && b[0] > 0 && Math.max(a[1], b[1]) > zb) { zb = Math.max(a[1], b[1]); i0 = i; }
    }
    if (i0 < 0) continue;
    const a = H[i0], b = H[(i0 + 1) % H.length], t = -a[0] / (b[0] - a[0]);
    const R = [[0, a[1] + (b[1] - a[1]) * t], ...H.slice(i0 + 1), ...H.slice(0, i0 + 1)];
    loops[k] = loopFrom(R);
  }
  for (let k = 0; k < n; k++) if (!loops[k]) {
    for (let d = 1; d < n; d++) { if (loops[k - d]) { loops[k] = loops[k - d]; break; } if (loops[k + d]) { loops[k] = loops[k + d]; break; } }
  }
  return (Y) => loops[clamp(Math.round(Y), 0, n - 1)];
}

/**
 * Skirt pieces around the lower body: (u, y, off) -> 3D, u = cm along the skirt's girth
 * from the centre front (towards the wearer's left), y = local height (0 = waistY in the
 * world), off = extra clearance (cm) for layered bits (a vent's overlap).
 * girth(y): the skirt's whole girth at local height y; the section is scaled up to it.
 */
export function skirtMap(sections, { waistY, girth, gap = 1.5 }) {
  return (u, y, off = 0) => {
    const Y = waistY + y, S = sections(Y), W = girth(y);
    const k = Math.max(1, W / S.L);
    const [x, z, nx, nz] = S.at((u / W) * S.L);
    const g = gap + off;
    return [S.cx + k * (x - S.cx) + g * nx, Y, S.cz + k * (z - S.cz) + g * nz];
  };
}
