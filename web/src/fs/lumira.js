// FreeSewing "Lumira" leggings (https://freesewing.eu/designs/lumira/, MIT, design by Wouter
// Van Wageningen): each leg is one piece with no outseam (the back and front of the leg either
// side of a line down the outside), joined under the crotch by a diamond gusset, with a
// shaped waistband; drafted with negative ease for stretch knits. Measurements from the
// mannequin, options as sliders, seam table and placement around the hips and legs for the
// drape (legwear.js).
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions, waistBandMap, partOutline } from './lower.js';
import { loc, rigid, opsPoly, clipLoop, legPairPlacement } from './legwear.js';

export const id = 'lumira';
export const name = 'Lumira leggings';
export const short = 'Leggings';
export const exportName = 'Lumira';
export const url = 'https://freesewing.eu/designs/lumira/';
export const author = 'Wouter Van Wageningen';
export const settings = { expand: true };
export const icon = 'M16 6h24l1 8-2 38h-8l-3-30-3 30h-8l-2-38z';
export const stretchNote = 'Lumira is drafted with negative ease for stretch knits. The 3D drape uses a relaxed copy (a quarter of the negative ease) because the simulated cloth barely stretches; the pattern view, cutting layout and exports use the real pattern. The waistband is cut twice (band and facing); the drape shows one layer.';

