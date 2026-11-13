// FreeSewing "Huey" zip-up hoodie (https://freesewing.eu/designs/huey/, MIT, design by Joost
// De Cock): Brian's set-in sleeves, a two-part hood that runs into the front zip, patch
// pockets and optional ribbing at the hem and cuffs. Measurements from the mannequin,
// options as sliders, seam table and placement around the torso, arms and head for the drape.
import { upperFrame, hoodSideMap, bandRingMap, bandOnEdge, edgeEnds } from './place.js';
import { brianMeasurements, brianTorso, brianSleeves, treeOptions, pick } from './tops.js';

export const id = 'huey';
export const name = 'Huey hoodie';
export const short = 'Zip hoodie';
export const exportName = 'Huey';
export const url = 'https://freesewing.eu/designs/huey/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the ribbing and pockets too
export const icon = 'M20 6c2-3 14-3 16 0l3 6 8 3 7 33-6 1-5-27v30H17V22l-5 27-6-1 7-33 8-3zM28 18v32';
export const stretchNote = 'With ribbing, the waistband and cuffs are cut shorter than the seams they are sewn to and stretched to fit. The 3D drape uses a relaxed copy (unstretched ribbing) with the zip closed; the pattern view, cutting layout and exports use the real pattern. The pockets are cut but not simulated.';

