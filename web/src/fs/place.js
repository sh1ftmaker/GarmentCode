// Where flat FreeSewing pieces start in 3D for the drape: body-hugging guide surfaces
// for upper-body pieces (front/back bodice around the torso and over the shoulders,
// sleeves around the arms, hoods around the head, bands around a hem or wrist).
// Lower-body pieces use hipSurface() in convert.js.
//
// The placement only has to be a good start: roughly the right shape, outside the
// body, with sewn edges close together. garment.js lifts it (~7 cm) and the cloth
// simulation settles it onto the body. Pieces that are hard to place on their own
// (sleeve caps, hoods, bands) are placed roughly and then snapped onto the pieces
// they are sewn to (see `follow` in convert.js).
//
// Conventions: world units are cm, y up, the body faces +z, the wearer's left is +x
// (body.js PART.L_ARM). Piece-local (x, y) are the panel's coordinates (cm, y up) as
// convertDraft emits them (mirrored copies have x negated).
import { PART } from '../body.js';

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = 2 * Math.PI;

function hull(pts) {   // monotone chain, counter-clockwise
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Principal axis of each arm (centroid c + unit direction a towards the hand), plus where the arm starts along it. */
export function armAxes(pos, part) {
  const out = {};
  for (const pid of [PART.L_ARM, PART.R_ARM]) {
    let n = 0, c = [0, 0, 0];
    for (let v = 0; v < part.length; v++) if (part[v] === pid) { c[0] += pos[3 * v]; c[1] += pos[3 * v + 1]; c[2] += pos[3 * v + 2]; n++; }
    if (!n) continue;
    c = c.map(x => x / n);
    let a = [c[0] >= 0 ? 1 : -1, -1, 0];   // power iteration on the covariance
    for (let it = 0; it < 12; it++) {
      const r = [0, 0, 0];
      for (let v = 0; v < part.length; v++) {
        if (part[v] !== pid) continue;
        const dx = pos[3 * v] - c[0], dy = pos[3 * v + 1] - c[1], dz = pos[3 * v + 2] - c[2];
        const d = dx * a[0] + dy * a[1] + dz * a[2];
        r[0] += d * dx; r[1] += d * dy; r[2] += d * dz;
      }
      const l = Math.hypot(...r) || 1; a = r.map(x => x / l);
    }
    if (a[1] > 0) a = a.map(x => -x);        // point down the arm
    let root = Infinity, end = -Infinity;
    for (let v = 0; v < part.length; v++) {
      if (part[v] !== pid) continue;
      const t = (pos[3 * v] - c[0]) * a[0] + (pos[3 * v + 1] - c[1]) * a[1] + (pos[3 * v + 2] - c[2]) * a[2];
      root = Math.min(root, t); end = Math.max(end, t);
    }
    out[c[0] >= 0 ? 'pos' : 'neg'] = { c, a, root, end };
  }
  return out;
}

// ------------------------------------------------------------------ body frame
const NB = 72;   // directions per torso section

/** Hull radius per direction φ = atan2(x, z) (0 = front) around (xc, zc). */
function hullRadii(H, xc, zc) {
  const r = new Float32Array(NB + 1);
  for (let j = 0; j < NB; j++) {
    const ph = TAU * j / NB, dx = Math.sin(ph), dz = Math.cos(ph);
    let best = 0;
    for (let i = 0; i < H.length; i++) {   // ray from the centre against each hull edge
      const a = H[i], b = H[(i + 1) % H.length];
      const ex = b[0] - a[0], ez = b[1] - a[1], ax = a[0] - xc, az = a[1] - zc;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den;
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, t);
    }
    r[j] = best;
  }
  r[NB] = r[0];
  return r;
}
/** Star-shaped section { xc, zc, r[direction] } plus arc-length tables from the front (φ = 0) to the back on each side. */
function section(xc, zc, r) {
  const arc = (sx) => {
    const c = new Float32Array(NB / 2 + 1);
    for (let k = 1; k <= NB / 2; k++) {
      const j0 = sx > 0 ? k - 1 : (NB - k + 1) % NB, j1 = sx > 0 ? k : NB - k;
      const p0 = TAU * j0 / NB, p1 = TAU * j1 / NB;
      c[k] = c[k - 1] + Math.hypot(r[j1] * Math.sin(p1) - r[j0] * Math.sin(p0), r[j1] * Math.cos(p1) - r[j0] * Math.cos(p0));
    }
    return c;
  };
  return { xc, zc, r, arcP: arc(1), arcN: arc(-1) };
}
const radiusAt = (S, ph) => {   // ph in radians, any range
  let f = ((ph / TAU) % 1 + 1) % 1 * NB;
  const j = Math.floor(f); f -= j;
  return S.r[j] * (1 - f) + S.r[j + 1] * f;
};
/** Point on a section inflated by scale s and gap g, at arc length a from the front on side sx. */
function ringAt(S, a, s, g, sx) {
  const c = sx > 0 ? S.arcP : S.arcN, n = NB / 2;
  // arc(φ) ≈ s * c(φ) + g * φ
  const A = (k) => s * c[k] + g * Math.PI * k / n;
  let k = 1;
  while (k < n && A(k) < a) k++;
  const a0 = A(k - 1), a1 = A(k);
  const f = clamp((a - a0) / ((a1 - a0) || 1), 0, 1);
  const ph = sx * Math.PI * (k - 1 + f) / n;
  const rr = radiusAt(S, ph) * s + g;
  return [S.xc + rr * Math.sin(ph), S.zc + rr * Math.cos(ph)];
}
const halfLen = (S) => 0.5 * (S.arcP[NB / 2] + S.arcN[NB / 2]);

