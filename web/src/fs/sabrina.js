// FreeSewing "Sabrina" sports top (https://freesewing.eu/designs/sabrina/, MIT, design by
// Jonathan Haas): a lined racerback sports top in stretch fabric, a front and a back cut on
// the fold and a side panel under each arm, finished at the bottom with an elastic band.
// Measurements from the mannequin, options as sliders, seam table and placement around the
// torso for the drape.
//
// Sabrina drafts all its panels on one sheet, side by side as they go around half the body:
// the front from the centre front (x = 0), the side panel, then the back up to the centre
// back (its fold). So that sheet's x is (roughly) the distance around the body from the
// centre front, and the panels are laid around the torso with place.js's torsoMap: the front
// and the side panels from the centre front, the back from the centre back, each strap top
// on the shoulder ridge (as Shelly's raglan torso does).
import { upperFrame, torsoMap, bandRingMap } from './place.js';
import { pathEdges } from './convert.js';
import { treeOptions } from './tops.js';
import { fsMeasurements, pick } from './measure.js';

export const id = 'sabrina';
export const name = 'Sabrina sports top';
export const short = 'Sports top';
export const exportName = 'Sabrina';
export const url = 'https://freesewing.eu/designs/sabrina/';
export const author = 'Jonathan Haas';
export const icon = 'M17 6h5c1 6 3 9 6 9s5-3 6-9h5l-1 12 4 8-2 14H16l-2-14 4-8z';
export const stretchNote = 'Sabrina is made in stretch fabric: the pattern is cut smaller than the body (the stretch options) and the bottom band is elastic. The 3D drape uses a relaxed copy (no stretch: the cloth simulated barely stretches); the pattern view, cutting layout and exports use the real pattern. The lining layers are cut, not simulated.';

const KEEP = new Set(['strapAngle']);   // degrees
export const design = {
  fit: {
    horizontalBustStretch: { v: 20, range: [0, 40], type: 'float', name: 'Bust stretch (%)', help: 'How much the fabric will stretch along the bust line, when worn.' },
    horizontalBandStretch: { v: 20, range: [0, 40], type: 'float', name: 'Elastic band stretch (%)', help: 'How much the fabric will stretch along the elastic band, when worn.' },
    verticalStretch: { v: 11, range: [0, 30], type: 'float', name: 'Vertical stretch (%)', help: 'How much the fabric will stretch vertically, when worn.' },
    strapStretch: { v: 20, range: [0, 50], type: 'float', name: 'Strap stretch (%)', help: 'How much the fabric will stretch along the straps, when worn.' },
    armpitAdjustment: { v: -1.5, range: [-10, 10], type: 'float', name: 'Armpit adjustment (%)', help: 'Move the armpit up or down.' },
    strapPosition: { v: 40, range: [20, 60], type: 'float', name: 'Strap position (%)', help: 'Move the straps towards your shoulders or neck.' },
    strapAngle: { v: 25, range: [0, 45], type: 'float', name: 'Strap angle (°)', help: 'The angle of the straps on your shoulder line.' },
  },
  style: {
    length: { v: 0, range: [0, 100], type: 'float', name: 'Length (%)', help: 'The length of the garment.' },
    neckHeightFront: { v: 35, range: [25, 80], type: 'float', name: 'Neck depth front (%)', help: 'The depth of the neck hole at the front.' },
    neckHeightBack: { v: 17, range: [10, 25], type: 'float', name: 'Neck depth back (%)', help: 'The depth of the neck hole at the back.' },
    strapWidth: { v: 33, range: [15, 50], type: 'float', name: 'Strap width (%)', help: 'The width of the shoulder straps.' },
    backWidth: { v: 18, range: [5, 40], type: 'float', name: 'Back width (%)', help: 'The width of the narrow part of the back.' },
  },
};

const STRETCH = ['horizontalBustStretch', 'horizontalBandStretch', 'verticalStretch', 'strapStretch'];
export function options(d, { relaxed = false } = {}) {
  const o = treeOptions(d, KEEP);
  if (relaxed) for (const k of STRETCH) o[k] = 0;
  return o;
}
const MEASUREMENTS = ['neck', 'chest', 'bustFront', 'highBust', 'underbust', 'waist', 'hpsToBust', 'hpsToWaistFront', 'waistToArmpit',
  'bustPointToUnderbust', 'shoulderSlope', 'shoulderToShoulder', 'bustSpan'];
export const measurements = (m, body) => pick(fsMeasurements(m, body), MEASUREMENTS);

