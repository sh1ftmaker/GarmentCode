// Placement helpers for FreeSewing trousers: bands sewn round the leg openings (cuffs,
// legbands), and leg pieces fuller than the body (gathered or spread tops, side panels).
// Used by paco.js, percy.js, ashley.js, cornelius.js. Conventions as in lower.js: world cm,
// y up, the body faces +z, the wearer's left is +x; pieces in local cm with y up.
import { outlineSpan } from './place.js';

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * A closed 3D ring along edges of the pieces: segs = [[map, a, b], ...] where a, b are the
 * two ends ([x, y], local) of a straight edge, or [[map, polyline]] for any edge; map is that
 * piece's (x, y) -> 3D placement; in the order the band is sewn on. Returns { at(f) -> [x, y, z],
 * len, cx, cz } with f in 0..1 along the ring by arc length.
 */
export function hemRing(segs, n = 24) {
  const pts = [];
  for (const [map, a, b] of segs) {
    if (b === undefined) { for (let i = 0; i < a.length - 1; i++) pts.push(map(a[i][0], a[i][1])); continue; }
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push(map(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
    }
  }
  pts.push(pts[0]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const L = cum[cum.length - 1];
  let cx = 0, cz = 0;
  for (let i = 0; i < pts.length - 1; i++) { cx += pts[i][0]; cz += pts[i][2]; }
  cx /= pts.length - 1; cz /= pts.length - 1;
  const at = (f) => {
    const s = (((f % 1) + 1) % 1) * L;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1), p = pts[lo], q = pts[hi];
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  };
  return { at, len: L, cx, cz };
}

/**
 * A band hanging from a ring (a cuff below a hem): (u, v) -> 3D, u = cm along the band
 * (0..len, the whole ring), v = cm away from the ring (dir = -1: down, +1: up), out = extra
 * clearance off the ring outwards. Meant to be snapped onto the hem it is sewn to (`follow`).
 */
export function ringBand(ring, len, { dir = -1, out = 0.3 } = {}) {
  return (u, v) => {
    const p = ring.at(u / len);
    let nx = p[0] - ring.cx, nz = p[2] - ring.cz;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    return [p[0] + out * nx, p[1] + dir * v, p[2] + out * nz];
  };
}

/**
 * trouserMaps() (lower.js) for trousers fuller than the body (gathered or spread tops, side
 * panels): above the crotch the pieces' whole girth (front + side + back) goes round the
 * hull from the centre front to the centre back, the hull scaled up about the centre plane
 * where the cloth is wider than it; below, front and back share the leg's hull as there.
 *  front / back: { loop, outSign, cs, forkY } as for trouserMaps; side: optional loop of a
 *    side panel drafted in the front's coordinates (the pocket's side piece that shows
 *    through the pocket opening), counted into the front's width where it reaches past it;
 *  gap: clearance off the body; underGap: the side panel's clearance where it lies under
 *    the front (a layer inside it).
 * Returns { front, back, side }: (x, y) -> [X, Y, Z] for the wearer's right leg pieces as
 * drawn (mirror the result in x for the left leg).
 */
export function fullTrouserMaps(sections, { waistY, front, back, side = null, gap = 1.5, underGap = 0.5, blend = 5 }) {
  const spans = { front: outlineSpan(front.loop), back: outlineSpan(back.loop) };
  const sideSpan = side ? outlineSpan(side) : null;
  const P = { front, back };
  const ext = (k, y) => {
    // spread hems and waists are curved and jagged: their extremes are read a little inside
    const sp = spans[k](clamp(y, spans[k].y0 + 2.5, spans[k].y1 - 1.5));
    if (!sp) return null;
    const o = P[k].outSign;
    let out = o < 0 ? sp[0] : sp[1];
    const inn = o < 0 ? sp[1] : sp[0];
    if (k === 'front' && sideSpan) {
      const ss = sideSpan(y);
      if (ss) out = o < 0 ? Math.min(out, ss[0]) : Math.max(out, ss[1]);
    }
    return { out, inn };
  };
  const width = (k, y) => { const e = ext(k, y); return e ? Math.abs(e.inn - e.out) : 0; };
  const make = (kind) => {
    const pc = P[kind], isFront = kind === 'front', o = pc.outSign;
    return (x, y, g = gap) => {
      const Y = waistY + y, S = sections(Y);
      const e = ext(kind, y);
      const wf = width('front', y), wb = width('back', y), W = wf + wb;
      // above the crotch: round the hull from the centre seam (the crotch extension on
      // along the centre plane), the hull scaled about the centre plane to the cloth's girth
      let sig;
      if (y >= pc.cs[1] && e) sig = (e.inn - x) * -o;
      else sig = (pc.cs[0] - x) * -o;
      const A = (S.sCF - S.sCB + S.L) % S.L;   // centre front round the outside to the centre back
      const kh = Math.max(1, W / A);
      const sHip = isFront ? S.sCF - sig / kh : S.sCB + sig / kh;
      const [hx, hz, hnx, hnz] = S.at(sHip);
      const hip = [kh * hx + g * hnx, S.cz + kh * (hz - S.cz) + g * hnz];
      // below the crotch: round the leg, the front from the outseam over the front
      const k = Math.max(1, W / S.L);
      const t = e ? clamp((x - e.out) / ((e.inn - e.out) || 1), 0, 1) : 0;
      const sO = S.front - wf / (2 * k);
      const sLeg = isFront ? sO + t * wf / k : sO - t * wb / k;
      const [lx, lz, lnx, lnz] = S.at(sLeg);
      // scaled away from the inner thigh (not about the leg's centre), so a full leg does
      // not reach across into the other one
      // (the inner thigh, S.xMax, ends up 2.5 cm off the centre plane)
      const xi = k > 1.02 ? (-2.5 - g - k * S.xMax) / (1 - k) : S.xMax;
      const leg = [xi + k * (lx - xi) + g * lnx, S.cz + k * (lz - S.cz) + g * lnz];
      const a = sm((pc.forkY + blend - y) / (2 * blend));
      return [hip[0] * (1 - a) + leg[0] * a, Y, hip[1] * (1 - a) + leg[1] * a];
    };
  };
  const F = make('front'), B = make('back');
  // the side panel: on the front's map, tucked under the front where the front covers it
  const S = side ? (x, y) => {
    const sp = spans.front(y);
    const depth = sp ? Math.min(x - sp[0], sp[1] - x) : -1;
    return F(x, y, gap - (gap - underGap) * sm(depth / 2.5));
  } : null;
  return { front: F, back: B, side: S };
}

/**
 * A gathered seam between two long chains ([piece, op, rev] items) as one seam per item of
 * chain a, each sewn to the matching stretch of chain b (by arc length, so b is gathered
 * evenly onto a or the other way round). convertDraft merges chain breaks closer than 2 % of
 * a seam, which loses edges when a chain has many short ones (a spread hem's), hence this.
 * Items of a may be partial ([piece, op, rev, from, to]); len(piece, op): the edge's length.
 */
export function gatherSeams(a, b, len) {
  const cum = (ch) => { let s = 0; return ch.map(it => { const l = len(it[0], it[1]) * ((it[4] ?? 1) - (it[3] ?? 0)); const r = [s, s + l]; s += l; return r; }).map(([p, q]) => [p, q, s]); };
  const ca = cum(a), cb = cum(b);
  const A = ca[0][2], B = cb[0][2], seams = [];
  // item ends of a that fall within a centimetre of one of b's are moved onto it (no
  // sliver of an edge in a seam: convertDraft would merge it away)
  const gb = cb.map(c => c[1] / B);
  const snap = (f) => { for (const g of [0, ...gb]) if (Math.abs(f - g) * B < 1) return g; return f; };
  const fa = [0, ...ca.map(c => snap(c[1] / A))];
  a.forEach((it, i) => {
    const f0 = fa[i], f1 = fa[i + 1], part = [];
    if (f1 - f0 < 1e-6) return;
    b.forEach((bt, j) => {
      const g0 = cb[j][0] / B, g1 = cb[j][1] / B;
      const lo = Math.max(f0, g0), hi = Math.min(f1, g1);
      if (hi - lo < 1e-6) return;
      // fractions along the b item in its sewing direction, then canonical
      let e0 = (lo - g0) / (g1 - g0), e1 = (hi - g0) / (g1 - g0);
      if (e0 < 1e-4) e0 = 0;
      if (e1 > 1 - 1e-4) e1 = 1;
      part.push(bt[2] ? [bt[0], bt[1], true, 1 - e1, 1 - e0] : [bt[0], bt[1], false, e0, e1]);
    });
    if (part.length) seams.push({ a: [it], b: part });
  });
  return seams;
}

/** Map a right-leg map onto a piece copy: mirrored copies are the left leg. */
export const sided = (f, mirror) => (mirror ? (x, y) => { const p = f(-x, y); return [-p[0], p[1], p[2]]; } : f);
