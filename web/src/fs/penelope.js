// FreeSewing "Penelope" pencil skirt (https://freesewing.eu/designs/penelope/, MIT, design
// by Wouter van Wageningen): a front cut on the fold, two backs with a centre back zip and
// vent, waist darts and an optional straight waistband. Measurements from the mannequin,
// options as sliders, seam table and placement around the hips and legs (lower.js).
import { fsMeasurements, pick } from './measure.js';
import { opsBetween, chain, fsOptions, partOutline, waistDarts, skirtSections, skirtMap } from './lower.js';
import { outlineSpan } from './place.js';

export const id = 'penelope';
export const name = 'Penelope pencil skirt';
export const short = 'Pencil skirt';
export const exportName = 'Penelope';
export const url = 'https://freesewing.eu/designs/penelope/';
export const author = 'Wouter van Wageningen';
export const settings = { expand: true };   // draft the waistband too
export const icon = 'M16 6h24v6l4 38c-5 2-27 2-32 0l4-38zM16 12h24';
export const stretchNote = 'The waistband is draped folded in half lengthwise. The zip is drawn closed; the back vent hangs open.';

export const design = {
  fit: {
    seatEase: { v: 1, range: [0, 8], type: 'float', fs: 'pct', name: 'Seat ease (%)', help: 'Amount of ease at the seat level.' },
    waistEase: { v: 1, range: [0, 8], type: 'float', fs: 'pct', name: 'Waist ease (%)', help: 'Amount of ease at the waist level.' },
  },
  style: {
    lengthBonus: { v: 0, range: [-50, 50], type: 'float', fs: 'pct', name: 'Length bonus (%)', help: 'The length of the skirt, as a percentage of the natural waist to knee measurement.' },
    hemBonus: { v: 0, range: [-35, 0], type: 'float', fs: 'pct', name: 'Hem bonus (%)', help: 'Reduces the circumference of the skirt at the hem, as a percentage of the seat measurement.' },
    backVent: { v: true, type: 'bool', fs: 'bool', name: 'Back vent', help: 'Adds a vent in the back of the skirt.' },
    backVentLength: { v: 40, range: [5, 70], type: 'float', fs: 'pct', name: 'Back vent length (%)', help: 'Length of the back vent as a percentage of the skirt length.' },
    zipperLocation: { v: 'backSeam', range: ['backSeam', 'sideSeam'], type: 'select', fs: 'list', name: 'Zipper location', labels: { backSeam: 'Back seam', sideSeam: 'Side seam' }, help: 'The location of the zipper.' },
    nrOfDarts: { v: 2, range: [1, 2], type: 'int', fs: 'count', name: 'Number of darts', help: 'The number of darts (the pattern may use fewer if they would be too small).' },
    curvedDarts: { v: true, type: 'bool', fs: 'bool', name: 'Curved darts', help: 'Whether or not to use curved darts.' },
    waistband: { v: true, type: 'bool', fs: 'bool', name: 'Waistband', help: 'Adds a waistband to the pattern.' },
    waistbandWidth: { v: 10, range: [5, 20], type: 'float', fs: 'pct', name: 'Waistband width (%)', help: 'The width of the waistband.' },
  },
};

export const options = (d) => fsOptions(d);

