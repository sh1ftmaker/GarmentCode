// FreeSewing "Umbra" undies (https://freesewing.eu/designs/umbra/, MIT, design by Joost De
// Cock and Jonathan Haas): a front that runs down under the crotch to a seam behind it, and a
// back, drafted with negative ease for stretch knits; an optional bulge dart shapes a pouch.
// Measurements from the mannequin, options as sliders, seam table and placement around the
// hips and under the crotch for the drape (as uma.js).
import { fsMeasurements, pick } from './measure.js';
import { fsOptions, skirtSections, opsBetween, chain } from './lower.js';

export const id = 'umbra';
export const name = 'Umbra undies';
export const short = 'Underwear';
export const exportName = 'Umbra';
export const url = 'https://freesewing.eu/designs/umbra/';
export const author = 'Joost De Cock, Jonathan Haas';
export const settings = { expand: true };   // whole front and back (not on the fold)
export const icon = 'M7 14c12 3 30 3 42 0l-2 10c-7 4-12 10-14 20h-10c-2-10-7-16-14-20z';
export const stretchNote = 'Umbra is drafted with negative ease for stretch knits. The 3D drape uses a relaxed copy (about a third of the horizontal and half the vertical stretch, at most 6% and 4%) because the simulated cloth barely stretches; the pattern view, cutting layout and exports use the real pattern. The front is also cut in lining; the drape shows one layer.';

