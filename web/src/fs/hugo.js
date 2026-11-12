// FreeSewing "Hugo" hoodie (https://freesewing.eu/designs/hugo/, MIT, design by Joost
// De Cock): raglan sleeves, a three-part hood, kangaroo pocket, ribbed waistband and
// cuffs. Measurements from the mannequin, options as sliders, seam table and placement
// around the torso, arms and head for the drape.
import { upperFrame, hoodSideMap, bandRingMap, bandOnEdge, edgeEnds } from './place.js';
import { brianMeasurements, brianTorso, brianSleeves, treeOptions, pick } from './tops.js';

export const id = 'hugo';
export const name = 'Hugo hoodie';
export const short = 'Hoodie';
export const exportName = 'Hugo';
export const url = 'https://freesewing.eu/designs/hugo/';
export const author = 'Joost De Cock';
export const settings = { expand: true };   // draft the rectangular parts (bands, hood centre) too
export const icon = 'M20 6c2-3 14-3 16 0l3 6 9 4 6 20-6 2-4-10v24H12V28l-4 10-6-2 6-20 9-4z';
export const stretchNote = 'The waistband and cuffs are ribbing, cut shorter than the seams they are sewn to and stretched to fit. The 3D drape uses a relaxed copy (unstretched ribbing); the pattern view, cutting layout and exports use the real pattern. The pocket is cut and sewn on but not simulated.';

