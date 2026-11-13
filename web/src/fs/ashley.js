// FreeSewing "Ashley" A-line shorts (https://freesewing.eu/designs/ashley/, MIT, design by
// Gawain CCBR), built on the Titan block: flared legs, a back yoke, front pockets whose side
// pieces show through the curved pocket openings, a fly, straight front waistbands and a
// curved back waistband. Legs, yokes, side pieces and waistbands drape (legbands.js); the
// pocket facings, back patch pockets, fly pieces and belt loops are cut but not simulated.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, lowerSections, fsOptions, partOutline } from './lower.js';
import { pathEdges } from './convert.js';
import { hemRing, fullTrouserMaps, sided } from './legbands.js';

export const id = 'ashley';
export const name = 'Ashley A-line shorts';
export const short = 'A-line shorts';
export const exportName = 'Ashley';
export const url = 'https://freesewing.eu/designs/ashley/';
export const author = 'Gawain CCBR';
export const settings = { expand: true };   // draft the waistbands and belt loops too
export const icon = 'M15 6h26l1 6 7 26H32l-4-12-4 12H7l7-26zM14 12h28';
export const stretchNote = 'The legs, back yokes, waistbands and the pockets’ side pieces drape; the side pieces hang inside the front where the pocket bags are. The pocket facings, back patch pockets, fly pieces, belt loops and the back waistband’s facing are cut but not simulated; the fly is drawn closed, and the right waistband’s button extension hangs free behind the left one.';
// cut from other materials than the main fabric (FreeSewing's cut list)
export const others = { interfacing: ['Left waistband × 1', 'Right waistband × 1', 'Back waistband × 1'] };

