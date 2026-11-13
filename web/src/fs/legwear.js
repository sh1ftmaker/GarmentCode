// Placement helpers for FreeSewing legwear whose pieces are not drafted upright on a
// natural-waist origin like Titan's (Shin, Shale, Crux, Lumira, Lumina): every piece gets
// a rigid transform into Titan's frame (y up, 0 at the natural waist, the wearer's right
// leg, front centre seam at +x, back centre seam at -x), after which trouserMaps2() (a
// variant of lower.js's trouserMaps()) lays it around the body section of its leg.
//
// Conventions as lower.js: world cm, y up, the body faces +z, the wearer's left is +x.
import { lowerSections, partOutline } from './lower.js';
import { outlineSpan } from './place.js';
import { pathEdges } from './convert.js';

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** FreeSewing point -> local cm (y up). */
export const loc = (p) => [p.x / 10, -p.y / 10];

/**
 * Rigid transform of local cm points: optional reflection in x (sx = -1), then a rotation
 * by `deg` (counter-clockwise) about `o`, then a shift by `t`.
 */
export function rigid({ sx = 1, deg = 0, o = [0, 0], t = [0, 0] } = {}) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return ([x, y]) => {
    const X = sx * x - o[0], Y = y - o[1];
    return [c * X - s * Y + o[0] + t[0], s * X + c * Y + o[1] + t[1]];
  };
}
const mapLoop = (loop, T) => ({ edges: loop.edges.map(e => ({ ...e, poly: e.poly.map(T) })) });

/** A one-edge outline loop (as partOutline) clipped to the half plane sign * x >= 0. */
export function clipLoop(loop, sign) {
  const P = loop.edges[0].poly.slice(0, -1), out = [];
  const inside = (p) => sign * p[0] >= 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = a[0] / (a[0] - b[0]); out.push([0, a[1] + (b[1] - a[1]) * t]); }
  }
  out.push(out[0]);
  return { edges: [{ poly: out }] };
}

/** Polyline (local cm) of a part's seam ops, in drawing order, optionally transformed. */
export function opsPoly(part, ids, T = (p) => p) {
  const E = pathEdges(part.paths.seam), out = [];
  for (const i of ids) if (E[i]) out.push(...E[i].map(T));
  return out;
}
/** x of a polyline at height y (the crossing nearest `near`); held at its ends above / below. */
export function xAtY(poly) {
  let top = poly[0], bot = poly[0];
  for (const p of poly) { if (p[1] > top[1]) top = p; if (p[1] < bot[1]) bot = p; }
  return (y, near = null) => {
    if (y >= top[1]) return top[0];
    if (y <= bot[1]) return bot[0];
    let best = null;
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i];
      if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
      const x = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
      if (best === null || (near !== null && Math.abs(x - near) < Math.abs(best - near))) best = x;
    }
    return best ?? top[0];
  };
}

/**
 * lower.js's trouserMaps() with the centre seam given as a polyline: above the point
 * where it starts to curve (cs) a piece runs round the hip section from the centre seam
 * itself rather than from its outline's extent, so waists that slope down towards the
 * centre (and crotch extensions) are measured from the right edge. front / back:
 * { loop, outSign, cs, forkY, centre: [[x, y]...], extra?: (y) => cm of cloth (a side
 * panel) carrying on beyond the piece's outer edge to the outseam } in the Titan frame.
 * wrap: above the crotch, front and back together are spread evenly over the outside of the
 * section from the centre front to the centre back (scaled up when they are wider), so
 * that their outer edges meet there: for a leg cut in one piece (Lumira's), which has no
 * outseam to close a gap. wrapTop: the local height (default: 1 cm below the lower of the two
 * pieces' tops) above which the widths are taken as there, e.g. the lower side seam top.
 */
