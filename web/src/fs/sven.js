// FreeSewing "Sven" sweatshirt (https://freesewing.eu/designs/sven/, MIT, design by Joost
// De Cock): a straightforward sweater with set-in sleeves and optional ribbing at the hem
// and cuffs. Measurements from the mannequin, options as sliders, seam table and placement
// around the torso and arms for the drape.
import { upperFrame, bandRingMap, bandOnEdge, edgeEnds } from './place.js';
import { brianMeasurements, brianTorso, brianSleeves, treeOptions, pick } from './tops.js';

export const id = 'sven';
export const name = 'Sven sweatshirt';
export const short = 'Sweatshirt';
export const exportName = 'Sven';
export const url = 'https://freesewing.eu/designs/sven/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the ribbing too
export const icon = 'M17 7l6-2c2 3 8 3 10 0l6 2 10 8 4 32-6 1-5-27v30H18V21l-5 27-6-1 4-32z';
export const stretchNote = 'With ribbing, the waistband and cuffs are cut shorter than the seams they are sewn to and stretched to fit. The 3D drape uses a relaxed copy (unstretched ribbing); the pattern view, cutting layout and exports use the real pattern.';

export const design = {
  fit: {
    chestEase: { v: 15, range: [5, 25], type: 'float', name: 'Chest ease (%)', help: 'Room around the chest.' },
    hipsEase: { v: 8, range: [-4, 20], type: 'float', name: 'Hips ease (%)', help: 'Room around the hips.' },
    bicepsEase: { v: 15, range: [5, 30], type: 'float', name: 'Biceps ease (%)', help: 'Room in the upper sleeves.' },
    cuffEase: { v: 20, range: [0, 60], type: 'float', name: 'Cuff ease (%)', help: 'Room at the wrists.' },
    collarEase: { v: 10, range: [5, 30], type: 'float', name: 'Collar ease (%)', help: 'Widens the neckline.' },
    ribbingStretch: { v: 15, range: [0, 30], type: 'float', name: 'Ribbing stretch (%)', help: 'How much shorter the ribbing is cut than the edge it is sewn to.' },
  },
  style: {
    ribbing: { v: true, type: 'bool', name: 'Ribbing', help: 'Ribbed waistband and cuffs (else plain hems).' },
    ribbingHeight: { v: 8, range: [3, 15], type: 'float', name: 'Ribbing height (%)', help: 'Height of the waistband and cuffs.' },
    lengthBonus: { v: 15, range: [0, 30], type: 'float', name: 'Length bonus (%)', help: 'Lengthens the body.' },
    sleeveLengthBonus: { v: 3, range: [0, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens the sleeves.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = treeOptions(d);
  if (relaxed) o.ribbingStretch = 0;
  return o;
}
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'hips', 'waist', 'shoulderToWrist', 'wrist'];
export const measurements = (m, body) => pick(brianMeasurements(m, body), MEASUREMENTS);

/*
 * Edges: front/back (cut on the fold, 7 = centre): 0 hem (centre -> side), 1 side seam (up),
 *   2-4 armhole (side -> shoulder), 5 shoulder seam (shoulder -> neck), 6 neckline (-> centre)
 * sleeve: 0 back underarm (up), 1-5 cap (back -> front), 6 front underarm (down), 7 wrist (front -> back)
 * waistband / cuff (with ribbing): 0 the long edge sewn on, 1 and 3 the ends, sewn into a ring
 */
export function spec(o) {
  const seams = [];
  for (const s of [1, -1]) {
    const f = (k) => (s > 0 ? String(k) : 'm' + k), b = (k) => (s > 0 ? 'm' + k : String(k));
    const sl = s > 0 ? 'sleeve_l' : 'sleeve_r', cf = s > 0 ? 'cuff_l' : 'cuff_r';
    seams.push(
      { a: [['front', f(1)]], b: [['back', b(1)]] },
      { a: [['front', f(5)]], b: [['back', b(5)]] },
      { a: [['back', b(2)], ['back', b(3)], ['back', b(4)], ['front', f(4), true], ['front', f(3), true], ['front', f(2), true]],
        b: [[sl, 1], [sl, 2], [sl, 3], [sl, 4], [sl, 5]] },
      { a: [[sl, 0, true]], b: [[sl, 6]] },
    );
    if (o.ribbing) seams.push({ a: [[sl, 7]], b: [[cf, 0]] }, { a: [[cf, 1]], b: [[cf, 3, true]] });
  }
  if (o.ribbing) seams.push(
    { a: [['back', 'm0', true], ['back', 0], ['front', 'm0', true], ['front', 0]], b: [['waistband', 0]] },
    { a: [['waistband', 1]], b: [['waistband', 3, true]] },
  );
  const pieces = [
    { name: 'front', part: 'sven.front', fold: 7, label: 'body' },
    { name: 'back', part: 'sven.back', fold: 7, label: 'body' },
    { name: 'sleeve_l', part: 'sven.sleeve', label: 'arm', follow: 12 },
    { name: 'sleeve_r', part: 'sven.sleeve', mirror: true, label: 'arm', follow: 12 },
  ];
  if (o.ribbing) pieces.push(
    // FreeSewing cuts two layers of the waistband ribbing; the drape uses one
    { name: 'waistband', part: 'sven.waistband', label: 'body', lining: true, follow: 6 },
    { name: 'cuff_l', part: 'sven.cuff', label: 'arm', follow: 6 },
    { name: 'cuff_r', part: 'sven.cuff', mirror: true, label: 'arm', follow: 6 },
  );
  return { pieces, seams, labels: {} };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const T = brianTorso(F, parts['sven.front'], parts['sven.back'], { shoulderEdge: 5 });
  const sleeves = brianSleeves(F, parts['sven.sleeve']);
  const hemY = T.front(0, -parts['sven.front'].points.cfHem.y / 10)[1];
  return (ps, loop) => {
    if (ps.name === 'front') return T.front;
    if (ps.name === 'back') return T.back;
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror].map;
    if (ps.name === 'waistband') {
      const [a, b] = edgeEnds(loop, 0), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ring = bandRingMap(F, { Y: hemY, len, phi0: Math.PI / 2, dir: 1 });
      return (x, y) => ring(-y, x);
    }
    if (/^cuff/.test(ps.name)) {
      const S = sleeves[!!ps.mirror];
      return bandOnEdge(S.map, edgeEnds(S.loop, 7), edgeEnds(loop, 0));
    }
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
