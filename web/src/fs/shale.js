// FreeSewing "Shale" shorts (https://freesewing.eu/designs/shale/, MIT, design by Jonathan
// Haas): pyjama / boxer shorts with a front and a back per leg (lined), a shaped front
// waistband and an elastic back waistband, and patch pockets. Measurements from the
// mannequin, options as sliders, seam table and placement around the hips and legs for the
// drape (legwear.js); the pockets are cut but not simulated.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions, waistBandMap } from './lower.js';
import { loc, rigid, opsPoly, legPairPlacement } from './legwear.js';

export const id = 'shale';
export const name = 'Shale shorts';
export const short = 'Shorts';
export const exportName = 'Shale';
export const url = 'https://freesewing.eu/designs/shale/';
export const author = 'Jonathan Haas';
export const settings = { expand: true };   // draft the waistbands too
export const icon = 'M11 8h34l5 30H34l-6-14-6 14H6zM11 8v-3h34v3';
export const stretchNote = 'The legs and both waistbands drape (one layer each: the lining and the waistbands\' facings are cut, not simulated); the patch pockets are cut but not simulated. The back waistband is shown without its elastic gathering.';

export const design = {
  fit: {
    ease: { v: 5, range: [0, 20], type: 'float', fs: 'pct', name: 'Ease (%)', help: 'Controls the amount of ease around the seat.' },
    crossSeamEase: { v: 2.5, range: [0, 10], type: 'float', fs: 'pct', name: 'Cross seam ease (%)', help: 'Adds length to the crotch seam.' },
    crotchLower: { v: 2.5, range: [0, 10], type: 'float', fs: 'pct', name: 'Crotch lower (%)', help: 'Lowers the crotch.' },
    fitLegs: { v: 90, range: [0, 100], type: 'float', fs: 'pct', name: 'Fit legs (%)', help: 'How closely the leg openings follow the thighs.' },
    waistReduction: { v: 80, range: [0, 100], type: 'float', fs: 'pct', name: 'Waist reduction (%)', help: 'How much the waist is taken in from the seat towards the waist.' },
    backCoverage: { v: 0, range: [-5, 10], type: 'float', fs: 'deg', name: 'Back coverage (°)', help: 'Tilts the back waist up for more coverage.' },
  },
  style: {
    waistHeight: { v: 15, range: [0, 100], type: 'float', fs: 'pct', name: 'Waist height (%)', help: 'Controls the height of the waist: 0% is at the natural waist.' },
    inseam: { v: 33, range: [10, 75], type: 'float', fs: 'pct', name: 'Inseam (%)', help: 'Controls the length of the legs.' },
    legBalance: { v: 40, range: [25, 50], type: 'float', fs: 'pct', name: 'Leg balance (%)', help: 'Controls the ratio between the front and the back of the leg.' },
    elasticHeight: { v: 4, range: [2, 10], type: 'float', fs: 'pct', name: 'Elastic height (%)', help: 'The width of the waist elastic (and of the waistbands).' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['seat', 'seatBack', 'knee', 'hips', 'waist', 'waistToKnee', 'waistToSeat', 'waistToHips', 'crotchDepth',
  'waistToUpperLeg', 'upperLeg', 'crossSeam', 'crossSeamFront', 'waistToFloor', 'inseam'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

// Shale draws its front and back outlines as `seamFront` / `seamBack` and the front
// waistband with the ring sector macro; convert.js reads each part's `seam`.
const OUTLINE = { 'shale.front': 'seamFront', 'shale.back': 'seamBack', 'shale.pocket': 'pocketSeam', 'shale.waistband-front': '__macro_ringsector_waistbandFront_path' };
function outlines(draft) {
  for (const [p, path] of Object.entries(OUTLINE)) {
    const part = draft.parts[0][p];
    if (part && !part.paths.seam && part.paths[path]) part.paths.seam = part.paths[path];
  }
}

/*
 * Edges by point name (@freesewing/shale, front and back drawn in one frame: y = 0 at the
 * natural waist, the side seam at x = 0, the front towards -x and the back towards +x, as
 * the wearer's left leg; the right leg is the mirrored copy):
 *  front: waist styleWaistOut -> styleWaistFront, centre seam -> forkFront, inseam -> legFront,
 *    hem -> legOut, side seam -> styleWaistOut.
 *  back: side seam styleWaistOut -> legOut, hem -> legBack, inseam -> forkBack, centre seam ->
 *    styleWaistBack, waist -> styleWaistOut.
 *  front waistband (ring sector): 0-1 the lower (longer) arc right end -> centre -> left end,
 *    2 left end, 3-4 the upper arc, 5 right end.
 *  back waistband (on the fold at its centre back, folded lengthwise): 2 the sewn edge
 *    from the left side to the centre back, 1 the left end.
 */
function edges(draft) {
  const parts = draft.parts[0], fp = parts['shale.front'], bp = parts['shale.back'];
  const F = fp.points, B = bp.points;
  return {
    fp, bp,
    fWaist: opsBetween(fp, F.styleWaistOut, F.styleWaistFront), fCentre: opsBetween(fp, F.styleWaistFront, F.forkFront),
    fIn: opsBetween(fp, F.forkFront, F.legFront), fSide: opsBetween(fp, F.legOut, F.styleWaistOut),
    bSide: opsBetween(bp, B.styleWaistOut, B.legOut), bIn: opsBetween(bp, B.legBack, B.forkBack),
    bCentre: opsBetween(bp, B.forkBack, B.styleWaistBack), bWaist: opsBetween(bp, B.styleWaistBack, B.styleWaistOut),
  };
}

export function spec(o, draft) {
  outlines(draft);
  const E = edges(draft);
  const seams = [];
  for (const s of ['_r', '_l']) {
    seams.push(
      { a: chain('front' + s, E.fSide), b: chain('back' + s, E.bSide, true) },   // side seam, hem up
      { a: chain('front' + s, E.fIn), b: chain('back' + s, E.bIn, true) },       // inseam, fork down
    );
  }
  seams.push(
    { a: chain('front_r', E.fCentre), b: chain('front_l', E.fCentre) },   // centre front, waist down
    { a: chain('back_r', E.bCentre), b: chain('back_l', E.bCentre) },     // centre back, fork up
    // waistbands: the front's lower arc along the front waist (side -> centre front -> side),
    // the back's sewn edge along the back waist (side -> centre back -> side)
    { a: [...chain('front_r', E.fWaist), ...chain('front_l', E.fWaist, true)], b: [['waistband_front', 0], ['waistband_front', 1]] },
    { a: [...chain('back_l', E.bWaist, true), ...chain('back_r', E.bWaist)], b: [['waistband_back', 2], ['waistband_back', 'm2', true]] },
    // waistband side seams: the front band's ends to the back band's, top down
    { a: [['waistband_front', 2, true]], b: [['waistband_back', 1]] },
    { a: [['waistband_front', 5]], b: [['waistband_back', 'm1']] },
  );
  // the waist, and the bands' top edges (held up at their designed height)
  const lab = [['waistband_front', 3], ['waistband_front', 4], ['waistband_back', 0], ['waistband_back', 'm0']];
  for (const s of ['_r', '_l']) lab.push(...E.fWaist.map(i => ['front' + s, i]), ...E.bWaist.map(i => ['back' + s, i]));
  return {
    // FreeSewing: 2 fronts and 2 backs in fabric and again in lining
    pieces: [
      { name: 'front_r', part: 'shale.front', mirror: true, lining: true },
      { name: 'front_l', part: 'shale.front', lining: true },
      { name: 'back_r', part: 'shale.back', mirror: true, lining: true },
      { name: 'back_l', part: 'shale.back', lining: true },
      { name: 'waistband_front', part: 'shale.waistband-front', label: 'body', lining: true, follow: 6 },   // cut 2: band + facing
      { name: 'waistband_back', part: 'shale.waistband-back', label: 'body', fold: 3, doubled: 'y', follow: 6 },
      ...(draft.parts[0]['shale.pocket']?.paths.seam ? [
        { name: 'patch_r', part: 'shale.pocket', mirror: true, cutOnly: true },
        { name: 'patch_l', part: 'shale.pocket', cutOnly: true },
      ] : []),
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // FreeSewing's y = 0: the natural waist
const DROP = 2;   // start below the designed waist; the waist attachment brings it back up (garment.js)

export function placement(draft, m, body) {
  outlines(draft);
  const parts = draft.parts[0], W = waistY(m);
  const E = edges(draft), F = E.fp.points, B = E.bp.points;
  const T = rigid({ sx: -1 });   // Titan's frame of the right leg: the mirror image
  const front = { part: E.fp, T, cs: T(loc(F.seatFront)), forkY: loc(F.forkFront)[1], centre: opsPoly(E.fp, E.fCentre, T) };
  const back = { part: E.bp, T, cs: T(loc(B.seatBack)), forkY: loc(B.forkBack)[1], centre: opsPoly(E.bp, E.bCentre, T) };
  const legs = legPairPlacement(body, W, { front, back });
  // the bands, round the waist from the right centre front (waistBandMap), up from the waist
  const fb = parts['shale.waistband-front'].points, bb = parts['shale.waistband-back'].points;
  const lf = 2 * Math.abs(fb.__macro_ringsector_waistbandFront_ex1?.x ?? 0) / 10 || 40, lb = 2 * bb.topRight.x / 10;
  const top = W + Math.min(loc(F.styleWaistOut)[1], loc(F.styleWaistFront)[1], loc(B.styleWaistBack)[1]);
  const band = waistBandMap(body, legs.sections, { Y: top, len: lf + lb });
  const yLow = Math.min(...Object.values(fb).map(p => -p.y / 10));
  const maps = {
    waistband_front: (x, y) => band((lf + lb - x) % (lf + lb), y - yLow),
    waistband_back: (x, y) => band(lf / 2 + lb / 2 + x, -y),
  };
  const drop = (f) => (x, y) => { const p = f(x, y); return [p[0], p[1] - DROP, p[2]]; };
  return (ps) => drop(maps[ps.name] || legs(ps));
}

export function attachLevels(draft, m) {
  const parts = draft.parts[0], F = parts['shale.front'].points, B = parts['shale.back'].points;
  // the top of the waistbands (garment.js caps every attached point at its own start + 2 cm)
  const band = draft.setStores[0].get('waistbandWidth') / 10 || 0;
  return { lower_interface: waistY(m) + band + Math.max(...[F.styleWaistOut, F.styleWaistFront, B.styleWaistBack].map(p => -p.y / 10)) };
}
export const lift = 0;