/**
 * Measure the mannequin for upper-body placement.
 * body: { pos, part } (morphed mannequin), m: GarmentCode measurements (cm).
 */
export function upperFrame(body, m) {
  const { pos, part } = body;
  const Yhps = m.height - m.head_l;
  const Yarm = Yhps - m.armscye_depth;
  const Ywaist = Yhps - m.waist_line;
  const Ycrotch = Ywaist - m.hips_line - m.crotch_hip_diff;
  const Xtip = m.shoulder_w / 2;
  // torso sections every cm (vertices within ±1 cm), from below the crotch to the top of the head
  const y0 = Math.floor(Ycrotch - 2), y1 = Math.ceil(m.height + 1);
  const bins = Array.from({ length: y1 - y0 + 1 }, () => []);
  for (let v = 0; v < part.length; v++) {
    if (part[v] !== PART.BODY) continue;
    const y = pos[3 * v + 1], k = Math.round(y - y0);
    for (let q = k - 1; q <= k + 1; q++) if (q >= 0 && q < bins.length && Math.abs(y - (y0 + q)) <= 1) bins[q].push([pos[3 * v], pos[3 * v + 2]]);
  }
  // Sections share one centre (the chest's), and their radii change by at most `SLOPE` cm
  // per cm of height: the guide surface is the body as cloth would bridge it (a cone from
  // the shoulders to the neck, not a step), so rings at neighbouring heights stay close.
  let hulls = bins.map(b => (b.length >= 6 ? hull(b) : null));
  const kc = Math.round(Ycrotch + 4 - y0);
  for (let k = kc - 1; k >= 0; k--) hulls[k] = hulls[k + 1] || hulls[kc];   // below the crotch: the hips
  for (let k = 1; k < hulls.length; k++) hulls[k] ||= hulls[k - 1];
  for (let k = hulls.length - 2; k >= 0; k--) hulls[k] ||= hulls[k + 1];
  const Ha = hulls[clamp(Math.round(Yarm - 4 - y0), 0, hulls.length - 1)];
  const zc0 = 0.5 * (Math.min(...Ha.map(p => p[1])) + Math.max(...Ha.map(p => p[1]))), xc0 = 0;
  const R = hulls.map(H => hullRadii(H, xc0, zc0));
  const SLOPE = 0.6;
  for (let j = 0; j <= NB; j++) {
    for (let k = 1; k < R.length; k++) R[k][j] = Math.max(R[k][j], R[k - 1][j] - SLOPE);
    for (let k = R.length - 2; k >= 0; k--) R[k][j] = Math.max(R[k][j], R[k + 1][j] - SLOPE);
  }
  const secs = R.map(r => section(xc0, zc0, r));
  const sec = (Y) => secs[clamp(Math.round(Y - y0), 0, secs.length - 1)];

  // shoulder ridge (top of the body at each lateral offset X, the neck cut off at shoulder
  // level), and how far the body reaches forward / back below it
  const NX = Math.ceil(Xtip) + 3;
  const top = new Float32Array(NX), topZ = new Float32Array(NX), fz = new Float32Array(NX), bz = new Float32Array(NX);
  const cap = Yhps + 1;
  for (let X = 0; X < NX; X++) {
    let t = -Infinity, zs = 0, n = 0;
    for (let v = 0; v < part.length; v++) {
      const p = part[v];
      if (p !== PART.BODY && p !== PART.L_ARM && p !== PART.R_ARM) continue;
      if (Math.abs(Math.abs(pos[3 * v]) - X) > 1) continue;
      t = Math.max(t, Math.min(cap, pos[3 * v + 1]));
    }
    for (let v = 0; v < part.length; v++) {   // ridge z: where the top is
      if (part[v] !== PART.BODY || Math.abs(Math.abs(pos[3 * v]) - X) > 1) continue;
      const y = pos[3 * v + 1];
      if (y > t - 1.5 && y <= cap + 0.5) { zs += pos[3 * v + 2]; n++; }
    }
    top[X] = isFinite(t) ? t : Yarm;
    topZ[X] = n ? zs / n : 0;
    let f = -Infinity, b = Infinity;
    for (let v = 0; v < part.length; v++) {
      if (part[v] !== PART.BODY || Math.abs(Math.abs(pos[3 * v]) - X) > 1.2) continue;
      const y = pos[3 * v + 1];
      if (y < top[X] - 16 || y > top[X] - 2) continue;
      f = Math.max(f, pos[3 * v + 2]); b = Math.min(b, pos[3 * v + 2]);
    }
    fz[X] = isFinite(f) ? f : NaN; bz[X] = isFinite(b) ? b : NaN;
  }
  // fill gaps (near the arm) and smooth; inside the neck the ridge z is the one beside it
  for (const A of [fz, bz]) for (let X = 1; X < NX; X++) if (!isFinite(A[X])) A[X] = A[X - 1];
  const Xn = Math.max(2, Math.round(m.neck_w / 2 + 1));
  for (let X = 0; X < Xn && Xn < NX; X++) topZ[X] = topZ[Xn];
  const smooth = (A) => { const B = Float32Array.from(A); for (let X = 1; X < NX - 1; X++) B[X] = (A[X - 1] + 2 * A[X] + A[X + 1]) / 4; return B; };
  const T = smooth(top), TZ = smooth(topZ), F = smooth(fz), Bk = smooth(bz);
  const at = (A, X) => { const x = clamp(Math.abs(X), 0, NX - 1.001), i = Math.floor(x), f = x - i; return A[i] * (1 - f) + A[i + 1] * f; };

  // head: centre and half sizes of everything well above the shoulders
  let hx0 = Infinity, hx1 = -Infinity, hz0 = Infinity, hz1 = -Infinity, hn = 0, hy = 0;
  for (let v = 0; v < part.length; v++) {
    const y = pos[3 * v + 1];
    if (y < Yhps + 0.35 * m.head_l || part[v] === PART.FACE) continue;
    hx0 = Math.min(hx0, pos[3 * v]); hx1 = Math.max(hx1, pos[3 * v]); hz0 = Math.min(hz0, pos[3 * v + 2]); hz1 = Math.max(hz1, pos[3 * v + 2]);
    hy += y; hn++;
  }
  const head = hn ? { c: [(hx0 + hx1) / 2, Yhps + 0.62 * m.head_l, (hz0 + hz1) / 2], rx: (hx1 - hx0) / 2, rz: (hz1 - hz0) / 2, top: m.height }
    : { c: [0, Yhps + 0.62 * m.head_l, 2], rx: 8.5, rz: 10, top: m.height };

  // arms: axis frame + radius along the axis
  const arms = {};
  const ax = armAxes(pos, part);
  for (const [key, sx, pid] of [['pos', 1, PART.L_ARM], ['neg', -1, PART.R_ARM]]) {
    const A = ax[key];
    if (!A) continue;
    const { c, a } = A;
    let up = [-a[1] * a[0], 1 - a[1] * a[1], -a[1] * a[2]];
    const ul = Math.hypot(...up) || 1; up = up.map(v => v / ul);
    let fr = [a[1] * up[2] - a[2] * up[1], a[2] * up[0] - a[0] * up[2], a[0] * up[1] - a[1] * up[0]];
    if (fr[2] < 0) fr = fr.map(v => -v);
    // per 1 cm slice across the axis: centre offset (up, fr) and girth radius (hull perimeter / 2π)
    const n = Math.ceil(A.end - A.root) + 1, sl = Array.from({ length: n }, () => []);
    for (let v = 0; v < part.length; v++) {
      if (part[v] !== pid) continue;
      const dx = pos[3 * v] - c[0], dy = pos[3 * v + 1] - c[1], dz = pos[3 * v + 2] - c[2];
      const t = dx * a[0] + dy * a[1] + dz * a[2];
      sl[clamp(Math.round(t - A.root), 0, n - 1)].push([dx * up[0] + dy * up[1] + dz * up[2], dx * fr[0] + dy * fr[1] + dz * fr[2]]);
    }
    const rad = new Float32Array(n), cu = new Float32Array(n), cf = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const H = sl[k].length >= 5 ? hull(sl[k]) : null;
      if (!H) { rad[k] = k ? rad[k - 1] : 4; cu[k] = k ? cu[k - 1] : 0; cf[k] = k ? cf[k - 1] : 0; continue; }
      let per = 0, u0 = Infinity, u1 = -Infinity, f0 = Infinity, f1 = -Infinity;
      for (let i = 0; i < H.length; i++) {
        const p = H[i], q = H[(i + 1) % H.length];
        per += Math.hypot(p[0] - q[0], p[1] - q[1]);
        u0 = Math.min(u0, p[0]); u1 = Math.max(u1, p[0]); f0 = Math.min(f0, p[1]); f1 = Math.max(f1, p[1]);
      }
      rad[k] = per / TAU; cu[k] = (u0 + u1) / 2; cf[k] = (f0 + f1) / 2;
    }
    // smooth the centre line (the hand and the shoulder joint make the slices ragged)
    const sm3 = (X) => { const Y = Float32Array.from(X); for (let k = 2; k < n - 2; k++) Y[k] = (X[k - 2] + X[k - 1] + X[k] + X[k + 1] + X[k + 2]) / 5; return Y; };
    const CU = sm3(cu), CF = sm3(cf);
    const ki = (t) => clamp(Math.round(t - A.root), Math.min(4, n - 1), n - 1);   // the first slices are the ragged shoulder joint
    // armpit on the axis: where the arm's underside meets the torso side at armpit level
    const S = sec(Yarm);
    const pit = [S.xc + sx * radiusAt(S, sx * Math.PI / 2), Yarm, S.zc];
    const tPit = (pit[0] - c[0]) * a[0] + (pit[1] - c[1]) * a[1] + (pit[2] - c[2]) * a[2];
    arms[sx] = {
      c, a, up, fr, root: A.root, end: A.end, tPit,
      radius: (t) => rad[ki(t)],
      at: (t, r, dir) => {
        const k = ki(t), o = [CU[k] * up[0] + CF[k] * fr[0], CU[k] * up[1] + CF[k] * fr[1], CU[k] * up[2] + CF[k] * fr[2]];
        return [c[0] + o[0] + t * a[0] + r * dir[0], c[1] + o[1] + t * a[1] + r * dir[1], c[2] + o[2] + t * a[2] + r * dir[2]];
      },
    };
  }
  return {
    m, Yhps, Yarm, Ywaist, Ycrotch, Xtip, sec, head, arms, axes: ax,
    ridgeY: (X) => at(T, X), ridgeZ: (X) => at(TZ, X), frontZ: (X) => at(F, X), backZ: (X) => at(Bk, X),
  };
}