export function trouserMaps2(sections, { waistY, front, back, gap = 1.2, blend = 5, wrap = false, wrapTop = null, crotch = null }) {
  const spans = { front: outlineSpan(front.loop), back: outlineSpan(back.loop) };
  const P = { front, back };
  const cen = { front: xAtY(front.centre), back: xAtY(back.centre) };
  const ext = (k, y) => {
    const sp = spans[k](clamp(y, spans[k].y0, spans[k].y1));
    if (!sp) return null;
    const x = P[k].extra ? P[k].extra(y) : 0;   // cloth beyond the outer edge (a side panel)
    return P[k].outSign < 0 ? { out: sp[0] - x, inn: sp[1] } : { out: sp[1] + x, inn: sp[0] };
  };
  const width = (k, y) => { const e = ext(k, y); return e ? Math.abs(e.inn - e.out) : 0; };
  const put = (S, s, k, g) => {
    const [x, z, nx, nz] = S.at(s);
    return [S.cx + k * (x - S.cx) + g * nx, S.cz + k * (z - S.cz) + g * nz];
  };
  const make = (kind) => {
    const pc = P[kind], isFront = kind === 'front', o = pc.outSign;
    return (x, y) => {
      const Y = waistY + y, S = sections(Y);
      const e = ext(kind, y);
      let sig = (y >= pc.cs[1] ? cen[kind](y, pc.cs[0]) - x : pc.cs[0] - x) * -o, kh = 1;
      if (wrap) {
        // widths measured between the crotch curves' start and the lower of the side seams' tops
        const yc = Math.min(Math.max(y, Math.max(front.cs[1], back.cs[1])), wrapTop ?? Math.min(spans.front.y1, spans.back.y1) - 1);
        const half = (k) => { const ek = ext(k, yc); return ek ? Math.abs(cen[k](yc, P[k].cs[0]) - ek.out) : 0; };
        const Wh = half('front') + half('back'), arc = S.sCF + S.L - S.sCB;
        if (Wh > 0) { sig *= arc / Wh; kh = Math.max(1, Wh / arc); }
      }
      if (crotch && sig < 0) {   // crotch extensions either side of a gusset: share the centre plane
        const A = S.sCB - S.sCF, T = crotch.front + crotch.gusset + crotch.back;
        if (T > A) sig *= A / T;
      }
      const hip = put(S, isFront ? S.sCF - sig : S.sCB + sig, kh, gap);
      const wf = width('front', y), wb = width('back', y), W = wf + wb;
      const k = Math.max(1, W / S.L);
      const t = e ? clamp((x - e.out) / ((e.inn - e.out) || 1), 0, 1) : 0;
      const sO = S.front - wf / (2 * k);
      const leg = put(S, isFront ? sO + t * wf / k : sO - t * wb / k, k, gap);
      const a = sm((pc.forkY + blend - y) / (2 * blend));
      // never past the centre plane: on the section's centre line the outward offset points
      // across it, which would cross the right and left pieces over each other at the seam
      return [Math.min(-0.4, hip[0] * (1 - a) + leg[0] * a), Y, hip[1] * (1 - a) + leg[1] * a];
    };
  };
  return { front: make('front'), back: make('back') };
}

/**
 * Trouser placement for a front and a back of any drafting orientation.
 *  front / back: { part, T (original local cm -> Titan frame of the wearer's right leg),
 *    cs: [x, y] in the Titan frame where the centre seam starts to curve to the fork,
 *    forkY: the fork's height in the Titan frame, centre: the centre seam polyline in the
 *    Titan frame, outline?: loop to use instead of the part's, extra?: see trouserMaps2 }
 * Pieces are named front_r / front_l / back_r / back_l (or anything starting with front /
 * back and ending in _r / _l); others(ps) may place the rest.
 */
export function legPairPlacement(body, waistY, { front, back, gap, blend, wrap, wrapTop, crotch, sectionsTop = 8 }) {
  const sections = lowerSections(body, waistY + sectionsTop);
  const T = trouserMaps2(sections, {
    waistY, gap, blend, wrap, wrapTop, crotch,
    front: { loop: mapLoop(front.outline || partOutline(front.part), front.T), outSign: -1, cs: front.cs, forkY: front.forkY, centre: front.centre, extra: front.extra },
    back: { loop: mapLoop(back.outline || partOutline(back.part), back.T), outSign: 1, cs: back.cs, forkY: back.forkY, centre: back.centre, extra: back.extra },
  });
  const P = { front, back };
  const fn = (ps, kind = ps.name.startsWith('front') ? 'front' : 'back', side = /_l$/.test(ps.name) ? 'l' : 'r') => {
    const f = T[kind], tr = P[kind].T;
    // local coords as convert.js hands them over (mirrored copies: x negated) -> original
    const sx = ps.mirror ? -1 : 1;
    return (x, y) => {
      const p = f(...tr([sx * x, y]));
      return side === 'l' ? [-p[0], p[1], p[2]] : p;
    };
  };
  fn.sections = sections;
  fn.maps = T;
  return fn;
}
