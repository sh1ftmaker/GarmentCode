// FreeSewing "Lily" leggings (https://freesewing.eu/designs/lily/, MIT, design by Anna
// Puk), built on the Titan block: a front and a back per leg drafted with negative ease
// for stretch fabric, tapered to the ankle, and an elastic waistband (Paco's). The legs and
// the waistband drape (lower.js); the drape uses a relaxed copy (see stretchNote).
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, lowerSections, fsOptions, waistBandMap } from './lower.js';
import { legPlacement } from './titan.js';

export const id = 'lily';
export const name = 'Lily leggings';
export const short = 'Leggings';
export const exportName = 'Lily';
export const url = 'https://freesewing.eu/designs/lily/';
export const author = 'Anna Puk';
export const settings = { expand: true };   // draft the waistband too
export const icon = 'M17 5h22v5l2 42h-7l-6-33-6 33h-7l2-42zM17 10h22';
export const stretchNote = 'Lily is drafted with negative ease for stretch fabric. The 3D drape uses a relaxed copy (no negative ease at the hips, a third of it at the legs) because the simulated cloth barely stretches, so it sits a little looser than real leggings; the pattern view, cutting layout and exports use the real pattern. The waistband elastic is not simulated.';

export const design = {
  fit: {
    waistEase: { v: -4, range: [-20, 0], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Controls the amount of ease at your waist.' },
    seatEase: { v: -4, range: [-20, 0], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'Controls the amount of ease at your seat.' },
    kneeEase: { v: -4, range: [-20, 0], type: 'float', fs: 'pct', name: 'Knee ease (%)', help: 'Controls the amount of ease at the knee.' },
    fabricStretch: { v: 40, range: [0, 50], type: 'float', fs: 'pct', name: 'Fabric stretch (%)', help: 'How much the fabric can stretch horizontally; this is used to calculate ease (the ease options should be about minus a tenth of it).' },
  },
  style: {
    waistHeight: { v: 50, range: [0, 100], type: 'float', fs: 'pct', name: 'Waist height (%)', help: 'Controls the height of the waist: 100% = waist height, 0% = hip height.' },
    waistbandWidth: { v: 3, range: [1, 6], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'The width of the waistband.' },
    lengthReduction: { v: 0, range: [0, 100], type: 'float', fs: 'pct', name: 'Length reduction (%)', help: 'Controls how much the leggings are shortened with respect to ankle length.' },
  },
  advanced: {
    crotchDrop: { v: 0, range: [0, 15], type: 'float', fs: 'pct', name: 'Crotch drop (%)', help: 'Lowers the crotch for a more relaxed fit.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  // the simulated cloth barely stretches: no negative ease at the hips, a third of it (and of
  // the stretch taken off the ankle) at the legs
  if (relaxed) { o.waistEase = 0; o.seatEase = 0; o.kneeEase *= 0.35; o.fabricStretch *= 0.35; }
  return o;
}

const MEASUREMENTS = ['crossSeam', 'crossSeamFront', 'knee', 'seat', 'seatBack', 'waist', 'waistBack', 'waistToFloor',
  'waistToKnee', 'waistToHips', 'waistToSeat', 'waistToUpperLeg', 'ankle', 'heel'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/**
 * Seams of a Titan-style front and back cut off at a hem (points named as below, for the
 * pieces front_r/_l, back_r/_l). Front: outseam waistOut -> hemOut, hem, inseam hemIn ->
 * fork, crotch seam fork -> waistIn, waist. Back: inseam fork -> hemIn, hem, outseam
 * hemOut -> waistOut, waist, cross seam waistIn -> fork.
 * pf / pb: { waistOut, waistIn, hemOut, hemIn, fork } FreeSewing points of the front / back.
 */
export function cutLegSeams(fp, bp, pf, pb) {
  const fOut = opsBetween(fp, pf.waistOut, pf.hemOut), fIn = opsBetween(fp, pf.hemIn, pf.fork), fCrotch = opsBetween(fp, pf.fork, pf.waistIn);
  const bOut = opsBetween(bp, pb.hemOut, pb.waistOut), bIn = opsBetween(bp, pb.fork, pb.hemIn), bCross = opsBetween(bp, pb.waistIn, pb.fork);
  const seams = [];
  for (const s of ['_r', '_l']) {
    seams.push(
      { a: chain('front' + s, fOut), b: chain('back' + s, bOut, true) },    // outseam, waist down
      { a: chain('front' + s, fIn), b: chain('back' + s, bIn, true) },      // inseam, hem up
    );
  }
  seams.push(
    { a: chain('front_r', fCrotch), b: chain('front_l', fCrotch) },   // centre front, fork up
    { a: chain('back_r', bCross), b: chain('back_l', bCross) },       // centre back, waist down
  );
  return {
    seams,
    waist: { front: opsBetween(fp, pf.waistIn, pf.waistOut), back: opsBetween(bp, pb.waistOut, pb.waistIn) },
    hem: { front: opsBetween(fp, pf.hemOut, pf.hemIn), back: opsBetween(bp, pb.hemIn, pb.hemOut) },
  };
}

const pts = (P) => ({ waistOut: P.styleWaistOutLily, waistIn: P.styleWaistInLily, hemOut: P.bottomOut, hemIn: P.bottomIn, fork: P.fork });

export function spec(o, draft) {
  const parts = draft.parts[0], fp = parts['lily.front'], bp = parts['lily.back'];
  const { seams, waist } = cutLegSeams(fp, bp, pts(fp.points), pts(bp.points));
  // waistband (as Paco's: its middle at the centre front), sewn from the centre back round
  // the wearer's left, the front and the right back; its ends joined at the centre back
  seams.push({
    a: [...chain('back_l', waist.back, true), ...chain('front_l', waist.front, true), ...chain('front_r', waist.front), ...chain('back_r', waist.back)],
    b: [['waistband', 0]],
  });
  seams.push({ a: [['waistband', 1]], b: [['waistband', 3, true]] });
  const lab = [];
  for (const s of ['_r', '_l']) lab.push(...waist.front.map(i => ['front' + s, i]), ...waist.back.map(i => ['back' + s, i]));
  return {
    // FreeSewing: cut 2 of each (a left and a right leg); the unmirrored parts are the wearer's right
    pieces: [
      { name: 'front_r', part: 'lily.front' },
      { name: 'front_l', part: 'lily.front', mirror: true },
      { name: 'back_r', part: 'lily.back' },
      { name: 'back_l', part: 'lily.back', mirror: true },
      { name: 'waistband', part: 'lily.waistband', label: 'body', doubled: 'x', follow: 6 },
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;
function waistTop(draft, m) {
  const parts = draft.parts[0], F = parts['lily.front'].points, B = parts['lily.back'].points;
  return waistY(m) + Math.min(...[F.styleWaistInLily, F.styleWaistOutLily, B.styleWaistInLily, B.styleWaistOutLily].map(p => -p.y / 10));
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const legs = legPlacement(draft, m, body, parts['lily.front'], parts['lily.back']);
  const wb = parts['lily.waistband'].points, len = (wb.bottomLeft.y - wb.topLeft.y) / 10;
  const band = waistBandMap(body, lowerSections(body, waistY(m) + 8), { Y: waistTop(draft, m), len });
  return (ps) => {
    // band: local y from 0 down to -length, sewn on from the centre back; x up
    if (ps.name === 'waistband') return (x, y) => band(-y + len / 2, Math.abs(x));
    return legs(ps);
  };
}

export function attachLevels(draft, m) {
  return { lower_interface: waistTop(draft, m) };
}
export const lift = 2;