// ------------------------------------------------------------------ outlines
/** Horizontal extent of a piece outline (local coords): (y) -> [xmin, xmax] (null outside). */
export function outlineSpan(loop) {
  const segs = [];
  for (const e of loop.edges) for (let i = 1; i < e.poly.length; i++) segs.push([e.poly[i - 1], e.poly[i]]);
  let y0 = Infinity, y1 = -Infinity;
  for (const [a] of segs) { y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); }
  const step = 0.5, n = Math.ceil((y1 - y0) / step) + 1;
  const lo = new Float32Array(n).fill(NaN), hi = new Float32Array(n).fill(NaN);
  for (let k = 0; k < n; k++) {
    const y = Math.min(y1 - 1e-4, Math.max(y0 + 1e-4, y0 + k * step));
    let a = Infinity, b = -Infinity;
    for (const [p, q] of segs) {
      if ((p[1] - y) * (q[1] - y) > 0 || p[1] === q[1]) continue;
      const x = p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]);
      a = Math.min(a, x); b = Math.max(b, x);
    }
    if (isFinite(a)) { lo[k] = a; hi[k] = b; }
  }
  const fn = (y) => {
    if (y < y0 - 1e-6 || y > y1 + 1e-6) return null;
    const k = clamp(Math.round((y - y0) / step), 0, n - 1);
    return isFinite(lo[k]) ? [lo[k], hi[k]] : null;
  };
  fn.y0 = y0; fn.y1 = y1;
  return fn;
}

