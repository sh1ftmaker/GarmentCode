// FreeSewing "Onyx" one-piece (https://freesewing.eu/designs/onyx/, MIT, design by Thrunic):
// a raglan-sleeved one-piece for stretch fabric (onesie, swimsuit, sleepsuit) with a front
// zipper, a folded neckband and a crotch gusset. Measurements from the mannequin, options as
// sliders, seam table and placement around the torso, arms and legs for the drape.
//
// Onyx drafts its own raglan block, as Shelly does: the pattern's origin is the "raglan
// centre" at the height of the high point of the shoulder. The front (two halves, zipper at
// the centre front) and the back (cut on the fold) run from the neck down to the leg hems;
// each leg is closed on the inside by the crotch gusset, a strip that runs from one leg hem
// up the inside of that leg, under the crotch (between front and back) and down the other.
// Placement: the torso as Shelly's (place.js torsoMap), the legs as tubes around the
// mannequin's legs (front, gusset and back side by side), blended over the crotch.
import { upperFrame, torsoMap, outlineSpan, sleeveMap, bandRingMap } from './place.js';
import { pieceLoop } from './convert.js';
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, lowerSections, fsOptions } from './lower.js';

export const id = 'onyx';
export const name = 'Onyx one-piece';
export const short = 'One-piece';
export const exportName = 'Onyx';
export const url = 'https://freesewing.eu/designs/onyx/';
export const author = 'Thrunic';
export const settings = { expand: true };   // the neckband, zipper guard and crotch gusset are rectangles
export const icon = 'M22 5c2 3 10 3 12 0l7 3 12 13-6 6-6-6v18l3 20H34l-3-14h-6l-3 14H12l3-20V21l-6 6-6-6L15 8z';
export const stretchNote = 'Onyx is meant for stretch fabric, and its neckband is cut shorter than the neckline and stretched to fit. The 3D drape uses a relaxed copy (an unstretched neckband) with the zipper closed; the pattern view, cutting layout and exports use the real pattern. The zipper guard is cut but not simulated. The simulated cloth barely stretches, so the ease sliders stop at -10% (FreeSewing allows down to -40% for stretch fabric) and the center seam ease at 20%.';