/** Sabrina's front, side and back draw their outlines as paths named after the part, not `seam`: use them as the seam path. Idempotent. */
function useOutlines(parts) {
  for (const k of ['front', 'side', 'back']) {
    const p = parts['sabrina.' + k];
    if (p && p.paths[k] && p.paths.seam !== p.paths[k]) p.paths.seam = p.paths[k];
  }
}

/*
 * Edges (drawing order):
 *  front (cut on the fold, 5 = the centre front): 0 bottom (centre -> side), 1 side seam (up),
 *    2 armhole (up to the strap), 3 strap top (outer -> neck side), 4 neckline (-> centre)
 *  side: 0 bottom (front -> back), 1 back edge (up), 2 top (the armhole's bottom), 3 front edge (down)
 *  back (cut on the fold, 6 = the centre back): 0 neckline (centre -> strap), 1 strap top
 *    (neck side -> outer), 2-3 armhole (the racerback's curve, down to the side), 4 side seam
 *    (down), 5 bottom (side -> centre)
 *  waistband (cut on the fold at its middle, 1, folded lengthwise; the drape uses one layer):
 *    2 / m2 the edge sewn on (middle -> end), 3 / m3 the ends, sewn together at the centre back
 * The front's and the back's local halves away from their folds, the unmirrored side panel and
 * the waistband's original half are the wearer's left.
 */
export function spec(o, draft) {
  useOutlines(draft.parts[0]);
  const seams = [];
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), sd = s > 0 ? 'side_l' : 'side_r';
    seams.push(
      { a: [['front', f(1)]], b: [[sd, 3, true]] },                         // front to side panel
      { a: [[sd, 1]], b: [['back', f(4), true]] },                          // side panel to back
      { a: [['front', f(3)]], b: [['back', f(1), true]] },                  // strap (shoulder seam)
      { a: [['front', f(0)], [sd, 0], ['back', f(5)]], b: [['waistband', f(2)]] },   // bottom to the band
    );
  }
  seams.push({ a: [['waistband', 3]], b: [['waistband', 'm3']] });
  return {
    pieces: [
      { name: 'front', part: 'sabrina.front', fold: 5, label: 'body', lining: true },
      { name: 'side_l', part: 'sabrina.side', label: 'body', lining: true },
      { name: 'side_r', part: 'sabrina.side', mirror: true, label: 'body', lining: true },
      { name: 'back', part: 'sabrina.back', fold: 6, label: 'body', lining: true },
      { name: 'waistband', part: 'sabrina.waistband', fold: 1, doubled: 'x', label: 'body', follow: 6 },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  useOutlines(parts);
  const F = upperFrame(body, m);
  const fe = pathEdges(parts['sabrina.front'].paths.seam), se = pathEdges(parts['sabrina.side'].paths.seam), be = pathEdges(parts['sabrina.back'].paths.seam);
  const cb = be[6] ? be[6][0][0] : be[5].at(-1)[0];   // the centre back's x on the sheet
  const G = cb;                                         // half girth: the sheet from centre front to centre back
  const armholeY = se[2][0][1];                         // the side panel's top
  const line = (n, s) => ({ hps: n, slope: Math.max(0, (n[1] - s[1]) / Math.max(1, s[0] - n[0])) });
  // strap tops: the front's from its outer end to the neck side, the back's from the neck side (x from the centre back)
  const fs = fe[3], bs = be[1].map(([x, y]) => [cb - x, y]);
  const Tf = torsoMap(F, { side: 1, xSign: 1, ...line(fs.at(-1), fs[0]), girth: () => G, armholeY, gap: 1.5 });
  const Tb = torsoMap(F, { side: -1, xSign: -1, ...line(bs[0], bs.at(-1)), girth: () => G, armholeY, gap: 1.5 });
  // the elastic band: a ring at the bottom's centre front height, its ends meeting at the centre back
  const Y = Tf(0.01, fe[0][0][1])[1];
  const half = parts['sabrina.waistband'].points.topLeft ? Math.abs(pathEdges(parts['sabrina.waistband'].paths.seam)[2].at(-1)[1]) : G;
  const R = bandRingMap(F, { Y, len: 2 * half, phi0: 0, dir: 1, gap: 1.2 });
  return (ps) => {
    if (ps.name === 'front' || /^side_/.test(ps.name)) return Tf;
    if (ps.name === 'back') return (x, y) => Tb(x - cb, y);
    if (ps.name === 'waistband') return (x, y) => R(-y, Math.abs(x));
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