/** Distance (cm) from a local point to a polyline set. */
export function distTo(polys) {
  const segs = [];
  for (const p of polys) for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]);
  return (x, y) => {
    let best = Infinity;
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1) : 0;
      best = Math.min(best, Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y));
    }
    return best;
  };
}

// ------------------------------------------------------------------ torso
/**
 * Front or back bodice piece around the torso.
 *  side: +1 front, -1 back; xSign: world x sign of the piece's local +x (front +1, back -1
 *    when the piece is drawn as seen from outside); hps: [x, y] of the high point of the
 *    shoulder on the piece; slope: shoulder drop (cm per cm outwards from the HPS);
 *  girth(y): half girth of the garment at pattern height y (front + back half widths);
 *  armholeY: pattern height of the armhole bottom (side seam top).
 * Below the chest the piece wraps around a ring (the body section at that height, scaled
 * to the garment's girth, so front and back side seams meet). Near the top it lies over
 * the shoulder (a profile from the shoulder ridge down the front or back), so front and
 * back shoulder seams meet on the ridge. Points inside the body are pushed out radially.
 */
export function torsoMap(F, { side, xSign = 1, hps, slope = 0.35, girth, armholeY, gap = 1.5 }) {
  const topY = (ax) => hps[1] - slope * Math.max(0, ax - hps[0]);
  // shoulder profile per lateral offset: quarter ellipse from the ridge to the front / back wall
  const prof = new Map();
  const profile = (Xc) => {
    const key = Math.round(Xc * 2);
    if (prof.has(key)) return prof.get(key);
    const X = key / 2;
    const Yr = F.ridgeY(X) + gap, zr = F.ridgeZ(X);
    const res = {};
    for (const sd of [1, -1]) {
      const zw = sd > 0 ? F.frontZ(X) + gap : F.backZ(X) - gap;
      const hz = Math.max(2, Math.abs(zw - zr)), ry = clamp(0.9 * hz, 3, 12);
      const N = 24, tab = [0];
      for (let i = 1; i <= N; i++) {
        const t0 = (i - 1) / N * Math.PI / 2, t1 = i / N * Math.PI / 2;
        tab.push(tab[i - 1] + Math.hypot(hz * (Math.sin(t1) - Math.sin(t0)), ry * (Math.cos(t1) - Math.cos(t0))));
      }
      res[sd] = { Yr, zr, hz, ry, tab, arc: tab[N], sd };
    }
    res.off = 0.5 * (res[1].arc - res[1].ry + res[-1].arc - res[-1].ry);
    prof.set(key, res);
    return res;
  };
  const onProfile = (P, d) => {   // [Y, z] at surface distance d below the ridge
    if (d <= 0) return [P.Yr, P.zr + P.sd * d];
    if (d >= P.arc) return [P.Yr - P.ry - (d - P.arc), P.zr + P.sd * P.hz];
    let i = 1; while (i < P.tab.length - 1 && P.tab[i] < d) i++;
    const f = (d - P.tab[i - 1]) / ((P.tab[i] - P.tab[i - 1]) || 1), t = (i - 1 + f) / (P.tab.length - 1) * Math.PI / 2;
    return [P.Yr - P.ry + P.ry * Math.cos(t), P.zr + P.sd * P.hz * Math.sin(t)];
  };
  const Gtop = girth(armholeY - 0.5);
  const xh = Math.max(1, hps[0]), xn = Math.max(4, F.m.neck_w / 2 - 1.5);   // pattern HPS, half the neck
  // how much higher the torso hangs because the cloth first runs over the shoulder: one
  // value for the whole piece (and its partner), so hems stay level and side seams meet
  const Yref = F.ridgeY(xh);
  const off = profile(Math.min(F.Xtip, 0.5 * (xh + F.Xtip))).off;
  return (x, y) => {
    const ax = Math.abs(x), sx = (x >= 0 ? 1 : -1) * xSign;
    const d = topY(ax) - y;
    const Xc = Math.min(ax, F.Xtip);
    const pr = profile(Xc), P = pr[side];
    const neck = sm((ax - 0.4 * xn) / (0.8 * xn));    // 0 around the neck front / back, 1 beside the neck
    // over the shoulder
    const [Yt, Zt] = onProfile(P, d);
    // around the torso
    // near the top the ridge's own height at this X, further down the pattern's vertical (level hems)
    // (raised by `off` only near the top: lower down, e.g. at the armhole bottom, the pattern's
    // own height keeps the armhole under the arm)
    const o = off * (1 - sm((d - 4) / 14));
    const Yp = Yref + gap + (y - hps[1]) + o, Ytop = F.ridgeY(Xc) + gap - d + o;
    const Y = Yp + (Ytop - Yp) * (1 - sm(d / 20));
    const G = y >= armholeY - 0.5 ? Gtop : Math.max(1, girth(y) || Gtop);
    const S = F.sec(Y), L0 = halfLen(S);
    const half = Math.max(G, L0 + Math.PI * gap), s = (half - Math.PI * gap) / L0;
    const arc = side > 0 ? ax * half / G : half - ax * half / G;
    const [Xr, Zr] = ringAt(S, Math.max(0, arc), s, gap, sx);
    // over the shoulder only: around the neck, below the shoulder and out at the side seams
    // the rings take over
    const wR = Math.max(sm((d - P.arc) / 8), 1 - neck, sm((ax - F.Xtip - 1) / 5) * sm((d - 4) / 6));
    let X = (1 - wR) * sx * Xc + wR * Xr, YY = (1 - wR) * Yt + wR * Y, Z = (1 - wR) * Zt + wR * Zr;
    // push out of the torso radially (horizontal section at the point's height)
    const S2 = F.sec(YY), rx = X - S2.xc, rz = Z - S2.zc, rr = Math.hypot(rx, rz);
    const lim = radiusAt(S2, Math.atan2(rx, rz)) + gap;
    if (rr < lim && rr > 1e-6) { X = S2.xc + rx * lim / rr; Z = S2.zc + rz * lim / rr; }
    return [X, YY, Z];
  };
}