export const design = {
  fit: {
    waistEase: { v: 2, range: [0, 10], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Controls the amount of ease at your waist.' },
    seatEase: { v: 5, range: [2, 15], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'Controls the amount of ease at your seat.' },
  },
  style: {
    waistHeight: { v: 25, range: [-5, 100], type: 'float', fs: 'pct', name: 'Waist height (%)', help: 'Controls the height of the waist: 100% = waist height, 0% = hip height.' },
    lengthInseam: { v: 25, range: [5, 100], type: 'float', fs: 'pct', name: 'Length at inseam (%)', help: 'Controls the total length of the shorts at the inseam, relative to the total inseam measurement.' },
    outseamAngle: { v: 9, range: [0, 45], type: 'float', fs: 'deg', name: 'Angle outseam (°)', help: 'How far to rotate the outseam (the flare of the A-line).' },
    inseamAngle: { v: 3, range: [0, 45], type: 'float', fs: 'deg', name: 'Angle inseam (°)', help: 'How far to rotate the inseam.' },
    outseamShorter: { v: 5, range: [0, 20], type: 'float', fs: 'pct', name: 'Shorten the outseam (%)', help: 'Cuts the outseam shorter to create an angle at the hem.' },
    waistbandWidth: { v: 4, range: [1, 10], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'The width of the waistband.' },
    frontPanelPercentage: { v: 50, range: [33, 75], type: 'float', fs: 'pct', name: 'Pocket opening width (%)', help: 'How wide to draft the opening of the front pocket.' },
    yokeDepth: { v: 25, range: [15, 50], type: 'float', fs: 'pct', name: 'Yoke depth (%)', help: 'How deep the yoke should be at the center back.' },
  },
  advanced: {
    crotchDrop: { v: 2, range: [0, 15], type: 'float', fs: 'pct', name: 'Crotch drop (%)', help: 'Lowers the crotch for a more relaxed fit.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['crossSeam', 'crossSeamFront', 'knee', 'seat', 'seatBack', 'waist', 'waistBack', 'waistToFloor',
  'waistToKnee', 'waistToHips', 'waistToSeat', 'waistToUpperLeg', 'inseam', 'hips', 'crotchDepth'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const len = (part, op) => { const e = pathEdges(part.paths.seam)[op]; let l = 0; for (let i = 1; i < e.length; i++) l += Math.hypot(e[i][0] - e[i - 1][0], e[i][1] - e[i - 1][1]); return l; };
const sum = (part, ids) => ids.reduce((s, i) => s + len(part, i), 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lenOf = (draft, part, op) => len(draft.parts[0][part], op);
/** The stretch l0..l1 (cm along the chain, in its direction) of a chain of [piece, op, rev]. */
function sliceChain(items, L, l0, l1) {
  const out = [];
  let s = 0;
  for (const [piece, op, rev] of items) {
    const l = L(piece, op), a = Math.max(l0, s), b = Math.min(l1, s + l);
    if (b - a > 1e-6) {
      const e0 = (a - s) / l, e1 = (b - s) / l;
      out.push(rev ? [piece, op, true, 1 - e1, 1 - e0] : [piece, op, false, e0, e1]);
    }
    s += l;
  }
  return out;
}

/*
 * Edges by point name (@freesewing/ashley):
 *  front: inseam floorIn -> fork, crotch seam -> crotchSeamCurveStart -> styleWaistIn, waist
 *    -> pocketInnerEdge, pocket opening -> pocketSideSeamIntercept, outseam -> floorOut, hem
 *  back: outseam floorOut -> yokeOutseamPoint, yoke seam -> yokeCrossPoint, cross seam ->
 *    crossSeamCurveStart -> fork, inseam -> floorIn, hem
 *  yoke: outseam yokeOutseamPoint -> styleWaistOut, waist -> styleWaistIn, cross seam ->
 *    yokeCrossPoint, yoke seam -> yokeOutseamPoint
 *  side piece ('pocket'): waist pocketFacingEdge -> styleWaistOut (its first part under the
 *    front), outseam -> pocketSideSeamIntercept (its lower part under the front, in the pocket
 *    bag), then the bag
 *  waistband_left / _right: 1 the long edge sewn on (from the centre front end; the right one
 *    first runs past the centre front by the fly's width), folded lengthwise; 0 / 2 the ends
 *  waist_back (curved): bottomCenter -> bottomRight, the end up to topRight, the top, the
 *    other end topLeft -> bottomLeft, bottomLeft -> bottomCenter
 */
function edges(draft) {
  const parts = draft.parts[0], fp = parts['ashley.front'], bp = parts['ashley.back'], yp = parts['ashley.yoke'], sp = parts['ashley.pocket'];
  const F = fp.points, B = bp.points, Y = yp.points, S = sp.points;
  const E = {
    fIn: opsBetween(fp, F.floorIn, F.fork), fCrotch: opsBetween(fp, F.fork, F.styleWaistIn),
    fWaist: opsBetween(fp, F.styleWaistIn, F.pocketInnerEdge), fOut: opsBetween(fp, F.pocketSideSeamIntercept, F.floorOut),
    bOut: opsBetween(bp, B.floorOut, B.yokeOutseamPoint), bYoke: opsBetween(bp, B.yokeOutseamPoint, B.yokeCrossPoint),
    bCross: opsBetween(bp, B.yokeCrossPoint, B.fork), bIn: opsBetween(bp, B.fork, B.floorIn),
    yOut: opsBetween(yp, Y.yokeOutseamPoint, Y.styleWaistOut), yWaist: opsBetween(yp, Y.styleWaistOut, Y.styleWaistIn),
    yCross: opsBetween(yp, Y.styleWaistIn, Y.yokeCrossPoint), yYoke: opsBetween(yp, Y.yokeCrossPoint, Y.yokeOutseamPoint),
    sWaist: opsBetween(sp, S.pocketFacingEdge, S.styleWaistOut), sOut: opsBetween(sp, S.styleWaistOut, S.pocketSideSeamIntercept),
  };
  const wp = parts['ashley.waist_back'], WB = wp.points;
  E.wbR = opsBetween(wp, WB.bottomCenter, WB.bottomRight); E.wbEndR = opsBetween(wp, WB.bottomRight, WB.topRight);
  E.wbEndL = opsBetween(wp, WB.topLeft, WB.bottomLeft); E.wbL = opsBetween(wp, WB.bottomLeft, WB.bottomCenter);
  // the side piece shows between the front's waist and the left waistband's length, and
  // between the back's outseam (with the yoke's) and the front's
  const lb = parts['ashley.waistband_left'];
  const sW = sum(sp, E.sWaist), sO = sum(sp, E.sOut);
  E.sWaistVis = clamp(len(lb, 1) - sum(fp, E.fWaist), 0.05 * sW, sW);
  E.sVis = clamp(sum(bp, E.bOut) + sum(yp, E.yOut) - sum(fp, E.fOut), 0.05 * sO, sO);
  const L = (piece, op) => len(sp, op);
  E.sWaistItems = (piece) => sliceChain(chain(piece, E.sWaist), L, sW - E.sWaistVis, sW);
  // (the stretch of the front's outseam it is sewn to is chosen so that convertDraft samples
  // it alike in both seams: as long as the side piece's, over the back's ratio to the front's)
  // the side piece's outseam: visible length (sewn to the back's, from the top) and the rest
  // (sewn to the front's, from the opening down, and with it to the back's)
  E.sHid = Math.min(sO - E.sVis, 0.98 * len(fp, E.fOut[0]));
  E.sOutItems = (piece, l0, l1) => sliceChain(chain(piece, E.sOut), L, l0, l1);
  E.sOutHidden = E.sHid / len(fp, E.fOut[0]);
  const rb = parts['ashley.waistband_right'];
  E.fly = clamp(draft.setStores[0].get('waistbandFly') / 10 / len(rb, 1), 0, 0.5);
  return E;
}

export function spec(o, draft) {
  const E = edges(draft);
  const seams = [];
  for (const s of ['_r', '_l']) {
    const f = 'front' + s, b = 'back' + s, y = 'yoke' + s, sd = 'side' + s;
    const back = [...chain(y, E.yOut, true), ...chain(b, E.bOut, true)];
    const slice = (items, l0, l1) => sliceChain(items, (piece, op) => lenOf(draft, piece.startsWith('yoke') ? 'ashley.yoke' : 'ashley.back', op), l0, l1);
    seams.push(
      // outseam, waist down: the side piece above the pocket opening, the front below it
      // (in three seams; where three layers meet, the front's and the side piece's stretches
      // are as long as each other and sewn to the same stretch of the back, so convertDraft
      // samples them alike)
      { a: E.sOutItems(sd, 0, E.sVis), b: slice(back, 0, E.sVis) },
      { a: [[f, E.fOut[0], false, 0, E.sOutHidden]], b: slice(back, E.sVis, E.sVis + 0.995 * E.sHid) },
      { a: [[f, E.fOut[0], false, E.sOutHidden, 1], ...chain(f, E.fOut.slice(1))], b: slice(back, E.sVis + 0.995 * E.sHid, Infinity) },
      // the side piece's outseam below the opening is caught in the outseam too, with the front's
      { a: E.sOutItems(sd, E.sVis, E.sVis + E.sHid), b: slice(back, E.sVis, E.sVis + 0.995 * E.sHid) },
      { a: chain(f, E.fIn), b: chain(b, E.bIn, true) },                  // inseam
      { a: chain(y, E.yYoke), b: chain(b, E.bYoke, true) },              // yoke seam
    );
  }
  const side = (s, rev) => (rev ? E.sWaistItems('side' + s).reverse().map(([p, op, , a, b]) => [p, op, true, a, b]) : E.sWaistItems('side' + s));
  seams.push(
    { a: chain('front_r', E.fCrotch), b: chain('front_l', E.fCrotch) },   // centre front (the fly drawn closed)
    { a: [...chain('yoke_r', E.yCross), ...chain('back_r', E.bCross)], b: [...chain('yoke_l', E.yCross), ...chain('back_l', E.bCross)] },
    // waistbands: the right one from the centre front (past its button extension) to the side,
    // the back one round the back, the left one from the side to the centre front
    { a: [...chain('front_r', E.fWaist), ...side('_r', false)], b: [['waistband_right', 1, false, E.fly, 1]] },
    { a: [...chain('yoke_r', E.yWaist), ...chain('yoke_l', E.yWaist, true)], b: [...chain('waist_back', E.wbR, true), ...chain('waist_back', E.wbL, true)] },
    { a: [...side('_l', true), ...chain('front_l', E.fWaist, true)], b: [['waistband_left', 1, true]] },
    { a: [['waistband_right', 2]], b: chain('waist_back', E.wbEndR) },
    { a: chain('waist_back', E.wbEndL), b: [['waistband_left', 2, true]] },
  );
  const lab = [];
  for (const s of ['_r', '_l']) lab.push(...E.fWaist.map(i => ['front' + s, i]), ...E.yWaist.map(i => ['yoke' + s, i]), ...E.sWaist.map(i => ['side' + s, i]));
  return {
    // FreeSewing: legs cut 2 (a left and a right); the unmirrored parts are the wearer's right
    pieces: [
      { name: 'front_r', part: 'ashley.front' },
      { name: 'front_l', part: 'ashley.front', mirror: true },
      { name: 'back_r', part: 'ashley.back' },
      { name: 'back_l', part: 'ashley.back', mirror: true },
      { name: 'yoke_r', part: 'ashley.yoke' },
      { name: 'yoke_l', part: 'ashley.yoke', mirror: true },
      { name: 'side_r', part: 'ashley.pocket' },
      { name: 'side_l', part: 'ashley.pocket', mirror: true },
      { name: 'waistband_right', part: 'ashley.waistband_right', label: 'body', doubled: 'x', follow: 6 },
      { name: 'waist_back', part: 'ashley.waist_back', label: 'body', follow: 6 },
      { name: 'waistband_left', part: 'ashley.waistband_left', label: 'body', doubled: 'x', follow: 6 },
      { name: 'facing_r', part: 'ashley.pocket_facing', cutOnly: true },
      { name: 'facing_l', part: 'ashley.pocket_facing', mirror: true, cutOnly: true },
      { name: 'patch_r', part: 'ashley.pocket_back', cutOnly: true },
      { name: 'patch_l', part: 'ashley.pocket_back', cutOnly: true },
      { name: 'fly_facing', part: 'ashley.flyFacing', cutOnly: true },
      { name: 'fly_extension', part: 'ashley.flyExtension', fold: 4, cutOnly: true },
      { name: 'belt_loops', part: 'ashley.beltLoops', cutOnly: true },
      { name: 'waist_back_facing', part: 'ashley.waist_back', cutOnly: true },
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // the front's y = 0 (Titan's)
function waistTop(draft, m) {
  const parts = draft.parts[0], F = parts['ashley.front'].points, Y = parts['ashley.yoke'].points;
  return waistY(m) + Math.min(...[F.styleWaistIn, F.pocketInnerEdge, Y.styleWaistIn, Y.styleWaistOut].map(p => -p.y / 10));
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['ashley.front'], bp = parts['ashley.back'], yp = parts['ashley.yoke'], sp = parts['ashley.pocket'];
  const F = fp.points, B = bp.points, Y = yp.points;
  const W = waistY(m);
  const sections = lowerSections(body, W + 8);
  const loc = (p) => [p.x / 10, -p.y / 10];
  // the back with its yoke on top (the yoke is drafted a little apart from the back)
  const dy = loc(B.yokeOutseamPoint), dyY = loc(Y.yokeOutseamPoint), off = [dy[0] - dyY[0], dy[1] - dyY[1]];
  const backLoop = partOutline(bp), yokeLoop = partOutline(yp);
  const T = fullTrouserMaps(sections, {
    waistY: W, gap: 2.0, underGap: 0.2,
    front: { loop: partOutline(fp), outSign: -1, cs: loc(F.crotchSeamCurveStart), forkY: loc(F.fork)[1] },
    back: { loop: { edges: [...backLoop.edges, ...yokeLoop.edges.map(e => ({ poly: e.poly.map(([x, y]) => [x + off[0], y + off[1]]) }))] }, outSign: 1, cs: loc(B.crossSeamCurveStart), forkY: loc(B.fork)[1] },
    side: partOutline(sp), openBottom: loc(F.pocketSideSeamIntercept)[1],
  });
  const yoke = (x, y) => T.back(x + off[0], y + off[1]);
  const maps = {
    front_r: T.front, front_l: sided(T.front, true), back_r: T.back, back_l: sided(T.back, true),
    yoke_r: yoke, yoke_l: sided(yoke, true), side_r: T.side, side_l: sided(T.side, true),
  };
  // waistbands: along a ring through the waist (from the right centre front round the back)
  const E = edges(draft);
  const polys = { front: pathEdges(fp.paths.seam), yoke: pathEdges(yp.paths.seam), side: pathEdges(sp.paths.seam) };
  const sideL = E.sWaistItems('side_l').reverse().map(([p, op, , a, b]) => [p, op, true, a, b]);
  const items = [...chain('front_r', E.fWaist), ...E.sWaistItems('side_r'), ...chain('yoke_r', E.yWaist),
    ...chain('yoke_l', E.yWaist, true), ...sideL, ...chain('front_l', E.fWaist, true)];
  const ring = hemRing(items.map(([piece, op, rev, from = 0, to = 1]) => {
    const kind = piece.replace(/_[rl]$/, ''), left = piece.endsWith('_l');
    let poly = polys[kind][op].map(([x, y]) => [left ? -x : x, y]);
    poly = poly.slice(Math.floor(from * (poly.length - 1)), Math.ceil(to * (poly.length - 1)) + 1);
    if (rev) poly = [...poly].reverse();
    return [maps[piece], poly];
  }));
  // ring fractions where the right band ends and the left one starts
  const lf = sum(fp, E.fWaist) + E.sWaistVis, ly = sum(yp, E.yWaist), tot = 2 * (lf + ly);
  const a1 = lf / tot, a3 = 1 - lf / tot;
  const up = (t, v) => { const p = ring.at(t); return [p[0], p[1] + v, p[2]]; };
  const rb = parts['ashley.waistband_right'].points, lb = parts['ashley.waistband_left'].points;
  const rLen = rb.bottomLeft.y / 10, lLen = lb.bottomLeft.y / 10, fly = E.fly * rLen;   // (FreeSewing: y down)
  const wb = parts['ashley.waist_back'].points;
  const xb = wb.bottomRight.x / 10, yr = -wb.bottomRight.y / 10, yb = -wb.bottomCenter.y / 10;
  const yc = (xb * xb + yr * yr - yb * yb) / (2 * (yr - yb)), Ro = yc - yb, thR = Math.atan2(xb, yc - yr);
  const band = {
    // local y down the band from its centre front end; the button extension carries on past
    // the centre front, behind the left band
    waistband_right: (x, y) => { const s = -y - fly; return s >= 0 ? up(a1 * s / (rLen - fly), Math.abs(x)) : (() => { const p = up(s / tot, Math.abs(x)); return [p[0] * 0.97, p[1], p[2] * 0.97]; })(); },
    waistband_left: (x, y) => up(1 - (1 - a3) * (-y / lLen), Math.abs(x)),
    waist_back: (x, y) => {
      const th = Math.atan2(x, yc - y), v = Math.max(0, Ro - Math.hypot(x, y - yc));
      return up(a1 + (a3 - a1) * (0.5 - 0.5 * th / thR), v);
    },
  };
  return (ps) => maps[ps.name] || band[ps.name];
}

export function attachLevels(draft, m) {
  return { lower_interface: waistTop(draft, m) };
}
export const lift = 2;