export const design = {
  fit: {
    xStretch: { v: 15, range: [0, 75], type: 'float', fs: 'pct', name: 'Horizontal fabric stretch (%)', help: 'Adjust this for more or less stretchy fabric in the horizontal direction.' },
    yStretch: { v: 5, range: [0, 50], type: 'float', fs: 'pct', name: 'Vertical fabric stretch (%)', help: 'Adjust this for more or less stretchy fabric in the vertical direction.' },
    gussetWidth: { v: 12, range: [3, 20], type: 'float', fs: 'pct', name: 'Gusset width (%)', help: 'Controls the width of the gusset.' },
    gussetPosition: { v: 50, range: [20, 100], type: 'float', fs: 'pct', name: 'Gusset position (%)', help: 'Shifts the narrowest part of the gusset more to the front or back.' },
    splitPosition: { v: 11, range: [0, 45], type: 'float', fs: 'pct', name: 'Crotch seam (%)', help: 'Moves the seam between front and back further back.' },
    bulge: { v: 0, range: [0, 30], type: 'float', fs: 'deg', name: 'Bulge (°)', help: 'Adds a dart at the front to make room for a bulge.' },
  },
  style: {
    rise: { v: 75, range: [20, 150], type: 'float', fs: 'pct', name: 'Rise (%)', help: 'Controls the height of the waist.' },
    legRise: { v: 0, range: [-20, 40], type: 'float', fs: 'pct', name: 'Leg rise (%)', help: 'Controls how high the leg is cut out.' },
    frontDip: { v: 2.5, range: [-5, 15], type: 'float', fs: 'pct', name: 'Front waist dip (%)', help: 'Controls how much the front waist curves.' },
    frontExposure: { v: 70, range: [5, 100], type: 'float', fs: 'pct', name: 'Front exposure (%)', help: 'Controls the amount of exposed skin on the front.' },
    backDip: { v: -2.5, range: [-15, 10], type: 'float', fs: 'pct', name: 'Back waist dip (%)', help: 'Controls how much the back waist curves.' },
    backExposure: { v: 15, range: [0, 100], type: 'float', fs: 'pct', name: 'Back exposure (%)', help: 'Controls the amount of exposed skin on the back.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = fsOptions(d);
  if (relaxed) { o.xStretch = Math.min(0.06, o.xStretch * 0.35); o.yStretch = Math.min(0.04, o.yStretch * 0.6); }
  return o;
}

const MEASUREMENTS = ['waist', 'seat', 'waistToSeat', 'crossSeam', 'crossSeamFront', 'waistToHips', 'hips'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges by point name (@freesewing/umbra, drafted whole; the left half of each part mirrors
 * its right, x -> -x):
 *  front: [bulge dart cfBulgeSplit -> cfGussetBulge -> cfBackGussetBulge], crotch seam
 *    cfBackGussetBulge -> backGussetSplitBulge, leg opening, side seam (up) ->
 *    sideWaistbandFront, waist -> cfWaistbandDipFront, then the mirror image back down.
 *  back (drawn turned over, waist up): waist cfWaistbandDipBack -> sideWaistbandBack, side
 *    seam (down) -> sideLegBack, leg opening, crotch seam backGussetSplit -> cfBackGusset,
 *    then the mirror image.
 */
const mir = (p) => ({ x: -p.x, y: p.y });
function edges(draft) {
  const parts = draft.parts[0], fp = parts['umbra.front'], bp = parts['umbra.back'];
  const F = fp.points, B = bp.points;
  const bulge = !!draft.setStores[0].get('bulge');
  const e = { fp, bp, bulge };
  for (const [k, m] of [['r', (p) => p], ['l', mir]]) {
    // the left half is drawn backwards (from the waist down, or from the centre out)
    const ops = (part, p, q) => (k === 'r' ? opsBetween(part, p, q) : opsBetween(part, q, p));
    e[k] = {
      fCrotch: ops(fp, m(F.cfBackGussetBulge), m(F.backGussetSplitBulge)),
      fSide: ops(fp, m(F.sideLegFront), m(F.sideWaistbandFront)),
      fWaist: ops(fp, m(F.sideWaistbandFront), m(F.cfWaistbandDipFront)),
      bWaist: ops(bp, m(B.cfWaistbandDipBack), m(B.sideWaistbandBack)),
      bSide: ops(bp, m(B.sideWaistbandBack), m(B.sideLegBack)),
      bCrotch: ops(bp, m(B.backGussetSplit), m(B.cfBackGusset)),
      dart: bulge ? ops(fp, m(F.cfBulgeSplit), m(F.cfBackGussetBulge)) : [],
    };
  }
  return e;
}

export function spec(o, draft) {
  const E = edges(draft);
  const seams = [];
  // each half of a part is drawn the opposite way round to the other, and the back
  // the opposite way to the front: front and back edges run against each other
  for (const k of ['r', 'l']) {
    seams.push(
      { a: chain('front', E[k].fCrotch), b: chain('back', E[k].bCrotch, true) },   // crotch seam
      { a: chain('front', E[k].fSide), b: chain('back', E[k].bSide, true) },       // side seam
    );
  }
  if (E.bulge) seams.push({ a: chain('front', E.r.dart), b: chain('front', E.l.dart, true) });   // bulge dart, top down
  const lab = [];
  for (const k of ['r', 'l']) lab.push(...E[k].fWaist.map(i => ['front', i]), ...E[k].bWaist.map(i => ['back', i]));
  return {
    pieces: [
      { name: 'front', part: 'umbra.front', lining: true },   // FreeSewing: cut 1 fabric + 1 lining
      { name: 'back', part: 'umbra.back' },
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // FreeSewing's y = 0: the natural waist

/**
 * Placement (as uma.js): front and back are drafted as one strip down the front, under the
 * crotch and up the back (the back drawn turned over: its local y is the distance down that
 * strip, the back's natural waist at twice the strip's middle). Above the crotch a point lies
 * on the lower body's section at its height; under the crotch it folds in between the legs.
 */
export function placement(draft, m, body) {
  const parts = draft.parts[0], B = parts['umbra.back'].points;
  const W = waistY(m), crotchH = -(m.hips_line + m.crotch_hip_diff);
  const sections = skirtSections(body, W + 4);
  const sMid = B.cfWaistBack.y / -20;   // half the strip (the back's local y of its natural waist / 2)
  // the pattern's girth at its top (front + back)
  const C = 2 * (B.sideWaistbandBack.x / 10) + 2 * (parts['umbra.front'].points.sideWaistbandFront.x / 10);
  const gap = 1.2;
  const at = (u, s) => {   // u: cm across from the centre line, s: cm down the strip
    const back = s > sMid, h = back ? s - 2 * sMid : -s;
    const hh = Math.max(h, crotchH + 1);
    const S = sections(W + hh);
    const k = Math.max(1, C / S.L);
    const f = back ? 0.5 - u / C : u / C;
    const [x, z, nx, nz] = S.at(f * S.L);
    let X = S.cx + k * (x - S.cx) + gap * nx, Z = S.cz + k * (z - S.cz) + gap * nz, Y = W + hh;
    if (h < crotchH + 1) {   // under the crotch: fold in towards the centre, between the legs
      const e = crotchH + 1 - h, zc = S.cz;
      Z = zc + Math.sign(Z - zc) * Math.max(0.6, Math.abs(Z - zc) - 1.6 * e);
      Y = W + crotchH - 0.5;
    }
    return [X, Y - DROP, Z];
  };
  return (ps) => {
    if (ps.name === 'back') return (x, y) => at(x, y);
    return (x, y) => at(x, -y);
  };
}

export function attachLevels(draft, m) {
  const parts = draft.parts[0], F = parts['umbra.front'].points, B = parts['umbra.back'].points;
  const sMid = B.cfWaistBack.y / -20;
  const front = [F.cfWaistbandDipFront, F.sideWaistbandFront].map(p => -p.y / 10);
  const back = [B.cfWaistbandDipBack, B.sideWaistbandBack].map(p => -p.y / 10 - 2 * sMid);
  return { lower_interface: waistY(m) + Math.max(...front, ...back) };
}
// the pieces start DROP cm below their designed height; the waist attachment floors (start +
// 2 cm) bring the waist back up to it (as uma.js)
const DROP = 2;
export const lift = 0;