const MEASUREMENTS = ['waist', 'seat', 'waistToHips', 'waistToSeat', 'waistToKnee', 'waistBack', 'seatBack'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

const backOnFold = (o) => !o.backVent && o.zipperLocation !== 'backSeam';

/*
 * Edges by point name (@freesewing/penelope), front and back alike: centre lWaist -> lHem
 * (the back with a vent: lWaist -> lVent, then the vent's overlap lVent -> vTop -> vLeg ->
 * vHem), hem -> rHem, side seam rHem -> rWaist, waist (with darts) rWaist -> lWaist.
 * Waistband (cut on the fold at its centre front end): 0 / m0 the long edges sewn on.
 */
export function spec(o, draft) {
  const parts = draft.parts[0], fp = parts['penelope.front'], bp = parts['penelope.back'], wbp = parts['penelope.waistband'];
  const F = fp.points, B = bp.points;
  const fSide = opsBetween(fp, F.rHem, F.rWaist), bSide = opsBetween(bp, B.rHem, B.rWaist);
  const fW = waistDarts(fp, F.rWaist, F.lWaist), bW = waistDarts(bp, B.rWaist, B.lWaist);
  const fold = backOnFold(o);
  const vent = !!B.lVent && o.backVent;
  const fCentre = opsBetween(fp, F.lWaist, F.lHem);
  const bCentre = opsBetween(bp, B.lWaist, vent ? B.lVent : B.lHem);
  const m = (ids) => ids.map(i => 'm' + i);
  // pieces and edge names per side: the front's own half and the back's mirrored copy (or
  // mirrored half) are the wearer's left
  const L = { f: (ids) => ids, b: fold ? m : (ids) => ids, back: fold ? 'back' : 'back_l' };
  const R = { f: m, b: (ids) => ids, back: fold ? 'back' : 'back_r' };
  const seams = [];
  const waist = {};
  for (const [S, k] of [[L, 'l'], [R, 'r']]) {
    seams.push({ a: chain('front', S.f(fSide)), b: chain(S.back, S.b(bSide)) });   // side seam, hem up
    for (const [a, b] of fW.darts) seams.push({ a: chain('front', S.f([a])), b: chain('front', S.f([b]), true) });
    for (const [a, b] of bW.darts) seams.push({ a: chain(S.back, S.b([a])), b: chain(S.back, S.b([b]), true) });
    // centre front -> side -> centre back
    waist[k] = [...chain('front', S.f(fW.waist), true), ...chain(S.back, S.b(bW.waist))];
  }
  if (!fold) seams.push({ a: chain('back_r', bCentre), b: chain('back_l', bCentre) });   // centre back (zip), waist down
  const band = !!(wbp && wbp.paths.outline && !wbp.hidden && o.waistband);
  if (band) {
    // FreeSewing draws the band as an `outline` path: use it as the seam line
    if (!wbp.paths.seam) wbp.paths.seam = wbp.paths.outline;
    seams.push({ a: waist.l, b: [['waistband', 0]] }, { a: waist.r, b: [['waistband', 'm0']] });
  }
  const lab = [...waist.l, ...waist.r].map(([p, i]) => [p, i]);
  return {
    pieces: [
      { name: 'front', part: 'penelope.front', fold: fCentre[0] },
      ...(fold ? [{ name: 'back', part: 'penelope.back', fold: opsBetween(bp, B.lWaist, B.lHem)[0] }]
        : [{ name: 'back_r', part: 'penelope.back' }, { name: 'back_l', part: 'penelope.back', mirror: true }]),
      ...(band ? [{ name: 'waistband', part: 'penelope.waistband', fold: 3, label: 'body', doubled: 'x', follow: 6 }] : []),
    ],
    seams,
    labels: { lower_interface: lab },
  };
}

const waistY = (m) => m.height - m.head_l - m.waist_line;   // FreeSewing's y = 0: the natural waist

export function placement(draft, m, body) {
  const parts = draft.parts[0], fp = parts['penelope.front'], bp = parts['penelope.back'], wbp = parts['penelope.waistband'];
  const W0 = waistY(m);
  const sections = skirtSections(body, W0 + 8);
  const sf = outlineSpan(partOutline(fp)), sb = outlineSpan(partOutline(bp));
  const half = (sp, y) => (sp(Math.max(sp.y0, Math.min(sp.y1, y))) || [0, 0])[1];
  const girth = (y) => 2 * (half(sf, y) + half(sb, y));
  const S = skirtMap(sections, { waistY: W0, girth });
  const vTop = bp.points.vTop ? -bp.points.vTop.y / 10 : null;
  return (ps, loop) => {
    if (ps.name === 'front') return (x, y) => S(x, y);
    if (ps.name === 'waistband') {
      const len = wbp.points.BL.y / 10, top = Math.max(-fp.points.rWaist.y, -bp.points.rWaist.y) / 10;
      const B = skirtMap(sections, { waistY: W0, girth: () => 2 * len });
      return (x, y) => B(-y, top + x);
    }
    void loop;
    // backs: u from the centre back (x = 0) towards the side; the vent's overlap (beyond the
    // centre back) of the left back lies over the right one
    const sx = ps.mirror ? -1 : 1;
    return (x, y) => {
      const xo = sx * x;   // x as drafted (> 0 towards the side seam)
      let off = 0;
      if (xo < 0.5 && vTop != null && y < vTop + 3) {
        const a = Math.min(1, (0.5 - xo) / 1.5) * Math.min(1, (vTop + 3 - y) / 3);
        off = (ps.mirror ? 0.7 : -0.7) * a;
      }
      return S(girth(y) / 2 + x, y, off);
    };
  };
}

export function attachLevels(draft, m) {
  const parts = draft.parts[0], F = parts['penelope.front'].points, B = parts['penelope.back'].points;
  return { lower_interface: waistY(m) + Math.min(...[F.lWaist, F.rWaist, B.lWaist, B.rWaist].map(p => -p.y / 10)) };
}
export const lift = 2;
