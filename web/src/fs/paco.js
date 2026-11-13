// FreeSewing "Paco" summer pants (https://freesewing.eu/designs/paco/, MIT, design by Joost
// De Cock), built on the Titan block: no fly (the waist is widened to the seat and drawn in
// by elastic in the waistband), optional in-seam front pockets and welted back pockets, and
// elasticated cuffs or a plain hem. The legs, the waistband and the cuffs drape (lower.js,
// legbands.js); pocket pieces are cut but not simulated.
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, lowerSections, fsOptions, waistBandMap } from './lower.js';
import { legSeams, legPlacement } from './titan.js';
import { hemRing, ringBand } from './legbands.js';

export const id = 'paco';
export const name = 'Paco pants';
export const short = 'Summer pants';
export const exportName = 'Paco';
export const url = 'https://freesewing.eu/designs/paco/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the waistband and cuffs too
export const icon = 'M14 5h28v5l3 36h2v6H34v-6l-6-27-6 27v6H9v-6h2l3-36z';
export const stretchNote = 'The elastic in the waistband and cuffs is not simulated: they drape at their cut length. The in-seam front pockets (their flaps on the side seams and the pocket bags) hang inside the pants, so the drape leaves them out; the back pocket welts and bags are cut but not simulated.';
// cut from other materials than the main fabric (FreeSewing's cut list)
export const others = { lining: ['Front pocket bag × 2 (with front pockets)', 'Back pocket bag × 2 (with back pockets)'], interfacing: ['Back pocket welt interfacing × 2 (with back pockets)'] };

