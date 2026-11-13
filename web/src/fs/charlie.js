// FreeSewing "Charlie" chinos (https://freesewing.eu/designs/charlie/, MIT, design by Joost
// De Cock), built on the Titan block: slanted front pockets, welted back pockets, a fly and
// a straight waistband. The legs and the waistband drape (lower.js); pockets, fly pieces and
// belt loops are cut but not simulated (the pocket openings are sewn closed along the back's
// side extension, as they lie when worn).
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, lowerSections, fsOptions, waistBandMap } from './lower.js';
import { legPlacement } from './titan.js';

export const id = 'charlie';
export const name = 'Charlie chinos';
export const short = 'Chinos';
export const exportName = 'Charlie';
export const url = 'https://freesewing.eu/designs/charlie/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the waistband and belt loops too
export const icon = 'M13 5h30v5l4 42H36l-8-32-8 32H9l4-42zM13 10h30';
export const stretchNote = 'The legs and the waistband drape; the pockets, fly pieces and belt loops are cut but not simulated, and the pocket openings are drawn closed.';
// cut from other materials than the main fabric (FreeSewing's cut list)
export const others = { lining: ['Front pocket bag × 2', 'Back pocket bag × 2'], interfacing: ['Back pocket interfacing × 2'] };

export const design = {
  fit: {
    waistEase: { v: 1, range: [0, 5], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Controls the amount of ease at your waist.' },
    seatEase: { v: 5, range: [0, 10], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'Controls the amount of ease at your seat.' },
    kneeEase: { v: 15, range: [10, 30], type: 'float', fs: 'pct', name: 'Knee ease (%)', help: 'Controls the amount of ease at the knee.' },
  },
  style: {
    waistHeight: { v: -4, range: [-15, 40], type: 'float', fs: 'pct', name: 'Waist height (%)', help: 'Controls the height of the waist: 100% = waist height, 0% = hip height.' },
    lengthBonus: { v: 2, range: [-20, 10], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'Controls the length of the trousers.' },
    crotchDrop: { v: 2, range: [0, 15], type: 'float', fs: 'pct', name: 'Crotch drop (%)', help: 'Lowers the crotch for a more relaxed fit.' },
    waistbandWidth: { v: 3, range: [1, 6], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'The width of the waistband.' },
    frontPocketSlantDepth: { v: 85, range: [70, 100], type: 'float', fs: 'pct', name: 'Front pocket slant depth (%)', help: 'Controls the depth of the (front) pocket slant.' },
    frontPocketSlantWidth: { v: 25, range: [15, 35], type: 'float', fs: 'pct', name: 'Front pocket slant width (%)', help: 'Controls the width of the (front) pocket slant.' },
  },
  advanced: {
    legBalance: { v: 57.5, range: [52.5, 62.5], type: 'float', fs: 'pct', name: 'Leg balance (%)', help: 'Controls the ratio between the front and back panel of the leg.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['crossSeam', 'crossSeamFront', 'knee', 'seat', 'seatBack', 'waist', 'waistBack', 'waistToFloor',
  'waistToKnee', 'waistToHips', 'waistToSeat', 'waistToUpperLeg'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges by point name (@freesewing/charlie):
 *  front: inseam floorIn -> fork, crotch seam fork -> styleWaistIn, waist styleWaistIn ->
 *    slantTop, pocket slant slantTop -> slantCurveEnd, outseam slantCurveEnd -> floorOut, hem
 *  back: outseam floorOut -> slantCurveEnd, side extension (under the pocket slant)
 *    slantCurveEnd -> slantOut, waist slantOut -> backDartRight, dart -> pocketCenter ->
 *    backDartLeft, waist backDartLeft -> styleWaistIn, cross seam -> fork, inseam fork -> floorIn
 *  waistband: 3 one long edge (sewn on, from its far end), 1 the other (folded over)
 */
function edges(draft) {
  const parts = draft.parts[0], fp = parts['charlie.front'], bp = parts['charlie.back'];
  const F = fp.points, B = bp.points;
  return {
    fp, bp,
    fIn: opsBetween(fp, F.floorIn, F.fork), fCrotch: opsBetween(fp, F.fork, F.styleWaistIn),
    fWaist: opsBetween(fp, F.styleWaistIn, F.slantTop), fSlant: opsBetween(fp, F.slantTop, F.slantCurveEnd),
    fOut: opsBetween(fp, F.slantCurveEnd, F.floorOut),
    bOut: opsBetween(bp, B.floorOut, B.slantCurveEnd), bSide: opsBetween(bp, B.slantCurveEnd, B.slantOut),
    bWaistOut: opsBetween(bp, B.slantOut, B.backDartRight), bDartR: opsBetween(bp, B.backDartRight, B.pocketCenter),
    bDartL: opsBetween(bp, B.pocketCenter, B.backDartLeft), bWaistIn: opsBetween(bp, B.backDartLeft, B.styleWaistIn),
    bCross: opsBetween(bp, B.styleWaistIn, B.fork), bIn: opsBetween(bp, B.fork, B.floorIn),
  };
}

export function spec(o, draft) {
  const E = edges(draft);
  const seams = [];
  for (const s of ['_r', '_l']) {
    const f = 'front' + s, b = 'back' + s;
    seams.push(
      { a: chain(f, E.fOut), b: chain(b, E.bOut, true) },        // outseam, pocket down
      { a: chain(f, E.fSlant), b: chain(b, E.bSide, true) },     // pocket slant over the back's side extension
      { a: chain(f, E.fIn), b: chain(b, E.bIn, true) },          // inseam
      { a: chain(b, E.bDartR), b: chain(b, E.bDartL, true) },    // back dart
    );
  }
  seams.push(
    { a: chain('front_r', E.fCrotch), b: chain('front_l', E.fCrotch) },
    { a: chain('back_r', E.bCross), b: chain('back_l', E.bCross) },
  );
  // waistband (FreeSewing's: the fly's underlap from its top end, y = 0, to cfRight, then
  // the waist): sewn from the right centre front round the back to the left centre front.
  // The underlap carries on past the left centre front, under the band's other end, so it
  // is laid on the first few cm of the left front's waist too (buttoned there when worn).
  const wb = draft.parts[0]['charlie.waistband'].points;
  const fly = Math.abs(wb.cfRight.y / wb.bottomLeft.y);
  const st = draft.setStores[0], fw = E.fWaist.length === 1 ? Math.min(0.8, st.get('waistbandFly') / st.get('waistbandFront')) : 0;
  const leftFront = fw ? [['front_l', E.fWaist[0], true, fw, 1], ['front_l', E.fWaist[0], true, 0, fw]] : chain('front_l', E.fWaist, true);
  const waist = [...chain('front_r', E.fWaist), ...chain('back_r', E.bWaistOut), ...chain('back_r', E.bWaistIn),
    ...chain('back_l', E.bWaistIn, true), ...chain('back_l', E.bWaistOut, true), ...leftFront];
  seams.push({ a: waist, b: [['waistband', 3, true, 0, 1 - fly]] });
  if (fw) seams.push({ a: [['front_l', E.fWaist[0], false, 0, fw]], b: [['waistband', 3, false, 1 - fly, 1]] });
  const lab = [];
  for (const s of ['_r', '_l']) lab.push(...E.fWaist.map(i => ['front' + s, i]), ...E.bWaistOut.map(i => ['back' + s, i]), ...E.bWaistIn.map(i => ['back' + s, i]));
  return {
    pieces: [
      { name: 'front_r', part: 'charlie.front' },
      { name: 'front_l', part: 'charlie.front', mirror: true },
      { name: 'back_r', part: 'charlie.back' },
      { name: 'back_l', part: 'charlie.back', mirror: true },
      { name: 'waistband', part: 'charlie.waistband', label: 'body', doubled: 'x', follow: 6 },
      { name: 'pocket_facing_r1', part: 'charlie.frontPocketFacing', cutOnly: true },
      { name: 'pocket_facing_r2', part: 'charlie.frontPocketFacing', cutOnly: true },
      { name: 'pocket_facing_l1', part: 'charlie.frontPocketFacing', mirror: true, cutOnly: true },
      { name: 'pocket_facing_l2', part: 'charlie.frontPocketFacing', mirror: true, cutOnly: true },
      { name: 'back_pocket_facing_r', part: 'charlie.backPocketFacing', cutOnly: true },
      { name: 'back_pocket_facing_l', part: 'charlie.backPocketFacing', mirror: true, cutOnly: true },
      { name: 'back_pocket_welt_r1', part: 'charlie.backPocketWelt', cutOnly: true },
      { name: 'back_pocket_welt_r2', part: 'charlie.backPocketWelt', cutOnly: true },
      { name: 'back_pocket_welt_l1', part: 'charlie.backPocketWelt', mirror: true, cutOnly: true },
      { name: 'back_pocket_welt_l2', part: 'charlie.backPocketWelt', mirror: true, cutOnly: true },
      { name: 'fly_facing', part: 'charlie.flyFacing', cutOnly: true },
      { name: 'fly_extension', part: 'charlie.flyExtension', fold: 4, cutOnly: true },
      { name: 'belt_loops', part: 'charlie.beltLoops', cutOnly: true },
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;
function waistTop(draft, m) {
  const parts = draft.parts[0], F = parts['charlie.front'].points, B = parts['charlie.back'].points;
  return waistY(m) + Math.min(...[F.styleWaistIn, F.slantTop, B.styleWaistIn, B.slantOut].map(p => -p.y / 10));
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const legs = legPlacement(draft, m, body, parts['charlie.front'], parts['charlie.back']);
  const wb = parts['charlie.waistband'];
  const fly = -wb.points.cfRight.y / 10, sewn = (wb.points.cfRight.y - wb.points.bottomLeft.y) / 10;
  const band = waistBandMap(body, lowerSections(body, waistY(m) + 8), { Y: waistTop(draft, m), len: sewn });
  return (ps) => {
    // band: local y from 0 down to -length, sewn on from the end of the fly underlap
    // (at the right centre front) round to the left centre front; x up
    if (ps.name === 'waistband') return (x, y) => band(-y - fly, x);
    return legs(ps);
  };
}

export function attachLevels(draft, m) {
  return { lower_interface: waistTop(draft, m) };
}
export const lift = 2;