export const design = {
  fit: {
    chestEase: { v: 15, range: [-4, 35], type: 'float', name: 'Chest ease (%)', help: 'The amount of ease at your chest.' },
    hipsEase: { v: 8, range: [4, 12], type: 'float', name: 'Hips ease (%)', help: 'The amount of ease at the hips.' },
    bicepsEase: { v: 15, range: [0, 50], type: 'float', name: 'Biceps ease (%)', help: 'The amount of ease at your upper arm.' },
    cuffEase: { v: 20, range: [0, 200], type: 'float', name: 'Cuff ease (%)', help: 'The amount of ease at your wrist.' },
    ribbingStretch: { v: 15, range: [0, 30], type: 'float', name: 'Ribbing stretch (%)', help: 'How much shorter the ribbing is cut than the edge it is sewn to.' },
  },
  style: {
    lengthBonus: { v: 15, range: [-4, 60], type: 'float', name: 'Length bonus (%)', help: 'Lengthens the body. A negative value shortens it.' },
    sleeveLengthBonus: { v: 0, range: [-40, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens the sleeves. A negative value shortens them.' },
    ribbing: { v: true, type: 'bool', name: 'Ribbing', help: 'Ribbed waistband and cuffs (else plain hems).' },
    ribbingHeight: { v: 10, range: [5, 15], type: 'float', name: 'Ribbing height (%)', help: 'Height of the waistband and cuffs.' },
    pocket: { v: true, type: 'bool', name: 'Pocket', help: 'Patch pockets on the front.' },
    hoodHeight: { v: 59, range: [55, 65], type: 'float', name: 'Hood height (%)', help: 'The height of the hood.' },
    hoodDepth: { v: 8.5, range: [5, 12], type: 'float', name: 'Hood depth (%)', help: 'The depth of the hood.' },
  },
};

export function options(d, { relaxed = false } = {}) {
  const o = treeOptions(d);
  if (relaxed) o.ribbingStretch = 0;
  return o;
}
const MEASUREMENTS = ['biceps', 'chest', 'hpsToBust', 'hpsToWaistBack', 'neck', 'shoulderToShoulder', 'shoulderSlope',
  'waistToArmpit', 'waistToHips', 'hips', 'shoulderToWrist', 'wrist', 'head'];
export const measurements = (m, body) => pick(brianMeasurements(m, body), MEASUREMENTS);

/*
 * Edges (seam path operations):
 *  front (a left and a right piece; zip at centre front): 0 side seam (up), 1-3 armhole
 *    (side -> shoulder), 4 shoulder seam (shoulder -> neck), 5 neckline (-> centre front),
 *    6 centre front (down), 7 hem (centre -> side)
 *  back (cut on the fold, 6 = centre back): 0-5 as the front, 7 hem (centre -> side)
 *  sleeve: 0 back underarm (up), 1-5 cap (back -> front), 6 front underarm (down), 7 wrist (front -> back)
 *  hood: 0 neck (centre front -> centre back), 1-2 centre seam (neck -> top of the face
 *    opening), 3 face opening (-> zip), 4 the hood's part of the zip (down to the neck)
 *  waistband / cuff (ribbing, folded lengthwise): 2 the edge sewn on, 1 and 3 the ends
 * The unmirrored front, the back's mirrored half ('m'), the unmirrored sleeve and the
 * unmirrored hood are the wearer's left. The drape closes the zip (fronts, hood and waistband).
 */
export function spec(o) {
  const seams = [];
  for (const s of [1, -1]) {
    const L = s > 0, fr = L ? 'front_l' : 'front_r', b = (k) => (L ? 'm' + k : String(k));
    const sl = L ? 'sleeve_l' : 'sleeve_r', cf = L ? 'cuff_l' : 'cuff_r', hood = L ? 'hood_l' : 'hood_r';
    seams.push(
      { a: [[fr, 0]], b: [['back', b(0)]] },                                                 // side seam
      { a: [[fr, 4]], b: [['back', b(4)]] },                                                 // shoulder seam
      { a: [['back', b(1)], ['back', b(2)], ['back', b(3)], [fr, 3, true], [fr, 2, true], [fr, 1, true]],
        b: [[sl, 1], [sl, 2], [sl, 3], [sl, 4], [sl, 5]] },                                  // armhole
      { a: [[sl, 0, true]], b: [[sl, 6]] },                                                  // underarm
      { a: [[fr, 5, true], ['back', b(5)]], b: [[hood, 0]] },                                 // neckline to the hood
    );
    if (o.ribbing) seams.push({ a: [[sl, 7]], b: [[cf, 2]] }, { a: [[cf, 1]], b: [[cf, 3, true]] });
  }
  seams.push(
    { a: [['hood_l', 1], ['hood_l', 2]], b: [['hood_r', 1], ['hood_r', 2]] },                // hood centre seam
    { a: [['hood_l', 4], ['front_l', 6]], b: [['hood_r', 4], ['front_r', 6]] },              // the zip, closed
  );
  if (o.ribbing) seams.push(
    { a: [['front_l', 7], ['back', 'm7', true], ['back', 7], ['front_r', 7, true]], b: [['waistband', 2]] },
    { a: [['waistband', 1]], b: [['waistband', 3, true]] },                                  // zip through the ribbing
  );
  const pieces = [
    { name: 'front_l', part: 'huey.front', label: 'body' },
    { name: 'front_r', part: 'huey.front', mirror: true, label: 'body' },
    { name: 'back', part: 'huey.back', fold: 6, label: 'body' },
    { name: 'sleeve_l', part: 'huey.sleeve', label: 'arm', follow: 12 },
    { name: 'sleeve_r', part: 'huey.sleeve', mirror: true, label: 'arm', follow: 12 },
    // FreeSewing cuts four hood pieces (outer and lining); the drape uses the outer two
    { name: 'hood_l', part: 'huey.hood', label: 'hood', lining: true, follow: 8 },
    { name: 'hood_r', part: 'huey.hood', mirror: true, label: 'hood', lining: true, follow: 8 },
  ];
  if (o.ribbing) pieces.push(
    { name: 'waistband', part: 'huey.waistband', label: 'body', doubled: 'x', follow: 6 },
    { name: 'cuff_l', part: 'huey.cuff', label: 'arm', doubled: 'x', follow: 6 },
    { name: 'cuff_r', part: 'huey.cuff', mirror: true, label: 'arm', doubled: 'x', follow: 6 },
  );
  if (o.pocket) pieces.push(
    { name: 'pocket_l', part: 'huey.pocket', cutOnly: true },
    { name: 'pocket_r', part: 'huey.pocket', mirror: true, cutOnly: true },
  );
  return { pieces, seams, labels: {} };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const T = brianTorso(F, parts['huey.front'], parts['huey.back'], { shoulderEdge: 4, setIn: true });
  const sleeves = brianSleeves(F, parts['huey.sleeve'], { atCrease: true });
  const hemY = T.front(0, -parts['huey.front'].points.cfHem.y / 10)[1];
  return (ps, loop) => {
    if (/^front/.test(ps.name)) return T.front;
    if (ps.name === 'back') return T.back;
    if (/^sleeve/.test(ps.name)) return sleeves[!!ps.mirror].map;
    if (/^hood/.test(ps.name)) {
      // unmirrored (left) hood: local +x runs from the face towards the back of the head
      const seam = loop.edges.filter(e => e.id === '1' || e.id === '2').map(e => e.poly);
      return hoodSideMap(F, { sx: ps.mirror ? -1 : 1, anchor: edgeEnds(loop, 0)[1], seam, zSign: ps.mirror ? 1 : -1 });
    }
    if (ps.name === 'waistband') {
      // from the left front edge of the zip around the left side, the back and the right side
      const len = parts['huey.waistband'].points.bottomLeft.y / 10;
      const ring = bandRingMap(F, { Y: hemY, len, phi0: 0, dir: 1 });
      return (x, y) => ring(-y, x);
    }
    if (/^cuff/.test(ps.name)) {
      const S = sleeves[!!ps.mirror];
      return bandOnEdge(S.map, edgeEnds(S.loop, 7), edgeEnds(loop, 2));
    }
    return null;
  };
}

export const attachLevels = () => ({});
export const lift = 2;