export const design = {
  fit: {
    ease: { v: -8, range: [-30, 0], type: 'float', fs: 'pct', name: 'Ease (%)', help: 'Controls the amount of ease. Leggings are made from stretch fabric, so the ease is negative.' },
    waistreduction: { v: 4, range: [0, 10], type: 'float', fs: 'pct', name: 'Waist circumference reduction (%)', help: 'The amount by which the waist is reduced (a percentage of the waist).' },
    gussetwidth: { v: 16, range: [5, 30], type: 'float', fs: 'pct', name: 'Gusset width (%)', help: 'Width of the gusset (a percentage of the front cross seam).' },
    frontgussetlength: { v: 12.5, range: [0, 30], type: 'float', fs: 'pct', name: 'Front gusset length (%)', help: 'How far the gusset extends to the front (a percentage of the front cross seam).' },
  },
  style: {
    leglength: { v: 100, range: [10, 100], type: 'float', fs: 'pct', name: 'Leg length (%)', help: 'The length of the legs (a percentage of the inseam).' },
    waistlowering: { v: 35, range: [-10, 60], type: 'float', fs: 'pct', name: 'Waist lowering (%)', help: 'Lowers the waist (a percentage of the waist to hips measurement).' },
    waistband: { v: true, type: 'bool', fs: 'bool', name: 'Waistband', help: 'Adds a separate waistband.' },
    waistbandsize: { v: 90, range: [0, 150], type: 'float', fs: 'pct', name: 'Waistband size (%)', help: 'Height of the waistband (a percentage of the waist to hips measurement).' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) o.ease *= 0.25;   // the simulated cloth barely stretches
  return o;
}

const MEASUREMENTS = ['waist', 'waistBack', 'hips', 'seat', 'seatBack', 'upperLeg', 'knee', 'ankle', 'heel', 'inseam', 'crossSeam',
  'crossSeamFront', 'waistToFloor', 'waistToKnee', 'waistToUpperLeg', 'waistToSeat', 'waistToHips'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges by point name (@freesewing/lumira; y = 0 at the natural waist, the outside of the
 * leg at x = 0, the front towards +x and the back towards -x: the wearer's right leg):
 *  leg: centre back backWaistband -> backGussetJoin, gusset seam -> backGusset, inseam ->
 *    backBottom, hem -> frontBottom, inseam -> frontGusset, gusset seam -> frontGussetJoin,
 *    centre front -> frontWaistband, waist -> centerWaistband -> backWaistband.
 *  gusset (on the fold along its length, front tip at -y): 1 front tip -> side, 2 side ->
 *    back tip; m1 / m2 the other side.
 *  waistband (on the fold at its centre front, 4): 0 top, 1 centre back end (down), 2-3 the
 *    sewn edge from the centre back to the centre front.
 */
function edges(draft) {
  const parts = draft.parts[0], lp = parts['lumira.leg'], P = lp.points;
  return {
    lp, P,
    bCentre: opsBetween(lp, P.backWaistband, P.backGussetJoin), bGusset: opsBetween(lp, P.backGussetJoin, P.backGusset),
    bIn: opsBetween(lp, P.backGusset, P.backBottom), fIn: opsBetween(lp, P.frontBottom, P.frontGusset),
    fGusset: opsBetween(lp, P.frontGusset, P.frontGussetJoin), fCentre: opsBetween(lp, P.frontGussetJoin, P.frontWaistband),
    waist: opsBetween(lp, P.frontWaistband, P.backWaistband),
  };
}
const hasBand = (draft) => !!draft.parts[0]['lumira.waistband']?.paths.seam && !draft.parts[0]['lumira.waistband'].hidden;

export function spec(o, draft) {
  const E = edges(draft), band = hasBand(draft);
  const seams = [];
  for (const s of ['_r', '_l']) seams.push({ a: chain('leg' + s, E.bIn), b: chain('leg' + s, E.fIn, true) });   // inseam, crotch down
  seams.push(
    { a: chain('leg_r', E.fCentre), b: chain('leg_l', E.fCentre) },   // centre front, up
    { a: chain('leg_r', E.bCentre), b: chain('leg_l', E.bCentre) },   // centre back, down
    // gusset: the right leg to its -x side, the left to +x (front tip -> side -> back tip)
    { a: [...chain('leg_r', E.fGusset, true), ...chain('leg_r', E.bGusset, true)], b: [['gusset', 'm1'], ['gusset', 'm2']] },
    { a: [...chain('leg_l', E.fGusset, true), ...chain('leg_l', E.bGusset, true)], b: [['gusset', 1], ['gusset', 2]] },
  );
  const lab = [];
  for (const s of ['_r', '_l']) lab.push(...E.waist.map(i => ['leg' + s, i]));
  if (band) {
    // the band's lower edge from the centre back round to the centre front on the right,
    // and from the centre front on round to the centre back on the left; its ends meet at
    // the centre back
    seams.push(
      { a: [...chain('leg_r', E.waist, true), ...chain('leg_l', E.waist)], b: [['waistband', 2], ['waistband', 3], ['waistband', 'm3', true], ['waistband', 'm2', true]] },
      { a: [['waistband', 1]], b: [['waistband', 'm1']] },
    );
    lab.push(['waistband', 0], ['waistband', 'm0']);
  }
  return {
    pieces: [
      { name: 'leg_r', part: 'lumira.leg' },
      { name: 'leg_l', part: 'lumira.leg', mirror: true },
      { name: 'gusset', part: 'lumira.gusset', fold: 0, label: 'body', follow: 4 },
      ...(band ? [{ name: 'waistband', part: 'lumira.waistband', fold: 4, label: 'body', lining: true, follow: 6 }] : []),
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;
const DROP = 2;   // start below the designed waist; the waist attachment brings it back up (garment.js)

export function placement(draft, m, body) {
  const W = waistY(m), E = edges(draft), P = E.P, parts = draft.parts[0];
  const T = rigid();   // already in Titan's frame for the right leg
  const loop = partOutline(E.lp);
  const front = { part: E.lp, outline: clipLoop(loop, 1), T, cs: loc(P.frontSeat), forkY: loc(P.frontGusset)[1], centre: opsPoly(E.lp, E.fCentre) };
  const back = { part: E.lp, outline: clipLoop(loop, -1), T, cs: loc(P.backSeat), forkY: loc(P.backGusset)[1], centre: opsPoly(E.lp, E.bCentre) };
  const legs = legPairPlacement(body, W, { front, back, wrap: true });
  const drop = (f) => (x, y) => { const p = f(x, y); return [p[0], p[1] - DROP, p[2]]; };
  // either half of the leg piece by the side of the outside line it is on
  const leg = (ps) => {
    const f = legs({ ...ps, name: 'front' + ps.name.slice(3) }), b = legs({ ...ps, name: 'back' + ps.name.slice(3) });
    const sx = ps.mirror ? -1 : 1;
    return (x, y) => (sx * x >= 0 ? f(x, y) : b(x, y));
  };
  // gusset: flat under the crotch, its tip towards the front
  const crotchY = W + loc(P.frontGusset)[1];
  const S = legs.sections(crotchY + 3);
  const gusset = (x, y) => [x, crotchY - 0.5, S.cz - y];
  const maps = { gusset };
  if (hasBand(draft)) {
    const wb = parts['lumira.waistband'].points;
    const xf = wb.bottomFront.x / 10, yb = -wb.bottomFront.y / 10;
    const len = 2 * (xf - Math.min(...Object.values(wb).map(p => p.x / 10)));   // round the waist
    const band = waistBandMap(body, legs.sections, { Y: W + loc(P.frontWaistband)[1], len });
    maps.waistband = (x, y) => band(((xf - x) % len + len) % len, Math.max(0, y - yb));
  }
  return (ps) => drop(maps[ps.name] || leg(ps));
}

export function attachLevels(draft, m) {
  const parts = draft.parts[0], P = parts['lumira.leg'].points;
  let top = Math.max(...['frontWaistband', 'centerWaistband', 'backWaistband'].map(k => loc(P[k])[1]));
  if (hasBand(draft)) {
    const wb = parts['lumira.waistband'].points;
    top += Math.max(...Object.values(wb).map(p => -p.y / 10)) - (-wb.bottomFront.y / 10);
  }
  return { lower_interface: waistY(m) + top };
}
export const lift = 0;
