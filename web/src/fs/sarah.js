// FreeSewing "Sarah" skirt block (https://freesewing.eu/designs/sarah/, MIT, design by Lindsey
// Hernandez and Joost De Cock): a straight skirt with a front cut on the fold (one waist dart
// per side), a back cut on the fold (two darts per side) and an optional centre front or
// centre back seam. Measurements from the mannequin, options as sliders, seam table and
// placement around the hips and legs (lower.js).
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions, partOutline, waistDarts, skirtSections, skirtMap } from './lower.js';
import { outlineSpan } from './place.js';

export const id = 'sarah';
export const name = 'Sarah skirt block';
export const short = 'Skirt block';
export const exportName = 'Sarah';
export const url = 'https://freesewing.eu/designs/sarah/';
export const author = 'Lindsey Hernandez, Joost De Cock';
export const settings = { expand: false };   // halves on the fold (unfolded by the adapter)
export const icon = 'M17 6h22l4 44H13zM22 6l1 9M34 6l-1 9';
export const stretchNote = 'Sarah is a block with no closure: the drape shows the skirt sewn closed.';

export const design = {
  fit: {
    extraSeatEase: { v: 0, range: [-20, 20], type: 'float', fs: 'pct', name: 'Extra seat ease (%)', help: 'Ease added to seat measurement to account for fabric stretch and closure style.' },
    extraWaistEase: { v: 0, range: [-20, 20], type: 'float', fs: 'pct', name: 'Extra waist ease (%)', help: 'Ease added to waistline.' },
  },
  style: {
    length: { v: 100, range: [25, 100], type: 'float', fs: 'pct', name: 'Length (%)', help: 'Skirt length, as a percentage of the waist to floor measurement.' },
    waistDrop: { v: 0, range: [0, 100], type: 'float', fs: 'pct', name: 'Waist drop (%)', help: 'Waistline drop from waist toward hips.' },
    centerFrontSeam: { v: false, type: 'bool', fs: 'bool', name: 'Center front seam', help: 'Create seam in center front (e.g., for zipper).' },
    centerBackSeam: { v: false, type: 'bool', fs: 'bool', name: 'Center back seam', help: 'Create a seam in center back (otherwise the back is one piece).' },
  },
  advanced: {
    seatEase: { v: 6.25, range: [0, 20], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'Ease added to seat measurement.' },
    waistEaseFront: { v: 10, range: [0, 20], type: 'float', fs: 'pct', name: 'Front waist ease (%)', help: 'Ease added to front waistline (the front dart takes it in).' },
    waistEaseBack: { v: 17, range: [0, 30], type: 'float', fs: 'pct', name: 'Back waist ease (%)', help: 'Ease added to back waistline (the back darts take it in).' },
    waistRise: { v: 6, range: [0, 10], type: 'float', fs: 'pct', name: 'Waist rise (%)', help: 'Rise of waistline between front/back center and sides.' },
    frontDartLength: { v: 58, range: [40, 80], type: 'float', fs: 'pct', name: 'Front dart length (%)', help: 'Length of darts on front.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['waist', 'seat', 'waistToSeat', 'waistToFloor', 'hips', 'waistToHips'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Sarah draws no closed seam line (only its pieces: waist, side, hem, centre): the seam
 * outline of each half is put together from its named points, as Sarah's own paths run.
 * Front half: cfTop -> (dart) -> sfTop -> sideSeat -> sideBottom -> cfBottom -> (fold) cfTop.
 * Back half: cbTop -> (fold) cbBottom -> sideBottom -> sideSeat -> sbTop -> (two darts) -> cbTop.
 */
const mv = (to) => ({ type: 'move', to }), ln = (to) => ({ type: 'line', to }), cv = (cp1, cp2, to) => ({ type: 'curve', cp1, cp2, to });
function buildSeams(fp, bp) {
  const F = fp.points, B = bp.points;
  if (!fp.paths.seam) {
    fp.paths.seam = { ops: [
      mv(F.cfTop), cv(F.cftCp, F.fdrCp, F.frontDartRight), ln(F.frontDartBottom), ln(F.frontDartLeft), cv(F.fdlCp, F.sftCp, F.sfTop),
      cv(F.sfhTCp, F.sfhTCp, F.sfhCpC), cv(F.sfhBCp, F.sfhBCp, F.sideSeat), ln(F.sideBottom), ln(F.cfBottom), { type: 'close' },
    ] };
  }
  if (!bp.paths.seam) {
    bp.paths.seam = { ops: [
      mv(B.cbTop), ln(B.cbBottom), ln(B.sideBottom), ln(B.sideSeat), cv(B.sshBCp, B.sshBCp, B.sshCpC), cv(B.sshTCp, B.sshTCp, B.sbTop),
      cv(B.sbtCp, B.bodRCp, B.backOutsideDartRight), ln(B.backOutsideDartBottom), ln(B.backOutsideDartLeft),
      cv(B.bodLCp, B.bidRCp, B.backInsideDartRight), ln(B.backInsideDartBottom), ln(B.backInsideDartLeft),
      cv(B.bidLCp, B.cbTopCp, B.cbTop), { type: 'close' },
    ] };
  }
}

/*
 * Pieces: the front (on the fold, or front_r / front_l with a centre front seam) and the
 * back (likewise). Each drafted half is the wearer's right; its mirror image the left.
 */
export function spec(o, draft) {
  const parts = draft.parts[0], fp = parts['sarah.front'], bp = parts['sarah.back'];
  buildSeams(fp, bp);
  const F = fp.points, B = bp.points;
  const fSide = opsBetween(fp, F.sfTop, F.sideBottom), bSide = opsBetween(bp, B.sideBottom, B.sbTop);
  const fW = waistDarts(fp, F.cfTop, F.sfTop), bW = waistDarts(bp, B.sbTop, B.cbTop);
  const fCentre = opsBetween(fp, F.cfBottom, F.cfTop), bCentre = opsBetween(bp, B.cbTop, B.cbBottom);
  const fFold = !o.centerFrontSeam, bFold = !o.centerBackSeam;
  const m = (ids) => ids.map(i => 'm' + i), id = (ids) => ids;
  const R = { front: fFold ? 'front' : 'front_r', back: bFold ? 'back' : 'back_r', f: id, b: id };
  const L = { front: fFold ? 'front' : 'front_l', back: bFold ? 'back' : 'back_l', f: fFold ? m : id, b: bFold ? m : id };
  const seams = [], waist = [];
  for (const S of [R, L]) {
    // side seam, waist down: front and back are drawn alike (two curves to the seat, then a
    // line), so each piece is sewn to its counterpart (one chain would merge near breaks)
    if (fSide.length === bSide.length) fSide.forEach((f, k) => seams.push({ a: chain(S.front, S.f([f])), b: chain(S.back, S.b([bSide[bSide.length - 1 - k]]), true) }));
    else seams.push({ a: chain(S.front, S.f(fSide)), b: chain(S.back, S.b(bSide), true) });
    for (const [a, b] of fW.darts) seams.push({ a: chain(S.front, S.f([a])), b: chain(S.front, S.f([b]), true) });
    for (const [a, b] of bW.darts) seams.push({ a: chain(S.back, S.b([a])), b: chain(S.back, S.b([b]), true) });
    waist.push(...chain(S.front, S.f(fW.waist)), ...chain(S.back, S.b(bW.waist)));
  }
  if (!fFold) seams.push({ a: chain('front_r', fCentre), b: chain('front_l', fCentre) });
  if (!bFold) seams.push({ a: chain('back_r', bCentre), b: chain('back_l', bCentre) });
  return {
    pieces: [
      ...(fFold ? [{ name: 'front', part: 'sarah.front', fold: fCentre[0] }]
        : [{ name: 'front_r', part: 'sarah.front' }, { name: 'front_l', part: 'sarah.front', mirror: true }]),
      ...(bFold ? [{ name: 'back', part: 'sarah.back', fold: bCentre[0] }]
        : [{ name: 'back_r', part: 'sarah.back' }, { name: 'back_l', part: 'sarah.back', mirror: true }]),
    ],
    seams,
    labels: { lower_interface: waist },
  };
}

const naturalWaistY = (m) => m.height - m.head_l - m.waist_line;
// FreeSewing's y = 0: the (dropped) waistline at the centre front and back
function waistY(draft, m) {
  const st = draft.setStores?.[0], M = draft.settings?.[0]?.measurements;
  const drop = M ? (M.waistToSeat - st.get('sarah.waistToSeat')) / 10 : 0;
  return naturalWaistY(m) - (isFinite(drop) ? drop : 0);
}

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['sarah.front'], bp = parts['sarah.back'];
  buildSeams(fp, bp);
  const W0 = waistY(draft, m);
  const sections = skirtSections(body, W0 + 10);
  const sf = outlineSpan(partOutline(fp)), sb = outlineSpan(partOutline(bp));
  // (above y = 0 only the raised sides are left: use the waist's girth there)
  const width = (sp, y) => { const s = sp(Math.max(sp.y0, Math.min(-0.3, y))); return s ? s[1] - s[0] : 0; };
  const girth = (y) => 2 * (width(sf, y) + width(sb, y));
  const S = skirtMap(sections, { waistY: W0, girth });
  const cfx = fp.points.cfTop.x / 10;
  return (ps) => {
    // front: u from the centre front (the drafted half lies at u < 0, the wearer's right);
    // back: from the centre back (u = girth / 2) on towards the wearer's right
    if (ps.name.startsWith('front')) return ps.mirror ? (x, y) => S(cfx + x, y) : (x, y) => S(x - cfx, y);
    return (x, y) => S(girth(y) / 2 + x, y);
  };
}

export function attachLevels(draft, m) {
  return { lower_interface: waistY(draft, m) };
}
export const lift = 2;
