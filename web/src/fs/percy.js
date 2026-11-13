// FreeSewing "Percy" puffy pants (https://freesewing.eu/designs/percy/, MIT, design by Gawain
// (Candle)), built on the Titan block: the front and back are slashed and spread so they are
// gathered into a shaped (curved) waistband in three parts and into cuffs; side pieces show
// through the front pockets' openings, and the front can have a pleat. Legs, side pieces,
// waistband and cuffs drape (legbands.js); the pocket facings are cut but not simulated.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, lowerSections, fsOptions, partOutline, waistBandMap } from './lower.js';
import { pathEdges } from './convert.js';
import { hemRing, ringBand, fullTrouserMaps, sided, gatherSeams } from './legbands.js';

export const id = 'percy';
export const name = 'Percy puffy pants';
export const short = 'Puffy pants';
export const exportName = 'Percy';
export const url = 'https://freesewing.eu/designs/percy/';
export const author = 'Gawain (Candle)';
export const settings = { expand: true };   // draft the cuffs too
export const icon = 'M17 5h22l2 9c6 8 9 20 8 32l-4 4h-9l-2-4-6-16-6 16-2 4h-9l-4-4c-1-12 2-24 8-32z';
export const stretchNote = 'The legs are gathered into the waistband and the cuffs as drafted; the front pleat is gathered in with the rest of the waist. The side pieces hang inside the front where the pocket bags are; the pocket facings and the inner layers of the waistband are cut but not simulated, and the waistband is drawn closed.';
// cut from other materials than the main fabric (FreeSewing's cut list)
export const others = { interfacing: ['Front waistband × 1', 'Side waistband × 2', 'Back waistband × 1'] };