// ------------------------------------------------------------------ arms
/**
 * Sleeve as a tube around the arm on side sx (+1 = wearer's left, +x).
 *  span: outlineSpan of the sleeve (its width at each height is the tube's girth);
 *  bicepsY: pattern height of the biceps line (where the underarm seam starts), placed at
 *    the armpit; frontSign: sign of local x on the sleeve's front half.
 * The cap (above the biceps line) continues the tube towards the shoulder; it is meant
 * to be snapped onto the armhole (follow) afterwards.
 */
export function sleeveMap(F, { sx, span, bicepsY, frontSign = -1, gap = 1.2 }) {
  const A = F.arms[sx];
  if (!A) return null;
  const wAt = (y) => { const s = span(clamp(y, span.y0, span.y1)); return s ? [s[0], s[1]] : [-10, 10]; };
  const [bl, br] = wAt(bicepsY);
  return (x, y) => {
    let t, lo, hi;
    if (y <= bicepsY) { t = A.tPit + (bicepsY - y); [lo, hi] = wAt(y); }
    else { t = A.tPit - (y - bicepsY); lo = bl; hi = br; }
    const W = Math.max(4, hi - lo), xc = (lo + hi) / 2;
    const r = Math.max(W / TAU, A.radius(Math.max(t, A.root)) + gap);
    const th = TAU * (x - xc) / W;
    const c = Math.cos(th), s = Math.sin(th) * frontSign;
    return A.at(t, r, [c * A.up[0] + s * A.fr[0], c * A.up[1] + s * A.fr[1], c * A.up[2] + s * A.fr[2]]);
  };
}

