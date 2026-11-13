// FreeSewing "Titan" trouser block (https://freesewing.eu/designs/titan/, MIT, design by Debra
// Bean and Joost De Cock): a front and a back per leg, fitted to the seat, the knee and the crotch
// seam. Measurements from the mannequin, options as sliders, seam table and placement
// around the hips and legs for the drape (lower.js).
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, lowerSections, trouserMaps, fsOptions, partOutline } from './lower.js';

export const id = 'titan';
export const name = 'Titan trouser block';
export const short = 'Trouser block';
export const exportName = 'Titan';
export const url = 'https://freesewing.eu/designs/titan/';
export const author = 'Debra Bean, Joost De Cock';
export const icon = 'M14 6h28l4 46h-11l-7-34-7 34H10z';

export const design = {
  fit: {
    waistEase: { v: 2, range: [0, 10], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Controls the amount of ease at your waist.' },
    seatEase: { v: 2, range: [0, 10], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'Controls the amount of ease at your seat.' },
    kneeEase: { v: 6, range: [1, 25], type: 'float', fs: 'pct', name: 'Knee ease (%)', help: 'Controls the amount of ease at the knee.' },
    fitKnee: { v: false, type: 'bool', fs: 'bool', name: 'Fit the knee', help: 'Fits the legs based on the knee circumference, rather than the seat circumference.' },
  },
  style: {
    waistHeight: { v: 100, range: [0, 100], type: 'float', fs: 'pct', name: 'Waist height (%)', help: 'Controls the height of the waist: 100% = waist height, 0% = hip height.' },
    lengthBonus: { v: 2, range: [-20, 10], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'Controls the length of the trousers.' },
    crotchDrop: { v: 2, range: [0, 15], type: 'float', fs: 'pct', name: 'Crotch drop (%)', help: 'Lowers the crotch for a more relaxed fit.' },
    waistAngle: { v: 0, range: [-20, 20], type: 'float', fs: 'deg', name: 'Waistband angle (°)', help: 'Changes the angle of the waistband when viewed from the side (positive lowers the front).' },
  },
  advanced: {
    legBalance: { v: 57.5, range: [52.5, 62.5], type: 'float', fs: 'pct', name: 'Leg balance (%)', help: 'Controls the ratio between the front and back panel of the leg.' },
    waistbandWidth: { v: 3, range: [1, 6], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'The width of the waistband (the waist is lowered by it).' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['crossSeam', 'crossSeamFront', 'knee', 'seat', 'seatBack', 'waist', 'waistBack', 'waistToFloor',
  'waistToKnee', 'waistToHips', 'waistToSeat', 'waistToUpperLeg'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/**
 * Seams of a Titan-style front and back (point names as in @freesewing/titan), for the
 * pieces `${f}_r`, `${f}_l`, `${b}_r`, `${b}_l`. Front: outseam waistOut -> floorOut,
 * hem, inseam floorIn -> fork, crotch seam fork -> waistIn, waist. Back: inseam
 * fork -> floorIn, hem, outseam floorOut -> waistOut, waist, cross seam waistIn -> fork.
 */
export function legSeams(fp, bp, { f = 'front', b = 'back', fpt = {}, bpt = {} } = {}) {
  const F = fp.points, B = bp.points;
  const g = (P, o, k) => o[k] || P['style' + k[0].toUpperCase() + k.slice(1)] || P[k];
  const fWO = g(F, fpt, 'waistOut'), fWI = g(F, fpt, 'waistIn'), bWO = g(B, bpt, 'waistOut'), bWI = g(B, bpt, 'waistIn');
  const fOut = opsBetween(fp, fWO, F.floorOut), fIn = opsBetween(fp, F.floorIn, F.fork), fCrotch = opsBetween(fp, F.fork, fWI);
  const bOut = opsBetween(bp, B.floorOut, bWO), bIn = opsBetween(bp, B.fork, B.floorIn), bCross = opsBetween(bp, bWI, B.fork);
  const seams = [];
  for (const s of ['_r', '_l']) {
    seams.push(
      { a: chain(f + s, fOut), b: chain(b + s, bOut, true) },    // outseam, waist down
      { a: chain(f + s, fIn), b: chain(b + s, bIn, true) },      // inseam, hem up
    );
  }
  seams.push(
    { a: chain(f + '_r', fCrotch), b: chain(f + '_l', fCrotch) },   // centre front, fork up
    { a: chain(b + '_r', bCross), b: chain(b + '_l', bCross) },     // centre back, waist down
  );
  return {
    seams,
    waist: { front: opsBetween(fp, fWI, fWO), back: opsBetween(bp, bWO, bWI) },
  };
}

export function spec(o, draft) {
  const parts = draft.parts[0], fp = parts['titan.front'], bp = parts['titan.back'];
  const { seams, waist } = legSeams(fp, bp);
  const lab = [];
  for (const s of ['_r', '_l']) lab.push(...waist.front.map(i => ['front' + s, i]), ...waist.back.map(i => ['back' + s, i]));
  return {
    // FreeSewing: cut 2 of each (a left and a right leg); the unmirrored parts are the wearer's right
    pieces: [
      { name: 'front_r', part: 'titan.front' },
      { name: 'front_l', part: 'titan.front', mirror: true },
      { name: 'back_r', part: 'titan.back' },
      { name: 'back_l', part: 'titan.back', mirror: true },
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // FreeSewing's y = 0 (as gc_bridge's lower_interface)

/** Trouser placement for a Titan-style front and back (see lower.js). */
export function legPlacement(draft, m, body, fp, bp, { csF = 'crotchSeamCurveStart', csB = 'crossSeamCurveStart', gap } = {}) {
  const W = waistY(m);
  const sections = lowerSections(body, W + 8);
  const loc = (p) => [p.x / 10, -p.y / 10];
  const outline = partOutline;
  const T = trouserMaps(sections, {
    waistY: W, gap,
    front: { loop: outline(fp), outSign: -1, cs: loc(fp.points[csF]), forkY: loc(fp.points.fork)[1] },
    back: { loop: outline(bp), outSign: 1, cs: loc(bp.points[csB]), forkY: loc(bp.points.fork)[1] },
  });
  return (ps) => {
    const f = ps.name.startsWith('front') ? T.front : T.back;
    if (ps.mirror) return (x, y) => { const p = f(-x, y); return [-p[0], p[1], p[2]]; };
    return f;
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  return legPlacement(draft, m, body, parts['titan.front'], parts['titan.back']);
}

/** The waist may not drop below its lowest designed point. */
export function waistLevel(m, ...parts) {
  let lo = Infinity;
  for (const p of parts) for (const k of ['styleWaistIn', 'styleWaistOut']) if (p.points[k]) lo = Math.min(lo, -p.points[k].y / 10);
  return waistY(m) + lo;
}
export function attachLevels(draft, m) {
  const parts = draft.parts[0];
  return { lower_interface: waistLevel(m, parts['titan.front'], parts['titan.back']) };
}
export const lift = 2;
