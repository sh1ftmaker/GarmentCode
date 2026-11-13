// FreeSewing "Tristan" top (https://freesewing.eu/designs/tristan/, MIT, design by
// Jonathan Haas): a fitted, sleeveless waist-length top with princess seams from the straps
// (inside and outside panels, front and back), a cut-out neckline front and back, and
// lacing (or a zip). Measurements from the mannequin, options as sliders, seam table and
// placement around the torso for the drape.
//
// Tristan's pieces are drawn roughly where they sit on the body (origin at the high point
// of the shoulder, centre front / back at x = 0), except the front outside panel, which is
// drawn with its dart rotated out: it starts on the torso at its drawn place and is then
// moved onto the panels it is sewn to (follow), the front inside panel along the princess
// seam and the back outside panel along the side seam.
import { upperFrame, torsoMap, outlineSpan } from './place.js';
import { pieceLoop } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';

export const id = 'tristan';
export const name = 'Tristan top';
export const short = 'Princess-seam top';
export const exportName = 'Tristan';
export const url = 'https://freesewing.eu/designs/tristan/';
export const author = 'Jonathan Haas';
export const icon = 'M20 5h5l3 12 3-12h5l2 13c4 4 6 8 6 13v8H12v-8c0-5 2-9 6-13z';
export const stretchNote = 'The lacing is drawn closed in the 3D drape: the drape copy is drafted without the lacing gap (the same girth, with cloth where the laces cross the opening), and the zip is closed. The pattern view, cutting layout and exports use the real pattern, with the opening.';

