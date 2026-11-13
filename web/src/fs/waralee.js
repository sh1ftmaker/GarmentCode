// FreeSewing "Waralee" wrap pants (https://freesewing.eu/designs/waralee/, MIT, design by
// Wouter Van Wageningen): each leg is one wide piece, front and back in one with the crotch
// cut out between them. The legs are joined along the centre front and centre back seams and
// each leg is sewn into a tube below the hip; above it the front and back flaps stay open,
// wrap past each other round the hip and are tied on with straps. Measurements from the
// mannequin, options as sliders, seam table and placement for the drape: legs as trousers
// (as lower.js does for Titan), the flaps round the hip with the back flap wrapped over the
// front one.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions, partOutline, lowerSections } from './lower.js';
import { outlineSpan } from './place.js';

export const id = 'waralee';
export const name = 'Waralee wrap pants';
export const short = 'Wrap pants';
export const exportName = 'Waralee';
export const url = 'https://freesewing.eu/designs/waralee/';
export const author = 'Wouter Van Wageningen';
export const settings = { expand: true };   // the full pants (not the minimised version), straps
export const icon = 'M10 8h36l-2 12 4 30H36l-8-26-8 26H8l4-30zM10 8l14 10M46 8L32 18';
export const stretchNote = 'The flaps are draped wrapped round the hips, the back flap over the front one. The straps are cut but not draped: the overlapping waist edges are joined instead, as the tied straps hold them. The pocket pieces are cut only, and the folded waist hem is drawn unfolded.';
export const others = { lining: ['Front pocket × 2 (with the front pocket)', 'Back pocket × 2 (with the back pocket)'] };