// ------------------------------------------------------------------ head
/**
 * Hood side beside the head on side sx. The piece hangs upright (local +y up, local
 * +x * zSign towards the face) with `anchor` (the back end of its neck seam) at the back
 * of the neck; it curves in to x = ±inset along `seam` (the centre seam polylines) and
 * stands off the head everywhere else.
 */
export function hoodSideMap(F, { sx, anchor, seam, zSign = 1, inset = 3, gap = 2.5 }) {
  const dist = distTo(seam);
  const S = F.sec(F.Yhps + 1);
  const zb = S.zc - radiusAt(S, Math.PI) - gap, Yb = F.Yhps + 1.5;
  const R = F.head.rx + gap, bend = 9;
  return (x, y) => {
    const Z = zb + zSign * (x - anchor[0]), Y = Yb + (y - anchor[1]);
    const s = dist(x, y);
    const X = inset + (R - inset) * Math.sin(Math.min(1, s / bend) * Math.PI / 2);
    return [sx * X, Y, Z];
  };
}

// ------------------------------------------------------------------ bands
/** A band hanging below a ring at height Y (e.g. a waistband below the hem): u along it (0..len) runs around the body from angle phi0 (0 = front, π/2 = +x side) towards +phi; v down. */
export function bandRingMap(F, { Y, len, phi0 = Math.PI / 2, dir = 1, gap = 2 }) {
  return (u, v) => {
    const Yv = Y - v, S = F.sec(Yv);
    const L = 2 * halfLen(S), s = Math.max(1, (len / (2 * Math.PI) - gap) / (L / (2 * Math.PI)));
    const ph = phi0 + dir * TAU * u / len;
    const r = radiusAt(S, ph) * s + gap;
    return [S.xc + r * Math.sin(ph), Yv, S.zc + r * Math.cos(ph)];
  };
}