const pct = (v, range, name, help) => ({ v, range, type: 'float', fs: 'pct', name, help });
export const design = {
  fit: {
    chestEase: pct(0, [-10, 50], 'Chest ease (%)', 'Controls how wide the garment will be around the chest.'),
    waistEase: pct(0, [-10, 50], 'Waist ease (%)', 'Controls how wide the garment will be around the waist.'),
    seatEase: pct(0, [-10, 50], 'Seat ease (%)', 'Controls how wide the seat is.'),
    upperLegEase: pct(0, [-10, 50], 'Upper leg ease (%)', 'Controls how wide the garment will be around the upper legs.'),
    legHemEase: pct(0, [-10, 100], 'Leg hem ease (%)', 'Controls how wide the bottom of the legs will be.'),
    centerSeamEase: pct(0, [-10, 20], 'Center seam ease (%)', 'Controls how long the center seam will be, and thus how low the crotch fork of the garment sits.'),
    crotchGussetWidth: pct(100, [75, 133], 'Crotch gusset width (%)', 'Controls how wide the crotch gusset will be.'),
    neckEase: pct(50, [-30, 150], 'Neck ease (%)', 'Controls how large the neck hole is.'),
    sleeveEase: pct(0, [-10, 50], 'Sleeve ease (%)', 'Affects how wide the sleeve is at the armhole.'),
  },
  style: {
    legLength: pct(20, [0, 120], 'Leg length (%)', 'Controls how long the legs of the garment will be (100% reaches the floor).'),
    sleeveLength: pct(20, [0, 125], 'Sleeve length (%)', 'Controls how long the sleeves of the garment will be (100% reaches the wrist).'),
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) o.neckbandLength = 1;
  return o;
}
const MEASUREMENTS = ['biceps', 'neck', 'chest', 'waist', 'hips', 'seat', 'waistToHips', 'hpsToWaistBack', 'hpsToWaistFront',
  'waistToSeat', 'crossSeam', 'waistToArmpit', 'inseam', 'upperLeg', 'waistToUpperLeg', 'ankle', 'wrist', 'shoulderToWrist', 'head', 'highBust'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/** Edge numbers of Onyx's front / back seam by named points (their count changes with the options). */
function torsoEdges(part) {
  const P = part.points;
  return {
    side: opsBetween(part, P.outseamHem, P.armpitCornerScooped),   // hem -> armpit
    raglan: opsBetween(part, P.armpitCornerScooped, P.neckShoulderCorner),
    neck: opsBetween(part, P.neckShoulderCorner, P.cfNeck),
    centre: opsBetween(part, P.cfNeck, P.cfCrotch),
    crotch: opsBetween(part, P.cfCrotch, P.inseamHem),               // crotch curve + inseam, down to the hem
  };
}
function sleeveEdges(part) {
  const P = part.points;
  return {
    backUnder: opsBetween(part, P.backSleeve, P.backArmholeScooped),
    backRaglan: opsBetween(part, P.backArmholeScooped, P.backNeck),
    neck: opsBetween(part, P.backNeck, P.frontNeck),
    frontRaglan: opsBetween(part, P.frontNeck, P.frontArmholeScooped),
    frontUnder: opsBetween(part, P.frontArmholeScooped, P.frontSleeve),
  };
}

/*
 * Seams (edges found by FreeSewing's point names, see torsoEdges):
 *  front_l / front_r (the left half as drafted, the right one mirrored): side seam to the
 *    back, raglan to the sleeve, neckline to the neckband, centre front (the zipper, closed)
 *    to each other, crotch curve + inseam to the gusset's front edge.
 *  back (cut on the fold; its drafted half is the wearer's right, the mirrored 'm' half the
 *    left): the same, its crotch + inseams to the gusset's back edge.
 *  raglanSleeve (local -x = front): back underarm / raglan, neck, front raglan / underarm.
 *  neckband (cut on the fold at the centre back, 3; folded lengthwise, the drape uses one
 *    layer): 2 / m2 the long edge sewn on, from the centre front to the centre back.
 *  crotchGusset (cut on the fold, 3 = the middle, under the crotch): 2 / m2 the front edge
 *    (leg hem -> middle), 0 / m0 the back edge (middle -> leg hem); local +x = the left leg.
 */
export function spec(o, draft) {
  const parts = draft.parts[0];
  const fe = torsoEdges(parts['onyx.front']), be = torsoEdges(parts['onyx.back']), se = sleeveEdges(parts['onyx.raglanSleeve']);
  const m = (ids) => ids.map(i => 'm' + i);
  const seams = [];
  for (const s of [1, -1]) {
    const fr = s > 0 ? 'front_l' : 'front_r', sl = s > 0 ? 'sleeve_l' : 'sleeve_r';
    const bk = (k) => (s > 0 ? m(be[k]) : be[k]);   // the back's half on this side
    const g = (k) => (s > 0 ? String(k) : 'm' + k);
    seams.push(
      { a: chain(fr, fe.side), b: chain('back', bk('side')) },                                  // side seam, hem up
      { a: chain(fr, fe.raglan), b: chain(sl, se.frontRaglan, true) },                          // front raglan, armpit -> neck
      { a: chain('back', bk('raglan')), b: chain(sl, se.backRaglan) },                          // back raglan, armpit -> neck
      { a: chain(sl, se.backUnder), b: chain(sl, se.frontUnder, true) },                        // sleeve underarm, hem up
      // neckline, centre front -> centre back, to the neckband (end -> centre back)
      { a: [...chain(fr, fe.neck, true), ...chain(sl, se.neck, true), ...chain('back', bk('neck'))], b: [['neckband', g(2)]] },
      // crotch + inseam (crotch -> hem) to the gusset's front and back edges (middle -> hem)
      { a: chain(fr, fe.crotch), b: [['gusset', g(2), true]] },
      { a: chain('back', bk('crotch')), b: [['gusset', g(0)]] },
    );
  }
  seams.push({ a: chain('front_l', fe.centre), b: chain('front_r', fe.centre) });   // centre front (zipper)
  return {
    pieces: [
      { name: 'front_l', part: 'onyx.front', label: 'body' },
      { name: 'front_r', part: 'onyx.front', mirror: true, label: 'body' },
      { name: 'back', part: 'onyx.back', fold: be.centre[0], label: 'body' },
      { name: 'sleeve_l', part: 'onyx.raglanSleeve', label: 'arm', follow: 14 },
      { name: 'sleeve_r', part: 'onyx.raglanSleeve', mirror: true, label: 'arm', follow: 14 },
      { name: 'neckband', part: 'onyx.neckband', fold: 3, doubled: 'y', label: 'body', follow: 50 },
      { name: 'gusset', part: 'onyx.crotchGusset', fold: 3, label: 'body', follow: 30 },
      { name: 'zipper_guard', part: 'onyx.zipperGuard', fold: 3, cutOnly: true },
    ],
    seams,
    labels: {},
  };
}

const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const P2 = (pt) => [pt.x / 10, -pt.y / 10];

/** A polyline (local cm) through a part's seam ops, with arc-length lookup. */
function edgePoly(part, ids) {
  const pts = [];
  let cur = null, k = -1, first = null;
  for (const op of part.paths.seam.ops) {
    if (op.type === 'move') { cur = first = op.to; continue; }
    k++;
    const to = op.type === 'close' ? first : op.to;
    if (ids.includes(k)) {
      const n = op.type === 'curve' ? 24 : 1;
      for (let i = pts.length ? 1 : 0; i <= n; i++) {
        const t = i / n, s = 1 - t;
        if (op.type === 'curve') pts.push([(s ** 3 * cur.x + 3 * s * s * t * op.cp1.x + 3 * s * t * t * op.cp2.x + t ** 3 * to.x) / 10,
          -(s ** 3 * cur.y + 3 * s * s * t * op.cp1.y + 3 * s * t * t * op.cp2.y + t ** 3 * to.y) / 10]);
        else pts.push(i ? P2(to) : P2(cur));
      }
    }
    cur = to;
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const at = (s) => {
    s = clamp(s, 0, L);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const f = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
  };
  return { L, at };
}

/**
 * Torso maps for a raglan front and back (pattern origin at shoulder height, as Shelly's):
 * the shoulder line runs out from where the neck circle crosses the origin's height.
 */
function raglanTorso(F, front, back, sf, sb, slopeDeg, gap = 1.5) {
  const half = (s, y) => { const r = s(y); return r ? Math.max(Math.abs(r[0]), Math.abs(r[1])) : 0; };
  const girth = (y) => half(sf, y) + half(sb, y);
  const armholeY = Math.min(P2(front.points.armpitCornerScooped)[1], P2(back.points.armpitCornerScooped)[1]);
  const slope = Math.tan(slopeDeg * Math.PI / 180);
  const c = P2(front.points.neckCenter), r = c[1] - P2(front.points.cfNeck)[1];
  const hx = Math.sqrt(Math.max(1, r * r - c[1] * c[1]));
  const line = (part) => ({ hps: [hx, 0], slope, shoulderX: hx, armholeX: P2(part.points.armpitCornerScooped)[0] });
  return {
    front: torsoMap(F, { side: 1, xSign: 1, ...line(front), girth, armholeY, gap }),
    back: torsoMap(F, { side: -1, xSign: -1, ...line(back), girth, armholeY, gap }),
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const front = parts['onyx.front'], back = parts['onyx.back'], sleeve = parts['onyx.raglanSleeve'];
  const F = upperFrame(body, m);
  const fe = torsoEdges(front);
  // half pieces (the back unfolded): at each height below the crotch [inseam, outseam]
  const sf = outlineSpan(pieceLoop(front)), sb = outlineSpan(pieceLoop(back));
  const T = raglanTorso(F, front, back, sf, sb, fsMeasurements(m, body).shoulderSlope);
  const gap = 1.5;
  // the pattern's vertical in the world, as torsoMap places the torso below the shoulders
  const yw = P2(front.points.waist)[1];
  const dY = T.front(0.5 * P2(front.points.waist)[0], yw)[1] - yw;
  const yC = P2(front.points.cfCrotch)[1];          // pattern height of the crotch (front and back alike)
  const G = parts['onyx.crotchGusset'].points.bottomLeftCorner.y / 10;   // gusset width (front -> back)
  const sections = lowerSections(body, dY + yC + 30);
  const put = (S, s, k) => {
    const [x, z, nx, nz] = S.at(s);
    return [S.cx + k * (x - S.cx) + gap * nx, S.cz + k * (z - S.cz) + gap * nz];
  };
  const widths = (y) => {
    const a = sf(clamp(y, sf.y0, sf.y1)), b = sb(clamp(y, sb.y0, sb.y1));
    return { f: a || [0, 1], b: b || [0, 1] };
  };
  // A leg as a tube: front (outseam -> inseam over the front of the leg), gusset (inside of the
  // leg, front -> back), back (inseam -> outseam). kind: 'f' | 'b' | 'g'; t: 0..1 across it.
  // Returns the point for the wearer's right leg (x < 0).
  const legAt = (kind, t, y) => {
    const Y = dY + Math.min(y, yC), S = sections(Y), w = widths(y);
    const wf = Math.abs(w.f[1] - w.f[0]), wb = Math.abs(w.b[1] - w.b[0]);
    // garment arc a -> loop arc: the three pieces close the ring (scaled up when wider than the leg)
    const W = wf + wb + G, k = Math.max(1, W / S.L), c = S.L / W;
    const a = kind === 'f' ? t * wf : kind === 'g' ? wf + t * G : wf + G + (1 - t) * wb;
    const [X, Z] = put(S, S.front + (a - wf / 2) * c, k);
    return [X, dY + y, Z];
  };
  // blend from the torso (above the crotch) to the legs (below it)
  const bl = (y) => sm((yC + 3 - y) / 9);
  const piece = (tor, kind, sideOf) => (x, y) => {
    const a = bl(y), sx = sideOf(x);
    const p = tor(x, y);
    if (a <= 0) return p;
    const w = widths(y)[kind], ax = Math.abs(x);
    const t = clamp((w[1] - ax) / ((w[1] - w[0]) || 1), 0, 1);   // 0 at the outseam, 1 at the inseam
    const q = legAt(kind, t, y);
    q[0] *= -sx;   // legAt is the right leg (x < 0); sx = +1: the wearer's left
    return [p[0] * (1 - a) + q[0] * a, p[1] * (1 - a) + q[1] * a, p[2] * (1 - a) + q[2] * a];
  };
  const frontMap = piece(T.front, 'f', (x) => (x >= 0 ? 1 : -1));
  const backMap = piece(T.back, 'b', (x) => (x >= 0 ? -1 : 1));
  // the gusset: between the front's and the back's crotch + inseam edges (as long as the
  // gusset's half), sagging below the crotch in the middle; down the legs on the inside
  const ef = edgePoly(front, fe.crotch), eb = edgePoly(back, torsoEdges(back).crotch);
  const gussetMap = (x, y) => {
    const sx = x >= 0 ? 1 : -1, u = Math.abs(x), t = clamp(-y / G, 0, 1);
    const pf = ef.at(u * ef.L / (ef.L || 1)), pb = eb.at(u * eb.L / (eb.L || 1));
    const A = frontMap(sx * pf[0], pf[1]), B = backMap(-sx * pb[0], pb[1]);
    const ym = 0.5 * (pf[1] + pb[1]);
    const a = bl(ym);
    const lerp = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - 0.4 * G * Math.sin(Math.PI * t) * (1 - a), A[2] + (B[2] - A[2]) * t];
    if (a <= 0) return lerp;
    const q = legAt('g', t, ym);
    q[0] *= -sx;
    return [lerp[0] * (1 - a) + q[0] * a, lerp[1] * (1 - a) + q[1] * a, lerp[2] * (1 - a) + q[2] * a];
  };
  // sleeves: tubes around the arms from the armpit down (then snapped onto the raglan seams)
  const bicepsY = -Math.max(sleeve.points.frontArmhole.y, sleeve.points.backArmhole.y) / 10;
  const sleeves = {};
  for (const mirror of [false, true]) {
    const loop = pieceLoop(sleeve, { mirror });
    sleeves[mirror] = sleeveMap(F, { sx: mirror ? -1 : 1, span: outlineSpan(loop), bicepsY, frontSign: mirror ? 1 : -1, atCrease: true });
  }
  // the neckband: a ring around the neck at the neckline's height, from the centre back
  const nf = T.front(0, P2(front.points.cfNeck)[1]), nb = T.back(0, P2(back.points.cfNeck)[1]);
  const len = 2 * parts['onyx.neckband'].points.topRightCorner.x / 10;
  const ring = bandRingMap(F, { Y: 0.5 * (nf[1] + nb[1]), len, phi0: Math.PI, dir: -1, gap: 1.5 });
  return (ps) => {
    if (ps.name.startsWith('front')) return frontMap;
    if (ps.name === 'back') return backMap;
    if (ps.name === 'gusset') return gussetMap;
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror];
    if (ps.name === 'neckband') return (x, y) => ring(x, y);
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