const SELECTS = new Set(['zipperLocation', 'lacingLocation']);
export const design = {
  fit: {
    chestEase: { v: 11, range: [5, 20], type: 'float', name: 'Chest ease (%)', help: 'Controls the amount of ease at the chest' },
    waistEase: { v: 5, range: [1, 20], type: 'float', name: 'Waist ease (%)', help: 'Controls the amount of ease at the waist' },
    fullChestEaseReduction: { v: 4, range: [0, 8], type: 'float', name: 'Full chest ease reduction (%)', help: 'Allows you to independently reduce the ease around the chest to make it fit tight(er) in that area' },
  },
  style: {
    armholeDepth: { v: 44, range: [38, 55], type: 'float', name: 'Armhole depth (%)', help: 'Controls the depth of the armhole' },
    cutDepthFront: { v: 80, range: [0, 125], type: 'float', name: 'Depth of the cut in the front (%)', help: 'Controls the depth of the cut in the front' },
    cutRoundnessFront: { v: 10, range: [0, 100], type: 'float', name: 'Roundness of the cut in the front (%)', help: "Controls how 'round' the cut in the front is, from V to round to square" },
    cutDepthBack: { v: 40, range: [5, 90], type: 'float', name: 'Depth of the cut in the back (%)', help: 'Controls the depth of the cut in the back' },
    cutRoundnessBack: { v: 20, range: [0, 100], type: 'float', name: 'Roundness of the cut in the back (%)', help: "Controls how 'round' the cut in the back is, from V to round to square" },
    strapWidth: { v: 45, range: [5, 90], type: 'float', name: 'Width of the straps (%)', help: 'Controls the width of the straps' },
  },
  options: {
    lacing: { v: true, type: 'bool', name: 'Lacing option', help: 'This removes part of the seam to create an opening for lacing' },
    lacingLocation: { v: 'front', range: ['front', 'back'], type: 'select', fs: 'list', name: 'Location of the lacing', labels: { front: 'Front', back: 'Back' }, help: 'Lacing in the front, or the back' },
    lacingWidth: { v: 20, range: [0, 50], type: 'float', name: 'Lacing width (%)', help: 'Width of the lacing opening' },
    zipperLocation: { v: 'side', range: ['front', 'side', 'back'], type: 'select', fs: 'list', name: 'Zipper location', labels: { front: 'Front', side: 'Side', back: 'Back' }, help: 'The location of the zipper: side, back, or front' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = treeOptions(d, SELECTS);
  if (relaxed) o.lacing = false;   // the drape: the laced opening closed (see stretchNote)
  return o;
}
const MEASUREMENTS = ['highBust', 'chest', 'underbust', 'waist', 'waistBack', 'bustSpan', 'neck', 'hpsToBust', 'hpsToWaistFront',
  'hpsToWaistBack', 'shoulderToShoulder', 'shoulderSlope'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/*
 * Edges (seam path operations; the same with and without lacing):
 *  frontInside: 0 hem (centre -> princess seam), 1-2 princess seam (up), 3 strap top (-> neck
 *    side), 4 neckline cut (-> centre), 5 centre front (down; the lacing edge with lacing)
 *  frontOutside: 0 side seam (up), 1 armhole, 2 strap top (armhole -> inside), 3-7 princess
 *    seam (down), 8 hem
 *  backInside: 0-1 princess seam (up), 2 strap top (-> neck side), 3 neckline cut, 4 centre
 *    back seam (down), 5 hem
 *  backOutside: 0 side seam (up), 1 armhole, 2 strap top (armhole -> inside), 3-4 princess
 *    seam (down), 5 hem
 * Unmirrored front pieces are on the wearer's left, unmirrored back pieces on the right.
 */
export function spec(o) {
  const laced = (where) => o.lacing && o.lacingLocation === where;
  const cfFold = !laced('front') && o.zipperLocation !== 'front';
  const seams = [];
  for (const s of ['l', 'r']) {
    const fi = cfFold ? 'front_inside' : `front_inside_${s}`, fo = `front_outside_${s}`, bi = `back_inside_${s}`, bo = `back_outside_${s}`;
    const fe = (k) => (cfFold && s === 'r' ? 'm' + k : String(k));   // the fold's mirrored half is the right
    seams.push(
      { a: [[fi, fe(1)], [fi, fe(2)]], b: [[fo, 7, true], [fo, 6, true], [fo, 5, true], [fo, 4, true], [fo, 3, true]] },
      { a: [[bi, 0], [bi, 1]], b: [[bo, 4, true], [bo, 3, true]] },
      { a: [[fo, 0]], b: [[bo, 0]] },
      { a: [[fo, 2], [fi, fe(3)]], b: [[bo, 2], [bi, 2]] },
    );
  }
  if (!cfFold && !laced('front')) seams.push({ a: [['front_inside_l', 5]], b: [['front_inside_r', 5]] });
  if (!laced('back')) seams.push({ a: [['back_inside_l', 4]], b: [['back_inside_r', 4]] });
  const pieces = [];
  if (cfFold) pieces.push({ name: 'front_inside', part: 'tristan.frontInside', fold: 5, label: 'body' });
  else pieces.push(
    { name: 'front_inside_l', part: 'tristan.frontInside', label: 'body' },
    { name: 'front_inside_r', part: 'tristan.frontInside', mirror: true, label: 'body' },
  );
  pieces.push(
    { name: 'back_inside_l', part: 'tristan.backInside', mirror: true, label: 'body' },
    { name: 'back_inside_r', part: 'tristan.backInside', label: 'body' },
    { name: 'back_outside_l', part: 'tristan.backOutside', mirror: true, label: 'body' },
    { name: 'back_outside_r', part: 'tristan.backOutside', label: 'body' },
    { name: 'front_outside_l', part: 'tristan.frontOutside', label: 'body', follow: 40 },
    { name: 'front_outside_r', part: 'tristan.frontOutside', mirror: true, label: 'body', follow: 40 },
  );
  return { pieces, seams, labels: {} };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const fi = parts['tristan.frontInside'], fo = parts['tristan.frontOutside'], bi = parts['tristan.backInside'], bo = parts['tristan.backOutside'];
  const span = (p) => outlineSpan(pieceLoop(p));
  const S = { fi: span(fi), fo: span(fo), bi: span(bi), bo: span(bo) };
  const hw = (list, y) => Math.max(0, ...list.map(s => s(y)).filter(Boolean).map(r => Math.max(Math.abs(r[0]), Math.abs(r[1]))));
  const girth = (y) => hw([S.fi, S.fo], y) + hw([S.bi, S.bo], y);
  const edge = (p, k) => { const e = pieceLoop(p).edges.find(q => q.id === String(k)).poly; return [e[0], e[e.length - 1]]; };
  // the strap: its neck side (high point of the shoulder) on the inside panel, its armhole
  // side on the outside panel; the side seam top on the outside panels
  const line = (inside, k, outside) => {
    const [, n] = edge(inside, k), [s] = edge(outside, 2);
    return { hps: n, slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])) };
  };
  const armholeY = Math.min(edge(fo, 0)[1][1], edge(bo, 0)[1][1]);
  const front = torsoMap(F, { side: 1, xSign: 1, ...line(fi, 3, fo), girth, armholeY });
  const back = torsoMap(F, { side: -1, xSign: -1, ...line(bi, 2, bo), girth, armholeY });
  return (ps) => (/^front/.test(ps.name) ? front : back);
}

export const attachLevels = () => ({});
export const lift = 2;