/**
 * A band sewn along a straight edge of another piece (a cuff on a sleeve's wrist):
 * map the band's local (x, y) onto the host piece's local coordinates, beyond the host
 * edge, then through the host's map. c0 -> c1: the band's sewn edge, s0 -> s1: the host
 * edge it is sewn to (both in sewing order); the band continues away from the host.
 */
export function bandOnEdge(hostMap, [s0, s1], [c0, c1], { away = [0, -1] } = {}) {
  const cx = c1[0] - c0[0], cy = c1[1] - c0[1], cl2 = cx * cx + cy * cy || 1, cl = Math.sqrt(cl2);
  return (x, y) => {
    const t = ((x - c0[0]) * cx + (y - c0[1]) * cy) / cl2;
    const off = Math.abs((x - c0[0]) * cy - (y - c0[1]) * cx) / cl;
    return hostMap(s0[0] + t * (s1[0] - s0[0]) + away[0] * off, s0[1] + t * (s1[1] - s0[1]) + away[1] * off);
  };
}

/** Canonical start and end (local coords) of edge `id` of a piece loop (see pieceLoop). */
export function edgeEnds(loop, id) {
  const e = loop.edges.find(q => q.id === String(id));
  const a = e.poly[0], b = e.poly[e.poly.length - 1];
  return e.canon > 0 ? [a, b] : [b, a];
}