export const design = {
  fit: {
    waistEase: { v: 2, range: [0, 10], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Controls the amount of ease at your waist.' },
    seatEase: { v: 7, range: [2, 12], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'Controls the amount of ease at your seat.' },
  },
  style: {
    waistHeight: { v: 75, range: [0, 100], type: 'float', fs: 'pct', name: 'Waist height (%)', help: 'Controls the height of the waist: 100% = waist height, 0% = hip height.' },
    lengthInseam: { v: 25, range: [5, 100], type: 'float', fs: 'pct', name: 'Length at inseam (%)', help: 'How long the inseam of the shorts should be. 100% = floor length, 40-50% = knee length.' },
    cuffWidth: { v: 5, range: [1, 15], type: 'float', fs: 'pct', name: 'Cuff width (%)', help: 'How wide to make the leg cuffs.' },
    waistbandWidth: { v: 10, range: [4, 20], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'The width of the waistband.' },
    frontPanelPercentage: { v: 50, range: [33, 75], type: 'float', fs: 'pct', name: 'Front panel width (%)', help: 'What proportion of the front of the pants should be taken up by the front panel.' },
    frontPleat: { v: true, type: 'bool', fs: 'bool', name: 'Front pleat', help: 'Whether to generate a pleat on the front panel.' },
    hemRatio: { v: 250, range: [100, 400], type: 'float', fs: 'pct', name: 'Hem ratio (%)', help: 'How far the bottom hem should be flared, relative to the same height on a basic Titan.' },
    spread: { v: true, type: 'bool', fs: 'bool', name: 'Spread', help: 'Whether to slash and spread the body panels.' },
  },
  advanced: {
    crotchDrop: { v: 2, range: [0, 15], type: 'float', fs: 'pct', name: 'Crotch drop (%)', help: 'Lowers the crotch for a more relaxed fit.' },
    legBalance: { v: 57.5, range: [52.5, 62.5], type: 'float', fs: 'pct', name: 'Leg balance (%)', help: 'Controls the ratio between the front and back panel of the leg.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['crossSeam', 'crossSeamFront', 'knee', 'seat', 'seatBack', 'waist', 'waistBack', 'waistToFloor',
  'waistToKnee', 'waistToHips', 'waistToSeat', 'waistToUpperLeg', 'inseam'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges by point name (@freesewing/percy):
 *  front: waist styleWaistIn -> pocketFacingEdge (the rest of it, to pocketInnerEdge, lies
 *    over the side piece), pocket opening -> pocketBottomEdge, outseam -> seatOut ->
 *    outseamShiftUpwards, hem (spread: many short lines) -> inseamShiftUpwards, inseam ->
 *    fork, crotch seam -> crotchSeamCurveStart -> styleWaistIn
 *  back: inseam fork -> inseamShiftUpwards, hem -> outseamShiftUpwards, outseam ->
 *    styleWaistOut (the front's below the pocket, the side piece's above), waist ->
 *    styleWaistIn, cross seam -> fork
 *  side piece ('pocket'): waist pocketFacingEdge -> styleWaistOut, outseam -> seatOut, then
 *    the pocket bag (inside, under the front)
 *  waistband pieces (curved, symmetric): 0 bottomCenter -> bottomRight, 1 bottomRight ->
 *    topRight, 2 top, 3 topLeft -> bottomLeft, 4 bottomLeft -> bottomCenter
 *  cuff: 3 topRight -> topLeft (sewn on, folded lengthwise), 0 and 2 the ends
 */
export function edges(draft) {
  const parts = draft.parts[0], fp = parts['percy.front'], bp = parts['percy.back'], sp = parts['percy.pocket'];
  const F = fp.points, B = bp.points, S = sp.points;
  return {
    fWaist: opsUntil(fp, F.styleWaistIn, F.pocketInnerEdge, F.pocketFacingEdge), fOut: opsBetween(fp, F.pocketBottomEdge, F.outseamShiftUpwards),
    fHem: opsBetween(fp, F.outseamShiftUpwards, F.inseamShiftUpwards), fIn: opsBetween(fp, F.inseamShiftUpwards, F.fork),
    fCrotch: opsBetween(fp, F.fork, F.styleWaistIn),
    bIn: opsBetween(bp, B.fork, B.inseamShiftUpwards), bHem: opsBetween(bp, B.inseamShiftUpwards, B.outseamShiftUpwards),
    bOut: opsBetween(bp, B.outseamShiftUpwards, B.styleWaistOut),
    bWaist: opsBetween(bp, B.styleWaistOut, B.styleWaistIn), bCross: opsBetween(bp, B.styleWaistIn, B.fork),
    sWaist: opsBetween(sp, S.pocketFacingEdge, S.styleWaistOut), sOut: opsUntil(sp, S.styleWaistOut, S.pocketSideSeamIntercept, F.pocketBottomEdge),
  };
}

/**
 * The edges of a part from point `from` to point `to`, cut off where the outline comes
 * nearest point `near` (a point drafted in the same frame that need not be on the outline):
 * [[op, upTo]...], the last op only partly (upTo < 1).
 */
function opsUntil(part, from, to, near) {
  const ids = opsBetween(part, from, to);
  const E = pathEdges(part.paths.seam), q = [near.x / 10, -near.y / 10];
  let best = [Infinity, 0, 0];
  ids.forEach((op, k) => {
    const e = E[op], cum = [0];
    for (let i = 1; i < e.length; i++) cum.push(cum[i - 1] + Math.hypot(e[i][0] - e[i - 1][0], e[i][1] - e[i - 1][1]));
    e.forEach((p, i) => { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < best[0]) best = [d, k, cum[i] / cum[cum.length - 1]]; });
  });
  const [, k, t] = best;
  const out = ids.slice(0, k).map(op => [op, 1]);
  if (t > 0.02) out.push([ids[k], t]);
  return out;
}
const part = (piece, items, rev = false) => {
  const r = items.map(([op, t]) => [piece, op, rev, 0, t]);
  return rev ? r.reverse() : r;
};

// the waist all round (CF -> wearer's right -> CB -> left -> CF) and the waistband along it
const waistChain = (E) => [
  ...part('front_r', E.fWaist), ...chain('side_r', E.sWaist), ...chain('back_r', E.bWaist),
  ...chain('back_l', E.bWaist, true), ...chain('side_l', E.sWaist, true), ...part('front_l', E.fWaist, true),
];
const BAND = [
  ['waist_front_r', 0, true], ['waist_front_r', 4, true], ['waist_side_r', 0, true], ['waist_side_r', 4, true],
  ['waist_back', 0, true], ['waist_back', 4, true],
  ['waist_side_l', 4], ['waist_side_l', 0], ['waist_front_l', 4], ['waist_front_l', 0],
];
const BAND_PIECES = { waist_front_r: 'percy.waist_front', waist_front_l: 'percy.waist_front', waist_side_r: 'percy.waist_side', waist_side_l: 'percy.waist_side', waist_back: 'percy.waist_back' };

const PART = { front: 'percy.front', back: 'percy.back', side: 'percy.pocket', cuff: 'percy.cuff', ...BAND_PIECES };
const lenOf = (draft) => (piece, op) => pathEdgeLen(draft.parts[0][PART[piece] || PART[piece.replace(/_[rl]$/, '')]], op);

export function spec(o, draft) {
  const E = edges(draft), len = lenOf(draft);
  const seams = [];
  for (const s of ['_r', '_l']) {
    const f = 'front' + s, b = 'back' + s, sd = 'side' + s, c = 'cuff' + s;
    seams.push(
      // outseam, waist down: the side piece above the pocket opening, the front below it
      { a: [...part(sd, E.sOut), ...chain(f, E.fOut)], b: chain(b, E.bOut, true) },
      { a: chain(f, E.fIn), b: chain(b, E.bIn, true) },          // inseam
      // cuff, gathered on from the inseam round the back and the front
      ...gatherSeams([...chain(b, E.bHem), ...chain(f, E.fHem)], [[c, 3]], len),
      { a: [[c, 0]], b: [[c, 2, true]] },
    );
  }
  seams.push(
    { a: chain('front_r', E.fCrotch), b: chain('front_l', E.fCrotch) },
    { a: chain('back_r', E.bCross), b: chain('back_l', E.bCross) },
    ...gatherSeams(waistChain(E), BAND, len),                         // gathered into the waistband
    { a: [['waist_front_r', 1]], b: [['waist_front_l', 1]] },          // waistband closed at the centre front
    { a: [['waist_front_r', 3]], b: [['waist_side_r', 1, true]] },
    { a: [['waist_side_r', 3]], b: [['waist_back', 1, true]] },
    { a: [['waist_back', 3]], b: [['waist_side_l', 3]] },
    { a: [['waist_side_l', 1]], b: [['waist_front_l', 3, true]] },
  );
  return {
    // FreeSewing: legs cut 2 (a left and a right); the unmirrored parts are the wearer's right
    pieces: [
      { name: 'front_r', part: 'percy.front' },
      { name: 'front_l', part: 'percy.front', mirror: true },
      { name: 'back_r', part: 'percy.back' },
      { name: 'back_l', part: 'percy.back', mirror: true },
      { name: 'side_r', part: 'percy.pocket' },
      { name: 'side_l', part: 'percy.pocket', mirror: true },
      { name: 'waist_front_r', part: 'percy.waist_front', label: 'body', follow: 8 },
      { name: 'waist_front_l', part: 'percy.waist_front', mirror: true, label: 'body', follow: 8 },
      { name: 'waist_side_r', part: 'percy.waist_side', label: 'body', follow: 8 },
      { name: 'waist_side_l', part: 'percy.waist_side', mirror: true, label: 'body', follow: 8 },
      { name: 'waist_back', part: 'percy.waist_back', label: 'body', follow: 8 },
      { name: 'cuff_r', part: 'percy.cuff', doubled: 'y', follow: 8 },
      { name: 'cuff_l', part: 'percy.cuff', doubled: 'y', follow: 8 },
      // the waistband's inner layers and the pocket facings: cut, not draped
      { name: 'waist_side_r2', part: 'percy.waist_side', cutOnly: true },
      { name: 'waist_side_l2', part: 'percy.waist_side', mirror: true, cutOnly: true },
      { name: 'waist_back2', part: 'percy.waist_back', cutOnly: true },
      { name: 'facing_r', part: 'percy.pocket_facing', cutOnly: true },
      { name: 'facing_l', part: 'percy.pocket_facing', mirror: true, cutOnly: true },
    ],
    seams,
    // the waistband's top edge sits at the waist
    labels: { lower_interface: Object.keys(BAND_PIECES).map(p => [p, 2]) },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // the front's y = 0 (Titan's)
const bandWidth = (draft) => { const P = draft.parts[0]['percy.waist_front'].points; return (P.topCenter.y - P.bottomCenter.y) / -10; };
function garmentTop(draft, m) {
  const F = draft.parts[0]['percy.front'].points;
  return waistY(m) + Math.min(-F.styleWaistIn.y, -F.styleWaistOut.y) / 10;
}

/**
 * The slashed and spread front / back are fans hinged along the waist, the hem spread out
 * round a centre far above it (and FreeSewing turns the whole piece round). For the
 * placement a piece is unrolled about that centre into an upright frame: y = yRef minus the
 * distance below the waist arc, x = the arc position, partly closing the spread (mu = 0:
 * closed up to the waist's width at every height, 1: as cut). Returns (x, y) -> [x', y'].
 */
export function fanFrame(hem, waist, yRef, mu = 0.45) {
  // least-squares circle through the hem's vertices (Kasa fit)
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = hem.length;
  for (const [x, y] of hem) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z; }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], r = [sxz, syz, sz];
  const det = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const D = det(M);
  const sol = [0, 1, 2].map(c => det(M.map((row, i) => row.map((v, j) => (j === c ? r[i] : v)))) / D);
  const cx = sol[0] / 2, cy = sol[1] / 2, R = Math.sqrt(Math.max(0, sol[2] + cx * cx + cy * cy));
  const yMean = hem.reduce((s, p) => s + p[1], 0) / n;
  // an unspread (straight) hem, or a centre below it: leave the piece as drawn
  if (!isFinite(R) || R > 300 || cy < yMean) {
    const yw = waist.reduce((s, p) => s + p[1], 0) / waist.length;
    return (x, y) => [x, y - yw + yRef];
  }
  const Rw = waist.reduce((s, [x, y]) => s + Math.hypot(x - cx, y - cy), 0) / waist.length;
  return (x, y) => {
    const h = Math.hypot(x - cx, y - cy) - Rw, th = Math.atan2(x - cx, cy - y);
    return [cx + th * (Rw + mu * h), yRef - h];
  };
}
export const vertices = (polys, ids) => ids.flatMap(i => [polys[i][0], polys[i][polys[i].length - 1]]);

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['percy.front'], bp = parts['percy.back'], sp = parts['percy.pocket'];
  const F = fp.points, B = bp.points;
  const W = waistY(m);
  const sections = lowerSections(body, W + 10);
  const E = edges(draft);
  const polys = { front: pathEdges(fp.paths.seam), back: pathEdges(bp.paths.seam), side: pathEdges(sp.paths.seam) };
  // both waists at the front's (Titan's) waist height
  const yRef = -F.styleWaistOut.y / 10;
  const tf = fanFrame(vertices(polys.front, E.fHem), vertices(polys.front, E.fWaist.map(([op]) => op)), yRef);
  const tb = fanFrame(vertices(polys.back, E.bHem), vertices(polys.back, E.bWaist), yRef);
  const tl = (f, loop) => ({ edges: loop.edges.map(e => ({ poly: e.poly.map(([x, y]) => f(x, y)) })) });
  const pt = (f, p) => f(p.x / 10, -p.y / 10);
  const T = fullTrouserMaps(sections, {
    waistY: W, gap: 1.8, underGap: 0.4,
    front: { loop: tl(tf, partOutline(fp)), outSign: -1, cs: pt(tf, F.crotchSeamCurveStart), forkY: pt(tf, F.fork)[1] },
    back: { loop: tl(tb, partOutline(bp)), outSign: 1, cs: pt(tb, B.crossSeamCurveStart), forkY: pt(tb, B.fork)[1] },
    side: tl(tf, partOutline(sp)),
  });
  const via = (f, t) => (x, y) => { const q = t(x, y); return f(q[0], q[1]); };
  const front = via(T.front, tf), back = via(T.back, tb), side = via(T.side, tf);
  const maps = {
    front_r: front, front_l: sided(front, true), back_r: back, back_l: sided(back, true),
    side_r: side, side_l: sided(side, true),
  };
  // a ring through the given chain items ([piece, op, rev]) of the leg pieces
  const ring = (items) => hemRing(items.map(([piece, op, rev, from = 0, to = 1]) => {
    const kind = piece.replace(/_[rl]$/, ''), left = piece.endsWith('_l');
    let poly = polys[kind][op].map(([x, y]) => [left ? -x : x, y]);
    poly = poly.slice(Math.floor(from * (poly.length - 1)), Math.ceil(to * (poly.length - 1)) + 1);
    if (rev) poly = [...poly].reverse();
    return [maps[piece], poly];
  }));
  // cuffs: local x along the cuff (sewn on from topRight, x = length), y down
  const cuffs = {};
  const cp = parts['percy.cuff'];
  if (cp && cp.points.topRight) {
    const len = cp.points.topRight.x / 10;
    for (const s of ['_r', '_l']) {
      const f = ringBand(ring([...chain('back' + s, E.bHem), ...chain('front' + s, E.fHem)]), len);
      cuffs['cuff' + s] = (x, y) => f(len - x, Math.abs(y));
    }
  }
  // waistband: each piece's bottom edge runs along part of the waist ring; up from there it
  // is drawn in to the body at the waist (the band is cut as a cone)
  const top = ring(waistChain(E));
  const bw = bandWidth(draft), Y = garmentTop(draft, m);
  const hug = waistBandMap(body, sections, { Y, len: 1, gap: 1.2 });
  const bandEdges = {}, frac = [];
  let total = 0;
  for (const [piece, op] of BAND) { const L = pathEdgeLen(parts[BAND_PIECES[piece]], op); frac.push([piece, op, total, total + L]); total += L; }
  const band = {};
  for (const piece of Object.keys(BAND_PIECES)) {
    const P = parts[BAND_PIECES[piece]].points, mirror = piece.endsWith('_l');
    const sx = mirror ? -1 : 1;
    const xb = P.bottomRight.x / 10, yr = -P.bottomRight.y / 10, yb = -P.bottomCenter.y / 10;
    const yc = (xb * xb + yr * yr - yb * yb) / (2 * (yr - yb)), Ro = yc - yb;   // circle centre (0, yc)
    const th = (x, y) => Math.atan2(x, yc - y);
    const thR = th(sx * xb, yr);
    // the piece's two bottom edges as angle intervals, in band order
    const items = frac.filter(f => f[0] === piece).map(([, op, t0, t1]) => {
      const [a, b] = op === 0 ? [0, thR] : [-thR, 0];
      const rev = BAND.find(q => q[0] === piece && q[1] === op)[2];
      return { a: rev ? b : a, b: rev ? a : b, t0: t0 / total, t1: t1 / total };
    });
    bandEdges[piece] = items;
    band[piece] = (x, y) => {
      const t = th(x, y), v = Math.max(0, Ro - Math.hypot(x, y - yc));
      let it = items.find(q => (t - q.a) * (t - q.b) <= 0) || items.reduce((best, q) => (Math.min(Math.abs(t - q.a), Math.abs(t - q.b)) < Math.min(Math.abs(t - best.a), Math.abs(t - best.b)) ? q : best));
      const f = Math.max(0, Math.min(1, (t - it.a) / ((it.b - it.a) || 1)));
      const u = it.t0 + (it.t1 - it.t0) * f;
      const p = top.at(u), h = hug(u, v), w = Math.min(1, v / bw);
      return [p[0] * (1 - w) + h[0] * w, p[1] + v, p[2] * (1 - w) + h[2] * w];
    };
  }
  return (ps) => maps[ps.name] || cuffs[ps.name] || band[ps.name];
}

function pathEdgeLen(part, op) {
  const e = pathEdges(part.paths.seam)[op];
  let l = 0;
  for (let i = 1; i < e.length; i++) l += Math.hypot(e[i][0] - e[i - 1][0], e[i][1] - e[i - 1][1]);
  return l;
}

export function attachLevels(draft, m) {
  return { lower_interface: garmentTop(draft, m) + bandWidth(draft) };
}
export const lift = 2;