export const design = {
  fit: {
    fitWaist: { v: true, type: 'bool', fs: 'bool', name: 'Fit the garment to the waist', help: 'Traditionally, wrap pants are not fitted to the waist, and just use the flexibility of the fabric to adjust.' },
    waistRaise: { v: 0, range: [-20, 40], type: 'float', fs: 'pct', name: 'Waist raise (%)', help: 'How much to raise the waist from the seat depth measurement. This influences the depth of the crotch cut-out.' },
    backRaise: { v: 10, range: [0, 25], type: 'float', fs: 'pct', name: 'Back raise (%)', help: 'Raises the waist in the back.' },
  },
  style: {
    legSize: { v: 75, range: [50, 90], type: 'float', fs: 'pct', name: 'Leg size (%)', help: 'How long the pants will be, as a factor of the inseam measurement.' },
    waistOverlap: { v: 50, range: [10, 50], type: 'float', fs: 'pct', name: 'Waist overlap (%)', help: 'How much the leg flaps overlap at the waist: 0 would have them meet at the side seam, 100 makes them meet at the front/back.' },
    knotPlacement: { v: 'front', range: ['front', 'back', 'traditional'], type: 'select', fs: 'list', name: 'Placement of the knot(s)', labels: { front: 'Knot in the front', back: 'Knot in the back', traditional: 'Knot in the front and back' }, help: 'Where the wrap straps are tied (changes the straps).' },
    frontPocket: { v: true, type: 'bool', fs: 'bool', name: 'Front pocket', help: 'Whether to include a (welt) front pocket.' },
    backPocket: { v: true, type: 'bool', fs: 'bool', name: 'Back pocket', help: 'Whether to include a back pocket.' },
  },
  advanced: {
    crotchFront: { v: 30, range: [10, 70], type: 'float', fs: 'pct', name: 'Crotch front (%)', help: 'The share of the seat circumference the front crotch occupies (space between the side and the front).' },
    crotchBack: { v: 45, range: [10, 70], type: 'float', fs: 'pct', name: 'Crotch back (%)', help: 'The share of the seat circumference the back crotch occupies (space between the side and the back).' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['seat', 'inseam', 'crotchDepth', 'waistToHips', 'waist', 'waistBack'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const live = (p) => p && !p.hidden && (p.paths.seam || p.paths.seamSeam);

/*
 * Pants (point names as in @freesewing/waralee): waist fWaistSide -> fWaistFrontOverlap,
 * front flap edge -> fHipFrontOverlap, outseam -> fLegFrontOverlap, hem -> bLegBackOverlap,
 * outseam -> bHipBackOverlap, back flap edge -> bWaistBackOverlap, waist -> bWaistSide, back
 * crotch -> mHip, front crotch -> fWaistSide. The drafted piece is the wearer's right leg.
 */
export function spec(o, draft) {
  const parts = draft.parts[0], pp = parts['waralee.pants'], P = pp.points;
  const sep = !!(o.separateWaistband || o.frontPocketStyle === 'waistband');
  const fWS = sep ? P.fWaistSideSeam : P.fWaistSide, bWS = sep ? P.bWaistSideSeam : P.bWaistSide;
  const fWO = sep ? P.fWaistFrontOverlapSeam : P.fWaistFrontOverlap, bWO = sep ? P.bWaistBackOverlapSeam : P.bWaistBackOverlap;
  const outF = opsBetween(pp, P.fHipFrontOverlap, P.fLegFrontOverlap), outB = opsBetween(pp, P.bLegBackOverlap, P.bHipBackOverlap);
  const cf = opsBetween(pp, P.mHip, fWS), cb = opsBetween(pp, bWS, P.mHip);
  const waist = [...opsBetween(pp, fWS, fWO), ...opsBetween(pp, bWO, bWS)];
  const seams = [];
  // the straps tie each flap's overlap onto the other flap at the waist: their waist edges are
  // joined over the overlap (front waist fWaistSide -> fWaistFront -> overlap; back waist
  // overlap -> bWaistBack -> bWaistSide)
  if (!sep) {
    const f0 = opsBetween(pp, P.fWaistSide, P.fWaistFrontOverlap), b0 = opsBetween(pp, P.bWaistBackOverlap, P.bWaistBack), b1 = opsBetween(pp, P.bWaistBack, P.bWaistSide);
    if (f0.length === 1 && b0.length === 1 && b1.length === 1) {
      const Lf = P.fWaistSide.dist(P.fWaistFrontOverlap), ov = P.fWaistFront.dist(P.fWaistFrontOverlap);
      const a = P.fWaistSide.dist(P.fWaistFront) / Lf, d = Math.min(a, ov / Lf);
      const L7 = P.bWaistBack.dist(P.bWaistSide);
      for (const s of ['right', 'left']) {
        seams.push({ a: [[s, f0[0], false, a, 1]], b: [[s, b1[0], false, 0, Math.min(1, ov / L7)]] });   // front overlap on the back
        seams.push({ a: [[s, b0[0], true]], b: [[s, f0[0], true, a - d, a]] });                          // back overlap on the front
      }
    }
  }
  for (const s of ['right', 'left']) seams.push({ a: chain(s, outF), b: chain(s, outB, true) });   // outseam, hip down
  seams.push({ a: chain('right', cf), b: chain('left', cf) }, { a: chain('right', cb), b: chain('left', cb) });
  const pieces = [
    { name: 'right', part: 'waralee.pants' },
    { name: 'left', part: 'waralee.pants', mirror: true },
  ];
  // cut only: straps, separate waistband, pocket facings (fabric)
  for (const [nm, part] of [['strap_front', 'waralee.strapFront'], ['strap_back', 'waralee.strapBack'],
    ['waistband_front', 'waralee.waistbandFront'], ['waistband_back', 'waralee.waistbandBack'],
    ['facing_front', 'waralee.facingFront'], ['facing_back', 'waralee.facingBack']]) {
    const p = parts[part];
    if (!live(p)) continue;
    if (!p.paths.seam) p.paths.seam = p.paths.seamSeam;
    pieces.push({ name: nm, part, cutOnly: true });
  }
  return { pieces, seams, labels: { lower_interface: [...waist.map(i => ['right', i]), ...waist.map(i => ['left', i])] } };
}

// ------------------------------------------------------------------ placement
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** The part of an outline loop on one side (sign) of the line x = x0 (Sutherland-Hodgman). */
function clipLoop(loop, x0, sign) {
  const P = loop.edges[0].poly, out = [];
  const inside = (p) => sign * (p[0] - x0) >= -1e-6;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (x0 - a[0]) / (b[0] - a[0]); out.push([x0, a[1] + (b[1] - a[1]) * t]); }
  }
  out.push(out[0]);
  return { edges: [{ poly: out }] };
}

/*
 * Like lower.js trouserMaps, for the two halves of one leg piece: above the crotch each half
 * runs round the hip from its centre seam (never past the far centre: a long flap stops short
 * of it), below the crotch front and back share the leg's hull, the leg's extra width folded
 * into flutes. Where the flaps overlap above the hip the back flap is lifted off the front
 * one by `layer` cm.
 */
function legMaps(sections, { waistY, front, back, hipY, ov, up, gap = 1.2, layer = 3, blend = 8 }) {
  const spans = { front: outlineSpan(front.loop), back: outlineSpan(back.loop) };
  const P = { front, back };
  const ext = (k, y) => {
    const sp = spans[k](clamp(y, spans[k].y0, spans[k].y1));
    if (!sp) return null;
    return P[k].outSign < 0 ? { out: sp[0], inn: sp[1] } : { out: sp[1], inn: sp[0] };
  };
  const width = (k, y) => { const e = ext(k, y); return e ? Math.abs(e.inn - e.out) : 0; };
  const put = (S, s, k, g) => { const [x, z, nx, nz] = S.at(s); return [S.cx + k * (x - S.cx) + g * nx, S.cz + k * (z - S.cz) + g * nz]; };
  const make = (kind) => {
    const pc = P[kind], isFront = kind === 'front', o = pc.outSign;
    return (x, y) => {
      const Y = waistY + y, S = sections(Y), e = ext(kind, y);
      const sig0 = y >= pc.cs[1] && e ? (e.inn - x) * -o : (pc.cs[0] - x) * -o;
      const arc = ((S.sCF - S.sCB) % S.L + S.L) % S.L;   // centre front round the outside to the centre back
      const wf = width('front', y), wb = width('back', y), W = wf + wb;
      // front and back meet at their side marks (each flap's overlap lies on the other one)
      const lam = Math.min(1, arc / Math.max(1, W - 2 * ov));
      const sig = Math.min(sig0 * lam, arc - 3);
      // the back flap lies over the front one where they overlap (above the hip)
      const lay = isFront ? 0 : layer * sm((sig - (arc - lam * wf) + 2) / 3) * sm((y - hipY + 1) / 3);
      const hip = put(S, isFront ? S.sCF - sig : S.sCB + sig, 1, gap + lay);
      // the leg: round the leg's hull (front from the outseam over the front of the leg to the
      // inseam, the back the rest of the way), its extra width in even flutes standing out
      const t = e ? clamp((x - e.out) / ((e.inn - e.out) || 1), 0, 1) : 0;
      const legOn = (Sk) => {
        const q = W / Sk.L;
        const sO = Sk.front - wf / (2 * q), sl = isFront ? sO + t * wf / q : sO - t * wb / q;
        let fl = 0;
        if (q > 1.02) {
          // a fixed number of flutes, in phase along the fabric (from the outseam round the front)
          const m = Math.max(4, Math.round(W / 12)), r0 = Sk.L / (2 * Math.PI);
          const A = Math.min(0.8 * r0, Math.max(Math.sqrt(2 * ((W / (2 * Math.PI)) ** 2 - r0 * r0)) / m, (W - Sk.L) / (4 * m)));
          const u = isFront ? t * wf : wf + (1 - t) * wb;
          fl = A * (1 - Math.cos(2 * Math.PI * m * u / W));
        }
        return put(Sk, sl, 1, gap + fl);
      };
      // averaged over a few cm of height (the leg's sections change abruptly at the knee)
      const leg = [0, 0];
      for (const [d, w] of [[-4, 0.1], [-2, 0.2], [0, 0.4], [2, 0.2], [4, 0.1]]) { const p = legOn(sections(Y + d)); leg[0] += w * p[0]; leg[1] += w * p[1]; }
      leg[0] = Math.min(leg[0], -1);   // never across the centre plane into the other leg
      // hip -> leg: the flaps open out of the leg tube gradually, fully wrapped only at the waist
      const a = y < pc.forkY ? 0.5 + 0.5 * sm((pc.forkY - y) / blend) : 0.5 * (1 - sm((y - pc.forkY) / up));
      return [hip[0] * (1 - a) + leg[0] * a, Y, hip[1] * (1 - a) + leg[1] * a];
    };
  };
  return { front: make('front'), back: make('back') };
}

const crotchY = (m) => m.height - m.head_l - m.waist_line - m.hips_line - m.crotch_hip_diff;
// world height of the pieces' y = 0: the fork (mHip) a little below the crotch
const zeroY = (draft, m) => crotchY(m) - 1.5 + draft.parts[0]['waralee.pants'].points.mHip.y / 10;

export function placement(draft, m, body) {
  const pp = draft.parts[0]['waralee.pants'], P = pp.points;
  const loc = (p) => [p.x / 10, -p.y / 10];
  const W = zeroY(draft, m), outline = partOutline(pp), x0 = P.mHip.x / 10;
  const sections = lowerSections(body, W + 10);
  const fy = loc(P.mHip)[1];
  const T = legMaps(sections, {
    waistY: W, hipY: fy, up: Math.max(8, 0.8 * (-P.fWaistSide.y / 10 - fy)),
    ov: (P.fWaistFront.x - P.fWaistFrontOverlap.x) / 10,
    front: { loop: clipLoop(outline, x0, -1), outSign: -1, cs: loc(P.fCutOutHip), forkY: fy },
    back: { loop: clipLoop(outline, x0, 1), outSign: 1, cs: loc(P.bCutOutHip), forkY: fy },
  });
  return (ps) => {
    const pick2 = (x, y) => (x <= x0 ? T.front(x, y) : T.back(x, y));
    if (ps.mirror) return (x, y) => { const p = pick2(-x, y); return [-p[0], p[1], p[2]]; };
    return pick2;
  };
}

export function attachLevels(draft, m) {
  const P = draft.parts[0]['waralee.pants'].points;
  return { lower_interface: zeroY(draft, m) + Math.min(-P.fWaistSide.y, -P.fWaistFrontOverlap.y) / 10 };
}
export const lift = 2;