export const design = {
  fit: {
    chestEase: { v: 8, range: [4, 20], type: 'float', name: 'Chest ease (%)', help: 'Room around the chest.' },
    hipsEase: { v: 12, range: [4, 20], type: 'float', name: 'Hips ease (%)', help: 'Room around the hips, above the waistband.' },
    collarEase: { v: 15, range: [0, 40], type: 'float', name: 'Collar ease (%)', help: 'Widens the neck opening.' },
    cuffEase: { v: 20, range: [10, 50], type: 'float', name: 'Cuff ease (%)', help: 'Room in the cuffs around the wrist.' },
    ribbingStretch: { v: 5, range: [0, 10], type: 'float', name: 'Ribbing stretch (%)', help: 'How much shorter the ribbing is cut than the edge it is sewn to.' },
  },
  style: {
    lengthBonus: { v: 10, range: [0, 20], type: 'float', name: 'Length bonus (%)', help: 'Lengthens the body.' },
    sleeveLengthBonus: { v: 2, range: [0, 10], type: 'float', name: 'Sleeve length bonus (%)', help: 'Lengthens the sleeves.' },
    ribbingHeight: { v: 10, range: [4, 20], type: 'float', name: 'Ribbing height (%)', help: 'Height of the waistband and cuffs.' },
    pocketWidth: { v: 50, range: [35, 65], type: 'float', name: 'Pocket width (%)', help: 'Width of the kangaroo pocket.' },
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
 *  front/back (cut on the fold, 5 = centre): 0 hem (centre -> side), 1 side seam (up),
 *    2-3 raglan (armhole -> raglan tip at the neck), 4 neck (raglan tip -> centre)
 *  sleeve: 0-1 neck (back tip -> top -> front tip), 2-3 front raglan (neck -> biceps),
 *    4 front underarm (down), 5 wrist (front -> back), 6 back underarm (up), 7-8 back raglan (biceps -> neck)
 *  hoodSide: 0-1 face opening, 2-3 centre seam (forehead -> top -> back of neck), 4 neck (back -> front)
 *  hoodCenter (x along it, 0 = face): 1 one side (face -> neck), 2 neck end, 3 other side (neck -> face)
 *  waistband / cuff: 0 / 3 the long edge sewn on, the short ends sewn into a ring
 * The front's local +x and the back's mirrored half ('m') are the wearer's left; the
 * unmirrored sleeve and the mirrored hood side are on the left.
 */
export function spec() {
  const side = (s) => s > 0
    ? { f: (k) => String(k), b: (k) => 'm' + k, sl: 'sleeve_l', hood: 'hood_l', cuff: 'cuff_l' }
    : { f: (k) => 'm' + k, b: (k) => String(k), sl: 'sleeve_r', hood: 'hood_r', cuff: 'cuff_r' };
  const seams = [];
  for (const s of [1, -1]) {
    const S = side(s);
    seams.push(
      { a: [['front', S.f(1)]], b: [['back', S.b(1)]] },                                           // side seam
      { a: [[S.sl, 2], [S.sl, 3]], b: [['front', S.f(3), true], ['front', S.f(2), true]] },        // front raglan
      { a: [[S.sl, 7], [S.sl, 8]], b: [['back', S.b(2)], ['back', S.b(3)]] },                       // back raglan
      { a: [[S.sl, 4]], b: [[S.sl, 6, true]] },                                                    // underarm
      { a: [[S.sl, 5]], b: [[S.cuff, 3]] },                                                        // cuff
      { a: [[S.cuff, 0]], b: [[S.cuff, 2, true]] },
      // neckline (centre back -> centre front) to the hood
      { a: [['back', S.b(4), true], [S.sl, 0], [S.sl, 1], ['front', S.f(4)]],
        b: [s > 0 ? ['hood_center', 2, true, 0, 0.5] : ['hood_center', 2, false, 0.5, 1], [S.hood, 4]] },
      { a: [[S.hood, 2], [S.hood, 3]], b: [s > 0 ? ['hood_center', 1] : ['hood_center', 3, true]] },   // hood centre seam
    );
  }
  seams.push(
    { a: [['back', 'm0', true], ['back', 0], ['front', 'm0', true], ['front', 0]], b: [['waistband', 0]] },
    { a: [['waistband', 1]], b: [['waistband', 3, true]] },
  );
  return {
    pieces: [
      { name: 'front', part: 'hugo.front', fold: 5, label: 'body' },
      { name: 'back', part: 'hugo.back', fold: 5, label: 'body' },
      { name: 'sleeve_l', part: 'hugo.sleeve', label: 'arm', follow: 14 },
      { name: 'sleeve_r', part: 'hugo.sleeve', mirror: true, label: 'arm', follow: 14 },
      { name: 'hood_l', part: 'library.hoodSide', mirror: true, label: 'hood', lining: true, follow: 8 },
      { name: 'hood_r', part: 'library.hoodSide', label: 'hood', lining: true, follow: 8 },
      { name: 'hood_center', part: 'library.hoodCenter', label: 'hood', lining: true, follow: 50 },
      { name: 'waistband', part: 'hugo.waistband', label: 'body', doubled: 'x', follow: 6 },
      { name: 'cuff_l', part: 'hugo.cuff', label: 'arm', doubled: 'y', follow: 6 },
      { name: 'cuff_r', part: 'hugo.cuff', mirror: true, label: 'arm', doubled: 'y', follow: 6 },
      { name: 'pocket_l', part: 'hugo.pocket', cutOnly: true },
      { name: 'pocket_r', part: 'hugo.pocket', mirror: true, cutOnly: true },
      { name: 'pocket_facing_l', part: 'hugo.pocketFacing', cutOnly: true },
      { name: 'pocket_facing_r', part: 'hugo.pocketFacing', mirror: true, cutOnly: true },
      { name: 'neck_binding', part: 'hugo.neckBinding', cutOnly: true },
    ],
    seams,
    labels: {},
  };
}

export function placement(draft, m, body) {
  const parts = draft.parts[0];
  const F = upperFrame(body, m);
  const T = brianTorso(F, parts['hugo.front'], parts['hugo.back']);
  const sleeves = brianSleeves(F, parts['hugo.sleeve']);
  const hemY = T.front(0, -parts['hugo.front'].points.cfRibbing.y / 10)[1];
  return (ps, loop) => {
    const base = ps.name.replace(/_[lr]$/, '');
    if (base === 'front') return T.front;
    if (base === 'back') return T.back;
    if (base === 'sleeve') return sleeves[!!ps.mirror].map;
    if (base === 'hood') {
      const seam = loop.edges.filter(e => e.id === '2' || e.id === '3').map(e => e.poly);
      return hoodSideMap(F, { sx: ps.mirror ? 1 : -1, anchor: edgeEnds(loop, 4)[0], seam, zSign: ps.mirror ? -1 : 1 });
    }
    if (base === 'hood_center') {
      const [cx, cy, cz] = F.head.c;
      return (x) => [0, cy + 6, cz - 6 + 0.1 * x];
    }
    if (base === 'waistband') {
      const len = parts['hugo.waistband'].points.bottomLeft.y / 10;
      const ring = bandRingMap(F, { Y: hemY, len, phi0: Math.PI / 2, dir: 1 });
      return (x, y) => ring(-y, x);
    }
    if (base === 'cuff') {
      // continue the sleeve tube below the wrist: the cuff's sewn edge (3) runs along the sleeve's wrist (5)
      const S = sleeves[!!ps.mirror];
      return bandOnEdge(S.map, edgeEnds(S.loop, 5), edgeEnds(loop, 3));
    }
    return null;
  };
}

export const attachLevels = () => ({});
// start just above the placement: lifted further, the armholes would rise above the arms
export const lift = 2;