export const design = {
  fit: {
    waistEase: { v: 2, range: [0, 10], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Controls the amount of ease at your waist.' },
    seatEase: { v: 5, range: [0, 15], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'Controls the amount of ease at your seat.' },
    heelEase: { v: 5, range: [0, 50], type: 'float', fs: 'pct', name: 'Heel ease (%)', help: 'The amount of ease at your heel (when stepping into the leg).' },
  },
  style: {
    waistHeight: { v: 5, range: [0, 100], type: 'float', fs: 'pct', name: 'Waist height (%)', help: 'Controls the height of the waist: 100% = waist height, 0% = hip height.' },
    lengthBonus: { v: 0, range: [-15, 10], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'Controls the length of the trousers.' },
    crotchDrop: { v: 2, range: [0, 10], type: 'float', fs: 'pct', name: 'Crotch drop (%)', help: 'Lowers the crotch for a more relaxed fit.' },
    elasticatedCuff: { v: true, type: 'bool', fs: 'bool', name: 'Elasticated cuff', help: 'Whether you want to include an elasticated cuff at the legs, or prefer a classic hemmed finish.' },
    waistbandWidth: { v: 3, range: [1, 6], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'The width of the waistband.' },
    ankleElastic: { v: 5, range: [1, 13], type: 'float', fs: 'pct', name: 'Ankle/Hem elastic width (%)', help: 'Width of the (optional) elastic at the ankle/hem.' },
  },
  pockets: {
    frontPockets: { v: true, type: 'bool', fs: 'bool', name: 'Front pockets', help: 'Whether or not to add front pockets on the side seam.' },
    backPockets: { v: false, type: 'bool', fs: 'bool', name: 'Back pockets', help: 'Whether or not to add welt pockets to the back.' },
  },
  advanced: {
    legBalance: { v: 57.5, range: [52.5, 62.5], type: 'float', fs: 'pct', name: 'Leg balance (%)', help: 'Controls the ratio between the front and back panel of the leg.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  // the drape leaves the in-seam pockets out: their flaps fold inside with the pocket bags
  // (the outline is otherwise the same: FreeSewing splits the side seam to add them)
  if (relaxed) o.frontPockets = false;
  return o;
}

const MEASUREMENTS = ['crossSeam', 'crossSeamFront', 'knee', 'seat', 'seatBack', 'waist', 'waistBack', 'waistToFloor',
  'waistToKnee', 'waistToHips', 'waistToSeat', 'waistToUpperLeg', 'heel'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges by point name (@freesewing/paco), as Titan's (legSeams in titan.js); the front pocket
 * flaps (only in the real pattern) interrupt the outseams. Hems: front floorOut -> floorIn,
 * back floorIn -> floorOut. Waistband and cuffs: rectangles folded lengthwise, 0 the long
 * edge sewn on (from y = 0 down), 1 and 3 the short ends (joined into a ring).
 */
export function spec(o, draft) {
  const parts = draft.parts[0], fp = parts['paco.front'], bp = parts['paco.back'];
  const F = fp.points, B = bp.points;
  const pieces = [
    { name: 'front_r', part: 'paco.front' },
    { name: 'front_l', part: 'paco.front', mirror: true },
    { name: 'back_r', part: 'paco.back' },
    { name: 'back_l', part: 'paco.back', mirror: true },
    { name: 'waistband', part: 'paco.waistband', label: 'body', doubled: 'x', follow: 6 },
  ];
  if (o.elasticatedCuff) pieces.push(
    { name: 'cuff_r', part: 'paco.cuff', doubled: 'x', follow: 8 },
    { name: 'cuff_l', part: 'paco.cuff', mirror: true, doubled: 'x', follow: 8 },
  );
  if (o.backPockets) pieces.push(
    { name: 'welt_r', part: 'paco.backPocketWelt', cutOnly: true },
    { name: 'welt_l', part: 'paco.backPocketWelt', mirror: true, cutOnly: true },
  );
  const { seams, waist } = legSeams(fp, bp);
  // waistband (eyelets at its middle: the centre front), sewn from the centre back round the
  // wearer's left, the front, and the right back to the centre back; ends joined there
  seams.push({
    a: [...chain('back_l', waist.back, true), ...chain('front_l', waist.front, true), ...chain('front_r', waist.front), ...chain('back_r', waist.back)],
    b: [['waistband', 0]],
  });
  seams.push({ a: [['waistband', 1]], b: [['waistband', 3, true]] });
  if (o.elasticatedCuff) {
    const fHem = opsBetween(fp, F.floorOut, F.floorIn), bHem = opsBetween(bp, B.floorIn, B.floorOut);
    for (const s of ['_r', '_l']) {
      // from the inseam round the back, the outseam and the front
      seams.push({ a: [...chain('back' + s, bHem), ...chain('front' + s, fHem)], b: [['cuff' + s, 0]] });
      seams.push({ a: [['cuff' + s, 1]], b: [['cuff' + s, 3, true]] });
    }
  }
  const lab = [];
  for (const s of ['_r', '_l']) lab.push(...waist.front.map(i => ['front' + s, i]), ...waist.back.map(i => ['back' + s, i]));
  return { pieces, seams, labels: { lower_interface: lab } };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;
function waistTop(draft, m) {
  const parts = draft.parts[0], F = parts['paco.front'].points, B = parts['paco.back'].points;
  return waistY(m) + Math.min(...[F.styleWaistIn, F.styleWaistOut, B.styleWaistIn, B.styleWaistOut].map(p => -p.y / 10));
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['paco.front'], bp = parts['paco.back'];
  const legs = legPlacement(draft, m, body, fp, bp);
  const wb = parts['paco.waistband'].points, len = (wb.bottomLeft.y - wb.topLeft.y) / 10;
  const band = waistBandMap(body, lowerSections(body, waistY(m) + 8), { Y: waistTop(draft, m), len });
  const loc = (p) => [p.x / 10, -p.y / 10];
  const F = fp.points, B = bp.points;
  const cuffs = {};
  if (parts['paco.cuff'] && !parts['paco.cuff'].hidden && parts['paco.cuff'].points.bottomLeft) {
    const c = parts['paco.cuff'].points, clen = (c.bottomLeft.y - c.topLeft.y) / 10;
    for (const s of ['_r', '_l']) {
      const mirror = s === '_l';
      const mf = legs({ name: 'front' + s, mirror }), mb = legs({ name: 'back' + s, mirror });
      const sx = mirror ? -1 : 1, L = (p) => { const q = loc(p); return [sx * q[0], q[1]]; };
      const ring = hemRing([[mb, L(B.floorIn), L(B.floorOut)], [mf, L(F.floorOut), L(F.floorIn)]]);
      const f = ringBand(ring, clen);
      cuffs['cuff' + s] = (x, y) => f(-y, Math.abs(x));
    }
  }
  return (ps) => {
    // band: local y from 0 down to -length, sewn on from the centre back; x up
    if (ps.name === 'waistband') return (x, y) => band(-y + len / 2, Math.abs(x));
    if (cuffs[ps.name]) return cuffs[ps.name];
    return legs(ps);
  };
}

export function attachLevels(draft, m) {
  return { lower_interface: waistTop(draft, m) };
}
export const lift = 2;
